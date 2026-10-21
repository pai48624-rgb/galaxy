// 한국 여행 = DB 글 칸 + 템플릿 시험(2026-10-19) — 가짜 Supabase(korea_articles·site_pages·RPC) + 빌드된 site2/dist(틀·정적 글)로 워커를 직접 부름. 실서버·실DB 안 씀.
// 먼저: (site2) npx astro build && node scripts/postbuild.mjs   → dist/frame-korea.html · dist/en/frame-korea.html · 정적 한국 여행 글이 있어야 함
// 실행: node site2/scripts/test_korea_doc.mjs
// 확인: 옛 저장 화면(site_pages)이 있어도 새 화면 / 새 화면 = 정적 빌드 글과 같은 본문 / 꼬리말 '사이트 소개' / 한·영 hreflang·canonical /
//       공개일 전 글 숨김 / 목록·사이트맵 = 정적 빌드와 같음 / 표가 없을 때 예전 순서 / POST /api/korea 토큰·검사 / 옮기기(글 원본·site_pages 저장분)
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
if (!existsSync(path.join(DIST, "frame-korea.html"))) { console.error("dist/frame-korea.html 없음 — 먼저 site2 빌드"); process.exit(1); }
const worker = (await import(pathToFileURL(path.join(here, "../worker/_worker.js")).href)).default;
const M = await import(pathToFileURL(path.join(here, "../../scripts/korea_articles_to_sql.mjs")).href);

// ---- 가짜 정적 파일(Pages ASSETS): site2/dist 그대로. /x.html 은 /x 로, /x/ 는 /x/index.html ----
const ASSETS = { fetch: async (req) => {
  const p = decodeURIComponent(new URL(req.url).pathname);
  const f = p.endsWith("/") ? path.join(DIST, p, "index.html") : existsSync(path.join(DIST, p + ".html")) ? path.join(DIST, p + ".html") : path.join(DIST, p);
  if (!existsSync(f) || f.endsWith("/")) return new Response("not found", { status: 404 });
  return new Response(readFileSync(f), { headers: { "content-type": f.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8" } });
} };
const env = { ASSETS };
globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => {} } };

// ---- 가짜 Supabase ----
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const { rows: migrated } = M.collect({});
let table = migrated.map((r) => ({ slug: r.slug, lang: r.lang, title: r.title, doc: r.doc, design_code: null, publish_date: r.publish_date, sources: r.sources, updated_at: "2026-10-19T00:00:00Z" }));
const future = { slug: "future-beach", lang: "ko", title: "아직 공개 전 글", doc: { title: "아직 공개 전 글", chip: "바다 · 시험", subtitle: "미래" }, publish_date: "2099-01-01", sources: [], updated_at: "x" };
table.push(future, { ...future, lang: "en", title: "Not yet" });
let tableMissing = false, rpcCalls = [];
const OLD = (p) => `<html><body>OLD-STORED ${p} <footer>옛 꼬리말</footer></body></html>`;
let stored = new Set(["/korea/seoraksan/", "/en/korea/seoraksan/", "/korea/", "/en/korea/", "/sitemap-korea.xml", "/korea/only-stored/"]);
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.pathname === "/rest/v1/rpc/factory_korea") {
    const b = JSON.parse(init.body); rpcCalls.push(b);
    if (b.p_token !== "good") return Response.json({ message: "bad_token" }, { status: 400 });
    return Response.json({ ok: true, updated: rpcCalls.filter((c) => c.p_slug === b.p_slug && c.p_lang === b.p_lang && c.p_token === "good").length > 1 });
  }
  if (u.pathname === "/rest/v1/site_pages") {
    const p = u.searchParams.get("path").replace(/^eq\./, "");
    return Response.json(stored.has(p) ? [{ html: OLD(p), content_type: "text/html; charset=utf-8", updated_at: "old" }] : []);
  }
  if (u.pathname === "/rest/v1/korea_articles") {
    if (tableMissing) return Response.json({ message: "relation does not exist" }, { status: 404 });
    let rows = table.filter((r) => r.publish_date <= kst);  // 표 읽기 정책(공개일 지난 것만)과 같게
    for (const [k, v] of u.searchParams) {
      if (k === "select" || k === "order") continue;
      const [op, val] = [v.slice(0, v.indexOf(".")), v.slice(v.indexOf(".") + 1)];
      rows = rows.filter((r) => (op === "eq" ? String(r[k]) === val : op === "lte" ? String(r[k]) <= val : true));
    }
    const sel = u.searchParams.get("select").split(",");
    return Response.json(rows.map((r) => Object.fromEntries(sel.map((s) => {
      const m = s.match(/^(\w+):doc->(>?)(\w+)$/);
      return m ? [m[1], r.doc?.[m[3]] ?? null] : [s, r[s]];
    }))));
  }
  throw new Error("예상 못 한 요청 " + url);
};
const get = async (p) => worker.fetch(new Request("https://aigalaxy-map.com" + p), env);
const post = (body, token = "good") => worker.fetch(new Request("https://aigalaxy-map.com/api/korea", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }), env);
const staticHtml = (p) => readFileSync(path.join(DIST, p, "index.html"), "utf8");
const norm = (s) => s.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
const part = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, "없음: " + a); return s.slice(i, s.indexOf(b, i) + b.length); };
let n = 0; const ok = (msg) => { n++; console.log("  ✓", msg); };

