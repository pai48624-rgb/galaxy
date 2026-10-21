// 구조화된 글(doc) 받기 시험(2026-10-19) — 가짜 Supabase·가짜 ASSETS 로 워커(site2/worker/_worker.js)를 직접 부름. 실서버·실DB는 안 씀.
// 실행: node site2/scripts/test_trend_doc.mjs            (옛 글 화면 비교까지: node site2/scripts/test_trend_doc.mjs <바꾸기 전 워커 파일>)
// 확인: 칸 없는 옛 요청 = 예전 factory_post 그대로 / 코드·doc 요청 = factory_post_doc 에 정리된 doc / 틀린 doc = 400
//       /trend/<id>: doc 있으면 템플릿(제목·소제목·표·사진·FAQ·출처), 없으면 body_html 그대로, SQL 전(칸 없음)에도 옛 글 화면 정상
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "../worker/_worker.js")).href)).default;

const FRAME = "<html><head><title>__TITLE__</title></head><body><main>__BODY__</main><aside>__SIDE__</aside></body></html>";
const env = { SUPABASE_SERVICE_ROLE_KEY: "svc", ASSETS: { fetch: async (req) => new URL(req.url).pathname === "/frame-template" ? new Response(FRAME) : new Response("", { status: 404 }) } };
const OLD_HTML = '<p>옛 본문</p><script>alert(1)</script><img src="https://x/a.png" onerror="x()"><h2>소제목</h2>';
const DOC = {
  chip: "AI 소식", title: "새 AI 글", subtitle: "한 줄 소개", meta: "2026-10 기준", summary: ["요점 하나", "요점 둘"],
  intro: "<p>들어가며</p><script>alert(1)</script>", hero: { src: "https://example.com/hero.jpg", alt: "대표", credit: "출처A" },
  tiles: [{ n: "731", t: "AI 수", d: "지도 기준" }],
  sections: [{ h: "첫 소제목", body: "첫 문단\n\n둘째 문단", list: ["가", "나"], table: { head: ["이름", "요금"], rows: [["Claude", "무료"]] },
               image: { src: "/img/a.png", alt: "그림", credit: "출처B" } },
             { h: "둘째 소제목", body: '<p onclick="x()">글</p>', image: { src: "javascript:alert(1)" } }],
  pros: ["빠름"], cons: ["비쌈"], who: "처음 쓰는 분", steps: [{ t: "가입", d: "메일로" }], checklist: ["요금 확인"],
  items: [{ name: "도구", price: "월 2만원", desc: "설명", link: "https://example.com/t", image: { src: "https://example.com/i.jpg" } }],
  faq: [{ q: "무료인가요?", a: "일부 무료예요." }], cta: { text: "지도 보기", link: "/map/" },
  sources: [{ title: "공식 블로그", url: "https://example.com/blog", date: "2026-10-18" }], tags: ["AI", "소식"], unknown: "버림",
};

let migrated = true, calls = [], rows = {};
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path: u.pathname, search: decodeURIComponent(u.search), method: init.method || "GET", body });
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    if (body.p_token !== "good") return Response.json({ message: "bad_token" }, { status: 400 });
    if (u.pathname.endsWith("factory_post_doc") && !migrated) return Response.json({ message: "function not found" }, { status: 404 });
    return Response.json({ id: 99, dup: false });
  }
  if (u.pathname === "/rest/v1/factory_tokens") return Response.json([{ token_hash: "h" }]);
  if (u.pathname === "/rest/v1/board_posts") {
    if (init.method === "PATCH") return new Response(null, { status: 204 });
    const sel = u.searchParams.get("select") || "";
    if (!migrated && /doc/.test(sel)) return Response.json({ message: "column board_posts.doc does not exist" }, { status: 400 });
    const id = (u.searchParams.get("id") || "").replace("eq.", "");
    if (u.searchParams.get("external_id")) return Response.json([{ id: 5 }]);
    if (id && rows[id]) { const r = { ...rows[id] }; if (!/doc/.test(sel)) { delete r.doc; delete r.design_code; } return Response.json([r]); }
    return Response.json([]);
  }
  return new Response("", { status: 404 });
};
const post = (b, token = "good") => worker.fetch(new Request("https://aigalaxy-map.com/api/posts", { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(b) }), env);
const page = async (id) => { const r = await worker.fetch(new Request(`https://aigalaxy-map.com/trend/${id}`), env); return { status: r.status, html: await r.text() }; };
let n = 0;
const t = async (name, fn) => { calls = []; await fn(); n++; console.log("ok -", name); };

