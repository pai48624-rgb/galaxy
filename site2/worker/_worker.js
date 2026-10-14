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
  // x-supabase-api-version — 최신 supabase-js(2.116.0)가 세션 복구 시 자동으로 붙이는 헤더.
  // 이게 허용 목록에 없으면 프리플라이트가 막혀서 로그인 후 access_token이 있어도 세션이
  // 전혀 저장 안 됨(콘솔에 CORS 에러) — 소셜 로그인(구글/카카오/네이버) 전부에 영향을 주는 버그였음.
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,prefer,range,x-client-info,accept-profile,content-profile,x-supabase-api-version",
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

// ==== §TREND: AI 트렌드 게시판 (2026-10-03) ====
// 콘텐츠 공장(노트북)이 POST /api/posts 로 글을 보내면 DB 함수 factory_post 가 토큰(해시 비교)을
// 확인하고 board='ai_trend' 로 운영자 글을 넣음 — 워커엔 비밀키가 필요 없음.
// 게시판 화면(index.html)은 JS로 그려서 검색엔진이 글을 못 읽으므로, 글마다 /trend/<id> 를
// 워커가 서버에서 완성된 HTML로 만들어 줌 + /sitemap-trend.xml 로 색인 요청.
const SITE = "https://aigalaxy-map.com";
const TREND_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" };

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sbGet(path) {
  const r = await fetch(`${UPSTREAM}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
}

// 이미 올라간 글 갱신 ("update": true, 같은 external_id) — 2026-10-03 글 형식을 바꾼 뒤 /trend/7 을 새 글로 바꾸려고 추가.
// DB 함수(factory_post)를 고치지 않고, 네이버 로그인용으로 이미 있는 SUPABASE_SERVICE_ROLE_KEY 로
// ① 토큰 해시가 factory_tokens 에 있는지 ② 같은 external_id 의 ai_trend 글을 찾아 제목·본문만 바꿈.
// 글이 없으면 null 을 돌려줘서 일반 등록으로 넘어감.
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function updatePost(token, p, env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return json({ ok: false, msg: "갱신 기능 미설정 (SUPABASE_SERVICE_ROLE_KEY 없음)" }, 500);
  const h = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const ok = await (await fetch(`${UPSTREAM}/rest/v1/factory_tokens?select=token_hash&token_hash=eq.${await sha256hex(token)}`, { headers: h })).json();
  if (!Array.isArray(ok) || !ok.length) return json({ ok: false, msg: "토큰이 맞지 않음" }, 401);
  const found = await (await fetch(`${UPSTREAM}/rest/v1/board_posts?select=id&board=eq.ai_trend&external_id=eq.${encodeURIComponent(p.external_id)}`, { headers: h })).json();
  if (!Array.isArray(found) || !found.length) return null;
  const id = found[0].id;
  const r = await fetch(`${UPSTREAM}/rest/v1/board_posts?id=eq.${id}`, {
    method: "PATCH", headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({ title: String(p.title).slice(0, 120), body: p.body_text, body_html: p.body_html || null,
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 15) : [] }),
  });
  if (!r.ok) return json({ ok: false, msg: `갱신 실패 ${r.status}: ${(await r.text()).slice(0, 150)}` }, 400);
  return json({ ok: true, id, updated: true, url: `${SITE}/trend/${id}` });
}

async function receivePost(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, msg: "토큰 없음" }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, msg: "JSON 형식 아님" }, 400); }
  if (!p?.title || !p?.body_text) return json({ ok: false, msg: "title, body_text 필요" }, 400);
  if (p.update && p.external_id) {
    const res = await updatePost(token, p, env);
    if (res) return res; // 없는 글이면 아래에서 새로 등록
  }
  const r = await fetch(`${UPSTREAM}/rest/v1/rpc/factory_post`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_token: token, p_external_id: p.external_id || null, p_title: String(p.title).slice(0, 120),
      p_body: p.body_text, p_body_html: p.body_html || null, p_tags: Array.isArray(p.tags) ? p.tags.slice(0, 15) : [],
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    const bad = String(res?.message || "").includes("bad_token");
    return json({ ok: false, msg: bad ? "토큰이 맞지 않음" : (res?.message || `등록 실패 ${r.status}`) }, bad ? 401 : 400);
  }
  return json({ ok: true, id: res.id, dup: !!res.dup, url: `${SITE}/trend/${res.id}` });
}

function fmtDate(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000); // 한국 시간
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

function summary(body, n = 150) {
  const s = String(body || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/*<chrome>*/
const CHROME_CSS = "\n:root{--bg:#05050b;--card:#0f0f1d;--card2:#141a3a;--line:#262640;--ink:#d9dae6;--soft:#c3c4d4;--dim:#9d9fb6;--faint:#6b6d86;--purple:#a89bf0;--amber:#f0b429;--teal:#8fd6c4;--red:#e5766b;--acc:#a89bf0;--chip:#1b1b30;--sea:#8fd6c4;--gold:#f0b429}\n*{box-sizing:border-box}html{overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--ink);font-family:\"Pretendard Variable\",Pretendard,-apple-system,\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif;font-size:14.5px;line-height:1.6;word-break:keep-all}\na{color:inherit}img{max-width:100%}\n.serif{font-family:\"Noto Serif KR\",\"Pretendard Variable\",serif}\n.star{color:var(--amber);text-shadow:0 0 8px var(--amber),0 0 18px var(--purple);font-style:normal;animation:tw 2.6s ease-in-out infinite}@keyframes tw{0%,100%{opacity:1}50%{opacity:.65}}\n.ticker{display:flex;gap:22px;align-items:center;padding:7px 24px;border-bottom:1px solid var(--line);background:#0a0a16;font-size:12px;color:var(--dim);overflow:hidden;white-space:nowrap}\n.ticker b{color:var(--amber);flex:none}.ticker a{color:var(--dim);text-decoration:none}.ticker a::before{content:\"◆\";color:var(--purple);font-size:8px;margin-right:8px}.ticker a:hover{color:var(--ink)}\n.mast{display:flex;align-items:center;gap:18px;padding:12px 24px;border-bottom:1px solid var(--line)}\n.mast .brand{font-size:23px;color:#fff;font-weight:700;display:flex;align-items:center;gap:8px;letter-spacing:-.02em;text-decoration:none}\n.mast .date{font-size:12px;color:var(--dim)}.mast .right{margin-left:auto;display:flex;align-items:center;gap:8px}\n.mast .q{display:flex;align-items:center;gap:6px;border:1px solid var(--line);padding:0 10px;height:32px;color:var(--dim);font-size:12.5px;width:210px;border-radius:6px}.mast .q input{background:none;border:0;color:var(--ink);width:100%;outline:none;font-size:13px}\n.lg{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-weight:800;font-size:11px;flex:none;text-decoration:none}.lg-g{background:#fff;color:#4285f4}.lg-k{background:#fee500;color:#191919}.lg-n{background:#03c75a;color:#fff}\n.langbar{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;flex:none}.langbar a{padding:4px 11px;font-size:12px;font-weight:700;color:var(--dim);text-decoration:none;line-height:1.5}.langbar a.on{background:var(--purple);color:#0b0b14}.langbar a:not(.on):hover{color:#fff}\n.menu{display:flex;gap:2px;padding:0 24px;border-bottom:2px solid var(--line);overflow-x:auto;scrollbar-width:none}.menu::-webkit-scrollbar{display:none}\n.menu a{padding:10px 14px;font-weight:700;font-size:14px;color:var(--ink);white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;text-decoration:none}\n.menu a:hover,.menu a.on{color:#fff;border-bottom-color:var(--amber)}.menu a.map{color:var(--amber)}\n.wrap{max-width:1320px;margin:0 auto;padding:22px 24px}\n.wrap.cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start}\n.sec{display:flex;align-items:baseline;margin:26px 0 12px;border-bottom:2px solid var(--line);padding-bottom:6px}\n.sec h2{margin:0;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#fff}.sec a{margin-left:auto;font-size:12px;color:var(--dim);text-decoration:none}\n.side{display:grid;gap:22px;align-content:start}\n.rank{border:1px solid var(--line);background:var(--card2)}.rank .hd{padding:12px 14px;background:#1a2250;color:#fff;font-weight:700;font-size:14px}.rank .hd small{display:block;font-weight:400;font-size:11px;color:#b9bfdc}\n.rank ol{list-style:none;margin:0;padding:6px 0}.rank li{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid rgba(255,255,255,.08);font-size:13.5px}\n.rank li:first-child{border-top:0}.rank .rk{font-family:\"Noto Serif KR\",serif;font-weight:700;font-size:15px;color:var(--dim);text-align:center}.rank li:nth-child(-n+3) .rk{color:#ff5a5a}.rank b{color:#fff;font-weight:600}.rank .val{font-size:12px;color:var(--dim)}.rank a{text-decoration:none}\n.sidebox{border:1px solid var(--line);padding:14px 16px;background:var(--card)}.sidebox b{display:block;color:#fff;margin-bottom:6px}.sidebox span,.sidebox small{font-size:12.5px;color:var(--dim)}\n.sidebox ul{list-style:none;margin:8px 0 0;padding:0}.sidebox li{padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}.sidebox li:first-child{border-top:0}.sidebox li a{color:var(--soft);text-decoration:none}.sidebox li a:hover{color:#fff}\n.mapbtn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;border:1px solid #4a3fa0;background:linear-gradient(180deg,#2a2360,#15152c);color:#fff;font-weight:700;box-shadow:0 0 24px -6px var(--purple);text-decoration:none}\n.chips{display:flex;flex-wrap:wrap;gap:6px}.chips a{font-size:12.5px;border:1px solid var(--line);padding:4px 10px;color:var(--dim);text-decoration:none;border-radius:4px}.chips a:hover{color:#fff;border-color:var(--purple)}\n.ft{font-size:11.5px;color:var(--dim);display:flex;flex-wrap:wrap;gap:14px;padding:16px 0;border-top:1px solid var(--line)}.ft a{color:var(--dim);text-decoration:none}\n.paper{background:#fff;color:#1d1d2b;border-radius:14px;padding:24px 22px;overflow-wrap:anywhere}.paper h2,.paper h3{color:#102a43}.paper table{display:block;overflow-x:auto}\n/* 본문 공통 글꼴·제목·카드 — 어느 페이지든 같은 모양(.wrap.cols main 안). 페이지 자체 CSS(h1{…})보다 구체도가 높아 이것이 이긴다 */\n.wrap.cols main{font-family:\"Pretendard Variable\",Pretendard,-apple-system,\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif;color:var(--ink);line-height:1.7}\n.wrap.cols main h1{font-family:\"Noto Serif KR\",\"Pretendard Variable\",serif;font-size:26px;line-height:1.35;margin:4px 0 8px;color:#fff;font-weight:700;letter-spacing:-.2px}\n.wrap.cols main h2{font-size:19px;line-height:1.4;margin:28px 0 10px;color:var(--soft);font-weight:700}\n.wrap.cols main h3{font-size:16px;margin:18px 0 6px;color:var(--soft);font-weight:700}\n.wrap.cols main p,.wrap.cols main li{font-size:15px;color:var(--ink)}.wrap.cols main a{color:var(--teal)}\n.wrap.cols main .lead,.wrap.cols main .meta,.wrap.cols main .note,.wrap.cols main .crumb,.wrap.cols main .updated,.wrap.cols main small{color:var(--dim)}\n.wrap.cols main .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0}\n.wrap.cols main .cta,.wrap.cols main .guide{display:inline-block;margin:24px 8px 0 0;background:linear-gradient(90deg,var(--purple),#7c6eff);color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;border:0}\n.wrap.cols main .cta.ghost{background:transparent;color:var(--purple);border:1px solid var(--purple)}\n.wrap.cols main table{border-collapse:collapse;width:100%;font-size:14px}.wrap.cols main th,.wrap.cols main td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.wrap.cols main th{color:var(--dim);font-weight:600;font-size:12.5px}\n.wrap.cols main img{max-width:100%;height:auto;border-radius:12px}.wrap.cols main code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px;font-size:12.5px}\n.wrap.cols main .chips a,.wrap.cols main .chips span{font-size:12.5px;border:1px solid var(--line);padding:4px 10px;color:var(--dim);text-decoration:none;border-radius:4px;background:none}\n.mast .brand{white-space:nowrap;flex:none}\n@media (max-width:900px){.mast{padding:10px 14px;gap:8px}.mast .brand{font-size:17px}.mast .brand svg{width:18px;height:18px}.mast .date,.mast .q{display:none}.mast .right{gap:6px}.langbar a{padding:3px 8px;font-size:11px}.lg{width:26px;height:26px}.menu{padding:0 16px}.ticker{padding:6px 16px}\n .wrap{padding:16px}.wrap.cols{grid-template-columns:minmax(0,1fr);gap:20px}.wrap.cols>main{min-width:0}}\n";
const FONT_LINKS = "<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css\"><link href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap\" rel=\"stylesheet\">";
const CHROME_TOP = "<div class=\"ticker\" id=\"ticker\"><b data-ko=\"이번 주 신호\" data-en=\"This week\">이번 주 신호</b><a href=\"/trend/\">AI 트렌드 새 글 보기</a></div>\n<header class=\"mast\"><a class=\"brand serif\" href=\"/\"><svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3v3M12 18v3M3 12h3M18 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z\"/></svg><span data-ko=\"AI 성단 지도\" data-en=\"AI Galaxy Map\">AI 성단 지도</span></a><span class=\"date\">__DATE__ · <span data-ko=\"전세계 AI 관계형 지도\" data-en=\"Relationship map of AI tools worldwide\">전세계 AI 관계형 지도</span></span>\n<div class=\"right\"><form class=\"q\" action=\"/map/\" method=\"get\"><svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m21 21-4.3-4.3\"/></svg><input type=\"search\" name=\"q\" placeholder=\"AI 이름 검색\" data-ko=\"AI 이름 검색\" data-en=\"Search AI tools\" aria-label=\"AI 검색\"></form><div class=\"langbar\" aria-label=\"언어\"><a href=\"/\" hreflang=\"ko\" lang=\"ko\" data-lang=\"ko\" class=\"on\">한국어</a><a href=\"/en/korea/\" hreflang=\"en\" lang=\"en\" data-lang=\"en\" class=\"\">English</a></div><a class=\"lg lg-g\" href=\"/map/#login\" title=\"구글 로그인\">G</a><a class=\"lg lg-k\" href=\"/map/#login\" title=\"카카오 로그인\">K</a><a class=\"lg lg-n\" href=\"/map/#login\" title=\"네이버 로그인\">N</a></div></header>\n<nav class=\"menu\"><a href=\"/map/\" class=\"map\" data-ko=\"✦ 3D 성단 지도\" data-en=\"✦ 3D Galaxy Map\"><i class=\"star\">✦</i> 3D 성단 지도</a><a href=\"/\" class=\"\" data-ko=\"홈\" data-en=\"Home\">홈</a><a href=\"/trend/\" class=\"on\" data-ko=\"AI 트렌드\" data-en=\"AI Trends\">AI 트렌드</a><a href=\"/ai/\" class=\"\" data-ko=\"AI 목록 731\" data-en=\"AI Tools 731\">AI 목록 731</a><a href=\"/category/\" class=\"\" data-ko=\"분야 21\" data-en=\"Fields 21\">분야 21</a><a href=\"/korea/\" class=\"\" data-ko=\"한국 여행\" data-en=\"Korea Travel\">한국 여행</a><a href=\"/map/#board\" class=\"\" data-ko=\"게시판 · 채팅\" data-en=\"Board · Chat\">게시판 · 채팅</a></nav>";
const CHROME_FOOT = "<div class=\"wrap\"><footer class=\"ft\"><span>© 2026 AI 성단 지도 · aigalaxy-map.com</span><a href=\"/privacy\">개인정보 처리방침</a><a href=\"/rss.xml\">RSS</a><a href=\"/sitemap.xml\">사이트맵</a><a href=\"/map/#board\">문의 · 게시판</a></footer></div>\n<script src=\"/chrome.js\" defer></script>";
/*</chrome>*/
// 트렌드 글·목록 껍데기 — 2026-10-13 메인과 같은 매거진형(공통 CSS·머리줄은 build-dist.mjs가 위 /*<chrome>*/ 블록에 주입).
// 글 본문이 글 틀(.gx 조각, 25_templates/post/galaxy_trend)이면 그대로 넓게 보여 주고, 옛 글(밝은 배경용 인라인 스타일)은 .paper 흰 카드에 담는다.
function kstDateText(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}
// site2(2026-10-14): 글 껍데기는 빌드된 사이트 틀(/frame-template/, 고정 머리줄·왼쪽 메뉴)을 읽어 자리표만 바꾼다 → 다른 화면과 같은 틀.
let _frameCache = null;
async function trendShell({ title, description, canonical, body, jsonLd, side = "", enHref = "" }, request, env) {
  if (!_frameCache) {
    // Pages는 /frame-template.html 을 /frame-template 로 308 돌리므로(결과 본문이 빔) 확장자 없는 주소로 읽고, 틀이 아니면 캐시하지 않는다
    const r = await env.ASSETS.fetch(new Request(new URL("/frame-template", request.url)));
    const t = await r.text();
    if (!r.ok || !t.includes("__BODY__")) throw new Error("frame-template 없음 " + r.status);
    _frameCache = t;
  }
  // 영어판이 있는 글: 한국어↔영어 짝(hreflang)과 머리줄 English 버튼 주소를 그 글로(2026-10-14)
  const canonPath = canonical.replace(/^https?:\/\/[^/]+/, "");
  const alt = enHref ? `<link rel="alternate" hreflang="ko" href="${SITE}${canonPath}"><link rel="alternate" hreflang="en" href="${SITE}${enHref}">` : "";
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  return _frameCache
    .split("__TITLE__").join(escHtml(title)).split("__DESC__").join(escHtml(description)).split("__CANON__").join(canonical.replace(/^https?:\/\/[^/]+/, ""))
    .replace('<meta name="robots" content="noindex, nofollow">', "").replace("</head>", ld + alt + "</head>")
    .replace('<a href="/en/" hreflang="en"', enHref ? `<a href="${enHref}" hreflang="en"` : '<a href="/en/" hreflang="en"')
    .replace("__BODY__", body).replace("__SIDE__", side.replace(/^<aside[^>]*>|<\/aside>$/g, ""));
}

function trendSide(more) {
  return `<div class="trend-side"><div class="box"><b>함께 보면 좋은 글</b><ul>${more || '<li><a href="/trend/">AI 트렌드 목록</a></li>'}</ul></div><div class="box"><b>새 글 받아 보기</b><ul><li><a href="/rss.xml">RSS 구독</a></li><li><a href="/map/">✦ 3D 성단 지도 열기</a></li></ul></div></div>`;
}

// /api/trend/latest — 공통 껍데기(chrome.js)가 "이번 주 신호" 띠·최신 글 칸을 채울 때 씀. 5분 캐시.
async function trendLatest() {
  let posts = [];
  try { posts = await sbGet("board_posts?select=id,title,body,tags,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=12"); } catch (e) {}
  const out = posts.map((p) => ({ id: p.id, title: p.title, tags: p.tags || [], created_at: p.created_at, summary: summary(p.body, 120) }));
  return new Response(JSON.stringify({ posts: out, total: out.length }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}


async function trendList() {
  let posts = [];
  try {
    posts = await sbGet("board_posts?select=id,title,body,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=100");
  } catch (e) { /* 목록 실패해도 빈 화면으로 */ }
  const items = posts.map((p) => `<li><a href="/trend/${p.id}"><b>${escHtml(p.title)}</b><small>${fmtDate(p.created_at)} · ${escHtml(summary(p.body, 90))}</small></a></li>`).join("");
  return new Response(await trendShell({
    title: "AI 트렌드 — 요즘 뜨는 AI 도구·순위·종류 정리 | AI 성단 지도",
    description: "요즘 많이 쓰는 AI 도구 순위, 종류별 AI 정리, 새로 나온 AI 소식을 누구나 읽기 쉽게 정리합니다.",
    canonical: `${SITE}/trend/`,
    body: `<h1 class="post-h1 serif">AI 트렌드</h1><div class="meta">요즘 뜨는 AI 도구·순위·요금·소식을 궤도 안내·별 대 별·성단 순위표 같은 틀로 정리한 글</div>
<ul class="list">${items || "<li style='padding:16px 4px;color:var(--dim)'>아직 글이 없어요.</li>"}</ul>
<a class="cta" href="/map/">✦ 3D 지도에서 AI 731개 둘러보기</a>`,
    side: trendSide(""),
  }), { headers: TREND_HEADERS });
}

async function trendPost(id, request, env) {
  let p, others = [];
  try {
    [p] = await sbGet(`board_posts?select=id,title,body,body_html,tags,created_at&board=eq.ai_trend&hidden=eq.false&id=eq.${id}`);
    others = await sbGet(`board_posts?select=id,title,created_at&board=eq.ai_trend&hidden=eq.false&id=neq.${id}&order=created_at.desc&limit=6`);
  } catch (e) { /* 아래 404 처리 */ }
  if (!p) return new Response(await trendShell({ title: "글을 찾을 수 없어요 | AI 성단 지도", description: "", canonical: `${SITE}/trend/`,
    body: `<h1>글을 찾을 수 없어요</h1><a class="cta" href="/trend/">AI 트렌드 목록으로</a>` }, request, env), { status: 404, headers: TREND_HEADERS });
  const canonical = `${SITE}/trend/${p.id}`;
  // 빌드된 영어판(/en/trend/<id>/)이 있을 때만 연결 — 번역 안 된 글은 영어 짝을 걸지 않음
  let enHref = "";
  try { const r = await env.ASSETS.fetch(new Request(new URL(`/en/trend/${p.id}/`, request.url))); if (r.status < 400) enHref = `/en/trend/${p.id}/`; } catch (e) {}
  // body_html 은 DB 정책상 운영자만 넣을 수 있음(factory_post). 그래도 스크립트·이벤트 속성은 걷어냄.
  const content = p.body_html
    ? String(p.body_html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    : `<div style="white-space:pre-wrap">${escHtml(p.body)}</div>`;
  const tags = (p.tags || []).map((t) => `<span>#${escHtml(t)}</span>`).join("");
  const more = others.map((o) => `<li><a href="/trend/${o.id}"><b>${escHtml(o.title)}</b><small>${fmtDate(o.created_at)}</small></a></li>`).join("");
  return new Response(await trendShell({
    title: `${p.title} | AI 성단 지도`,
    description: summary(p.body),
    canonical,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: p.title, datePublished: p.created_at,
      author: { "@type": "Organization", name: "AI 성단 지도" }, mainEntityOfPage: canonical },
    body: (content.includes('class="gx"')
      ? `<article>${content}</article>`
      : `<h1 class="post-h1 serif">${escHtml(p.title)}</h1><div class="meta">AI 성단 지도 · ${fmtDate(p.created_at)}</div><article class="paper">${content}</article>`)
      + `${tags ? `<div class="tags">${tags}</div>` : ""}`,
    side: trendSide(others.map((o) => `<li><a href="/trend/${o.id}">${escHtml(o.title)}</a></li>`).join("")),
    enHref,
  }, request, env), { headers: TREND_HEADERS });
}

