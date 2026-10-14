// 사이트 공통 Supabase 클라이언트·로그인 상태 — 한 곳(2026-10-14).
// 머리줄 로그인(site-auth.ts)·게시판(board/board.ts)·실시간 채팅(chat/chat.ts)이 모두 이 모듈을 불러
// 같은 클라이언트(window.__galaxySb)와 같은 세션 하나를 쓴다. 로그인·로그아웃은 머리줄에서만 한다.
// 설정값은 원본 3D 앱(C:\dev\10_projects\galaxy\index.html CONFIG)과 같고, 주소는 같은 출처 워커 프록시(src/env.ts 규칙).
import { API } from '~/env';

// 소셜 로그인 복귀 여부는 클라이언트를 만들기 전에 캡처 — getSession()이 URL 해시의 access_token을 처리하면서
// 해시를 지워 버리면 "로그인하고 돌아왔다"는 판단을 놓친다(원본 board 주석과 같은 이유). 모듈은 한 번만 실행된다.
export const RETURNING_FROM_OAUTH = /access_token=/.test(location.hash);

const CONFIG = {
  // 일부 망이 *.supabase.co 를 막아서 같은 출처 워커(/api)가 대신 전달함(로컬=로컬, 서버=서버)
  SUPABASE_URL: location.origin + API,
  // ANON(=publishable) 키 — 브라우저에 노출돼도 안전(RLS가 보호). 원본과 같은 값.
  SUPABASE_ANON_KEY: 'sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr',
};

declare global {
  interface Window {
    supabase?: { createClient: (url: string, key: string, opts?: any) => any };
    __galaxySb?: any;
  }
}

/** 공유 클라이언트(없으면 만들고, supabase-js 가 안 읽혔으면 null) */
export function sb(): any {
  if (window.__galaxySb) return window.__galaxySb;
  if (!window.supabase) return null;
  // persistSession true — 새로고침해도 로그인 유지(원본과 동일)
  window.__galaxySb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true } });
  return window.__galaxySb;
}

let session: any = null;
const listeners = new Set<(s: any) => void>();
let readyP: Promise<any> | null = null;

/** 첫 세션 확인(한 번만). 복귀 해시의 토큰은 성공 여부와 상관없이 바로 주소창에서 지움(원본 보안 처리와 동일). */
export function authReady(): Promise<any> {
  if (readyP) return readyP;
  readyP = (async () => {
    const c = sb();
    if (!c) return null;
    try { const { data } = await c.auth.getSession(); session = data?.session || null; } catch (e) { console.warn('auth init skipped', e); }
    if (RETURNING_FROM_OAUTH) history.replaceState(null, '', location.pathname + location.search);
    try {
      c.auth.onAuthStateChange((_e: string, s: any) => { session = s; listeners.forEach((f) => { try { f(s); } catch (err) { console.warn(err); } }); });
    } catch (e) { /* 구독 실패해도 읽기 기능은 계속 */ }
    return session;
  })();
  return readyP;
}
/** 로그인 상태가 바뀔 때마다(로그인·로그아웃·토큰 갱신) 부름 */
export function onAuth(cb: (s: any) => void) { listeners.add(cb); }
export const currentSession = () => session;
/** access_token 까지 있어야 로그인으로 봄(반쪽 상태 방지 — 원본과 동일) */
export const isLoggedIn = (s: any = session) => !!(s?.user && s?.access_token);

/** 구글 full_name/name → 닉네임 → 이메일 앞부분(원본 socialDisplayName 과 같은 순서) */
export function socialDisplayName(user: any): string {
  const m = user?.user_metadata;
  return m?.nickname || m?.full_name || m?.name || (user?.email ? String(user.email).split('@')[0] : '') || '';
}

/** 머리줄 로그인 버튼 강조(#login 과 같은 효과). 모바일에서 머리줄 메뉴가 접혀 있으면 열고 나서 강조. */
export function highlightSiteLogin(openMenu = false) {
  const btns = document.querySelectorAll<HTMLElement>('#siteAuth .site-login');
  if (openMenu && window.matchMedia('(max-width: 1023px)').matches) {
    const toggle = document.querySelector<HTMLElement>('[data-aw-toggle-menu]');
    if (toggle && !toggle.classList.contains('expanded')) toggle.click();
  }
  btns.forEach((b) => { b.style.boxShadow = '0 0 0 3px #f0b429'; setTimeout(() => (b.style.boxShadow = ''), 2500); });
  const first = btns[0];
  if (first && first.offsetParent !== null) first.focus();
}
