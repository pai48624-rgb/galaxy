// 한국 여행 글 옮기기(2026-10-19) — 지금 글을 korea_articles 표에 넣는 SQL 파일을 만든다. DB에 직접 쓰지 않음(실행은 사람이 SQL Editor에서).
// 원본 두 가지(같은 slug·lang 이면 글 원본이 먼저):
//   ① content/korea/<slug>/meta.json·ko.html·en.html (글 원본 — 정적 빌드와 같은 규칙: hidden 빼고, 분량 모자라면 빼고. 예약 글은 넣되 공개일 전엔 표가 숨김)
//   ② site_pages 저장분(공장이 올린 완성 화면) — 원본 폴더에 없는 글만. 화면 HTML(KoreaArticle 마크업)에서 칸을 다시 뽑음
// 만든 SQL은 insert … on conflict (slug, lang) do nothing → 여러 번 실행해도 중복 없음, 이미 공장이 새로 올린 글은 덮지 않음. site_pages 는 건드리지 않음.
//
// 쓰는 법(galaxy 뿌리에서):
//   node scripts/korea_articles_to_sql.mjs                                  → scripts/korea_articles_data.sql (content/korea 만)
//   node scripts/korea_articles_to_sql.mjs --site-pages site_pages.json      → + SQL Editor에서 내려받은 site_pages(JSON 배열 [{path, html}])
//   node scripts/korea_articles_to_sql.mjs --fetch-site-pages                → + site_pages 를 공개 읽기(anon)로 받아서(읽기만)
//   node scripts/korea_articles_to_sql.mjs --out 다른.sql
// 그다음 SQL Editor에서: ① scripts/migrate_korea_articles.sql(표·함수, 한 번) ② 만든 korea_articles_data.sql
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM = "https://urflispegkzouclljxzg.supabase.co";
const ANON_KEY = "sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr"; // 워커·site2 와 같은 공개 키(읽기만)

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const unesc = (s) => String(s ?? "").replace(/&(amp|lt|gt|quot|#39|#x27|apos);/g, (_, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", apos: "'" })[k]);
const textLen = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && (!Array.isArray(v) || v.length)));

// ---- KoreaArticle.astro 와 같은 변환(영어 숫자 칸·차트) ----
function factVal(v, lang) {
  return lang !== "en" ? v : String(v).replace(/(\d)번 중 (\d+)번/g, "$2 of $1").replace(/(\d)면$/, "$1 spaces").replace(/(\d)(개|곳|명|번|편)$/g, "$1");
}
function chartSvg(c, lang) {
  const fmtCount = (v) => {
    if (!v) return "0";
    if (lang === "ko") return v >= 1e6 ? `${Math.round(v / 1e4).toLocaleString()}만` : v >= 1e4 ? `${(v / 1e4).toFixed(1)}만` : v.toLocaleString();
    return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v);
  };
  const top = Math.max(...c.values), w = 54;
  const bars = c.values.map((v, i) => {
    const h = (v / top) * 128, x = 20 + i * w, y = 150 - h;
    return `<rect x="${x}" y="${y.toFixed(1)}" width="34" height="${h.toFixed(1)}" rx="2" class="${(c.dip || []).includes(c.years[i]) ? "dip" : "bar"}"/>` +
      `<text x="${x + 17}" y="168" text-anchor="middle">${c.years[i]}</text><text class="v" x="${x + 17}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${fmtCount(v)}</text>`;
  }).join("");
  return `<figure class="chart"><svg viewBox="0 0 560 176" role="img" aria-label="${esc(c[lang])}">${bars}<line x1="14" y1="150" x2="552" y2="150" stroke="currentColor" stroke-opacity=".25"/></svg><figcaption>${esc(c[lang])}</figcaption></figure>`;
}

// 본문 HTML → 소개(첫 <h2> 앞) + 소제목 칸들({h, body})
export function splitBody(html) {
  const parts = String(html).split(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const intro = parts[0].trim();
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) sections.push(compact({ h: unesc(parts[i].replace(/<[^>]+>/g, "")).trim(), body: (parts[i + 1] || "").trim() }));
  return { intro, sections };
}

