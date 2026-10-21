// Cloudflare Pages — Advanced mode 단일 워커
//  /api/*              → Supabase REST 프록시 (일부 망이 *.supabase.co 를 막아도 앱이 동작하도록)
//  /api/auth/naver/*   → 네이버 로그인(Supabase가 기본 지원하는 목록에 없어서 직접 구현, 아래 §NAVER 참고)
//  그 외                 → 정적 자산(index.html) 그대로 서빙
// DB 주소: 실서버는 이 값. 로컬 시험은 site2/.dev.vars 의 SUPABASE_URL(내 컴퓨터 DB, tools/local_supabase.py)로 바꿈(2026-10-21)
let UPSTREAM = "https://urflispegkzouclljxzg.supabase.co";
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
// 겹친 트렌드 글 정리(2026-10-19): 옮긴 글 번호 → 남긴 글 번호. 되돌리려면 줄을 지우고 DB hidden=false.
const TREND_MERGED = { "27": "30", "31": "36" };
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

// ==== §DOC: 구조화된 글 (2026-10-19) ====
// 글 공장이 완성 HTML 대신 글 칸(doc)과 메뉴·카테고리·틀 코드를 보내면 형식 검사·정리 후 board_posts 의
// menu_code·cat_code·design_code·doc(jsonb)에 저장하고, /trend/<id> 는 renderDoc 이 그린다(galaxy_pick 의 doc_struct.py 와 같은 규칙).
// 모든 칸 선택. 형식이 틀리면 400, 모르는 칸은 버림. 글자 칸은 태그를 빼고 화면에서 이스케이프,
// intro·sections[].body·faq[].a 만 짧은 HTML 허용(cleanHtml 로 스크립트·이벤트 속성·위험한 태그 제거). 주소는 http(s)·//·/ 로 시작하는 것만.
// SQL: scripts/migrate_board_posts_doc.sql (사람이 실행). 실행 전에도 코드·doc 없는 요청·화면은 예전과 똑같이 동작.
const DOC_CODES = ["menu_code", "cat_code", "design_code"];
const DOC_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const DOC_URL_RE = /^(https?:)?\/\/|^\/(?!\/)/i;
class DocError extends Error {}

