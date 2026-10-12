// 한국 여행 글(2026-10-11) — build-dist.mjs 가 부름. content/korea/<slug>/(meta.json·ko.html·en.html)를 읽어
// 한국어 /korea/<slug>/ 와 영어 /en/korea/<slug>/ 한 쌍 + 목록 /korea/·/en/korea/ + dist/sitemap-korea.xml 을 만듦.
//
// 글 원본은 galaxy_pick 이 모은 공공데이터(주차·응급실·숙소·수질·이용객)로 씀. DB 를 쓰지 않아서 로컬에서 그대로 시험 가능.
// meta.publish(YYYY-MM-DD, 한국 시간) 가 빌드하는 날보다 뒤면 아직 안 만듦 → 날짜를 하루 2편씩 매겨 두면 그 날 빌드·배포 때 공개.
// 출처는 항상 날짜와 함께(사용자 규칙 2026-10-11) — meta.sources[].date 가 비면 빌드를 멈춤.
// 얇은 페이지 방지: 본문 글자 수가 MIN_TEXT 보다 적으면 빌드를 멈춤.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");
const SRC = join(ROOT, "content", "korea");
const SITE = "https://aigalaxy-map.com";
const MIN_TEXT = { ko: 900, en: 1800 };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const textLen = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a89bf0' d='M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'/%3E%3C/svg%3E";

const L = {
  ko: { site: "AI 성단 지도", home: "/", list: "/korea/", listName: "한국 여행", ai: "AI 목록", trend: "AI 트렌드", other: "English", src: "자료 출처",
    listTitle: "한국 여행 — 공공데이터로 정리한 가기 전 체크", listDesc: "주차·응급실·숙소·수질·이용객 같은 공공데이터로 정리한 한국 여행지 안내예요. 영어판도 함께 있어요.",
    updated: "기준", guide: "더 보기", note: "거리는 직선거리예요. 운영시간·요금은 바뀔 수 있으니 출발 전에 한 번 더 확인하세요.", emergency: "응급 119 · 바다 해양경찰 122" },
  en: { site: "AI Galaxy Map", home: "/", list: "/en/korea/", listName: "Korea travel", ai: "AI list", trend: "AI trends", other: "한국어", src: "Sources",
    listTitle: "Korea travel — before-you-go guides from public data", listDesc: "Guides to places in Korea built from public data: parking, emergency care, places to stay, water quality and visitor numbers. Each guide also has a Korean version.",
    updated: "Data as of", guide: "More", note: "Distances are straight-line. Opening hours and fees can change, so check again before you travel.", emergency: "Emergency 119 · Coast Guard 122" },
};
const pathOf = (lang, slug = "") => (lang === "en" ? "/en/korea/" : "/korea/") + (slug ? `${slug}/` : "");

function extraCss() {
  const f = join(SRC, "_style.css");
  return existsSync(f) ? "\n/* 관리 화면 디자인 템플릿(content/korea/_style.css) */\n" + readFileSync(f, "utf8").replace(/<\/style/gi, "") : "";
}