// 글 원본(meta + 한 언어 HTML) → 표 한 줄
export function fromContent(m, html, lang) {
  const body = html.replace("<!--CHART-->", m.chart ? chartSvg(m.chart, lang) : "");
  const { intro, sections } = splitBody(body);
  const g = m.links?.guide;
  const sources = (m.sources || []).map((s) => compact({ title: s[lang], date: s.date?.[lang] }));
  const doc = compact({
    chip: `${m.kind[lang]} · ${m.region[lang]}`, title: m.title[lang], subtitle: m.description[lang],
    hero: m.photo?.url ? compact({ src: m.photo.url, alt: m.photo.alt?.[lang], credit: m.photo.credit?.[lang], width: m.photo.width || 0, height: m.photo.height || 0 }) : null,
    tiles: (m.facts || []).map((f) => compact({ t: f[lang], n: factVal(f.v, lang) })),
    intro, sections,
    cta: g && g.live !== false ? { text: g[lang], link: g.url } : null,
    sources,
  });
  return { slug: m.slug, lang, title: m.title[lang], doc, publish_date: m.publish, sources, from: `content/korea/${m.slug}/${lang}.html` };
}

export function readContent(dir = join(ROOT, "content", "korea")) {
  const out = [], skipped = [];
  if (!existsSync(dir)) return { out, skipped };
  for (const slug of readdirSync(dir).sort()) {
    if (slug.startsWith("_") || !existsSync(join(dir, slug, "meta.json"))) continue;
    const m = JSON.parse(readFileSync(join(dir, slug, "meta.json"), "utf8"));
    if (m.hidden) { skipped.push([slug, "hidden"]); continue; }
    const html = { ko: readFileSync(join(dir, slug, "ko.html"), "utf8"), en: readFileSync(join(dir, slug, "en.html"), "utf8") };
    if (textLen(html.ko) < 900 || textLen(html.en) < 1800) { skipped.push([slug, "분량 모자람(정적 빌드도 안 만듦)"]); continue; }
    out.push(fromContent(m, html.ko, "ko"), fromContent(m, html.en, "en"));
  }
  return { out, skipped };
}

