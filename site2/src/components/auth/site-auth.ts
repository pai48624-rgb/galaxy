// 사이트 공통 로그인(2026-10-14): 머리줄의 G/K/N 버튼을 어느 화면에서든 그 자리에서 쓴다. 로그인·로그아웃은 여기 한 곳.
// 클라이언트·세션은 auth-client.ts 하나를 게시판·채팅과 같이 쓴다(window.__galaxySb). 흐름은 원본 3D 앱과 동일:
// Supabase OAuth(구글·카카오), 네이버는 워커 /api/auth/naver/start. 로그인 뒤 복귀 주소는 "지금 보고 있는 화면"(해시 제외).
import { API } from '~/env';
import { sb, authReady, onAuth, socialDisplayName, highlightSiteLogin } from '~/components/auth/auth-client';

const EN = document.documentElement.lang === 'en';
const FAIL = EN ? 'Sign-in failed. Please try again shortly.' : '로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
function $(sel: string) { return document.querySelector(sel) as HTMLElement | null; }

function paint(user: any) {
  const box = $('#siteAuth'); if (!box) return;
  const on = !!user;
  box.querySelectorAll<HTMLElement>('.site-login').forEach((b) => (b.hidden = on));
  const u = $('#siteUser'); if (u) u.hidden = !on;
  const n = $('#siteUserName'); if (n) n.textContent = on ? socialDisplayName(user) || (EN ? 'Member' : '회원') : '';
}

async function login(provider: string) {
  const here = location.origin + location.pathname + location.search;
  if (provider === 'naver') { location.href = `${API}/auth/naver/start?returnTo=` + encodeURIComponent(here); return; }
  const c = sb(); if (!c) return;
  const options: any = { redirectTo: here };
  // 카카오 개인 앱은 이메일 동의항목을 요청하면 invalid_scope — 닉네임·프로필 사진만(원본과 동일)
  if (provider === 'kakao') options.scopes = 'profile_nickname profile_image';
  try {
    const { error } = await c.auth.signInWithOAuth({ provider, options });
    if (error) alert(FAIL);
  } catch (e) { alert(FAIL); }
}

async function init() {
  document.querySelectorAll<HTMLElement>('#siteAuth .site-login').forEach((b) => b.addEventListener('click', () => login(b.dataset.provider || 'google')));
  $('#siteLogout')?.addEventListener('click', async () => { try { await sb()?.auth.signOut(); } catch (e) {} paint(null); });
  // 왼쪽 메뉴·꼬리말의 "로그인"(#login)은 머리줄 버튼을 강조해 안내
  if (/^#login/.test(location.hash)) highlightSiteLogin();
  // 같은 화면 안에서 "로그인"(#login) 링크를 누르면 주소만 바뀌고 새로 읽지 않으므로 여기서 강조(모바일은 메뉴를 열고)
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement)?.closest?.('a[href="#login"]');
    if (!a) return;
    ev.preventDefault();
    highlightSiteLogin(true);
  });
  const s = await authReady();
  paint(s?.user || null);
  onAuth((s2) => paint(s2?.user || null));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