function cleanHtml(html) {
  return String(html || "")
    .replace(/<(script|style|iframe|object|embed|form|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|form|noscript|input|button|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}
const stripTags = (s) => String(s).replace(/<[^>]+>/g, "");

function docText(v, where, n = 2000) {
  if (v === undefined || v === null) return "";
  if (!["string", "number"].includes(typeof v)) throw new DocError(`${where}: 글자여야 해요`);
  return stripTags(v).replace(/\s+/g, " ").trim().slice(0, n);
}
function docHtml(v, where) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new DocError(`${where}: 글자여야 해요`);
  const h = cleanHtml(v).trim().slice(0, 20000);
  if (h.includes("<")) return h;
  return h.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${escHtml(x)}</p>`).join(""); // 그냥 글자면 빈 줄로 문단
}
function docUrl(v, where) { const u = docText(v, where, 1000); return DOC_URL_RE.test(u) ? u : ""; }
function docList(v, where) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new DocError(`${where}: 목록([])이어야 해요`);
  return v.slice(0, 60);
}
function docObj(v, where) {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new DocError(`${where}: 묶음({})이어야 해요`);
  return v;
}
const docTexts = (v, w) => docList(v, w).map((x, i) => docText(x, `${w}[${i}]`)).filter(Boolean);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && (!Array.isArray(v) || v.length)));
function docImage(v, w) {
  const o = docObj(v, w);
  // width·height(선택, 2026-10-19 한국 여행): 화면이 사진 자리를 미리 잡게(정적 글과 같게). 양의 정수만
  const px = (v) => (Number.isInteger(v) && v > 0 && v < 20000 ? v : 0);
  const img = { src: docUrl(o.src, `${w}.src`), alt: docText(o.alt, `${w}.alt`, 200), credit: docText(o.credit, `${w}.credit`, 200), width: px(o.width), height: px(o.height) };
  return img.src ? compact(img) : null;
}
function docRows(v, w, fields, html = []) {
  return docList(v, w).map((x, i) => {
    const ww = `${w}[${i}]`, o = docObj(x, ww), r = {};
    for (const f of fields) {
      r[f] = f === "link" || f === "url" ? docUrl(o[f], `${ww}.${f}`) : f === "image" ? docImage(o[f], `${ww}.${f}`)
        : html.includes(f) ? docHtml(o[f], `${ww}.${f}`) : docText(o[f], `${ww}.${f}`);
    }
    return compact(r);
  }).filter((r) => Object.keys(r).length);
}
function docTable(v, w) {
  const o = docObj(v, w);
  const head = docTexts(o.head, `${w}.head`);
  const rows = docList(o.rows, `${w}.rows`).map((r, i) => docList(r, `${w}.rows[${i}]`).map((c, j) => docText(c, `${w}.rows[${i}][${j}]`, 500)));
  return head.length || rows.length ? { head, rows } : null;
}

// doc 검사·정리 → 정리된 묶음(빈 칸 뺌) 또는 null. 형식이 틀리면 DocError
function cleanDoc(doc) {
  if (doc === undefined || doc === null) return null;
  const w = "doc";
  if (typeof doc !== "object" || Array.isArray(doc)) throw new DocError("doc: 묶음({})이어야 해요");
  const cta = docObj(doc.cta, `${w}.cta`);
  const d = compact({
    chip: docText(doc.chip, `${w}.chip`, 40), title: docText(doc.title, `${w}.title`, 200),
    subtitle: docText(doc.subtitle, `${w}.subtitle`, 300), meta: docText(doc.meta, `${w}.meta`, 300),
    summary: docTexts(doc.summary, `${w}.summary`), intro: docHtml(doc.intro, `${w}.intro`), hero: docImage(doc.hero, `${w}.hero`),
    tiles: docRows(doc.tiles, `${w}.tiles`, ["n", "t", "d"]),
    sections: docList(doc.sections, `${w}.sections`).map((x, i) => {
      const ww = `${w}.sections[${i}]`, o = docObj(x, ww);
      return compact({ h: docText(o.h, `${ww}.h`, 200), body: docHtml(o.body, `${ww}.body`), list: docTexts(o.list, `${ww}.list`),
        table: docTable(o.table, `${ww}.table`), image: docImage(o.image, `${ww}.image`) });
    }).filter((s) => Object.keys(s).length),
    pros: docTexts(doc.pros, `${w}.pros`), cons: docTexts(doc.cons, `${w}.cons`), who: docText(doc.who, `${w}.who`),
    steps: docRows(doc.steps, `${w}.steps`, ["t", "d"]), checklist: docTexts(doc.checklist, `${w}.checklist`),
    items: docRows(doc.items, `${w}.items`, ["name", "price", "desc", "link", "image"]),
    faq: docRows(doc.faq, `${w}.faq`, ["q", "a"], ["a"]),
    cta: (() => { const c = { text: docText(cta.text, `${w}.cta.text`, 100), link: docUrl(cta.link, `${w}.cta.link`) }; return c.text && c.link ? c : null; })(),
    sources: docRows(doc.sources, `${w}.sources`, ["title", "url", "date"]),
    tags: docTexts(doc.tags, `${w}.tags`).map((t) => t.slice(0, 30)).slice(0, 15),
  });
  return Object.keys(d).length ? d : null;
}

// 요청에서 코드·doc 꺼내기 → { fields:{menu_code,cat_code,design_code,doc}|null(새 칸이 하나도 없음), doc }
function docFields(p) {
  if (![...DOC_CODES, "doc"].some((k) => p[k] !== undefined && p[k] !== null)) return { fields: null, doc: null };
  const fields = {};
  for (const k of DOC_CODES) {
    const v = p[k];
    if (v === undefined || v === null || String(v).trim() === "") fields[k] = null;
    else if (typeof v !== "string" || !DOC_CODE_RE.test(v.trim())) throw new DocError(`${k}: 영문·숫자·점(.)으로 된 코드여야 해요(예 GP.01.01)`);
    else fields[k] = v.trim();
  }
  const doc = cleanDoc(p.doc);
  fields.doc = doc;
  return { fields, doc };
}

// doc 의 글자만 이어 붙임 — body_text 없이 doc 만 온 글의 본문 글자(목록 요약·검색·RSS용)
function docPlain(doc) {
  const out = [];
  const walk = (v, k) => {
    if (["src", "link", "url", "credit", "alt"].includes(k)) return;
    if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") Object.entries(v).forEach(([kk, x]) => walk(x, kk));
    else if (typeof v === "string") out.push(stripTags(v));
  };
  walk(doc);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// doc → 본문 HTML(트렌드 글 화면). design_code 는 지금은 data-design 표시만 — 틀 고르기는 다음 단계.
const DOC_CSS = `<style>
.gdoc .d-chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px;border:1px solid var(--line);color:var(--amber)}
.gdoc .d-sub{font-size:17px;color:var(--soft);margin:6px 0}.gdoc .d-meta{color:var(--dim);font-size:13px;margin-bottom:12px}
.gdoc .d-sum{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px 12px 34px;margin:12px 0}
.gdoc figure{margin:16px 0}.gdoc figure img{width:100%;height:auto;border-radius:12px;display:block}.gdoc figcaption{font-size:12px;color:var(--dim);margin-top:4px}
.gdoc .d-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:10px;margin:14px 0}
.gdoc .d-tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.gdoc .d-tile b{display:block;font-size:20px;color:var(--amber)}.gdoc .d-tile small{display:block;color:var(--dim)}
.gdoc .d-table{overflow-x:auto;margin:12px 0}
.gdoc .d-pc{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.gdoc .d-pc>div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}.gdoc .d-pc ul{padding-left:18px;margin:6px 0 0}
.gdoc .d-who{border-left:4px solid var(--purple);background:var(--card);padding:10px 14px;border-radius:0 12px 12px 0;margin:14px 0}
.gdoc .d-steps{counter-reset:st;list-style:none;padding:0}.gdoc .d-steps li{counter-increment:st;position:relative;padding:0 0 10px 36px}.gdoc .d-steps li::before{content:counter(st);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:var(--purple);color:#0b0b14;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
.gdoc .d-check{list-style:none;padding:0}.gdoc .d-check li::before{content:"☐ ";color:var(--amber)}
.gdoc .d-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:12px;margin:14px 0}.gdoc .d-item{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.gdoc .d-item img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-radius:0}.gdoc .d-item div{padding:10px 12px;display:grid;gap:4px}.gdoc .d-item .pr{color:var(--amber);font-weight:700}
.gdoc .d-faq details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:6px 0}.gdoc .d-faq summary{font-weight:700;cursor:pointer;color:#fff}
.gdoc .d-src{font-size:13px;color:var(--dim);margin-top:18px}.gdoc .d-src ul{padding-left:18px}
@media (max-width:600px){.gdoc .d-pc{grid-template-columns:1fr}}
</style>`;

function renderDoc(d, designCode) {
  const e = escHtml, li = (xs) => xs.map((x) => `<li>${e(x)}</li>`).join("");
  const img = (i, alt) => `<figure><img src="${e(i.src)}" alt="${e(i.alt || alt || "")}" loading="lazy">${i.credit ? `<figcaption>사진: ${e(i.credit)}</figcaption>` : ""}</figure>`;
  const ext = (u) => /^(https?:)?\/\//i.test(u) ? ' target="_blank" rel="noopener nofollow"' : "";
  const h = [];
  if (d.chip) h.push(`<span class="d-chip">${e(d.chip)}</span>`);
  if (d.subtitle) h.push(`<p class="d-sub">${e(d.subtitle)}</p>`);
  if (d.meta) h.push(`<div class="d-meta">${e(d.meta)}</div>`);
  if (d.summary) h.push(`<ul class="d-sum">${li(d.summary)}</ul>`);
  if (d.hero) h.push(img(d.hero, d.title));
  if (d.intro) h.push(`<div class="d-intro">${cleanHtml(d.intro)}</div>`);  // HTML 칸은 저장 때 걸렀어도 그릴 때 한 번 더
  if (d.tiles) h.push(`<div class="d-tiles">${d.tiles.map((t) => `<div class="d-tile">${t.n ? `<b>${e(t.n)}</b>` : ""}${t.t ? `<span>${e(t.t)}</span>` : ""}${t.d ? `<small>${e(t.d)}</small>` : ""}</div>`).join("")}</div>`);
  (d.sections || []).forEach((s, i) => {
    h.push(`<section>${s.h ? `<h2 id="d${i + 1}">${e(s.h)}</h2>` : ""}${cleanHtml(s.body)}${s.list ? `<ul>${li(s.list)}</ul>` : ""}`
      + (s.table ? `<div class="d-table"><table>${s.table.head.length ? `<thead><tr>${s.table.head.map((x) => `<th>${e(x)}</th>`).join("")}</tr></thead>` : ""}<tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "")
      + (s.image ? img(s.image, s.h) : "") + `</section>`);
  });
  if (d.pros || d.cons) h.push(`<div class="d-pc">${d.pros ? `<div><b>👍 좋은 점</b><ul>${li(d.pros)}</ul></div>` : ""}${d.cons ? `<div><b>🤔 아쉬운 점</b><ul>${li(d.cons)}</ul></div>` : ""}</div>`);
  if (d.who) h.push(`<div class="d-who"><b>이런 분께</b><br>${e(d.who)}</div>`);
  if (d.steps) h.push(`<h2 id="d-steps">순서대로</h2><ol class="d-steps">${d.steps.map((x) => `<li>${x.t ? `<b>${e(x.t)}</b>` : ""}${x.d ? `<div>${e(x.d)}</div>` : ""}</li>`).join("")}</ol>`);
  if (d.checklist) h.push(`<h2 id="d-check">체크리스트</h2><ul class="d-check">${li(d.checklist)}</ul>`);
  if (d.items) h.push(`<h2 id="d-items">추천 도구</h2><div class="d-items">${d.items.map((it) => `<div class="d-item">${it.image ? `<img src="${e(it.image.src)}" alt="${e(it.image.alt || it.name || "")}" loading="lazy">` : ""}<div>${it.name ? `<b>${e(it.name)}</b>` : ""}${it.price ? `<span class="pr">${e(it.price)}</span>` : ""}${it.desc ? `<small>${e(it.desc)}</small>` : ""}${it.link ? `<a href="${e(it.link)}" target="_blank" rel="sponsored nofollow noopener">보러 가기 →</a>` : ""}</div></div>`).join("")}</div>`);
  if (d.faq) h.push(`<h2 id="d-faq">자주 묻는 질문</h2><div class="d-faq">${d.faq.map((x, i) => `<details${i ? "" : " open"}><summary>${e(x.q || "")}</summary><div>${cleanHtml(x.a)}</div></details>`).join("")}</div>`);
  if (d.cta) h.push(`<a class="cta" href="${e(d.cta.link)}"${ext(d.cta.link)}>${e(d.cta.text)}</a>`);
  if (d.sources) h.push(`<div class="d-src"><b>출처</b><ul>${d.sources.map((x) => `<li>${x.url ? `<a href="${e(x.url)}" target="_blank" rel="noopener nofollow">${e(x.title || x.url)}</a>` : e(x.title || "")}${x.date ? ` (${e(x.date)})` : ""}</li>`).join("")}</ul></div>`);
  return `${DOC_CSS}<article class="gdoc"${designCode ? ` data-design="${e(designCode)}"` : ""}>${h.join("\n")}</article>`;
}

