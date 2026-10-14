// 사이트 공통 실시간 채팅(2026-10-14) — 원본 3D 앱(C:\dev\10_projects\galaxy\index.html 2457~2840줄)의
// 접속자 presence·broadcast 채팅을 옮긴 것. 지도 앱 사용자와 같은 방에서 이어지도록 그대로 둔 것:
//   채널 이름 "galaxy-live", presence key = sessionStorage galaxyClientId, presence 값 { name },
//   broadcast event "chat" { id, text } / "whisper" { id, fromName, targetName, text },
//   1.2초에 한 번 전송 제한, 정원 50명(첫 sync 때 남의 인원만 세어 판단), 혼자일 때 "🌌 우주" 메아리, /비밀사용자 명령.
// 바뀐 것: 3D 별·말풍선 대신 오른쪽 아래 작은 창의 대화 목록. 연결은 창을 처음 열 때(안 여는 방문자는 연결 0 —
// 무료 티어 동시 연결 200개를 아끼려고). 창을 열어 둔 채 다른 화면으로 가면 그 화면에서도 열리고 다시 연결된다.
// 클라이언트·로그인 세션은 머리줄·게시판과 같은 것(auth-client.ts, window.__galaxySb). 문구는 src/i18n/ui.ts 의 chat.
import { sb, authReady, onAuth, currentSession, socialDisplayName } from '~/components/auth/auth-client';

