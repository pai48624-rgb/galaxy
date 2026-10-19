// 메뉴 'New' 시험(2026-10-19) — 가짜 Supabase 로 워커 /api/nav-new 를 직접 부름. 실서버·실DB 안 씀.
// 실행: node site2/scripts/test_nav_new.mjs
// 확인: 새 글 → New / 24시간 지난 글 → 없음 / 공개일 전 한국 여행 → 없음(오늘 공개 글만 New) / 숨긴 글·다른 게시판 글은 안 셈 / DB 오류 → 없음
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const worker = (await import(pathToFileURL(path.join(here, "../worker/_worker.js")).href)).default;
const env = { ASSETS: { fetch: async () => new Response("", { status: 404 }) } };

const H = 3600 * 1000, ago = (h) => new Date(Date.now() - h * H).toISOString();
const kstDay = (d) => new Date(Date.now() + 9 * H + d * 24 * H).toISOString().slice(0, 10);  // 오늘(KST)+d일
let posts = [], korea = [], broken = new Set();

// 가짜 Supabase: eq·lte 거르기 + order(칸.desc) + limit — 워커가 보내는 조건 그대로 따름
globalThis.fetch = async (url) => {
  const u = new URL(url), t = u.pathname.replace("/rest/v1/", "");
  if (broken.has(t)) return Response.json({ message: "boom" }, { status: 500 });
  let rows = t === "board_posts" ? posts : t === "korea_articles" ? korea : null;
  if (!rows) throw new Error("예상 못 한 요청 " + url);
  for (const [k, v] of u.searchParams) {
    if (["select", "order", "limit"].includes(k)) continue;
    const i = v.indexOf("."), op = v.slice(0, i), val = v.slice(i + 1);
    rows = rows.filter((r) => (op === "eq" ? String(r[k]) === val : op === "lte" ? String(r[k]) <= val : true));
  }
  const [col] = (u.searchParams.get("order") || "").split(".");
  if (col) rows = [...rows].sort((a, b) => String(b[col]).localeCompare(String(a[col])));
  const lim = Number(u.searchParams.get("limit") || 0);
  if (lim) rows = rows.slice(0, lim);
  const sel = u.searchParams.get("select").split(",");
  return Response.json(rows.map((r) => Object.fromEntries(sel.map((s) => [s, r[s]]))));
};
const nav = async () => {
  const r = await worker.fetch(new Request("https://aigalaxy-map.com/api/nav-new"), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control") || "", /max-age=\d+/);
  return r.json();
};
let n = 0; const ok = (m) => { n++; console.log("  ✓", m); };

// 1) 새 글 → New (세 메뉴 모두)
posts = [{ board: "ai_trend", hidden: false, created_at: ago(1) }, { board: "free", hidden: false, created_at: ago(23.5) }];
korea = [{ slug: "a", lang: "ko", publish_date: kstDay(0) }, { slug: "a", lang: "en", publish_date: kstDay(0) }];
let d = await nav();
assert.equal(d.hours, 24);
assert.deepEqual(d.new, { trend: true, korea: true, board: true });
ok("새 글(트렌드 1시간 전·게시판 23.5시간 전·한국 여행 오늘 공개) → 세 메뉴 New");

// 2) 24시간 지난 글 → 없음
posts = [{ board: "ai_trend", hidden: false, created_at: ago(24.1) }, { board: "free", hidden: false, created_at: ago(48) }];
korea = [{ slug: "b", lang: "ko", publish_date: kstDay(-1) }];
d = await nav();
assert.deepEqual(d.new, { trend: false, korea: false, board: false });
ok("24시간 지난 글(트렌드 24.1시간·게시판 48시간·한국 여행 어제 공개) → New 없음");

// 3) 공개일 전 한국 여행 → 없음(더 앞선 오늘 글이 있으면 그건 New)
korea = [{ slug: "c", lang: "ko", publish_date: kstDay(1) }, { slug: "d", lang: "ko", publish_date: kstDay(5) }, { slug: "e", lang: "ko", publish_date: kstDay(-3) }];
d = await nav();
assert.equal(d.new.korea, false);
assert.equal(d.latest.korea, kstDay(-3));
korea.push({ slug: "f", lang: "en", publish_date: kstDay(0) });
d = await nav();
assert.equal(d.new.korea, true);
ok("공개일 전 한국 여행(내일·5일 뒤) → 없음, 오늘 공개 글이 더해지면 New");

// 4) 숨긴 글·다른 게시판은 안 셈
posts = [{ board: "ai_trend", hidden: true, created_at: ago(1) }, { board: "free", hidden: true, created_at: ago(1) }, { board: "notice", hidden: false, created_at: ago(1) },
  { board: "ai_trend", hidden: false, created_at: ago(30) }];
d = await nav();
assert.equal(d.new.trend, false); assert.equal(d.new.board, false);
posts.push({ board: "free", hidden: false, created_at: ago(2) });
d = await nav();
assert.equal(d.new.trend, false); assert.equal(d.new.board, true);
ok("숨긴 글·다른 게시판 글은 안 셈, 공개 free 글은 게시판 New(트렌드와 따로)");

// 5) DB 오류·빈 표 → New 없음(화면은 그대로)
broken = new Set(["board_posts", "korea_articles"]);
d = await nav();
assert.deepEqual(d.new, { trend: false, korea: false, board: false });
broken = new Set(); posts = []; korea = [];
d = await nav();
assert.deepEqual(d.new, { trend: false, korea: false, board: false });
ok("DB 오류·글 없음 → New 없음");

console.log(`\n메뉴 New 시험 ${n}묶음 통과`);