// 1) 글 화면: 옛 저장 화면이 있어도 새 화면, 본문은 정적 빌드 글과 같음, 꼬리말·hreflang·canonical
for (const a of migrated) {
  const p = (a.lang === "en" ? "/en/korea/" : "/korea/") + a.slug + "/";
  const r = await get(p), h = await r.text();
  assert.equal(r.status, 200, p);
  assert.ok(!h.includes("OLD-STORED"), p + " 옛 저장 화면이 나옴");
  assert.match(r.headers.get("x-galaxy-page") || "", /^korea_articles/);
  const s = staticHtml(p.slice(1));
  assert.equal(norm(part(h, '<article class="max-w-3xl', "</article>")), norm(part(s, '<article class="max-w-3xl', "</article>")), p + " 본문이 정적 글과 다름");
  // 머리 칸도 정적 글과 같음(제목·설명·canonical·og·hreflang)
  for (const re of [/<title>[^<]*<\/title>/, /<meta name="description"[^>]*>/, /<link rel="canonical"[^>]*>/, /<meta property="og:type"[^>]*>/, /<meta property="og:image"[^>]*>/, /<html[^>]*>/])
    assert.equal((h.match(re) || [])[0], (s.match(re) || [])[0], p + " 머리 칸 다름 " + re);
  assert.deepEqual([...h.matchAll(/<link rel="alternate" hreflang[^>]*>/g)].map((x) => x[0]), [...s.matchAll(/<link rel="alternate" hreflang[^>]*>/g)].map((x) => x[0]), p + " hreflang");
  assert.ok(!h.includes('name="robots"'), p + " noindex 남음");
  assert.ok(!/__(TITLE|DESC|SLUG|BODY|IMAGE|OGTYPE)__/.test(h), p + " 자리표 남음");
  // 꼬리말: 사이트 공통 틀(10/19 새 '사이트 소개·문의' 링크)
  const foot = part(h, "<footer", "</footer>");
  assert.ok(a.lang === "ko" ? foot.includes('href="/about"') && foot.includes("사이트 소개") && foot.includes('href="/contact"') : foot.includes('href="/en/about"') && foot.includes(">About<"), p + " 꼬리말 사이트 소개 링크 없음");
  assert.equal(norm(foot), norm(part(s, "<footer", "</footer>")), p + " 꼬리말이 정적 틀과 다름");
}
ok(`글 ${migrated.length}편(한·영): 옛 저장 화면 대신 DB 글, 본문·머리 칸·hreflang·꼬리말이 정적 빌드 글과 같음`);
{
  const h = await (await get("/korea/seoraksan/")).text();
  assert.ok(h.includes('<link rel="alternate" hreflang="ko" href="https://aigalaxy-map.com/korea/seoraksan/">'));
  assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://aigalaxy-map.com/en/korea/seoraksan/">'));
  assert.ok(h.includes('<link rel="alternate" hreflang="x-default" href="https://aigalaxy-map.com/en/korea/seoraksan/">'));
  assert.ok(h.includes('<link rel="canonical" href="https://aigalaxy-map.com/korea/seoraksan/">'));
  assert.ok(h.includes('href="/en/korea/seoraksan/" hreflang="en"'));  // 본문 '영어로 읽기' + 머리줄 언어 버튼
  const e = await (await get("/en/korea/seoraksan/")).text();
  assert.ok(e.includes('<html lang="en"') && e.includes('<link rel="canonical" href="https://aigalaxy-map.com/en/korea/seoraksan/">') && e.includes('hreflang="ko"'));
  ok("한·영 hreflang(ko·en·x-default)·canonical·언어 버튼 주소");
}