function shell(lang, { title, description, path, altPath, body, jsonLd, image }) {
  const t = L[lang], o = lang === "en" ? "ko" : "en";
  return `<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" hreflang="${lang}" href="${SITE}${path}"><link rel="alternate" hreflang="${o}" href="${SITE}${altPath}"><link rel="alternate" hreflang="x-default" href="${SITE}${lang === "en" ? path : altPath}">
<meta property="og:type" content="${jsonLd ? "article" : "website"}"><meta property="og:site_name" content="${t.site}"><meta property="og:locale" content="${lang === "en" ? "en_US" : "ko_KR"}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE}${path}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<link rel="icon" href="${ICON}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1632907475675251" crossorigin="anonymous"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>
:root{--bg:#f7f7fb;--card:#fff;--ink:#1d1d2b;--dim:#6b6b80;--line:#e3e3ee;--acc:#5b4bd6;--chip:#efedff;--sea:#1f6f8b;--gold:#c9963a}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d18;--card:#161626;--ink:#e8e8f2;--dim:#9a9ab0;--line:#2a2a40;--acc:#9d8cff;--chip:#24203f;--sea:#7cc3dc;--gold:#e0b25a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.75}
header{border-bottom:1px solid var(--line);background:var(--card)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;gap:6px 14px;min-height:56px;flex-wrap:wrap;padding:8px 16px}
.top a{color:var(--ink);text-decoration:none;font-weight:700}.top .sp{flex:1}.top .lnk{font-weight:500;color:var(--dim);font-size:14px}
@media (max-width:520px){.top .sp{flex-basis:100%;height:0}.top{padding:10px 16px}}
.top .lang{font-size:13px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;color:var(--dim)}
main{padding:24px 0 60px}
.crumb{font-size:13px;color:var(--dim);margin-bottom:8px}.crumb a{color:var(--dim)}
h1{font-size:27px;line-height:1.35;margin:0 0 8px;text-wrap:balance}
h2{font-size:20px;margin:34px 0 10px}
.lead{font-size:16.5px;color:var(--dim);margin:0 0 16px}
.meta{color:var(--dim);font-size:13px}
figure{margin:18px 0 6px}figure img{display:block;width:100%;height:auto;border-radius:12px;background:var(--chip)}figcaption{font-size:12.5px;color:var(--dim);margin-top:6px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:18px 0}
.facts div{background:var(--card);padding:10px 12px}.facts small{display:block;font-size:12.5px;color:var(--dim)}.facts b{font-size:20px;font-variant-numeric:tabular-nums}
article p{margin:0 0 14px}
.tw{overflow-x:auto;margin:6px 0 10px}table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:420px}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12.5px;color:var(--dim);font-weight:500}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.note{font-size:13px;color:var(--dim)}
.chart svg{width:100%;height:auto}.chart text{fill:var(--dim);font-size:11px}.chart .v{fill:var(--ink);font-weight:700}.chart .bar{fill:var(--sea)}.chart .dip{fill:var(--gold)}
.src{border-top:1px solid var(--line);margin-top:30px;padding-top:12px;font-size:13px;color:var(--dim)}.src ul{margin:6px 0;padding-left:18px}
.guide{display:inline-block;margin:18px 0 0;background:var(--acc);color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700}
.list{list-style:none;padding:0;margin:0}.list li{border-bottom:1px solid var(--line);padding:14px 2px;display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px}
.list img{width:96px;height:72px;object-fit:cover;border-radius:8px;background:var(--chip)}
.list a{color:var(--ink);font-weight:700;text-decoration:none}.list a:hover{color:var(--acc)}.list small{display:block;color:var(--dim);font-size:13.5px}
footer{color:var(--dim);font-size:12px;text-align:center;padding:24px 0}footer a{color:var(--dim)}
${extraCss()}</style></head><body>
<header><div class="wrap top"><a href="${t.home}">✦ ${t.site}</a><span class="sp"></span><a class="lnk" href="${t.list}">${t.listName}</a><a class="lnk" href="/ai/">${t.ai}</a><a class="lnk" href="/trend/">${t.trend}</a><a class="lang" href="${altPath}" hreflang="${o}" lang="${o}">${L[o] === L.en ? "English" : "한국어"}</a></div></header>
<main class="wrap">${body}</main>
<footer class="wrap">© ${t.site} · <a href="/privacy">${lang === "en" ? "Privacy" : "개인정보처리방침"}</a></footer>
</body></html>`;
}

// 작은 해수욕장(1만 명대)도 읽히게: 한국어 만 단위, 영어 k·M (예전엔 모두 백만 단위라 '0.0M'으로 보였음)
function fmtCount(v, lang) {
  if (!v) return "0";
  if (lang === "ko") return v >= 1e6 ? `${Math.round(v / 1e4).toLocaleString()}만` : v >= 1e4 ? `${(v / 1e4).toFixed(1)}만` : v.toLocaleString();
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v);
}

