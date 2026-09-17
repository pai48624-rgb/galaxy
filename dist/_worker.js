// Cloudflare Pages — Advanced mode 단일 워커
//  /api/*              → Supabase REST 프록시 (일부 망이 *.supabase.co 를 막아도 앱이 동작하도록)
//  /api/auth/naver/*   → 네이버 로그인(Supabase가 기본 지원하는 목록에 없어서 직접 구현, 아래 §NAVER 참고)
//  그 외                 → 정적 자산(index.html) 그대로 서빙
const UPSTREAM = "https://urflispegkzouclljxzg.supabase.co";
// anon(publishable) 키 — 원래 클라이언트 JS에도 그대로 노출되는 공개 키라 여기 있어도 안전함
const ANON_KEY = "sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,prefer,range,x-client-info,accept-profile,content-profile",
  "Access-Control-Expose-Headers": "content-range,range-unit",
  "Access-Control-Max-Age": "86400",
};

// 같은 IP로 7일 이내 재가입을 막기 위한 확인 — 실제 판단은 DB 쪽 SECURITY DEFINER 함수
// (check_signup_ip_ok, supabase_schema.sql §7)에서 하고, 여기서는 그 결과만 받아서 막을지 결정함.
// 확인 자체가 실패하면(네트워크 등) 정상 가입까지 막아버리지 않도록 통과시킴(fail-open).
async function checkSignupIpOk(ip) {
  try {
    const r = await fetch(`${UPSTREAM}/rest/v1/rpc/check_signup_ip_ok`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_ip: ip }),
    });
    if (!r.ok) return true;
    return await r.json();
  } catch (e) {
    return true;
  }
}

async function proxy(request, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // OAuth 인가 요청(/authorize)은 브라우저를 구글/카카오/메타 로그인 화면으로 "직접" 리다이렉트
  // 시켜야 함. 아래 일반 프록시처럼 워커가 fetch로 대신 따라가버리면(redirect:"follow") 로그인
  // 화면이 아니라 그 결과 HTML이 워커를 거쳐서 브라우저에 전달되어 로그인이 깨짐 — 그래서 이
  // 경로만 302를 그대로 브라우저에 전달(수동 리다이렉트).
  if (request.method === "GET" && url.pathname === "/api/auth/v1/authorize") {
    return Response.redirect(UPSTREAM + "/auth/v1/authorize" + url.search, 302);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/v1/signup") {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const ok = await checkSignupIpOk(ip);
    if (!ok) {
      return new Response(
        JSON.stringify({ code: 429, error_code: "signup_rate_limited", msg: "같은 IP에서는 7일에 한 번만 새로 가입할 수 있어요." }),
        { status: 429, headers: { "content-type": "application/json", ...CORS } },
      );
    }
  }

  const target = UPSTREAM + url.pathname.replace(/^\/api/, "") + url.search;
  const headers = new Headers(request.headers);
  ["host", "cf-connecting-ip", "cf-ipcountry", "x-forwarded-host", "x-forwarded-proto", "x-real-ip"]
    .forEach((h) => headers.delete(h));

  // Supabase Realtime(접속자 Presence/채팅 Broadcast)은 /api/realtime/v1/websocket 으로
  // WebSocket 업그레이드 요청을 보냄. 아래 일반 프록시처럼 fetch 응답을 새 Response로 감싸버리면
  // Cloudflare가 넘겨준 resp.webSocket(업그레이드된 실제 소켓)이 버려져서 연결이 끊김 —
  // 그래서 업그레이드 요청은 별도로 감지해 webSocket을 그대로 들고 101을 돌려줌.
  const isWebSocketUpgrade = (request.headers.get("Upgrade") || "").toLowerCase() === "websocket";

  const init = { method: request.method, headers, redirect: "follow" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

  let resp;
  try {
    resp = await fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream_fetch_failed", message: String(e) }),
      { status: 502, headers: { "content-type": "application/json", ...CORS } });
  }

  if (isWebSocketUpgrade && resp.webSocket) {
    return new Response(null, { status: 101, webSocket: resp.webSocket });
  }

  const out = new Headers(resp.headers);
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);
  ["content-encoding", "content-length", "transfer-encoding"].forEach((h) => out.delete(h));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
}

