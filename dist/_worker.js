// Cloudflare Pages — Advanced mode 단일 워커
//  /api/*  → Supabase REST 프록시 (일부 망이 *.supabase.co 를 막아도 앱이 동작하도록)
//  그 외    → 정적 자산(index.html) 그대로 서빙
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

  const init = { method: request.method, headers, redirect: "follow" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

  let resp;
  try {
    resp = await fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream_fetch_failed", message: String(e) }),
      { status: 502, headers: { "content-type": "application/json", ...CORS } });
  }

  const out = new Headers(resp.headers);
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);
  ["content-encoding", "content-length", "transfer-encoding"].forEach((h) => out.delete(h));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxy(request, url);
    return env.ASSETS.fetch(request);
  },
};
