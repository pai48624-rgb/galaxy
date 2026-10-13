// 새 메인(/) + 분야 목록(/category/) 생성 — 2026-10-13 사용자 결정(매거진형 시안 m2).
// 옛 메인(3D 지도)은 /map/ 으로 옮김(build-dist.mjs). 메인은 글자가 있는 콘텐츠 허브:
// 큰 기사(3D 지도 미리보기) → 최신 글 3단(chrome.js가 채움, 빌드 때 정적 본문도 둠) → 한국 여행 → 분야 성단 칩 | 옆칸: 가장 밝은 별 1~10 · 최신 글 · RSS.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHROME_CSS, FONT_LINKS, chromeTop, chromeFoot, rankBox } from "./site-chrome.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");
const SITE = "https://aigalaxy-map.com";
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-DMZLKJKCFG"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-DMZLKJKCFG');</script>`;
const ADS = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1632907475675251" crossorigin="anonymous"></script>`;
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a89bf0' d='M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'/%3E%3C/svg%3E">`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);

const HOME_CSS = `
.lead{position:relative;border:1px solid #4a3fa0;overflow:hidden;background:#000;box-shadow:0 0 40px -10px rgba(168,155,240,.45);display:block;text-decoration:none}
.lead img{width:100%;height:420px;object-fit:cover;object-position:left top;opacity:.92;display:block}
.lead .cap{position:absolute;left:0;right:0;bottom:0;padding:28px;background:linear-gradient(transparent,rgba(5,5,11,.95) 70%)}
.kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--amber);font-weight:700}
.lead h1{margin:8px 0 8px;font-size:32px;line-height:1.2;color:#fff}.lead p{margin:0 0 14px;color:#c9cad8;font-size:14px;max-width:640px}
.nums{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0 0;font-size:12.5px;color:var(--dim)}.nums b{color:#fff;font-size:16px;margin-right:4px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px 20px}
.art{text-decoration:none;display:block}.art .th{height:150px;border:1px solid var(--line);background:radial-gradient(80% 80% at 30% 30%,#2a2360,#0a0a16);display:grid;place-items:center;font-size:30px}
.art .cat{display:block;margin-top:10px;font-size:11px;color:var(--purple);letter-spacing:.06em;text-transform:uppercase}
.art h3{margin:4px 0 6px;font-size:17px;line-height:1.3;color:#fff}.art p{margin:0;font-size:12.5px;color:var(--dim)}
.trip{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.trip a{text-decoration:none;border:1px solid var(--line);background:var(--card);display:block}
.trip img{width:100%;height:130px;object-fit:cover;display:block}.trip div{padding:10px 12px}.trip small{color:var(--purple);font-size:11px}.trip b{display:block;color:#fff;font-size:14px;line-height:1.35;margin-top:3px}
.intro{color:var(--soft);font-size:14.5px;line-height:1.75;margin:0}.intro a{color:var(--teal)}
@media (max-width:900px){.lead img{height:200px}.lead .cap{position:static;background:none;padding:14px 12px 16px}.lead h1{font-size:20px}.lead p{display:none}.nums{gap:12px}.grid{grid-template-columns:1fr 1fr;gap:16px 12px}.art .th{height:100px}.art h3{font-size:14.5px}.trip{grid-template-columns:1fr}}
`;

function categories() {
  const dir = join(DIST, "category");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((s) => existsSync(join(dir, s, "index.html"))).map((slug) => {
    const html = readFileSync(join(dir, slug, "index.html"), "utf8");
    const h1 = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1] || slug;
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    const n = Number((h1.match(/(\d+)개/) || [])[1] || 0);
    return { slug, name: h1.replace(/\s*AI\s*\d+개$/, "").trim(), n, desc };
  }).sort((a, b) => b.n - a.n);
}

function koreaLatest() {
  const dir = join(ROOT, "content", "korea");
  if (!existsSync(dir)) return [];
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return readdirSync(dir).filter((s) => !s.startsWith("_") && existsSync(join(dir, s, "meta.json")))
    .map((s) => readJson(join(dir, s, "meta.json"), null)).filter((m) => m && m.publish && m.publish <= today && existsSync(join(DIST, "korea", m.slug, "index.html")))
    .sort((a, b) => (b.publish > a.publish ? 1 : -1));
}

