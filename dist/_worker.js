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

async function receivePost(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, msg: "토큰 없음" }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, msg: "JSON 형식 아님" }, 400); }
  if (!p?.title || !p?.body_text) return json({ ok: false, msg: "title, body_text 필요" }, 400);
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

function trendShell({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article"><meta property="og:site_name" content="AI 성단 지도">
<meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a89bf0' d='M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'/%3E%3C/svg%3E">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1632907475675251" crossorigin="anonymous"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>
:root{--bg:#f7f7fb;--card:#fff;--ink:#1d1d2b;--dim:#6b6b80;--line:#e3e3ee;--acc:#5b4bd6}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d18;--card:#161626;--ink:#e8e8f2;--dim:#9a9ab0;--line:#2a2a40;--acc:#9d8cff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.7}
header{border-bottom:1px solid var(--line);background:var(--card)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;gap:14px;height:56px}
.top a{color:var(--ink);text-decoration:none;font-weight:700}.top .sp{flex:1}.top .lnk{font-weight:500;color:var(--dim);font-size:14px}
main{padding:28px 0 60px}
h1{font-size:26px;line-height:1.35;margin:0 0 8px}
.meta{color:var(--dim);font-size:13px;margin-bottom:24px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:24px 0}.tags span{font-size:12px;color:var(--acc);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
article{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 22px;overflow-wrap:anywhere}
article p,article li{color:var(--ink)!important}article table{width:100%;border-collapse:collapse;font-size:14px;display:block;overflow-x:auto}
article th,article td{border:1px solid var(--line);padding:6px 8px}article img{max-width:100%;height:auto}
article h2{color:var(--ink)}
.list{list-style:none;padding:0;margin:0}.list li{border-bottom:1px solid var(--line)}
.list a{display:block;padding:16px 4px;color:var(--ink);text-decoration:none}.list a:hover b{color:var(--acc)}
.list b{display:block;font-size:17px}.list small{color:var(--dim);font-size:13px}
.more{margin-top:36px}.more h2{font-size:18px}
.cta{display:inline-block;margin-top:28px;background:var(--acc);color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700}
footer{color:var(--dim);font-size:12px;text-align:center;padding:24px 0}footer a{color:var(--dim)}
</style></head><body>
<header><div class="wrap top"><a href="/">✦ AI 성단 지도</a><span class="sp"></span><a class="lnk" href="/trend/">AI 트렌드</a><a class="lnk" href="/">3D 지도</a></div></header>
<main class="wrap">${body}</main>
<footer class="wrap">© AI 성단 지도 · <a href="/privacy">개인정보처리방침</a></footer>
</body></html>`;
}

async function trendList() {
  let posts = [];
  try {
    posts = await sbGet("board_posts?select=id,title,body,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=100");
  } catch (e) { /* 목록 실패해도 빈 화면으로 */ }
  const items = posts.map((p) => `<li><a href="/trend/${p.id}"><b>${escHtml(p.title)}</b><small>${fmtDate(p.created_at)} · ${escHtml(summary(p.body, 90))}</small></a></li>`).join("");
  return new Response(trendShell({
    title: "AI 트렌드 — 요즘 뜨는 AI 도구·순위·종류 정리 | AI 성단 지도",
    description: "요즘 많이 쓰는 AI 도구 순위, 종류별 AI 정리, 새로 나온 AI 소식을 누구나 읽기 쉽게 정리합니다.",
    canonical: `${SITE}/trend/`,
    body: `<h1>AI 트렌드</h1><div class="meta">요즘 뜨는 AI 도구·순위·종류를 쉽게 정리한 글</div>
<ul class="list">${items || "<li style='padding:16px 4px;color:var(--dim)'>아직 글이 없어요.</li>"}</ul>
<a class="cta" href="/">✦ 3D 지도에서 AI 731개 둘러보기</a>`,
  }), { headers: TREND_HEADERS });
}

async function trendPost(id) {
  let p, others = [];
  try {
    [p] = await sbGet(`board_posts?select=id,title,body,body_html,tags,created_at&board=eq.ai_trend&hidden=eq.false&id=eq.${id}`);
    others = await sbGet(`board_posts?select=id,title,created_at&board=eq.ai_trend&hidden=eq.false&id=neq.${id}&order=created_at.desc&limit=6`);
  } catch (e) { /* 아래 404 처리 */ }
  if (!p) return new Response(trendShell({ title: "글을 찾을 수 없어요 | AI 성단 지도", description: "", canonical: `${SITE}/trend/`,
    body: `<h1>글을 찾을 수 없어요</h1><a class="cta" href="/trend/">AI 트렌드 목록으로</a>` }), { status: 404, headers: TREND_HEADERS });
  const canonical = `${SITE}/trend/${p.id}`;
  // body_html 은 DB 정책상 운영자만 넣을 수 있음(factory_post). 그래도 스크립트·이벤트 속성은 걷어냄.
  const content = p.body_html
    ? String(p.body_html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    : `<div style="white-space:pre-wrap">${escHtml(p.body)}</div>`;
  const tags = (p.tags || []).map((t) => `<span>#${escHtml(t)}</span>`).join("");
  const more = others.map((o) => `<li><a href="/trend/${o.id}"><b>${escHtml(o.title)}</b><small>${fmtDate(o.created_at)}</small></a></li>`).join("");
  return new Response(trendShell({
    title: `${p.title} | AI 성단 지도`,
    description: summary(p.body),
    canonical,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: p.title, datePublished: p.created_at,
      author: { "@type": "Organization", name: "AI 성단 지도" }, mainEntityOfPage: canonical },
    body: `<h1>${escHtml(p.title)}</h1><div class="meta">AI 성단 지도 · ${fmtDate(p.created_at)}</div>
<article>${content}</article>
${tags ? `<div class="tags">${tags}</div>` : ""}
<a class="cta" href="/">✦ 3D 지도에서 AI 731개 둘러보기</a>
${more ? `<section class="more"><h2>함께 보면 좋은 글</h2><ul class="list">${more}</ul></section>` : ""}`,
  }), { headers: TREND_HEADERS });
}

async function trendSitemap() {
  let posts = [];
  try { posts = await sbGet("board_posts?select=id,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=5000"); } catch (e) {}
  const urls = [`<url><loc>${SITE}/trend/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`]
    .concat(posts.map((p) => `<url><loc>${SITE}/trend/${p.id}</loc><lastmod>${String(p.created_at).slice(0, 10)}</lastmod><priority>0.7</priority></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/naver/start") return naverStart(request, url, env);
    if (url.pathname === "/api/auth/naver/callback") return naverCallback(request, url, env);
    if (url.pathname === "/api/posts") return receivePost(request);
    if (url.pathname === "/trend" || url.pathname === "/trend/") return trendList();
    const tm = url.pathname.match(/^\/trend\/(\d+)\/?$/);
    if (tm) return trendPost(tm[1]);
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