// ==== §NAVER: 네이버 로그인 ====
// Supabase Auth는 구글/카카오/메타(페이스북)는 기본 제공자로 지원하지만 네이버는 지원 목록에
// 없어서(Supabase 공식 문서 확인함) 표준 OAuth2 + Supabase Admin API로 직접 다리를 놓음.
//
// 흐름: /naver/start (state를 쿠키에 심고 네이버 동의화면으로 이동)
//    → 네이버 로그인/동의
//    → /naver/callback (code→토큰 교환 → 프로필 조회 → Supabase Admin API로 유저 조회/생성 +
//       매직링크(action_link) 발급 → 그 링크로 리다이렉트하면 그 자체로 Supabase 세션이 생성됨,
//       이메일이 실제로 발송되진 않고 링크만 즉시 사용함)
//
// 필요한 환경변수(Cloudflare Pages ▸ Settings ▸ Environment variables, Secret으로 등록):
//   NAVER_CLIENT_ID, NAVER_CLIENT_SECRET  — 네이버 개발자센터 발급
//   SUPABASE_SERVICE_ROLE_KEY             — Supabase 대시보드 ▸ Project Settings ▸ API
//     (RLS 우회 권한이 있는 비밀키 — 절대 클라이언트/깃에 노출 금지, 여기 워커 안에서만 사용)
function randomState() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function naverStart(request, url, env) {
  if (!env.NAVER_CLIENT_ID) {
    return new Response("네이버 로그인이 아직 설정되지 않았습니다 (NAVER_CLIENT_ID 미설정). 사이트 운영자에게 문의해주세요.", { status: 500 });
  }
  const secure = url.protocol === "https:" ? "Secure; " : "";
  const state = randomState();
  const redirectUri = `${url.origin}/api/auth/naver/callback`;
  const returnTo = url.searchParams.get("returnTo") || url.origin;
  const authorizeUrl = "https://nid.naver.com/oauth2.0/authorize"
    + `?response_type=code&client_id=${encodeURIComponent(env.NAVER_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const headers = new Headers({ Location: authorizeUrl });
  headers.append("Set-Cookie", `naver_oauth_state=${state}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=600`);
  headers.append("Set-Cookie", `naver_oauth_return=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}

