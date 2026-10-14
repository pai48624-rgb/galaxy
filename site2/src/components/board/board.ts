// 커뮤니티 게시판 클라이언트 — 기존 3D 앱(C:\dev\10_projects\galaxy\index.html 1434~1727줄, 3687~3728줄)의
// 게시판 함수를 이름 그대로 옮긴 것. 바뀐 것: DOM id(새 페이지 구조), 로그인(2026-10-14 한 벌로 정리).
// 로그인·로그아웃 버튼은 머리줄(site-auth.ts) 한 벌만 — 게시판은 같은 클라이언트·세션(auth-client.ts, window.__galaxySb)을
// 받아 쓰고 상태가 바뀌면 화면만 다시 그린다. 로그인 전엔 안내 한 줄(#boardLoginHint)을 누르면 머리줄 버튼을 강조.
// supabase-js UMD(window.supabase)는 Layout <head>에서 /vendor/supabase.min.js 로 먼저 읽는다.
import { sb as sharedSb, authReady, onAuth, isLoggedIn, socialDisplayName, highlightSiteLogin, RETURNING_FROM_OAUTH } from '~/components/auth/auth-client';

// 한국어 문구 — 원본 tr() 사전(index.html 875·890~919줄)에서 게시판에 쓰는 키만 그대로 가져옴. 영어판(/en/board/)은 아래 T_EN.
const T: Record<string, string> = {
  loadingReviews: '리뷰 불러오는 중…',
  boardTitle: '🗨 커뮤니티 게시판',
  boardSocialFail: '소셜 로그인을 시작하지 못했어요 — 잠시 후 다시 시도해주세요',
  boardDetailEmpty: '왼쪽에서 글을 선택하세요.',
  boardNeedLogin: '글을 쓰려면 먼저 로그인해주세요',
  boardNeedTitleBody: '제목과 내용을 모두 입력해주세요',
  boardCaptchaFail: '확인 숫자가 틀렸어요 — 다시 입력해주세요',
  boardNone: '아직 글이 없어요. 첫 글을 남겨보세요.',
  boardDelete: '삭제',
  boardPostFail: '등록 실패 — 로그인 상태를 확인해주세요',
  boardReport: '🚩 신고',
  boardReportNeedLogin: '신고하려면 먼저 로그인해주세요',
  boardReportOk: '신고가 접수됐어요',
  boardReportDup: '이미 신고한 글이에요',
  boardAdminNone: '신고된 글이 없어요',
  boardAdminReports: '신고',
  boardAdminHidden: '숨김됨',
  boardAdminRestore: '숨김 해제',
  boardAdminDelete: '삭제',
  boardAdminLoadFail: '불러오기 실패',
  libFail: '라이브러리 로드 실패: vendor/supabase.min.js 로드가 차단되었습니다. 광고차단·보안 확장 끄고 강력 새로고침(Ctrl+Shift+R) 하세요.',
};
// 영어 문구(2026-10-14) — 페이지 lang="en"(/en/board/)이면 이것을 쓴다. 원본 3D 앱의 영어 사전과 같은 뜻.
const T_EN: Record<string, string> = {
  loadingReviews: 'Loading…', boardTitle: '🗨 Community board',
  boardSocialFail: "Couldn't start social sign-in — please try again shortly",
  boardDetailEmpty: 'Select a post on the left.', boardNeedLogin: 'Please sign in to write a post',
  boardNeedTitleBody: 'Please enter both a title and content', boardCaptchaFail: 'Wrong check number — please try again',
  boardNone: 'No posts yet. Be the first to write one.', boardDelete: 'Delete', boardPostFail: 'Posting failed — please check that you are signed in',
  boardReport: '🚩 Report', boardReportNeedLogin: 'Please sign in to report', boardReportOk: 'Report received', boardReportDup: 'You already reported this post',
  boardAdminNone: 'No reported posts', boardAdminReports: 'Reports', boardAdminHidden: 'Hidden', boardAdminRestore: 'Unhide', boardAdminDelete: 'Delete',
  boardAdminLoadFail: 'Failed to load', libFail: 'Could not load vendor/supabase.min.js. Turn off ad-blocking or security extensions and hard-refresh (Ctrl+Shift+R).', prev: 'Previous page', next: 'Next page', justNow: 'just now', minAgo: 'm ago', hourAgo: 'h ago', dayAgo: 'd ago',
};
const IS_EN = document.documentElement.lang === 'en';
const tr = (k: string) => (IS_EN ? T_EN[k] : T[k]) ?? T[k] ?? k;

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toast = (msg: string) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
};
function timeago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return IS_EN ? tr('justNow') : '방금';
  if (s < 3600) return Math.floor(s / 60) + (IS_EN ? tr('minAgo') : '분 전');
  if (s < 86400) return Math.floor(s / 3600) + (IS_EN ? tr('hourAgo') : '시간 전');
  if (s < 2592000) return Math.floor(s / 86400) + (IS_EN ? tr('dayAgo') : '일 전');
  return new Date(iso).toLocaleDateString(IS_EN ? 'en-US' : 'ko-KR');
}
if (!window.supabase) {
  const el = $('#boardList');
  if (el) el.innerHTML = `<div class="text-muted px-3 py-3">${tr('libFail')}</div>`;
  throw new Error('vendor libs missing: supabase');
}
// 머리줄·채팅과 같은 클라이언트 하나(세션도 하나)
const sb = sharedSb();