async function trendSitemap() {
  let posts = [];
  try { posts = await sbGet("board_posts?select=id,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=5000"); } catch (e) {}
  const urls = [`<url><loc>${SITE}/trend/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`]
    .concat(posts.map((p) => `<url><loc>${SITE}/trend/${p.id}</loc><lastmod>${String(p.created_at).slice(0, 10)}</lastmod><priority>0.7</priority></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// /rss.xml — 빌드 때 만든 정적 RSS(고정 페이지 10개, scripts/build-dist.mjs)에 AI 트렌드 최신 글을
// 맨 앞에 붙여서 내보냄(2026-10-03 "새 글이 RSS에도 들어가게" - 네이버가 RSS로 새 글을 빨리 가져감).
// DB를 못 읽으면 정적 RSS 그대로.
function xmlEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

async function rssFeed(request, env) {
  const base = await env.ASSETS.fetch(new Request(new URL("/rss.xml", request.url)));
  let xml = await base.text();
  let posts = [];
  try {
    posts = await sbGet("board_posts?select=id,title,body,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=30");
  } catch (e) { /* 정적 RSS만 */ }
  if (posts.length) {
    const items = posts.map((p) => {
      const link = `${SITE}/trend/${p.id}`;
      return `<item><title>${xmlEsc(p.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid>` +
        `<description>${xmlEsc(summary(p.body, 300))}</description><pubDate>${new Date(p.created_at).toUTCString()}</pubDate></item>`;
    }).join("");
    const newest = new Date(posts[0].created_at).toUTCString();
    xml = xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, `<lastBuildDate>${newest}</lastBuildDate>`)
             .replace("<item>", items + "<item>");
  }
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/rss.xml") return rssFeed(request, env);
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/naver/start") return naverStart(request, url, env);
    if (url.pathname === "/api/auth/naver/callback") return naverCallback(request, url, env);
    if (url.pathname === "/api/posts") return receivePost(request, env);
    if (url.pathname === "/api/trend/latest") return trendLatest();
    /* /trend/ 목록은 site2 정적 페이지가 그림 */
    const tm = url.pathname.match(/^\/trend\/(\d+)\/?$/);
    if (tm) return trendPost(tm[1], request, env);
    if (url.pathname === "/sitemap-trend.xml") return trendSitemap();
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