// site_pages 의 완성 화면(KoreaArticle 마크업) → 표 한 줄. 모양이 다르면 null
const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i + a.length, j); };
export function fromStoredPage(path, html) {
  const pm = String(path).match(/^\/(en\/)?korea\/([a-z0-9][a-z0-9-]{0,80})\/$/);
  if (!pm) return null;
  const lang = pm[1] ? "en" : "ko", slug = pm[2];
  const art = between(html, '<article class="max-w-3xl mx-auto', "</article>");
  if (!art) return null;
  const ldTxt = [...art.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => { try { return JSON.parse(x[1]); } catch (e) { return null; } });
  const ld = ldTxt.find((x) => x && x["@type"] === "Article");
  if (!ld) return null;
  const chip = unesc(between(art, '<span aria-current="page" class="text-default">', "</span>") || "");
  const fig = art.match(/<figure class="mt-6"><img src="([^"]*)" alt="([^"]*)"([^>]*)><figcaption[^>]*>([\s\S]*?)<\/figcaption>/);
  const wh = (k) => Number(((fig?.[3] || "").match(new RegExp(` ${k}="(\\d+)"`)) || [])[1] || 0);
  const tiles = [...art.matchAll(/<small class="block text-xs text-muted">([\s\S]*?)<\/small><b class="text-xl tabular-nums text-heading">([\s\S]*?)<\/b>/g)].map((x) => ({ t: unesc(x[1]), n: unesc(x[2]) }));
  const bodyStart = '<div class="prose prose-invert prose-base max-w-none mt-8 korea-body">';
  const bi = art.indexOf(bodyStart);
  if (bi < 0) return null;
  const rest = art.slice(bi + bodyStart.length);
  const bj = rest.search(/<\/div>(<a href="[^"]*" class="btn-primary|<p class="text-sm text-muted mt-6">)/);
  if (bj < 0) return null;
  const body = rest.slice(0, bj).replace(/<div class="tw"><table>/g, "<table>").replace(/<\/table><\/div>/g, "</table>");
  const cta = rest.slice(bj).match(/^<\/div><a href="([^"]*)" class="btn-primary mt-6">([\s\S]*?)<svg/);
  // 출처 "이름 (날짜)" — 날짜 안에도 괄호가 있을 수 있어 끝 괄호와 짝인 여는 괄호에서 나눔
  const sources = (ld.isBasedOn || []).map((s) => {
    s = String(s);
    if (!s.endsWith(")")) return { title: s };
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ")") depth++;
      else if (s[i] === "(" && --depth === 0) return compact({ title: s.slice(0, i).trimEnd(), date: s.slice(i + 1, -1) });
    }
    return { title: s };
  });
  const { intro, sections } = splitBody(body);
  const doc = compact({
    chip, title: ld.headline, subtitle: ld.description,
    hero: fig ? compact({ src: unesc(fig[1]), alt: unesc(fig[2]), credit: unesc(fig[4]), width: wh("width"), height: wh("height") }) : null,
    tiles, intro, sections, cta: cta ? { text: unesc(cta[2]), link: unesc(cta[1]) } : null, sources,
  });
  return { slug, lang, title: ld.headline, doc, publish_date: String(ld.datePublished).slice(0, 10), sources, from: `site_pages ${path}` };
}

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
export function toSql(rows) {
  const lines = [
    "-- 한국 여행 글 옮기기 데이터 — scripts/korea_articles_to_sql.mjs 가 만듦. scripts/migrate_korea_articles.sql 다음에 SQL Editor에서 실행.",
    "-- 이미 있는 (slug, lang)은 건너뜀(on conflict do nothing) → 여러 번 실행해도 중복 없음. site_pages 는 건드리지 않음.",
    `-- ${rows.length}줄: ${rows.map((r) => `${r.slug}/${r.lang}`).join(", ")}`,
    "begin;",
  ];
  for (const r of rows) {
    lines.push(`-- ${r.from}`);
    lines.push(`insert into public.korea_articles(slug, lang, title, doc, publish_date, sources) values (${q(r.slug)}, ${q(r.lang)}, ${q(r.title)}, ${q(JSON.stringify(r.doc))}::jsonb, ${q(r.publish_date)}::date, ${q(JSON.stringify(r.sources || []))}::jsonb) on conflict (slug, lang) do nothing;`);
  }
  lines.push("commit;", "-- 확인: select slug, lang, publish_date, title from public.korea_articles order by publish_date desc, slug;", "");
  return lines.join("\n");
}

export function collect({ contentDir, sitePages = [] } = {}) {
  const { out, skipped } = readContent(contentDir);
  const have = new Set(out.map((r) => `${r.slug}/${r.lang}`));
  for (const p of sitePages) {
    if (!/^\/(en\/)?korea\/[a-z0-9-]+\/$/.test(p.path || "")) continue; // 목록·사이트맵은 표에서 다시 만듦
    const r = fromStoredPage(p.path, p.html || "");
    if (!r) { skipped.push([p.path, "화면 모양을 못 읽음"]); continue; }
    const k = `${r.slug}/${r.lang}`;
    if (have.has(k)) { skipped.push([p.path, "글 원본(content/korea)이 있어 그걸 씀"]); continue; }
    have.add(k);
    out.push(r);
  }
  out.sort((a, b) => (a.publish_date + a.slug + a.lang).localeCompare(b.publish_date + b.slug + b.lang));
  return { rows: out, skipped };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  let sitePages = [];
  if (arg("--site-pages")) sitePages = JSON.parse(readFileSync(arg("--site-pages"), "utf8"));
  if (argv.includes("--fetch-site-pages")) {
    const r = await fetch(`${UPSTREAM}/rest/v1/site_pages?select=path,html&path=like.*korea/*`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    if (!r.ok) throw new Error(`site_pages 읽기 실패 ${r.status}`);
    sitePages = sitePages.concat(await r.json());
  }
  const { rows, skipped } = collect({ sitePages });
  const out = arg("--out") || join(ROOT, "scripts", "korea_articles_data.sql");
  writeFileSync(out, toSql(rows));
  console.log(`[korea→sql] ${rows.length}줄 → ${out}`);
  for (const r of rows) console.log(`  + ${r.slug}/${r.lang} (${r.publish_date}) ← ${r.from}`);
  for (const [k, why] of skipped) console.log(`  - 건너뜀 ${k}: ${why}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main(process.argv.slice(2));