// 2) 목록·사이트맵 = 정적 빌드와 같은 순서·모양
for (const lang of ["ko", "en"]) {
  const p = lang === "en" ? "/en/korea/" : "/korea/";
  const r = await get(p), h = await r.text();
  assert.equal(r.status, 200);
  assert.ok(!h.includes("OLD-STORED"));
  const blk = (x) => norm(part(x, '<div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-7 md:py-9"><h1', '</div></a></div></div>'));
  assert.equal(blk(h), blk(staticHtml(p.slice(1))), p + " 목록이 정적 빌드와 다름");
  for (const re of [/<title>[^<]*<\/title>/, /<link rel="canonical"[^>]*>/, /<meta property="og:type"[^>]*>/])
    assert.equal((h.match(re) || [])[0], (staticHtml(p.slice(1)).match(re) || [])[0], p + " 머리 칸 " + re);
  assert.ok(!h.includes("future-beach"));
  assert.ok(!h.includes('og:image'), "목록에 og:image 없어야(정적과 같게)");
}
{
  const r = await get("/sitemap-korea.xml"), x = await r.text();
  assert.equal(r.status, 200);
  assert.equal(x, readFileSync(path.join(DIST, "sitemap-korea.xml"), "utf8"));
  assert.ok(!x.includes("future-beach"));
}
ok("목록 /korea/·/en/korea/·sitemap-korea.xml = 정적 빌드와 같음(공개 전 글 없음)");

// 3) 공개일 전 글 숨김
assert.equal((await get("/korea/future-beach/")).status, 404);
assert.equal((await get("/en/korea/future-beach/")).status, 404);
ok("공개일 전 글은 글·목록·사이트맵 모두 안 보임(404)");

// 4) 표에 없는 글: 정적 빌드 → (정적도 없으면) site_pages
{
  table = table.filter((r) => !(r.slug === "bukhansan"));
  stored.add("/korea/bukhansan/");
  const h = await (await get("/korea/bukhansan/")).text();
  assert.equal(h, staticHtml("korea/bukhansan"), "표에 없으면 정적 빌드");
  const o = await get("/korea/only-stored/");
  assert.equal(o.status, 200);
  assert.ok((await o.text()).includes("OLD-STORED"), "정적도 없으면 옛 저장 화면");
  assert.equal((await get("/korea/none-at-all/")).status, 404);
  ok("표에 없는 글 = 정적 빌드, 정적도 없으면 옛 저장 화면(site_pages), 다 없으면 404");
}

// 5) 표가 아직 없음(SQL 전) → 예전 순서(site_pages → 정적) 그대로
tableMissing = true;
assert.ok((await (await get("/korea/seoraksan/")).text()).includes("OLD-STORED"));
assert.ok((await (await get("/korea/")).text()).includes("OLD-STORED"));
assert.equal(await (await get("/korea/gwangjin-beach/")).text(), staticHtml("korea/gwangjin-beach"));
tableMissing = false;
{ const keep = table; table = []; assert.ok((await (await get("/sitemap-korea.xml")).text()).includes("OLD-STORED"), "빈 표면 목록·사이트맵은 예전대로"); table = keep; }
ok("표가 없거나 비었으면(SQL·옮기기 전) 예전과 같은 순서");