export function generateHome() {
  const tools = readJson(join(ROOT, "data", "ai_landscape.json"), []);
  const combos = readJson(join(ROOT, "data", "ai_combos.json"), []);
  const rank = readJson(join(ROOT, "data", "ai_top_rank.json"), []);
  const cats = categories();
  const korea = koreaLatest();
  const catCount = cats.length || 21;
  const vis = { 1: "53억", 2: "11억", 3: "9.68억", 4: "7.6억", 5: "3.19억" };
  const rankHtml = rank.slice(0, 10).map((r) => `<li><span class="rk">${r.rank}</span><b>${esc(r.matched_name_ko || r.tool_name)}</b><span class="val">${vis[r.rank] ? "월 " + vis[r.rank] : esc((r.reason || "").slice(0, 10))}</span></li>`).join("");
  const chips = cats.slice(0, 12).map((c) => `<a href="/category/${c.slug}/">${esc(c.name)} ${c.n}</a>`).join("") + `<a href="/category/">+${Math.max(0, catCount - 12)}개 더 →</a>`;
  const trips = korea.slice(0, 3).map((m) => `<a href="/korea/${m.slug}/">${m.photo?.url ? `<img src="${esc(m.photo.url)}" alt="${esc(m.photo.alt?.ko || "")}" loading="lazy">` : ""}<div><small>${esc(m.region?.ko || "")} · ${esc(m.kind?.ko || "")}</small><b>${esc(m.title?.ko || m.slug)}</b></div></a>`).join("");
  const latestStatic = `<a class="art" href="/trend/"><div class="th"><i class="star">✦</i></div><span class="cat">AI 트렌드</span><h3 class="serif">요즘 뜨는 AI 도구·순위·요금을 글로 정리합니다</h3><p>매주 수신된 신호를 궤도 안내·별 대 별·성단 순위표 같은 틀로 읽기 쉽게.</p></a>`;
  const body = `${chromeTop("home")}
<div class="wrap cols">
<main>
<a class="lead" href="/map/"><img src="/img/map_preview.jpg" alt="AI 성단 지도 3D 화면" fetchpriority="high"><div class="cap"><span class="kicker">✦ 3D 성단 지도</span><h1 class="serif">AI ${tools.length}개를 ${catCount}개 성단으로 묶어 우주에 펼친 관계형 지도</h1><p>별을 고르면 함께 쓰는 조합과 비슷한 대안이 선으로 이어집니다. 지도에서 고르고, 글에서 확인하고, 다시 지도로.</p><span class="mapbtn"><i class="star">✦</i> 지도 열기 →</span>
<div class="nums"><span><b>${tools.length}</b>AI 도구</span><span><b>${catCount}</b>분야 성단</span><span><b>${combos.length}</b>AI 조합</span><span><b data-count-trend>·</b>트렌드 글</span><span><b>${korea.length}</b>여행 글</span></div></div></a>
<div class="sec"><h2>최신 글</h2><a href="/trend/">AI 트렌드 전체 →</a></div>
<div class="grid" data-latest>${latestStatic}</div>
<div class="sec"><h2>이 지도는</h2><a href="/ai/">AI 목록 →</a></div>
<p class="intro">AI 성단 지도는 전 세계 AI 도구 ${tools.length}개를 ${catCount}개 분야 성단으로 묶어 3D 우주에 띄운 관계형 지도입니다. 별 하나를 고르면 함께 쓰면 좋은 조합 ${combos.length}개와 비슷한 대안이 선으로 이어지고, <a href="/ai/">도구별 안내 페이지</a>에서 기능·요금·대안을 확인할 수 있습니다. <a href="/trend/">AI 트렌드</a>에서는 요금제·비교·순위·소식을 궤도 안내, 별 대 별, 성단 순위표 같은 틀로 정리하고, <a href="/korea/">한국 여행</a>에서는 공공데이터로 산·바다·섬의 가기 전 체크를 다룹니다.</p>
<div class="sec"><h2>한국 여행 최신</h2><a href="/korea/">전체 보기 →</a></div>
<div class="trip">${trips || `<a href="/korea/"><div><b>한국 여행 글 보기</b></div></a>`}</div>
<div class="sec"><h2>분야 성단 ${catCount}</h2><a href="/category/">모두 →</a></div>
<div class="chips">${chips}</div>
</main>
<aside class="side">
${rankBox()}
<div class="sidebox"><b>최신 트렌드 글</b><ul data-latest-list><li><a href="/trend/">AI 트렌드 목록</a></li></ul></div>
<div class="sidebox"><b>새 글 받아 보기</b><span>RSS로 구독하면 새 글이 바로 옵니다.</span><ul><li><a href="/rss.xml">RSS 구독</a></li><li><a href="/map/#board">게시판에 의견 남기기</a></li></ul></div>
</aside>
</div>${chromeFoot()}`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${GA}
<title>AI 성단 지도 — 전세계 AI ${tools.length}개 관계형 지도, AI 트렌드·한국 여행</title>
<meta name="description" content="AI 도구 ${tools.length}개를 ${catCount}개 성단으로 묶은 3D 관계형 지도. 함께 쓰는 조합과 대안, 요금제·비교·순위를 정리한 AI 트렌드 글, 공공데이터로 쓴 한국 여행 안내.">
<link rel="canonical" href="${SITE}/"><meta property="og:type" content="website"><meta property="og:site_name" content="AI 성단 지도"><meta property="og:title" content="AI 성단 지도 — 전세계 AI 관계형 지도"><meta property="og:description" content="AI ${tools.length}개를 성단으로 묶은 3D 지도와 AI 트렌드 글"><meta property="og:url" content="${SITE}/"><meta property="og:image" content="${SITE}/img/map_preview.jpg">
<link rel="alternate" type="application/rss+xml" title="AI 성단 지도" href="/rss.xml"><link rel="manifest" href="/manifest.webmanifest">${ICON}${FONT_LINKS}${ADS}
<script>/* 옛 메인 주소로 온 지도 깊은 링크(/?ai=…)·로그인 복귀(#access_token)·게시판(#board)은 3D 지도(/map/)로 보냄 — 2026-10-13 */
(function(){var s=location.search,h=location.hash;if((s&&s.length>1)||/access_token=|^#(board|login)/.test(h)){location.replace("/map/"+s+h);}})();</script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "AI 성단 지도", url: SITE + "/", potentialAction: { "@type": "SearchAction", target: SITE + "/map/?q={search_term_string}", "query-input": "required name=search_term_string" } })}</script>
<style>${CHROME_CSS}${HOME_CSS}</style></head><body>${body}</body></html>`;
  writeFileSync(join(DIST, "index.html"), html);

  // /category/ 목록(메뉴 "분야 21"이 가리키는 곳 — 전엔 없던 페이지)
  const catBody = `${chromeTop("category")}<div class="wrap cols"><main><h1 class="serif" style="font-size:26px;margin:4px 0 6px;color:#fff">분야 성단 ${catCount}</h1><p class="intro">분야마다 AI 도구를 모아 둔 성단입니다. 숫자는 그 분야의 도구 수.</p>
<div class="grid" style="margin-top:18px">${cats.map((c) => `<a class="art" href="/category/${c.slug}/"><span class="cat">${c.n}개</span><h3 class="serif">${esc(c.name)}</h3><p>${esc(c.desc.slice(0, 80))}</p></a>`).join("")}</div></main>
<aside class="side">${rankBox()}<div class="sidebox"><b>최신 트렌드 글</b><ul data-latest-list><li><a href="/trend/">AI 트렌드 목록</a></li></ul></div></aside></div>${chromeFoot()}`;
  mkdirSync(join(DIST, "category"), { recursive: true });
  writeFileSync(join(DIST, "category", "index.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${GA}<title>분야별 AI 성단 ${catCount}개 — AI 성단 지도</title><meta name="description" content="파운데이션 모델, 코딩 에이전트, 시각 생성 등 ${catCount}개 분야별 AI 도구 목록.">
<link rel="canonical" href="${SITE}/category/">${ICON}${FONT_LINKS}${ADS}<style>${CHROME_CSS}${HOME_CSS}</style></head><body>${catBody}</body></html>`);
  // 404 페이지(없던 것 — 전엔 모르는 주소가 메인을 200으로 돌려줬음)
  writeFileSync(join(DIST, "404.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>페이지를 찾을 수 없어요 — AI 성단 지도</title><meta name="robots" content="noindex">${ICON}${FONT_LINKS}<style>${CHROME_CSS}${HOME_CSS}</style></head><body>${chromeTop("")}<div class="wrap"><h1 class="serif" style="font-size:26px;color:#fff">이 별은 지도에 없어요</h1><p class="intro">주소가 바뀌었거나 사라진 페이지예요. 아래에서 다시 찾아보세요.</p><div class="chips" style="margin-top:14px"><a href="/">홈</a><a href="/map/">✦ 3D 성단 지도</a><a href="/trend/">AI 트렌드</a><a href="/ai/">AI 목록</a><a href="/korea/">한국 여행</a></div></div>${chromeFoot()}</body></html>`);
  return `메인 index.html(도구 ${tools.length}·분야 ${catCount}·조합 ${combos.length}·여행 ${korea.length}) + category/index.html + 404.html`;
}
