// Cloudflare Pages — Advanced mode 단일 워커
//  /api/*  → Supabase REST 프록시 (일부 망이 *.supabase.co 를 막아도 앱이 동작하도록)
//  그 외    → 정적 자산(index.html) 그대로 서빙
const UPSTREAM = "https://urflispegkzouclljxzg.supabase.co";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,prefer,range,x-client-info,accept-profile,content-profile",
  "Access-Control-Expose-Headers": "content-range,range-unit",
  "Access-Control-Max-Age": "86400",
};

async function proxy(request, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

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
    if (url.pathname === "/api/log") {
      const body = request.method === "POST" ? await request.text() : "";
      console.log("CLIENT-LOG", body);
      return new Response(null, { status: 204, headers: CORS });
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxy(request, url);
    return env.ASSETS.fetch(request);
  },
};