// 6) POST /api/korea — 토큰·검사·같은 slug·lang 이면 갱신
{
  const body = { slug: "test-beach", lang: "ko", publish_date: "2026-10-20", menu_code: "GX.03.01", cat_code: "02.01", design_code: "K1",
    doc: { title: "시험 바다", chip: "바다 · 시험", subtitle: "한 줄", intro: "<p>들어가며</p><script>alert(1)</script>", sections: [{ h: "주차", body: '<p onclick="x()">글</p>' }],
      hero: { src: "javascript:alert(1)" }, sources: [{ title: "공공데이터", date: "2026-10-19 받음" }], unknown: 1 } };
  assert.equal((await post(body, "")).status, 401);
  assert.equal((await post(body, "bad")).status, 401);
  assert.equal((await post({ ...body, slug: "Bad Slug" })).status, 400);
  assert.equal((await post({ ...body, lang: "jp" })).status, 400);
  assert.equal((await post({ ...body, publish_date: "10/20" })).status, 400);
  assert.equal((await post({ ...body, doc: { sections: "x" } })).status, 400);
  assert.equal((await post({ ...body, doc: undefined })).status, 400);
  assert.equal((await post({ ...body, menu_code: "나쁜 코드" })).status, 400);
  rpcCalls = [];
  const r1 = await (await post(body)).json();
  assert.deepEqual([r1.ok, r1.updated, r1.url], [true, false, "https://aigalaxy-map.com/korea/test-beach/"]);
  const c = rpcCalls[0];
  assert.deepEqual([c.p_slug, c.p_lang, c.p_title, c.p_publish_date, c.p_menu_code, c.p_cat_code, c.p_design_code], ["test-beach", "ko", "시험 바다", "2026-10-20", "GX.03.01", "02.01", "K1"]);
  assert.ok(!JSON.stringify(c.p_doc).includes("script") && !JSON.stringify(c.p_doc).includes("onclick") && !c.p_doc.hero && !c.p_doc.unknown, "doc 정리 안 됨");
  assert.deepEqual(c.p_sources, [{ title: "공공데이터", date: "2026-10-19 받음" }]);
  const r2 = await (await post({ ...body, doc: { ...body.doc, title: "고친 제목" } })).json();
  assert.equal(r2.updated, true);
  ok("POST /api/korea: 토큰 없음·틀림 401, 형식 틀림 400, 저장 RPC에 정리된 doc·코드·공개일, 같은 slug·lang 은 갱신");
}

// 7) 옮기기: site_pages 저장분(정적 빌드와 같은 화면)에서 뽑은 칸 = 글 원본에서 만든 칸, SQL 은 중복 없이
{
  for (const a of migrated) {
    const p = (a.lang === "en" ? "/en/korea/" : "/korea/") + a.slug + "/";
    const r = M.fromStoredPage(p, staticHtml(p.slice(1)));
    assert.ok(r, p);
    assert.deepEqual(JSON.parse(JSON.stringify(r.doc)), JSON.parse(JSON.stringify(a.doc)), p + " 저장 화면에서 뽑은 doc 다름");
    assert.equal(r.publish_date, a.publish_date);
  }
  const extra = M.collect({ sitePages: [{ path: "/korea/seoraksan/", html: staticHtml("korea/seoraksan") }, { path: "/korea/", html: "목록" },
    { path: "/korea/extra-place/", html: staticHtml("korea/gyeongpo-beach") }, { path: "/korea/broken/", html: "<p>모양 다름</p>" }] });
  assert.equal(extra.rows.length, migrated.length + 1);
  assert.ok(extra.rows.some((r) => r.slug === "extra-place" && r.from.startsWith("site_pages")));
  assert.ok(extra.skipped.some(([k]) => k === "/korea/broken/") && extra.skipped.some(([k, w]) => k === "/korea/seoraksan/" && w.includes("글 원본")));
  const sql = M.toSql(extra.rows);
  assert.equal((sql.match(/on conflict \(slug, lang\) do nothing;/g) || []).length, extra.rows.length);
  // 명령 줄만 본다 — 글 본문 속 낱말(waterfalls that drop…)은 SQL 명령이 아님
  assert.ok(!/^\s*(delete|update public\.site_pages|drop )/im.test(sql.replace(/^--.*$/gm, "")));
  ok(`옮기기: 저장 화면 ${migrated.length}개에서 뽑은 칸 = 글 원본, 원본 없는 저장분만 추가, SQL 은 on conflict do nothing(site_pages 안 건드림)`);
}
console.log(`\n한국 여행 시험 ${n}묶음 통과`);