function chartSvg(c, lang) {
  const top = Math.max(...c.values), w = 54;
  const bars = c.values.map((v, i) => {
    const h = (v / top) * 128, x = 20 + i * w, y = 150 - h;
    return `<rect x="${x}" y="${y.toFixed(1)}" width="34" height="${h.toFixed(1)}" rx="2" class="${c.dip.includes(c.years[i]) ? "dip" : "bar"}"/>` +
      `<text x="${x + 17}" y="168" text-anchor="middle">${c.years[i]}</text><text class="v" x="${x + 17}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${fmtCount(v, lang)}</text>`;
  }).join("");
  return `<figure class="chart"><svg viewBox="0 0 560 176" role="img" aria-label="${esc(c[lang])}">${bars}<line x1="14" y1="150" x2="552" y2="150" stroke="currentColor" stroke-opacity=".25"/></svg><figcaption>${esc(c[lang])}</figcaption></figure>`;
}

export function articlePage(m, html, lang) {
  const t = L[lang], o = lang === "en" ? "ko" : "en";
  const path = pathOf(lang, m.slug), altPath = pathOf(o, m.slug);
  // 영어판 숫자 칸: 한국어 단위(개·곳·명·면·번)를 떼거나 영어로(10/13 사용자 점검: 영어 글에 "13개·4곳" 섞여 나옴)
  const factVal = (v) => lang !== "en" ? v : String(v)
    .replace(/(\d)번 중 (\d+)번/g, "$2 of $1").replace(/(\d)면$/, "$1 spaces").replace(/(\d)(개|곳|명|번|편)$/g, "$1");
  const facts = (m.facts || []).map((f) => `<div><small>${esc(f[lang])}</small><b>${esc(factVal(f.v))}</b></div>`).join("");
  const tables = html[lang].replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>");
  const bodyHtml = tables.replace("<!--CHART-->", m.chart ? chartSvg(m.chart, lang) : "");
  const g = m.links?.guide;
  const guide = g && g.live !== false ? `<a class="guide" href="${esc(g.url)}">${esc(g[lang])} →</a>` : "";
  const src = (m.sources || []).map((s) => `<li>${esc(s[lang])} (${esc(s.date[lang])})</li>`).join("");
  const photo = m.photo ? `<figure><img src="${esc(m.photo.url)}" alt="${esc(m.photo.alt[lang])}"${m.photo.width ? ` width="${m.photo.width}" height="${m.photo.height}"` : ""} loading="eager"><figcaption>${esc(m.photo.credit[lang])}</figcaption></figure>` : "";
  const body = `<div class="crumb"><a href="${t.list}">${t.listName}</a> · ${esc(m.kind[lang])} · ${esc(m.region[lang])}</div>
<h1>${esc(m.title[lang])}</h1><p class="lead">${esc(m.description[lang])}</p>
<p class="meta">${t.updated} ${esc(m.publish)}</p>${photo}<div class="facts">${facts}</div>
<article>${bodyHtml}</article>${guide}
<p class="note">${t.note} ${t.emergency}</p>
<div class="src"><b>${t.src}</b><ul>${src}</ul><a href="${altPath}" hreflang="${o}">${L[o] === L.en ? "Read in English" : "한국어로 보기"} →</a></div>`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: m.title[lang], description: m.description[lang], inLanguage: lang,
    datePublished: m.publish, dateModified: m.publish, image: m.photo ? [m.photo.url] : undefined, mainEntityOfPage: `${SITE}${path}`,
    author: { "@type": "Organization", name: t.site, url: SITE }, publisher: { "@type": "Organization", name: t.site, url: SITE },
    isBasedOn: (m.sources || []).map((s) => `${s[lang]} (${s.date[lang]})`) };
  return { path, html: shell(lang, { title: `${m.title[lang]} | ${t.site}`, description: m.description[lang], path, altPath, body, jsonLd, image: m.photo?.url }) };
}

function kstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function generateKoreaPages({ today = kstToday() } = {}) {
  for (const p of ["korea", "en/korea"]) rmSync(join(DIST, p), { recursive: true, force: true });
  if (!existsSync(SRC)) return { korea: 0 };
  const items = [];
  for (const slug of readdirSync(SRC).sort()) {
    const dir = join(SRC, slug);
    if (!existsSync(join(dir, "meta.json"))) continue;
    const m = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    if (m.publish > today || m.hidden) continue; // 예약: 그 날 빌드부터 공개 · 관리 화면에서 숨긴 글은 안 만듦
    for (const s of m.sources || []) if (!s.date?.ko || !s.date?.en) throw new Error(`[korea] ${slug}: 출처 '${s.ko}' 에 날짜가 없음`);
    const html = {};
    for (const lang of ["ko", "en"]) {
      html[lang] = readFileSync(join(dir, `${lang}.html`), "utf8");
      const n = textLen(html[lang]);
      if (n < MIN_TEXT[lang]) throw new Error(`[korea] ${slug}/${lang}.html 본문 ${n}자 — 최소 ${MIN_TEXT[lang]}자`);
    }
    items.push({ m, html });
  }
  items.sort((a, b) => (b.m.publish + b.m.slug).localeCompare(a.m.publish + a.m.slug));

  for (const { m, html } of items) {
    for (const lang of ["ko", "en"]) {
      const pg = articlePage(m, html, lang);
      const out = join(DIST, pg.path);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "index.html"), pg.html);
    }
  }
  for (const lang of ["ko", "en"]) {
    const t = L[lang], o = lang === "en" ? "ko" : "en";
    const lis = items.map(({ m }) => `<li><img src="${esc(m.photo?.url || "")}" alt="" loading="lazy"><span><a href="${pathOf(lang, m.slug)}">${esc(m.title[lang])}</a><small>${esc(m.kind[lang])} · ${esc(m.region[lang])} · ${esc(m.publish)}</small><small>${esc(m.description[lang])}</small></span></li>`).join("");
    const body = `<h1>${esc(t.listTitle)}</h1><p class="lead">${esc(t.listDesc)}</p><ul class="list">${lis || `<li>${lang === "en" ? "No guides yet." : "아직 글이 없어요."}</li>`}</ul>`;
    const out = join(DIST, pathOf(lang));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "index.html"), shell(lang, { title: `${t.listTitle} | ${t.site}`, description: t.listDesc, path: pathOf(lang), altPath: pathOf(o), body }));
  }
  const urls = [];
  const alt = (slug) => `<xhtml:link rel="alternate" hreflang="ko" href="${SITE}${pathOf("ko", slug)}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}${pathOf("en", slug)}"/>`;
  urls.push(`<url><loc>${SITE}/korea/</loc>${alt("")}</url>`, `<url><loc>${SITE}/en/korea/</loc>${alt("")}</url>`);
  for (const { m } of items) for (const lang of ["ko", "en"]) urls.push(`<url><loc>${SITE}${pathOf(lang, m.slug)}</loc><lastmod>${m.publish}</lastmod>${alt(m.slug)}</url>`);
  writeFileSync(join(DIST, "sitemap-korea.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
  return { korea: items.length, pages: items.length * 2 + 2, today };
}

// 단독 실행: node scripts/gen-korea-pages.mjs [YYYY-MM-DD]  (날짜를 주면 그 날 기준으로 예약 글 포함 여부 시험)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === "--preview") {  // 글 공장 관리 화면 미리보기(같은 코드로 그림, 파일은 안 씀)
    const dir = join(SRC, process.argv[3]);
    const m = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    const lang = process.argv[4] === "en" ? "en" : "ko";
    process.stdout.write(articlePage(m, { [lang]: readFileSync(join(dir, `${lang}.html`), "utf8") }, lang).html);
  } else {
    console.log(generateKoreaPages(process.argv[2] ? { today: process.argv[2] } : {}));
  }
}