// 이미 올라간 글 갱신 ("update": true, 같은 external_id) — 2026-10-03 글 형식을 바꾼 뒤 /trend/7 을 새 글로 바꾸려고 추가.
// DB 함수(factory_post)를 고치지 않고, 네이버 로그인용으로 이미 있는 SUPABASE_SERVICE_ROLE_KEY 로
// ① 토큰 해시가 factory_tokens 에 있는지 ② 같은 external_id 의 ai_trend 글을 찾아 제목·본문만 바꿈.
// 글이 없으면 null 을 돌려줘서 일반 등록으로 넘어감.
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function updatePost(token, p, env, extra = null) {
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
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 15) : [], ...(extra || {}) }),  // extra = 코드·doc(보냈을 때만, §DOC)
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
  if (!p || typeof p !== "object") return json({ ok: false, msg: "JSON 형식 아님" }, 400);
  // 구조화된 글(§DOC): menu_code·cat_code·design_code·doc — 하나도 없으면 extra=null 이라 아래는 예전과 똑같음
  let extra = null, doc = null;
  try { ({ fields: extra, doc } = docFields(p)); } catch (e) { if (e instanceof DocError) return json({ ok: false, msg: e.message }, 400); throw e; }
  if (doc) {  // doc 만 와도 됨: 제목은 doc.title, 본문 글자(목록 요약·RSS용)는 doc 글자, 태그는 doc.tags
    p = { ...p, title: p.title || doc.title, body_text: p.body_text || docPlain(doc).slice(0, 19000),  /* 트렌드 본문 2만 자 제한(DB) */ tags: p.tags || doc.tags };
  }
  if (!p?.title || !p?.body_text) return json({ ok: false, msg: "title, body_text(또는 doc) 필요" }, 400);
  if (p.update && p.external_id) {
    const res = await updatePost(token, p, env, extra);
    if (res) return res; // 없는 글이면 아래에서 새로 등록
  }
  const args = {
    p_token: token, p_external_id: p.external_id || null, p_title: String(p.title).slice(0, 120),
    p_body: p.body_text, p_body_html: p.body_html || null, p_tags: Array.isArray(p.tags) ? p.tags.slice(0, 15) : [],
  };
  // 새 칸이 있으면 factory_post_doc(scripts/migrate_board_posts_doc.sql) — 없으면 예전 factory_post 그대로
  if (extra) Object.assign(args, { p_menu_code: extra.menu_code, p_cat_code: extra.cat_code, p_design_code: extra.design_code, p_doc: extra.doc });
  const r = await fetch(`${UPSTREAM}/rest/v1/rpc/${extra ? "factory_post_doc" : "factory_post"}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
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

// 트렌드 목록 썸네일(2026-10-21 사용자: "글 누르면 나오는 그림을 목록 왼쪽 위에") — 규칙은 여기 한 곳.
// 빌드 목록(src/lib/data.ts)도 이 함수를 불러 씀. ① 글의 첫 그림(SVG, 궤도 등) ② 없으면 숫자 카드(tiles) 3개 ③ 둘 다 없으면 ''(별 배경)
// 그림 속 id 는 글마다 앞에 t<글번호>- 를 붙임(한 화면에 그림 여러 개면 그라데이션 id 가 겹쳐 색이 섞임)
export function trendThumb(html, id) {
  const h = String(html || "");
  const m = h.match(/<svg[\s\S]*?<\/svg>/i);
  if (m) {
    const p = `t${String(id).replace(/\D/g, "")}-`;
    const s = m[0].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "")
      .replace(/\bid=(['"])([^'"]+)\1/g, (_, q, v) => `id=${q}${p}${v}${q}`)
      .replace(/url\(#([^)\s]+)\)/g, (_, v) => `url(#${p}${v})`)
      .replace(/href=(['"])#([^'"]+)\1/g, (_, q, v) => `href=${q}#${p}${v}${q}`)
      .replace(/^<svg([^>]*?)\swidth=(['"])[^'"]*\2/i, "<svg$1").replace(/^<svg([^>]*?)\sstyle=(['"])[^'"]*\2/i, "<svg$1");
    return `<span class="tz-ph tz-fig">${s}</span>`;
  }
  const strip = (x) => String(x).replace(/<[^>]*>/g, "").trim();
  const tiles = [...h.matchAll(/<div class="tile"><div class="n">([\s\S]*?)<\/div><div class="t">([\s\S]*?)<\/div>/g)].slice(0, 3);
  if (tiles.length) return `<span class="tz-ph tz-tiles">${tiles.map(([, n, t]) => `<span><b>${strip(n)}</b><small>${strip(t)}</small></span>`).join("")}</span>`;
  return "";
}

// /api/trend/latest — 공통 껍데기(chrome.js)가 "이번 주 신호" 띠·최신 글 칸을 채울 때 씀. 5분 캐시.
async function trendLatest() {
  let posts = [];
  try { posts = await sbGet("board_posts?select=id,title,body,body_html,tags,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=12"); } catch (e) {}
  const out = posts.map((p) => { const m = String(p.body_html || "").match(/<img[^>]+src="(https:[^"]+)"/i); return { id: p.id, title: p.title, tags: p.tags || [], created_at: p.created_at, summary: summary(p.body, 120), ...(m ? { img: m[1] } : {}), thumb: trendThumb(p.body_html, p.id) }; });  // img = 본문 첫 그림(목록 사진 칸, 10/14)
  return new Response(JSON.stringify({ posts: out, total: out.length }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}

// ==== §NAVNEW: 메뉴 옆 'New' 표시 (2026-10-19) ====
// 새 글이 올라오면 그 메뉴(AI 트렌드·한국 여행·게시판) 옆에 NEW_BADGE_HOURS 동안 'New'. 기준 시간은 여기 한 곳.
// 화면(site2 components/common/NavNew.astro)은 이 JSON만 읽어 붙임 → 빌드·배포 없이 글이 올라오면 바로 바뀜.
//   AI 트렌드 = board_posts(board=ai_trend, 숨김 아님) created_at / 게시판 = board_posts(board=free, 숨김 아님) created_at
//   한국 여행 = korea_articles publish_date(한국 날짜, 그날 0시 KST부터 공개) — 공개일 전 글은 셈에 안 넣음
// DB 오류인 칸은 New 없음(false). 5분 캐시.
const NEW_BADGE_HOURS = 24;
async function navNew() {
  const now = Date.now(), win = NEW_BADGE_HOURS * 3600 * 1000;
  const fresh = (t) => Number.isFinite(t) && t <= now && now - t < win;
  const latest = async (q, f) => { try { const r = await sbGet(q); return r.length ? f(r[0]) : null; } catch (e) { return null; } };
  const [trend, board, korea] = await Promise.all([
    latest("board_posts?select=created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=1", (r) => r.created_at),
    latest("board_posts?select=created_at&board=eq.free&hidden=eq.false&order=created_at.desc&limit=1", (r) => r.created_at),
    latest(`korea_articles?select=publish_date&publish_date=lte.${kstToday()}&order=publish_date.desc&limit=1`, (r) => r.publish_date),
  ]);
  const at = { trend: Date.parse(trend), board: Date.parse(board), korea: Date.parse(`${korea}T00:00:00+09:00`) };
  const out = { hours: NEW_BADGE_HOURS, new: { trend: fresh(at.trend), korea: fresh(at.korea), board: fresh(at.board) }, latest: { trend, korea, board } };
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
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
    // 코드·doc 칸(§DOC)까지 읽고, SQL 실행 전이라 칸이 없으면(400) 예전 칸만 다시 읽음
    const q = `&board=eq.ai_trend&hidden=eq.false&id=eq.${id}`;
    try { [p] = await sbGet(`board_posts?select=id,title,body,body_html,tags,created_at,design_code,doc${q}`); }
    catch (e) { [p] = await sbGet(`board_posts?select=id,title,body,body_html,tags,created_at${q}`); }
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
    // 공장 우주 틀(class="gx", 12벌) 화면이 있으면 그것 먼저 — doc 기본 모양으로 그리면 우주 틀이 사라짐(2026-10-21 로컬 /trend/37 확인).
    // 우주 틀이 없는 구조화된 글만 doc 템플릿(§DOC), 그 밖은 예전 그대로
    body: (content.includes('class="gx"')
      ? `<article>${content}</article>`
      : p.doc && typeof p.doc === "object" && Object.keys(p.doc).length
      ? `<h1 class="post-h1 serif">${escHtml(p.title)}</h1><div class="meta">AI 성단 지도 · ${fmtDate(p.created_at)}</div>${renderDoc(p.doc, p.design_code)}`
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


// ==== §PAGES: 공장이 올린 화면(한국 여행 글 등) — 배포 없이 바로 보이게 (2026-10-14) ====
// 공장(common_prj)이 로컬 빌드한 완성 화면을 POST /api/pages 로 보내면 DB 함수 factory_page 가 토큰(해시)을 확인해 site_pages 에 저장.
// 방문자가 /korea/…, /en/korea/…, /sitemap-korea.xml 을 열면 저장된 화면이 있으면 그것을, 없거나 DB 오류면 원래 정적 파일을 보여 줌.
// → 2026-10-19부터 한국 여행은 §KOREA(korea_articles + 템플릿)가 먼저. 여기 저장분은 표가 없을 때·정적 파일도 없을 때만(지우지 않음).
// 틀은 site2 Astro 컴포넌트 하나(KoreaArticle) — 워커는 완성된 HTML을 그대로 내보내기만 함. 표: scripts/migrate_site_pages.sql
const PAGE_RE = /^\/(en\/)?korea\/([a-z0-9][a-z0-9-]{0,80}\/)?$/;

function pagePath(pathname) {
  if (pathname === "/sitemap-korea.xml") return pathname;
  const p = pathname.endsWith("/") ? pathname : pathname + "/";
  return PAGE_RE.test(p) ? p : null;
}

async function receivePage(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, msg: "토큰 없음" }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, msg: "JSON 형식 아님" }, 400); }
  if (!p?.path || !p?.html) return json({ ok: false, msg: "path, html 필요" }, 400);
  const r = await fetch(`${UPSTREAM}/rest/v1/rpc/factory_page`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: token, p_path: String(p.path), p_html: String(p.html), p_content_type: p.content_type || null, p_source: p.source || null }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(res?.message || "");
    return json({ ok: false, msg: msg.includes("bad_token") ? "토큰이 맞지 않음" : (msg || `저장 실패 ${r.status}`) }, msg.includes("bad_token") ? 401 : 400);
  }
  // 새로 올린 화면이 바로 보이게 캐시 비움
  try { await caches.default.delete(new Request(`${SITE}${p.path}`)); } catch (e) {}
  return json({ ok: true, path: p.path, url: `${SITE}${p.path}` });
}

async function storedPage(path, request) {
  const key = new Request(`${SITE}${path}`);
  try {
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const rows = await sbGet(`site_pages?path=eq.${encodeURIComponent(path)}&select=html,content_type,updated_at`);
    if (!rows?.length) return null;
    const res = new Response(rows[0].html, { headers: { "content-type": rows[0].content_type, "cache-control": "public, max-age=300", "x-galaxy-page": "factory " + rows[0].updated_at } });
    try { await caches.default.put(key, res.clone()); } catch (e) {}
    return res;
  } catch (e) {
    return null; // DB가 안 되면 정적 파일로
  }
}


// ==== §KOREA: 한국 여행 글 = DB 글 칸 + 템플릿 (2026-10-19) ====
// 사용자 원칙 "대본 텍스트·이미지만 DB에 저장하고 화면은 전부 템플릿이 그린다".
// 글 공장이 POST /api/korea 로 글 칸(doc, AI 트렌드와 같은 공통 글 구조)을 보내면 검사·정리(cleanDoc) 후 DB 함수 factory_korea 가
// korea_articles 에 저장(같은 slug·lang 이면 갱신). /korea/<slug>/ · /en/korea/<slug>/ · 목록 /korea/ · /en/korea/ · /sitemap-korea.xml 은
// 이 표에서 읽어 그린다. 틀 = 빌드된 /frame-korea · /en/frame-korea(사이트 공통 PageLayout — 머리줄·왼쪽 메뉴·꼬리말)라서 틀을 바꿔 배포하면 같이 바뀜.
// 글 본문 모양은 site2 KoreaArticle.astro·KoreaList.astro 와 같은 마크업(같은 Tailwind 칸·KoreaStyles CSS).
// 순서: korea_articles → (없으면) 정적 빌드 → (정적도 없으면) site_pages 옛 저장 화면. 표가 아직 없거나(SQL 전) 비었으면 예전 순서(site_pages → 정적) 그대로.
// SQL: scripts/migrate_korea_articles.sql · 옮기기: scripts/korea_articles_to_sql.mjs (둘 다 사람이 실행)
const KOREA_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const KOREA_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" };
const KT = {
  ko: { site: "AI 성단 지도", list: "/korea/", listName: "한국 여행", updated: "기준", src: "자료 출처", other: "Read in English", o: "en",
    note: "거리는 직선거리예요. 운영시간·요금은 바뀔 수 있으니 출발 전에 한 번 더 확인하세요.", emergency: "응급 119 · 바다 해양경찰 122",
    lTitle: "한국 여행 — 공공데이터로 정리한 가기 전 체크", lDesc: "주차·응급실·숙소·수질·이용객 같은 공공데이터로 정리한 한국 여행지 안내예요. 영어판도 함께 있어요.", empty: "아직 글이 없어요.",
    faq: "자주 묻는 질문", steps: "순서대로", check: "체크리스트", pros: "좋은 점", cons: "아쉬운 점", who: "이런 분께", items: "추천" },
  en: { site: "AI Galaxy Map", list: "/en/korea/", listName: "Korea travel", updated: "Data as of", src: "Sources", other: "한국어로 보기", o: "ko",
    note: "Distances are straight-line. Opening hours and fees can change, so check again before you travel.", emergency: "Emergency 119 · Coast Guard 122",
    lTitle: "Korea travel — before-you-go guides from public data", lDesc: "Guides to places in Korea built from public data: parking, emergency care, places to stay, water quality and visitor numbers. Each guide also has a Korean version.", empty: "No guides yet.",
    faq: "FAQ", steps: "Step by step", check: "Checklist", pros: "Good", cons: "Not so good", who: "Good for", items: "Picks" },
};
const kPath = (lang, slug) => (lang === "en" ? "/en/korea/" : "/korea/") + (slug ? `${slug}/` : "");
// 아이콘(astro-icon tabler) — 정적 글과 같은 SVG. 첫 번째만 symbol 정의
const ICON_D = { "chevron-right": "m9 6l6 6l-6 6", "arrow-right": "M5 12h14m-6 6l6-6m-6-6l6 6" };
function kIcon(name, cls, used) {
  const sym = used.has(name) ? "" : `<symbol id="ai:tabler:${name}"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICON_D[name]}"/></symbol>`;
  used.add(name);
  return `<svg width="1em" height="1em" viewBox="0 0 24 24" class="${cls}" data-icon="tabler:${name}">${sym}<use href="#ai:tabler:${name}"></use></svg>`;
}
const ldJson = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
function kstToday() { const k = new Date(Date.now() + 9 * 3600 * 1000); return k.toISOString().slice(0, 10); }
const srcText = (s) => `${s.title || ""}${s.date ? ` (${s.date})` : ""}`;

// doc 본문(소개·소제목 칸 + 그 밖의 공통 칸) → .korea-body 안쪽 HTML. 표는 정적 글처럼 가로 넘김 칸(.tw)으로 감쌈
function koreaBody(d, T) {
  const e = escHtml, li = (xs) => xs.map((x) => `<li>${e(x)}</li>`).join("");
  const h = [];
  if (d.summary) h.push(`<ul>${li(d.summary)}</ul>`);
  if (d.intro) h.push(cleanHtml(d.intro));
  for (const s of d.sections || []) {
    h.push(`${s.h ? `<h2>${e(s.h)}</h2>` : ""}${s.body ? cleanHtml(s.body) : ""}${s.list ? `<ul>${li(s.list)}</ul>` : ""}`
      + (s.table ? `<table>${s.table.head.length ? `<thead><tr>${s.table.head.map((x) => `<th>${e(x)}</th>`).join("")}</tr></thead>` : ""}<tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "")
      + (s.image ? `<figure><img src="${e(s.image.src)}" alt="${e(s.image.alt || s.h || "")}" loading="lazy">${s.image.credit ? `<figcaption>${e(s.image.credit)}</figcaption>` : ""}</figure>` : ""));
  }
  if (d.pros) h.push(`<h3>${T.pros}</h3><ul>${li(d.pros)}</ul>`);
  if (d.cons) h.push(`<h3>${T.cons}</h3><ul>${li(d.cons)}</ul>`);
  if (d.who) h.push(`<p><b>${T.who}</b> ${e(d.who)}</p>`);
  if (d.steps) h.push(`<h2>${T.steps}</h2><ol>${d.steps.map((x) => `<li>${x.t ? `<b>${e(x.t)}</b> ` : ""}${x.d ? e(x.d) : ""}</li>`).join("")}</ol>`);
  if (d.checklist) h.push(`<h2>${T.check}</h2><ul>${li(d.checklist)}</ul>`);
  if (d.items) h.push(`<h2>${T.items}</h2><ul>${d.items.map((it) => `<li>${it.link ? `<a href="${e(it.link)}" target="_blank" rel="sponsored nofollow noopener">${e(it.name || it.link)}</a>` : e(it.name || "")}${it.price ? ` · ${e(it.price)}` : ""}${it.desc ? ` — ${e(it.desc)}` : ""}</li>`).join("")}</ul>`);
  if (d.faq) h.push(`<h2>${T.faq}</h2>${d.faq.map((x) => `<details><summary>${e(x.q || "")}</summary>${cleanHtml(x.a || "")}</details>`).join("")}`);
  return h.join("\n").replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>");
}

// 글 한 편(한 언어) → <article> — KoreaArticle.astro 와 같은 구성(크럼·제목·소개·기준일·사진·숫자 칸·본문·안내 링크·주의·출처·다른 언어·JSON-LD)
function koreaArticleHtml(row, lang, hasOther) {
  const d = row.doc || {}, T = KT[lang], e = escHtml, used = new Set();
  const path = kPath(lang, row.slug), altPath = kPath(T.o, row.slug);
  const title = row.title || d.title || "", sources = Array.isArray(row.sources) && row.sources.length ? row.sources : d.sources || [];
  const crumbs = [{ text: T.listName, href: T.list }, { text: d.chip || "" }];
  const crumbLd = { "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ name: c.text, url: c.href ? SITE + c.href : i === crumbs.length - 1 ? SITE + path : "" })).filter((x) => x.url && x.name)
      .map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: x.url })) };
  const site = T.site;
  const articleLd = { "@context": "https://schema.org", "@type": "Article", headline: title, description: d.subtitle || "", inLanguage: lang,
    datePublished: row.publish_date, dateModified: row.publish_date, ...(d.hero ? { image: [d.hero.src] } : {}), mainEntityOfPage: SITE + path,
    author: { "@type": "Organization", name: site, url: SITE }, publisher: { "@type": "Organization", name: site, url: SITE },
    isBasedOn: sources.map(srcText) };
  const h = [];
  h.push(`<article class="max-w-3xl mx-auto px-4 sm:px-6 py-7 md:py-9"><nav aria-label="Breadcrumb" class="text-sm text-muted mb-3"><ol class="flex flex-wrap items-center gap-1 list-none">`
    + crumbs.map((c, i) => `<li class="flex min-w-0 items-center gap-1">${i > 0 ? kIcon("chevron-right", "h-3.5 w-3.5 shrink-0 opacity-60 rtl:rotate-180", used) : ""}`
      + (c.href && i < crumbs.length - 1 ? `<a href="${e(c.href)}" class="inline-flex items-center hover:text-link hover:underline">${e(c.text)}</a>` : `<span aria-current="page" class="text-default">${e(c.text)}</span>`) + `</li>`).join("")
    + `</ol></nav>${ldJson(crumbLd)}`);
  h.push(`<h1 class="text-2xl md:text-3xl font-bold leading-tighter tracking-tighter font-heading text-heading text-balance">${e(title)}</h1>`);
  h.push(`<p class="mt-2 text-base text-muted text-pretty">${e(d.subtitle || "")}</p><p class="mt-2 text-sm text-muted">${T.updated} ${e(row.publish_date)}</p>`);
  if (d.hero) h.push(`<figure class="mt-6"><img src="${e(d.hero.src)}" alt="${e(d.hero.alt || "")}" class="w-full h-auto rounded-md bg-slate-800" loading="eager"${d.hero.width && d.hero.height ? ` width="${d.hero.width}" height="${d.hero.height}"` : ""}><figcaption class="text-xs text-muted mt-2">${e(d.hero.credit || "")}</figcaption></figure>`);
  if (d.tiles) h.push(`<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-700 border border-slate-700 rounded-md overflow-hidden mt-6">${d.tiles.map((t) => `<div class="bg-page p-3"><small class="block text-xs text-muted">${e(t.t || t.d || "")}</small><b class="text-xl tabular-nums text-heading">${e(t.n || "")}</b></div>`).join("")}</div>`);
  h.push(`<div class="prose prose-invert prose-base max-w-none mt-8 korea-body">${koreaBody(d, T)}</div>`);
  if (d.cta) h.push(`<a href="${e(d.cta.link)}" class="btn-primary mt-6">${e(d.cta.text)}${kIcon("arrow-right", "w-5 h-5 ml-1 -mr-1", used)}</a>`);
  h.push(`<p class="text-sm text-muted mt-6">${T.note} ${T.emergency}</p>`);
  h.push(`<div class="border-t border-slate-800 mt-8 pt-4 text-sm text-muted"><b class="text-default">${T.src}</b><ul class="list-disc pl-5 mt-2 space-y-1">`
    + sources.map((s) => `<li>${s.url ? `<a href="${e(s.url)}" target="_blank" rel="noopener nofollow">${e(s.title || s.url)}</a>${s.date ? ` (${e(s.date)})` : ""}` : e(srcText(s))}</li>`).join("") + `</ul>`
    + (hasOther ? `<a href="${altPath}" hreflang="${T.o}" class="inline-flex items-center gap-1 mt-4 text-link hover:underline font-medium">${T.other}${kIcon("chevron-right", "w-4 h-4", used)}</a>` : "")
    + `</div>${ldJson(articleLd)}</article>`);
  return h.join("");
}

// 목록 → KoreaList.astro 와 같은 카드 격자
function koreaListHtml(rows, lang) {
  const T = KT[lang], e = escHtml;
  const cards = rows.map((r) => `<a href="${kPath(lang, r.slug)}" class="block rounded-md border border-slate-700 bg-slate-900/40 md:p-5 not-prose hover:border-primary/70 hover:bg-slate-900/70 transition duration-150 ease-in-out p-0 overflow-hidden">`
    + (r.hero?.src ? `<img src="${e(r.hero.src)}" alt="${e(r.hero.alt || "")}" loading="lazy" class="w-full h-44 object-cover bg-slate-800">` : "")
    + `<div class="p-5"><small class="text-xs text-link">${e(r.chip || "")} · ${e(r.publish_date)}</small><h3 class="text-lg font-bold text-heading leading-snug mt-1 text-balance">${e(r.title)}</h3>`
    + `<p class="text-sm text-muted mt-2 line-clamp-3">${e(r.subtitle || "")}</p></div></a>`).join("");
  return `<div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-7 md:py-9"><h1 class="text-2xl md:text-3xl font-bold leading-tighter tracking-tighter font-heading text-heading text-balance">${T.lTitle}</h1>`
    + `<p class="mt-2 text-base text-muted max-w-3xl text-pretty">${T.lDesc}</p>`
    + (rows.length ? `<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-8">${cards}</div>` : `<p class="mt-8 text-muted">${T.empty}</p>`) + `</div>`;
}

// 빌드된 틀(/frame-korea, /en/frame-korea)에 자리표 채우기 — trendShell 과 같은 방식
const _koreaFrame = {};
async function koreaShell(lang, { title, description, slug, ogType, image, body, hasKo = true, hasEn = true }, request, env) {
  if (!_koreaFrame[lang]) {
    const r = await env.ASSETS.fetch(new Request(new URL(lang === "en" ? "/en/frame-korea" : "/frame-korea", request.url)));
    const t = await r.text();
    if (!r.ok || !t.includes("__BODY__")) throw new Error("frame-korea 없음 " + r.status);
    _koreaFrame[lang] = t;
  }
  let t = _koreaFrame[lang].replace(/<meta name="robots" content="noindex, nofollow">/, "");
  if (image) t = t.split(`${SITE}__IMAGE__`).join(escHtml(/^https?:/i.test(image) ? image : SITE + image));
  else t = t.replace(/<meta property="og:image"[^>]*>/, "").replace('content="summary_large_image"', 'content="summary"');
  // 짝 언어가 없는 글이면 그 hreflang 줄은 뺌(x-default 는 있는 쪽으로)
  if (!hasEn) t = t.replace(/<link rel="alternate" hreflang="en"[^>]*>/, "").split(`hreflang="x-default" href="${SITE}/en/korea/__SLUG__"`).join(`hreflang="x-default" href="${SITE}/korea/__SLUG__"`);
  if (!hasKo) t = t.replace(/<link rel="alternate" hreflang="ko"[^>]*>/, "");
  // Astro 와 같은 이스케이프: 글자 칸(<title>)은 & < > " ' 모두, 속성 값은 & " 만
  const attr = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  t = t.split("<title>__TITLE__").join("<title>" + escHtml(title)).split("__TITLE__").join(attr(title)).split("__DESC__").join(attr(description)).split("__OGTYPE__").join(ogType)
    .split("__SLUG__").join(slug ? `${slug}/` : "").replace("__BODY__", () => body);
  // 목록 화면이면 머리줄 '한국 여행' 메뉴를 켜진 모양으로(틀은 글 주소 기준으로 빌드돼 목록 주소와 안 맞음 — Header.astro isActive 와 같게)
  return slug ? t : t.replace(`whitespace-nowrap gap-1" href="${kPath(lang)}"`, `whitespace-nowrap gap-1 aw-link-active" href="${kPath(lang)}"`);
}

const KOREA_LIST_SEL = "slug,lang,title,publish_date,chip:doc->>chip,subtitle:doc->>subtitle,hero:doc->hero";
const koreaSort = (rows) => rows.sort((a, b) => (String(b.publish_date) + b.slug).localeCompare(String(a.publish_date) + a.slug));

// 한국 여행 주소 하나 → Response | "missing"(표엔 있는데 이 글이 없음) | "legacy"(표가 없거나 비었거나 DB 오류 → 예전 순서)
async function koreaFromDb(path, request, env) {
  const today = kstToday();
  try {
    if (path === "/sitemap-korea.xml") {
      const rows = await sbGet(`korea_articles?select=slug,lang,publish_date&publish_date=lte.${today}&order=publish_date.desc,slug.desc`);
      if (!rows.length) return "legacy";
      // 정적 빌드(postbuild.mjs)와 같은 모양: 영어 글 → 한국어 글, 각각 slug 순, 끝 / 없이
      const bySlug = (l) => rows.filter((r) => r.lang === l).map((r) => r.slug).sort();
      const locs = [...bySlug("en").map((x) => `${SITE}/en/korea/${x}`), ...bySlug("ko").map((x) => `${SITE}/korea/${x}`)];
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`,
        { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    const m = path.match(/^\/(en\/)?korea\/(?:([a-z0-9][a-z0-9-]{0,80})\/)?$/);
    if (!m) return "legacy";
    const lang = m[1] ? "en" : "ko", T = KT[lang];
    if (!m[2]) {
      const rows = await sbGet(`korea_articles?select=${KOREA_LIST_SEL}&lang=eq.${lang}&publish_date=lte.${today}&order=publish_date.desc,slug.desc`);
      if (!rows.length) return "legacy";
      koreaSort(rows);
      return new Response(await koreaShell(lang, { title: T.lTitle, description: T.lDesc, slug: "", ogType: "website", image: "", body: koreaListHtml(rows, lang) }, request, env), { headers: KOREA_HEADERS });
    }
    const rows = await sbGet(`korea_articles?select=slug,lang,title,doc,design_code,publish_date,sources,updated_at&slug=eq.${m[2]}&publish_date=lte.${today}`);
    const row = rows.find((r) => r.lang === lang);
    if (!row) return "missing";
    const hasOther = rows.some((r) => r.lang === T.o);
    const d = row.doc || {};
    return new Response(await koreaShell(lang, { title: row.title || d.title || "", description: d.subtitle || "", slug: row.slug, ogType: "article", image: d.hero?.src || "",
      body: koreaArticleHtml(row, lang, hasOther), hasKo: lang === "ko" || hasOther, hasEn: lang === "en" || hasOther }, request, env),
      { headers: { ...KOREA_HEADERS, "x-galaxy-page": "korea_articles " + row.updated_at } });
  } catch (e) {
    return "legacy"; // 표가 아직 없음(SQL 전)·DB 오류·틀 없음 → 예전 순서
  }
}

async function koreaRoute(path, request, env) {
  const r = await koreaFromDb(path, request, env);
  if (r instanceof Response) return r;
  if (r === "legacy") { const page = await storedPage(path, request); return page || env.ASSETS.fetch(request); }
  // 표에 이 글이 없음 → 정적 빌드, 정적도 없으면 옛 저장 화면(site_pages, 지우지 않고 마지막 대안으로만)
  const stat = await env.ASSETS.fetch(request);
  if (stat.status < 400) return stat;
  return (await storedPage(path, request)) || stat;
}

// POST /api/korea — AI 트렌드 /api/posts 와 같은 토큰(factory_tokens 해시, DB 함수 안에서 확인)·같은 doc 검사(cleanDoc)
// 보낼 것: { slug, lang:"ko"|"en", doc, publish_date:"YYYY-MM-DD", title?(없으면 doc.title), sources?(없으면 doc.sources), menu_code?, cat_code?, design_code? }
async function receiveKorea(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, msg: "토큰 없음" }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, msg: "JSON 형식 아님" }, 400); }
  if (!p || typeof p !== "object") return json({ ok: false, msg: "JSON 형식 아님" }, 400);
  const slug = String(p.slug || "").trim(), lang = String(p.lang || "").trim(), publish = String(p.publish_date || p.publish || "").trim();
  if (!KOREA_SLUG_RE.test(slug)) return json({ ok: false, msg: "slug: 영문 소문자·숫자·- 만(예 seoraksan)" }, 400);
  if (!["ko", "en"].includes(lang)) return json({ ok: false, msg: "lang: ko 또는 en" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publish) || isNaN(Date.parse(publish))) return json({ ok: false, msg: "publish_date: YYYY-MM-DD" }, 400);
  let fields, sources;
  try {
    ({ fields } = docFields({ ...p, doc: p.doc ?? {} }));
    sources = p.sources !== undefined && p.sources !== null ? docRows(p.sources, "sources", ["title", "url", "date"]) : null;
  } catch (e) { if (e instanceof DocError) return json({ ok: false, msg: e.message }, 400); throw e; }
  const doc = fields?.doc;
  if (!doc) return json({ ok: false, msg: "doc 필요" }, 400);
  const title = docText(p.title, "title", 200) || doc.title;
  if (!title) return json({ ok: false, msg: "title(또는 doc.title) 필요" }, 400);
  const r = await fetch(`${UPSTREAM}/rest/v1/rpc/factory_korea`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: token, p_slug: slug, p_lang: lang, p_title: title, p_doc: doc, p_menu_code: fields.menu_code, p_cat_code: fields.cat_code,
      p_design_code: fields.design_code, p_publish_date: publish, p_sources: sources || doc.sources || [] }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    const bad = String(res?.message || "").includes("bad_token");
    return json({ ok: false, msg: bad ? "토큰이 맞지 않음" : (res?.message || `저장 실패 ${r.status}`) }, bad ? 401 : 400);
  }
  return json({ ok: true, slug, lang, updated: !!res.updated, url: `${SITE}${kPath(lang, slug)}` });
}

export default {
  async fetch(request, env) {
    if (env?.SUPABASE_URL) UPSTREAM = env.SUPABASE_URL;  // 로컬 시험용 DB(설정 있을 때만)
    if (new URL(request.url).pathname === "/rss.xml") return rssFeed(request, env);
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/naver/start") return naverStart(request, url, env);
    if (url.pathname === "/api/auth/naver/callback") return naverCallback(request, url, env);
    if (url.pathname === "/api/posts") return receivePost(request, env);
    if (url.pathname === "/api/pages") return receivePage(request);
    if (url.pathname === "/api/korea") return receiveKorea(request);
    if (url.pathname === "/api/trend/latest") return trendLatest();
    if (url.pathname === "/api/nav-new") return navNew();
    /* /trend/ 목록은 site2 정적 페이지가 그림 */
    // 같은 주제로 겹친 글은 남긴 글로 영구 이동(옮긴 글은 DB에서 hidden=true). 한국어·영어 둘 다.
    const mm = url.pathname.match(/^(\/en)?\/trend\/(\d+)\/?$/);
    if (mm && TREND_MERGED[mm[2]]) return Response.redirect(`${url.origin}${mm[1] ? `/en/trend/${TREND_MERGED[mm[2]]}/` : `/trend/${TREND_MERGED[mm[2]]}`}`, 301);
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
    if (request.method === "GET" || request.method === "HEAD") {
      // 한국 여행(§KOREA): korea_articles → 정적 빌드 → site_pages(옛 저장 화면은 새 화면을 덮지 않음)
      const pp = pagePath(url.pathname);
      if (pp) return koreaRoute(pp, request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