type Dict = {
  open: string; close: string; title: string; sub: string; placeholder: string; send: string; hint: string;
  connecting: string; alone: string; liveN: string; offline: string; universe: string; joined: string; left: string;
  full: string; notConnected: string; secret: string; secretHelp: string; whisperUsage: string; listNow: string; nobody: string;
  me: string; whisperTo: string; whisperFrom: string; guest: string; guestAdj: string[]; guestNoun: string[];
  echo: Record<'greeting' | 'question' | 'laugh' | 'general', string[]>; greet: string[];
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

// 무료 플랜 Realtime 동시 연결 한도 200개의 1/4 — 원본과 같은 값(이 기능에만 적용, 차도 게시판 등은 그대로)
const MAX_LIVE_VISITORS = 50;
// 무료 플랜 초당 메시지 한도 100개 — 1명당 1.2초에 한 번이면 50명이 동시에 쳐도 한도 안(원본과 같은 값)
const SEND_INTERVAL_MS = 1200;
const FEED_MAX = 50;
const OPEN_KEY = 'galaxyChatOpen';
const SECRET_CMD = '/비밀사용자';

class ChatDock extends HTMLElement {
  private T!: Dict;
  private ch: any = null;            // 원본 visitorChannel
  private joined = false;            // 정원 확인 뒤 track 까지 했는지
  private myClientId = '';
  private myDisplayName = '';
  private members = new Map<string, string>(); // clientId -> 이름(원본 visitorStars 의 이름 부분)
  private checkedLiveCapacity = false;
  private hasSyncedOnce = false;
  private lastMessageSentAt = -Infinity;
  private lastAmbientEcho = -Infinity;
  private recentAmbient: string[] = [];
  private hasChatted = false;
  private greetTimer: ReturnType<typeof setTimeout> | null = null;
  private greetDone = false;
  private unread = 0;
  private noteTimer: ReturnType<typeof setTimeout> | undefined;

  connectedCallback() {
    try { this.T = JSON.parse(this.dataset.t || '{}'); } catch { return; }
    const disabled = this.dataset.disabled === '1';
    // 꼬리말 "채팅"(#chat)·게시판의 "실시간 채팅 열기"(data-chat-open)는 이 창을 연다.
    // 지도(/map/)에선 사이트 창을 숨기고(앱 안 채팅과 겹치지 않게) 링크만 무시 — 지도 앱의 💬 를 쓰면 된다.
    document.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const hit = t?.closest?.('[data-chat-open], a[href="#chat"]');
      if (!hit) return;
      ev.preventDefault();
      if (!disabled) this.open();
    });
    if (disabled) return;
    this.q('#chatDockBtn')?.addEventListener('click', () => (this.isOpen() ? this.close() : this.open()));
    this.q('#chatDockClose')?.addEventListener('click', () => this.close());
    const input = this.q<HTMLInputElement>('#chatDockInput');
    this.q('#chatDockForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input) return;
      this.sendChatMessage(input.value);
      input.value = '';
    });
    input?.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    let want = false;
    try { want = sessionStorage.getItem(OPEN_KEY) === '1'; } catch {}
    if (want || location.hash === '#chat') this.open(false);
  }

  private q<E extends HTMLElement = HTMLElement>(s: string) { return this.querySelector(s) as E | null; }
  private isOpen() { return !this.q('#chatDockPanel')?.hidden; }

  open(focus = true) {
    const panel = this.q('#chatDockPanel'); if (!panel) return;
    panel.hidden = false;
    this.q('#chatDockBtn')?.setAttribute('aria-expanded', 'true');
    try { sessionStorage.setItem(OPEN_KEY, '1'); } catch {}
    this.unread = 0; this.paintBadge();
    if (focus) this.q<HTMLInputElement>('#chatDockInput')?.focus();
    this.connect();
    this.scheduleProactiveGreet();
  }
  close() {
    const panel = this.q('#chatDockPanel'); if (!panel) return;
    panel.hidden = true;
    this.q('#chatDockBtn')?.setAttribute('aria-expanded', 'false');
    try { sessionStorage.setItem(OPEN_KEY, '0'); } catch {}
    this.q<HTMLElement>('#chatDockBtn')?.focus();
  }

  // ---- 화면 ----
  private status(text: string) { const s = this.q('#chatDockStatus'); if (s) s.textContent = text; }
  private note(text: string) {
    const n = this.q('#chatDockNote'); if (!n) return;
    n.textContent = text; n.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => (n.hidden = true), 4000);
  }
  private paintBadge() {
    const b = this.q('#chatDockCount'); if (!b) return;
    // 창이 닫혀 있을 때 새 메시지 수, 아니면 접속자 수(2명 이상일 때)
    const n = this.unread || (this.members.size > 1 ? this.members.size : 0);
    b.textContent = this.unread ? String(Math.min(this.unread, 99)) : String(n);
    b.hidden = !n;
    b.classList.toggle('unread', !!this.unread);
  }
  // 원본 addChatFeedLine — 이름은 굵게, 귓속말은 다른 색
  private addLine(name: string, text: string, isWhisper = false) {
    const feed = this.q('#chatDockFeed'); if (!feed) return;
    feed.querySelector('.chat-dock-empty')?.remove();
    const row = document.createElement('div');
    row.className = isWhisper ? 'chat-dock-line whisper' : 'chat-dock-line';
    const b = document.createElement('b'); b.textContent = name;
    row.append(b, document.createTextNode(' ' + text));
    feed.appendChild(row);
    while (feed.children.length > FEED_MAX) feed.removeChild(feed.firstChild!);
    feed.scrollTop = feed.scrollHeight;
    if (!this.isOpen()) { this.unread++; this.paintBadge(); }
  }

  // ---- 이름·식별(원본과 같은 sessionStorage 키 — 지도 앱과 같은 탭이면 같은 사람으로 보임) ----
  private getMyClientId() {
    try {
      let id = sessionStorage.getItem('galaxyClientId');
      if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('galaxyClientId', id); }
      return id;
    } catch { return 'guest-' + Math.random().toString(36).slice(2); }
  }
  private makeGuestName() {
    const { guestAdj: A, guestNoun: N } = this.T;
    try {
      let n = sessionStorage.getItem('galaxyGuestName');
      if (n) return n;
      n = A[Math.floor(Math.random() * A.length)] + N[Math.floor(Math.random() * N.length)] + Math.floor(Math.random() * 900 + 100);
      sessionStorage.setItem('galaxyGuestName', n);
      return n;
    } catch { return this.T.guest + Math.floor(Math.random() * 9000); }
  }
  private myName() { return socialDisplayName(currentSession()?.user) || this.makeGuestName(); }
  private resolveVisitorName(id: string) {
    const n = this.members.get(id);
    if (n) return n;
    return id === this.myClientId ? this.myDisplayName || this.myName() : '?';
  }

  // ---- 연결(원본 initVisitorPresence) ----
  private async connect() {
    if (this.ch) return;
    const c = sb();
    if (!c) { this.status(this.T.offline); return; }
    this.status(this.T.connecting);
    this.myClientId = this.getMyClientId();
    await authReady();
    onAuth(() => this.retrackPresence());   // 로그인·로그아웃하면 접속자 이름도 같이 바꿈(원본 retrackPresence)
    const ch = c.channel('galaxy-live', { config: { presence: { key: this.myClientId } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      // 정원 확인은 내가 track() 하기 전(=순수 남의 인원) 첫 sync 에서만 — 원본과 동일
      if (!this.checkedLiveCapacity) {
        this.checkedLiveCapacity = true;
        if (Object.keys(state).length >= MAX_LIVE_VISITORS) {
          console.warn('galaxy-live: 정원 초과라 참여 안 함 —', Object.keys(state).length, '명');
          this.note(this.T.full); this.status(this.T.offline);
          ch.unsubscribe().catch(() => {});
          return;
        }
        this.myDisplayName = this.myName();
        ch.track({ name: this.myDisplayName }).then(() => { this.joined = true; }).catch((e: unknown) => console.warn('presence track failed', e));
        this.joined = true;
      }
      this.rebuild(state);
    })
      .on('broadcast', { event: 'chat' }, ({ payload }: any) => { if (payload?.id && payload?.text) this.addLine(this.resolveVisitorName(payload.id), String(payload.text).slice(0, 80)); })
      .on('broadcast', { event: 'whisper' }, ({ payload }: any) => {
        // 채널 전체에 가지만 받는 쪽에서 "나한테 온 것"만 보여 줌(진짜 비밀 채널은 아님 — 원본 주석과 같음)
        if (!payload || payload.id === this.myClientId) return;
        if (String(payload.targetName).trim().toLowerCase() !== this.resolveVisitorName(this.myClientId).trim().toLowerCase()) return;
        this.addLine(fill(this.T.whisperFrom, { n: payload.fromName }), payload.text, true);
      })
      .subscribe((status: string, err: unknown) => {
        console.info('[galaxy-live] status:', status, err ? String(err) : '');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('galaxy-live channel not connected:', status, err);
          if (!this.joined) this.status(this.T.offline);
        }
      });
  }
  private async retrackPresence() {
    if (!this.ch || !this.joined) return;
    const name = this.myName();
    if (name === this.myDisplayName) return;
    this.myDisplayName = name;
    try { await this.ch.track({ name }); } catch { /* 재접속 때 자동 재시도 */ }
  }
  // 원본 rebuildVisitorStars 의 이름·인원·입장/퇴장 부분(별 그리기는 없음)
  private rebuild(state: Record<string, Array<{ name?: string }>>) {
    const ids = Object.keys(state).sort();
    if (this.hasSyncedOnce) {
      for (const id of ids) if (id !== this.myClientId && !this.members.has(id)) this.addLine(this.T.universe, fill(this.T.joined, { n: state[id]?.[0]?.name || '?' }));
      for (const [id, name] of this.members) if (id !== this.myClientId && !ids.includes(id)) this.addLine(this.T.universe, fill(this.T.left, { n: name || '?' }));
    }
    this.hasSyncedOnce = true;
    this.members = new Map(ids.map((id) => [id, state[id]?.[0]?.name || '?']));
    const total = ids.length;
    this.status(total <= 1 ? this.T.alone : fill(this.T.liveN, { n: total }));
    this.paintBadge();
  }

  // ---- 혼자일 때 "🌌 우주" 메아리(진짜 사람인 척은 안 함 — 원본과 같은 규칙) ----
  private categorize(text: string): keyof Dict['echo'] {
    if (/[?？]/.test(text)) return 'question';
    if (/안녕|hi|hello|헬로|하이/i.test(text)) return 'greeting';
    if (/ㅋ{2,}|ㅎ{2,}|lol|haha/i.test(text)) return 'laugh';
    return 'general';
  }
  private pickAmbient(cat: keyof Dict['echo']) {
    const pool = this.T.echo[cat] || this.T.echo.general;
    const cand = pool.filter((l) => !this.recentAmbient.includes(l));
    const list = cand.length ? cand : pool;
    const line = list[Math.floor(Math.random() * list.length)];
    this.recentAmbient.push(line);
    if (this.recentAmbient.length > 3) this.recentAmbient.shift();
    return line;
  }
  private maybeAmbientEcho(text: string) {
    if (this.members.size > 1) return;                         // 진짜 접속자가 있으면 끼어들지 않음
    const now = performance.now();
    if (now - this.lastAmbientEcho < 3000) return;             // 연타 방지 쿨다운 3초(원본과 같음)
    this.lastAmbientEcho = now;
    const line = this.pickAmbient(this.categorize(text || ''));
    setTimeout(() => this.addLine(this.T.universe, line), 1600 + Math.random() * 1400);
  }
  // 창을 열고 25초 동안 아무 말 없으면 한 번만 먼저 말 걸기(이미 채팅했거나 다른 사람이 있으면 취소)
  private scheduleProactiveGreet() {
    if (this.greetDone || this.greetTimer) return;
    this.greetTimer = setTimeout(() => {
      this.greetTimer = null;
      if (this.greetDone || this.hasChatted || this.members.size > 1 || !this.isOpen()) return;
      this.greetDone = true;
      const g = this.T.greet;
      this.addLine(this.T.universe, g[Math.floor(Math.random() * g.length)]);
    }, 25000);
  }

  // ---- 숨은 명령(원본 handleChatCommand) ----
  private handleChatCommand(text: string) {
    if (text !== SECRET_CMD && !text.startsWith(SECRET_CMD + ' ')) return false;
    const rest = text.slice(SECRET_CMD.length).trim();
    if (rest === '도움말' || rest.toLowerCase() === 'help') { this.addLine(this.T.secret, fill(this.T.secretHelp, { c: SECRET_CMD })); return true; }
    if (!rest) {
      const me = this.resolveVisitorName(this.myClientId);
      const counts = new Map<string, number>();
      for (const n of this.members.values()) counts.set(n, (counts.get(n) || 0) + 1);
      const parts = [...counts.entries()].map(([n, k]) => { const label = n === me ? `${n}${this.T.me}` : n; return k > 1 ? `${label} x${k}` : label; });
      this.addLine(this.T.secret, parts.length ? fill(this.T.listNow, { n: this.members.size, list: parts.join(', ') }) : this.T.nobody);
      return true;
    }
    const sp = rest.indexOf(' ');
    const targetName = sp === -1 ? rest : rest.slice(0, sp);
    const whisperText = sp === -1 ? '' : rest.slice(sp + 1).trim();
    if (!whisperText) { this.note(this.T.whisperUsage); return true; }
    if (!this.ch || !this.joined) { this.note(this.T.notConnected); return true; }
    this.addLine(fill(this.T.whisperTo, { n: targetName }), whisperText, true);
    this.ch.send({ type: 'broadcast', event: 'whisper', payload: { id: this.myClientId, fromName: this.resolveVisitorName(this.myClientId), targetName, text: whisperText } });
    return true;
  }
  // 원본 sendChatMessage — 1.2초 안의 연속 전송은 조용히 무시
  private sendChatMessage(raw: string) {
    const text = raw.trim();
    if (!text) return;
    if (this.handleChatCommand(text)) return;
    if (!this.ch || !this.joined) { this.note(this.T.notConnected); return; }
    const now = performance.now();
    if (now - this.lastMessageSentAt < SEND_INTERVAL_MS) return;
    this.lastMessageSentAt = now;
    this.hasChatted = true;
    this.addLine(this.resolveVisitorName(this.myClientId), text);   // 내 화면엔 바로(왕복 안 기다림)
    this.ch.send({ type: 'broadcast', event: 'chat', payload: { id: this.myClientId, text } });
    this.maybeAmbientEcho(text);
  }
}
if (!customElements.get('chat-dock')) customElements.define('chat-dock', ChatDock);
export {};