/* ---- 커뮤니티 게시판: 로그인한 사용자만 글쓰기, 읽기는 누구나 가능.
   board_posts 테이블 + RLS는 supabase_schema.sql §6 / scripts/migrate_board_posts.mjs 참고 ---- */
let boardSession: any = null;
async function initBoardAuth() {
  // 첫 세션 확인·복귀 해시 지우기는 auth-client.ts 가 한 번만 한다(머리줄과 같은 세션)
  boardSession = await authReady();
  onAuth((session: any) => {
    boardSession = session;
    updateBoardAuthUI();
  });
  // 소셜 로그인에서 막 돌아왔으면 목록을 새로 그림(내 글 삭제 버튼 등)
  if (RETURNING_FROM_OAUTH && boardSession?.user) {
    boardPage = 0;
    loadBoardPosts();
  }
}
function updateBoardAuthUI() {
  // access_token까지 확인 — user만 있고 실제 세션이 없는 반쪽 상태를 "로그인됨"으로 잘못 표시하는 걸 방지
  const loggedIn = isLoggedIn(boardSession);
  // 로그인 전엔 "머리줄에서 로그인하세요" 한 줄, 후엔 숨김(이름·로그아웃은 머리줄에 있음)
  const note = $('#boardLoginNote');
  if (note) note.hidden = loggedIn;
  // "글쓰기" 버튼 자체를 로그인했을 때만 보이게 함 — 로그인 안 된 사람은 애초에 글쓰기 창을 열 수가 없음.
  const writeBtn = $('#boardWriteOpen');
  if (writeBtn) writeBtn.hidden = !loggedIn;
  refreshBoardAdminUI(loggedIn);
  const loggedInEl = $('#boardAuthLoggedIn');
  if (!loggedInEl) return;
  const form = $('#boardPostForm');
  if (form) form.hidden = !loggedIn;
  const emailEl = $('#boardUserEmail');
  if (loggedIn && emailEl) emailEl.textContent = socialDisplayName(boardSession.user);
}
let boardIsAdmin = false;
// 운영자 판정: DB 함수 is_board_admin() (supabase_schema.sql 339줄, 로그인한 사용자만 호출 가능) — 원본과 동일
async function refreshBoardAdminUI(loggedIn: boolean) {
  const btn = $('#boardAdminOpen');
  if (!btn) return;
  if (!loggedIn) { boardIsAdmin = false; btn.hidden = true; return; }
  try {
    const { data, error } = await sb.rpc('is_board_admin');
    boardIsAdmin = !error && data === true;
  } catch (e) { boardIsAdmin = false; }
  btn.hidden = !boardIsAdmin;
}
// 로그인(구글·카카오·네이버)·로그아웃 함수는 머리줄(components/auth/site-auth.ts)로 옮김 — 여기엔 없음
// 진짜 스팸 방지는 아니고 — 화면에 뜬 숫자를 그대로 입력해야 등록되게 해서 아주 단순한 자동 스팸 봇 정도만 거르는 용도.
let boardCaptcha: string | null = null;
function newBoardCaptcha() {
  boardCaptcha = String(Math.floor(1000 + Math.random() * 9000));
  const numEl = document.getElementById('boardCaptchaNum');
  if (numEl) numEl.textContent = boardCaptcha;
  const inputEl = document.getElementById('boardCaptchaInput') as HTMLInputElement | null;
  if (inputEl) inputEl.value = '';
}
// 왼쪽엔 제목/작성자만 있는 목록, 오른쪽엔 클릭한 글의 전체 내용(이메일함/포럼에서 흔히 쓰는 목록-상세 구조).
let boardPosts: any[] = [];
let boardActiveId: number | null = null;
// 이 페이지는 커뮤니티("free") 게시판만. AI 트렌드 글은 /trend/ 화면이 따로 있음.
const boardKind = 'free';
// 한 번에 15개씩만 불러오고 페이지 넘기기로 이동(이전/다음)
const BOARD_PAGE_SIZE = 15;
let boardPage = 0;
let boardTotalCount = 0;
async function loadBoardPosts() {
  const listEl = $('#boardList');
  if (!listEl) return;
  listEl.innerHTML = `<div class="text-muted px-3 py-3">${tr('loadingReviews')}</div>`;
  try {
    const from = boardPage * BOARD_PAGE_SIZE, to = from + BOARD_PAGE_SIZE - 1;
    const query = (withBoard: boolean) => {
      let q = sb.from('board_posts').select('id,user_id,author_name,title,body,created_at', { count: 'exact' });
      if (withBoard) q = q.eq('board', boardKind);
      return q.order('created_at', { ascending: false }).range(from, to);
    };
    let { data, error, count } = await query(true);
    // DB에 board 칼럼이 아직 없을 때(scripts/migrate_board_ai_trend.sql 실행 전): 커뮤니티는 예전처럼 전체 목록
    if (error && error.code === '42703') { // undefined_column
      ({ data, error, count } = await query(false));
    }
    if (error) throw error;
    boardPosts = data || [];
    boardTotalCount = count || 0;
    listEl.innerHTML = (boardPosts.length
      ? boardPosts.map(boardRowHTML).join('')
      : `<div class="text-muted px-3 py-3">${tr('boardNone')}</div>`) + boardPagerHTML();
    if (boardActiveId != null && boardPosts.some((p) => p.id === boardActiveId)) renderBoardDetail(boardActiveId);
    else { boardActiveId = null; const d = $('#boardDetail'); if (d) d.innerHTML = `<div class="text-muted" id="lblBoardDetailEmpty">${tr('boardDetailEmpty')}</div>`; }
  } catch (e) {
    listEl.innerHTML = `<div class="text-muted px-3 py-3">${tr('boardNone')}</div>`;
  }
}
function boardPagerHTML() {
  const totalPages = Math.max(1, Math.ceil(boardTotalCount / BOARD_PAGE_SIZE));
  if (totalPages <= 1) return '';
  return `<div class="board-pager">
    <button type="button" id="boardPagePrev" ${boardPage <= 0 ? 'disabled' : ''} aria-label="${IS_EN ? tr('prev') : '이전 페이지'}">‹</button>
    <span>${boardPage + 1} / ${totalPages}</span>
    <button type="button" id="boardPageNext" ${boardPage >= totalPages - 1 ? 'disabled' : ''} aria-label="${IS_EN ? tr('next') : '다음 페이지'}">›</button>
  </div>`;
}
function boardRowHTML(p: any) {
  // 게시판 목록의 표준 관례: 제목은 왼쪽에서 잘리고(...), 작성자·날짜는 오른쪽 끝에 고정.
  return `<button type="button" class="board-row${p.id === boardActiveId ? ' active' : ''}" data-id="${p.id}">
    <span class="board-row-top">
      <span class="board-row-title">${esc(p.title)}</span>
      <span class="board-row-nick">${esc(p.author_name)}</span>
    </span>
    <span class="board-row-meta">${timeago(p.created_at)}</span>
  </button>`;
}
function renderBoardDetail(id: number) {
  const p = boardPosts.find((x) => x.id === id);
  if (!p) return;
  boardActiveId = id;
  document.querySelectorAll('#boardList .board-row').forEach((row) => { row.classList.toggle('active', +(row as HTMLElement).dataset.id! === id); });
  const mine = boardSession?.user?.id && p.user_id === boardSession.user.id;
  // 제목을 큰 헤딩으로, 작성자·날짜는 그 아래 한 줄(byline)로 — 필드 라벨 없는 표준 게시판 구성.
  const d = $('#boardDetail');
  if (!d) return;
  d.innerHTML = `
    <div class="board-detail-title">${esc(p.title)}</div>
    <div class="board-detail-meta"><span class="board-detail-nick">${esc(p.author_name)}</span> · ${timeago(p.created_at)}</div>
    <div class="board-detail-body">${esc(p.body)}</div>
    ${mine ? `<button type="button" class="board-post-del" data-del="${p.id}">${esc(tr('boardDelete'))}</button>` : `<button type="button" class="board-post-report" data-report="${p.id}">${esc(tr('boardReport'))}</button>`}`;
  // 모바일(1열)에서는 목록 아래에 상세가 있으므로 글을 고르면 상세로 내려가 보이게
  if (window.matchMedia('(max-width: 1023px)').matches) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function reportBoardPost(id: number) {
  // 같은 글이 서로 다른 사람에게 3번 신고당하면 DB 트리거(handle_board_report)가 자동으로 hidden=true 처리함.
  if (!boardSession?.user) { toast(tr('boardReportNeedLogin')); return; }
  try {
    const { error } = await sb.from('board_reports').insert({ post_id: id });
    if (error) throw error;
    toast(tr('boardReportOk'));
  } catch (e: any) {
    // unique_violation(post_id, reporter_id) — 이미 이 사람이 같은 글을 신고한 적 있음
    toast(e?.code === '23505' ? tr('boardReportDup') : tr('boardReportOk'));
  }
}
async function submitBoardPost(e: Event) {
  e.preventDefault();
  // 조건 하나하나마다 왜 안 되는지 토스트로 알려줌
  if (!boardSession?.user) { toast(tr('boardNeedLogin')); return; }
  const titleEl = $('#boardPostTitle') as HTMLInputElement, bodyEl = $('#boardPostBody') as HTMLTextAreaElement;
  const title = titleEl.value.trim(), body = bodyEl.value.trim();
  if (!title || !body) { toast(tr('boardNeedTitleBody')); return; }
  if (($('#boardCaptchaInput') as HTMLInputElement).value.trim() !== boardCaptcha) {
    toast(tr('boardCaptchaFail'));
    newBoardCaptcha();
    return;
  }
  const authorName = boardSession.user.user_metadata?.nickname || (boardSession.user.email || 'user').split('@')[0];
  try {
    const { error } = await sb.from('board_posts').insert({ author_name: authorName, title, body });
    if (error) throw error;
    titleEl.value = ''; bodyEl.value = '';
    $('#boardTitleCount')!.textContent = '0'; $('#boardBodyCount')!.textContent = '0';
    newBoardCaptcha();
    ($('#boardWriteDlg') as HTMLDialogElement).close();
    boardPage = 0; // 새 글은 최신순 맨 앞이라 1페이지부터 다시 보여줌
    loadBoardPosts();
  } catch (e) { toast(tr('boardPostFail')); }
}
async function deleteBoardPost(id: number) {
  try {
    await sb.from('board_posts').delete().eq('id', id);
    if (boardActiveId === id) boardActiveId = null;
    loadBoardPosts();
  } catch (e) {}
}
async function openBoardAdminPanel() {
  if (!boardIsAdmin) return;
  ($('#boardAdminDlg') as HTMLDialogElement).showModal();
  await loadBoardAdminList();
}
async function loadBoardAdminList() {
  const list = $('#boardAdminList');
  if (!list) return;
  list.innerHTML = `<div class="text-muted">${tr('loadingReviews')}</div>`;
  try {
    const { data, error } = await sb.from('board_posts')
      .select('id,title,author_name,hidden,report_count')
      .gt('report_count', 0)
      .order('report_count', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) {
      list.innerHTML = `<div class="text-muted">${tr('boardAdminNone')}</div>`;
      return;
    }
    list.innerHTML = data.map((p: any) => `
      <div class="board-admin-row">
        <div class="ba-title">${esc(p.title)} <span class="text-muted font-normal">— ${esc(p.author_name)}</span></div>
        <div class="ba-meta">${tr('boardAdminReports')}: ${p.report_count} ${p.hidden ? `· <b class="ba-hidden">${tr('boardAdminHidden')}</b>` : ''}</div>
        <div class="ba-act">
          ${p.hidden ? `<button type="button" data-restore="${p.id}">${tr('boardAdminRestore')}</button>` : ''}
          <button type="button" data-admin-del="${p.id}">${tr('boardAdminDelete')}</button>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="text-muted">${tr('boardAdminLoadFail')}</div>`;
  }
}
async function restoreBoardPost(id: number) {
  try {
    await sb.from('board_posts').update({ hidden: false, report_count: 0 }).eq('id', id);
    loadBoardAdminList();
    loadBoardPosts();
  } catch (e) {}
}
async function adminDeleteBoardPost(id: number) {
  try {
    await sb.from('board_posts').delete().eq('id', id);
    loadBoardAdminList();
    loadBoardPosts();
  } catch (e) {}
}

/* ---- 이벤트 연결 (원본 index.html 3687~3728줄과 같은 구성, id만 새 페이지 것) ---- */
function wireBoardEvents() {
  $('#boardWriteOpen')?.addEventListener('click', () => ($('#boardWriteDlg') as HTMLDialogElement).showModal());
  $('#boardWriteCancel')?.addEventListener('click', () => ($('#boardWriteDlg') as HTMLDialogElement).close());
  $('#boardAdminOpen')?.addEventListener('click', openBoardAdminPanel);
  $('#boardAdminClose')?.addEventListener('click', () => ($('#boardAdminDlg') as HTMLDialogElement).close());
  $('#boardAdminList')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const restoreBtn = t.closest<HTMLElement>('[data-restore]');
    if (restoreBtn) { restoreBoardPost(+restoreBtn.dataset.restore!); return; }
    const delBtn = t.closest<HTMLElement>('[data-admin-del]');
    if (delBtn) adminDeleteBoardPost(+delBtn.dataset.adminDel!);
  });
  // <dialog>는 배경 클릭으로 안 닫히는 게 브라우저 기본 동작 — 배경 클릭 시 닫히게(안의 내용 클릭은 target이 자식이라 안 걸림)
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });
  $('#boardPostForm')?.addEventListener('submit', submitBoardPost);
  $('#boardPostTitle')?.addEventListener('input', (e) => { $('#boardTitleCount')!.textContent = String((e.target as HTMLInputElement).value.length); });
  $('#boardPostBody')?.addEventListener('input', (e) => { $('#boardBodyCount')!.textContent = String((e.target as HTMLTextAreaElement).value.length); });
  $('#boardList')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-id]');
    if (row) { renderBoardDetail(+row.dataset.id!); return; }
    if (t.closest('#boardPagePrev')) { if (boardPage > 0) { boardPage--; loadBoardPosts(); } return; }
    if (t.closest('#boardPageNext')) { boardPage++; loadBoardPosts(); return; }
  });
  $('#boardDetail')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const delBtn = t.closest<HTMLElement>('[data-del]');
    if (delBtn) { deleteBoardPost(+delBtn.dataset.del!); return; }
    const reportBtn = t.closest<HTMLElement>('[data-report]');
    if (reportBtn) reportBoardPost(+reportBtn.dataset.report!);
  });
  newBoardCaptcha();
  // 로그인 전 안내 줄을 누르면 머리줄 로그인 버튼 강조(모바일은 머리줄 메뉴를 열고)
  $('#boardLoginHint')?.addEventListener('click', () => highlightSiteLogin(true));
}

async function startBoard() {
  wireBoardEvents();
  updateBoardAuthUI();
  loadBoardPosts();
  await initBoardAuth();
  updateBoardAuthUI();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBoard);
else startBoard();

export {};