await t("옛 요청 = 예전 factory_post 그대로(새 인자 없음)", async () => {
  const r = await post({ title: "옛 글", body_text: "본문", body_html: "<p>x</p>", tags: ["a"] });
  assert.equal(r.status, 200);
  assert.equal(calls[0].path, "/rest/v1/rpc/factory_post");
  assert.deepEqual(Object.keys(calls[0].body), ["p_token", "p_external_id", "p_title", "p_body", "p_body_html", "p_tags"]);
  assert.equal((await post({ title: "x" })).status, 400);
  assert.equal((await post({ title: "x", body_text: "y" }, "bad")).status, 401);
});
await t("옛 갱신 요청 = PATCH 칸 그대로", async () => {
  await post({ title: "갱신", body_text: "본문", external_id: "e1", update: true });
  const patch = calls.find((c) => c.method === "PATCH");
  assert.deepEqual(Object.keys(patch.body), ["title", "body", "body_html", "tags"]);
});
await t("코드·doc 요청 = factory_post_doc 에 정리된 doc", async () => {
  const r = await post({ external_id: "d1", menu_code: "AG.01.02", cat_code: "02.03.01", design_code: "B1", doc: DOC });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  const c = calls[0];
  assert.equal(c.path, "/rest/v1/rpc/factory_post_doc");
  assert.equal(c.body.p_title, "새 AI 글");                 // doc.title 이 제목
  assert.match(c.body.p_body, /첫 소제목/);                  // 본문 글자 = doc 글자
  assert.deepEqual(c.body.p_tags, ["AI", "소식"]);
  assert.deepEqual([c.body.p_menu_code, c.body.p_cat_code, c.body.p_design_code], ["AG.01.02", "02.03.01", "B1"]);
  const d = c.body.p_doc;
  assert.equal(d.unknown, undefined);
  assert.ok(!d.intro.includes("<script"));
  assert.ok(!d.sections[1].body.includes("onclick"));
  assert.equal(d.sections[1].image, undefined);             // javascript: 사진은 버림
  assert.equal(d.sections[0].body, "<p>첫 문단</p><p>둘째 문단</p>");
  assert.deepEqual(d.sections[0].table.rows, [["Claude", "무료"]]);
});
await t("코드·doc 갱신 = PATCH 에 칸 4개", async () => {
  await post({ external_id: "e1", update: true, menu_code: "AG.01", doc: DOC });
  const patch = calls.find((c) => c.method === "PATCH");
  assert.equal(patch.body.menu_code, "AG.01");
  assert.equal(patch.body.cat_code, null);
  assert.equal(patch.body.doc.title, "새 AI 글");
});
await t("틀린 doc·코드 = 400, DB 안 부름", async () => {
  for (const bad of [{ doc: "글자" }, { doc: [1] }, { doc: { sections: "x" } }, { doc: { sections: [{ table: { rows: "x" } }] } },
    { doc: { hero: "a.jpg" } }, { doc: { faq: [{ q: ["x"] }] } }, { doc: { tags: "a,b" } }, { menu_code: "GP 01" }, { cat_code: 12 }]) {
    calls = [];
    const r = await post({ title: "t", body_text: "b", ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(calls.length, 0);
  }
});

rows = {
  1: { id: 1, title: "옛 글", body: "옛 본문", body_html: OLD_HTML, tags: ["a"], created_at: "2026-10-18T00:00:00Z", design_code: null, doc: null },
  2: { id: 2, title: "새 AI 글", body: "글자", body_html: null, tags: ["AI"], created_at: "2026-10-19T00:00:00Z", design_code: "B1",
       doc: (await (async () => { calls = []; await post({ doc: DOC }); return calls[0].body.p_doc; })()) },
};
await t("/trend/<doc 글> = 템플릿으로 다 나옴", async () => {
  const { status, html } = await page(2);
  assert.equal(status, 200);
  for (const w of ["새 AI 글", "한 줄 소개", "첫 소제목", "둘째 소제목", "<th>요금</th>", "<td>Claude</td>", "https://example.com/hero.jpg", "/img/a.png",
    "무료인가요?", "일부 무료예요.", "공식 블로그", "요점 하나", "731", "👍 좋은 점", "처음 쓰는 분", "가입", "요금 확인", "월 2만원", 'data-design="B1"', 'class="gdoc"'])
    assert.ok(html.includes(w), w);
  assert.ok(!html.includes("<script>alert"), "script");
  assert.ok(!/javascript:|onclick|onerror/.test(html), "event/js");
});
await t("/trend/<옛 글> = body_html 그대로(.paper)", async () => {
  const { html } = await page(1);
  assert.ok(html.includes('<article class="paper"><p>옛 본문</p><img src="https://x/a.png"><h2>소제목</h2></article>'));
  assert.ok(!html.includes("gdoc"));
});
await t("SQL 실행 전(doc 칸 없음)에도 옛 글 화면 정상, doc 요청은 등록 실패로 알림", async () => {
  migrated = false;
  const { status, html } = await page(1);
  assert.equal(status, 200);
  assert.ok(html.includes("옛 본문"));
  assert.equal((await post({ title: "옛", body_text: "b" })).status, 200);
  assert.notEqual((await post({ doc: DOC })).status, 200);
  migrated = true;
});

// 바꾸기 전 워커가 주어지면 옛 글 화면을 글자 하나까지 비교
if (process.argv[2]) {
  const before = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
  for (const id of [1, 404]) {
    const a = await (await before.fetch(new Request(`https://aigalaxy-map.com/trend/${id}`), env)).text();
    const b = (await page(id)).html;
    assert.equal(b, a, `trend/${id} 달라짐`);
  }
  n++; console.log("ok - 옛 글·없는 글 화면이 바꾸기 전 워커와 같음");
}
console.log(`\n${n}개 통과`);