async function naverCallback(request, url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, "naver_oauth_state");
  const returnTo = getCookie(request, "naver_oauth_return") || url.origin;
  const clearCookies = [
    "naver_oauth_state=; Path=/; Max-Age=0",
    "naver_oauth_return=; Path=/; Max-Age=0",
  ];

  if (!code || !state || !savedState || state !== savedState) {
    return new Response("네이버 로그인 실패: 상태값이 일치하지 않습니다. 다시 시도해주세요.", { status: 400 });
  }
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("네이버 로그인이 아직 설정되지 않았습니다 (서버 환경변수 미설정). 사이트 운영자에게 문의해주세요.", { status: 500 });
  }
  const redirectUri = `${url.origin}/api/auth/naver/callback`;

  // 1) 인가 코드 → 액세스 토큰
  let tokenJson;
  try {
    const tokenUrl = "https://nid.naver.com/oauth2.0/token"
      + `?grant_type=authorization_code&client_id=${encodeURIComponent(env.NAVER_CLIENT_ID)}`
      + `&client_secret=${encodeURIComponent(env.NAVER_CLIENT_SECRET)}`
      + `&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    tokenJson = await (await fetch(tokenUrl)).json();
  } catch (e) {
    return new Response("네이버 토큰 발급 실패: " + String(e), { status: 502 });
  }
  if (!tokenJson.access_token) {
    return new Response("네이버 토큰 발급 실패: " + JSON.stringify(tokenJson), { status: 502 });
  }

  // 2) 액세스 토큰 → 프로필(이메일 필수 — 네이버 개발자센터에서 로그인 동의항목에 "이메일"을
  //    필수로 설정해야 내려옴)
  let profile;
  try {
    const profResp = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    profile = (await profResp.json())?.response;
  } catch (e) {
    return new Response("네이버 프로필 조회 실패: " + String(e), { status: 502 });
  }
  if (!profile?.email) {
    return new Response(
      "네이버 계정에서 이메일 제공 동의를 받지 못해 로그인할 수 없습니다. 네이버 개발자센터 ▸ 내 애플리케이션 ▸ 제공정보에서 " +
      "\"이메일\"을 필수 동의항목으로 설정해주세요.",
      { status: 400 },
    );
  }

  // 3) Supabase Admin API: 매직링크 발급 — 해당 이메일 유저가 없으면 자동 생성됨(Supabase 공식 동작).
  //    이 action_link로 리다이렉트하는 것 자체가 로그인 완료(이메일 발송 없이 즉시 사용).
  let linkJson;
  try {
    const linkResp = await fetch(`${UPSTREAM}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email: profile.email,
        data: { nickname: profile.nickname || profile.name || undefined, provider: "naver", naver_id: profile.id },
        options: { redirect_to: returnTo },
      }),
    });
    linkJson = await linkResp.json();
    if (!linkResp.ok) throw new Error(JSON.stringify(linkJson));
  } catch (e) {
    return new Response("Supabase 세션 발급 실패: " + String(e), { status: 502 });
  }
  // generate_link가 돌려주는 action_link는 type=magiclink로 돼있는데, 이 프로젝트의 GoTrue 버전
  // /auth/v1/verify는 "Invalid email verification type"으로 거부함(magiclink는 더 이상 유효한
  // type이 아니고 email/signup/email_change만 받음 — 실제 curl로 검증함). hashed_token을 받아
  // type=email로 직접 verify URL을 구성해야 실제 access_token이 나옴.
  const hashedToken = linkJson?.hashed_token || linkJson?.properties?.hashed_token;
  if (!hashedToken) {
    return new Response("Supabase 세션 발급 실패: hashed_token 없음 — " + JSON.stringify(linkJson), { status: 502 });
  }
  const verifyUrl = `${UPSTREAM}/auth/v1/verify?token=${encodeURIComponent(hashedToken)}&type=email&redirect_to=${encodeURIComponent(returnTo)}`;

  const headers = new Headers({ Location: verifyUrl });
  clearCookies.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers });
}

// 네이버/구글 사이트 소유 확인 크롤러는 리다이렉트를 안 따라가는 경우가 있는데,
// Cloudflare Pages 기본 설정(html_handling)이 /foo.html 요청을 /foo 로 308
// 리다이렉트시켜서 인증에 실패할 수 있음 -> ASSETS.fetch로 넘기기 전에 이 파일들만
// 먼저 가로채서 리다이렉트 없이 직접 200으로 응답.
const SITE_VERIFICATION_FILES = {
  "/naver11527827ffc572c4fc7337b69af3d8a9.html":
    "naver-site-verification: naver11527827ffc572c4fc7337b69af3d8a9.html",
  "/naverf7a773b489c1dab0e775a86c8ababb3a.html":
    "naver-site-verification: naverf7a773b489c1dab0e775a86c8ababb3a.html",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/naver/start") return naverStart(request, url, env);
    if (url.pathname === "/api/auth/naver/callback") return naverCallback(request, url, env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxy(request, url);
    if (SITE_VERIFICATION_FILES[url.pathname]) {
      return new Response(SITE_VERIFICATION_FILES[url.pathname], {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
