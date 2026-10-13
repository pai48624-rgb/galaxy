// dist/ 를 루트 소스 파일들로부터 다시 만드는 스크립트.
// 목적: "루트 파일 고치고 dist/ 복사하는 걸 깜빡해서 옛날 버전이 배포되는" 사고 방지.
//
// dist/_worker.js 와 dist/selftest.html 은 루트에 원본이 없는 dist 전용 파일이라 건드리지 않음.
// data/, vendor/ 는 전체가 아니라 실제로 브라우저에서 fetch 하는 파일만 골라서 복사함
// (data/ 안의 lotto.db, *.xlsx, ai_enrichment.json, ai_landscape.json 은 가져오기 스크립트 전용이라 제외).

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSeoPages } from "./gen-seo-pages.mjs";
import { generateKoreaPages } from "./gen-korea-pages.mjs";
import { generateHome } from "./gen-home.mjs";
import { CHROME_CSS, FONT_LINKS, chromeTop, chromeFoot, scopedChrome, chromeSide } from "./site-chrome.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");

const ROOT_FILES = [
  "index.html",
  "privacy.html",
  "ads.txt",
  "sitemap.xml",
  "robots.txt",
  "naver11527827ffc572c4fc7337b69af3d8a9.html",
  "naverf7a773b489c1dab0e775a86c8ababb3a.html",
  "manifest.webmanifest",
  "galaxy-sw.js",
  "3836b201693766a26e82d00418c13d65.txt", // IndexNow 키 파일(scripts/indexnow.py, 2026-10-03)
];

const DATA_FILES = [
  "affiliate_suns.json",
  "ai_combos.json",
  "ai_top10_relations.json",
  "ai_top_rank.json",
  "constellations_88.json",
  "deepsky_textures.json",
  "planet_textures.json",
  "world_countries.json",
];

function copyIfExists(srcPath, destPath) {
  if (!existsSync(srcPath)) {
    console.warn(`  (건너뜀 — 소스에 없음) ${srcPath}`);
    return;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(srcPath, destPath);
  console.log(`  ${srcPath.replace(ROOT + "\\", "").replace(ROOT + "/", "")} -> dist/`);
}

function copyDirRecursive(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

console.log("[build] 루트 파일 -> dist/");
for (const f of ROOT_FILES) copyIfExists(join(ROOT, f), join(DIST, f));

console.log("[build] data/*.json -> dist/data/");
for (const f of DATA_FILES) copyIfExists(join(ROOT, "data", f), join(DIST, "data", f));
copyDirRecursive(join(ROOT, "data", "models"), join(DIST, "data", "models"));

console.log("[build] vendor/ -> dist/vendor/ (전체 복사)");
copyDirRecursive(join(ROOT, "vendor"), join(DIST, "vendor"));

console.log("[build] galaxy_saas/ -> dist/galaxy_saas/ (전체 복사, /galaxy_saas/ 경로로 배포됨)");
copyDirRecursive(join(ROOT, "galaxy_saas"), join(DIST, "galaxy_saas"));

// ---- rss.xml 생성 (2026-10-03 "aigalaxy-map.com RSS 등록하게 만들어" - 네이버 서치어드바이저 제출용)
// 원래 /rss.xml 은 파일이 없어서 메인 HTML이 대신 나가고 있었음. sitemap.xml 에 있는 페이지를
// 그대로 항목으로 쓰고(개인정보처리방침 같은 안내 페이지는 제외), 제목·설명은 각 페이지의
// <title>·meta description 에서 읽음 → 페이지를 늘리면 sitemap 만 고쳐도 RSS가 따라감.
// 날짜는 그 파일의 마지막 git 커밋 시각(없으면 파일 수정 시각).
const SITE = "https://aigalaxy-map.com";
const RSS_EXCLUDE = new Set(["/privacy"]);

function sourceFor(path) {
  if (path === "/") return "index.html";
  if (path.endsWith("/")) return join(path.slice(1), "index.html");
  return path.slice(1) + ".html";
}

function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlUnescape(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function lastChanged(file) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${file}"`, { cwd: ROOT }).toString().trim();
    if (iso) return new Date(iso);
  } catch (e) { /* git 없으면 아래로 */ }
  return statSync(join(ROOT, file)).mtime;
}

console.log("[build] sitemap.xml -> dist/rss.xml");
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const items = [];
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const path = loc.replace(SITE, "") || "/";
  if (RSS_EXCLUDE.has(path)) continue;
  const file = sourceFor(path);
  if (!existsSync(join(ROOT, file))) {
    console.warn(`  (RSS 건너뜀 — 소스 없음) ${file}`);
    continue;
  }
  const html = readFileSync(join(ROOT, file), "utf8");
  const title = htmlUnescape((html.match(/<title>([^<]*)<\/title>/) || [, path])[1].trim());
  const desc = htmlUnescape((html.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1].trim());
  items.push({ loc, title, desc, date: lastChanged(file) });
}
const newest = items.reduce((a, b) => (a > b.date ? a : b.date), new Date(0));
const rss =
  '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>' +
  `<title>AI 성단 지도</title><link>${SITE}/</link>` +
  "<description>731개+ AI 서비스를 용도별 은하계로 탐색하는 AI 관계형 지도와 무료 AI 도구 모음</description>" +
  `<language>ko</language><lastBuildDate>${newest.toUTCString()}</lastBuildDate>` +
  items.map((i) =>
    `<item><title>${xmlEscape(i.title)}</title><link>${i.loc}</link><guid isPermaLink="true">${i.loc}</guid>` +
    `<description>${xmlEscape(i.desc)}</description><pubDate>${i.date.toUTCString()}</pubDate></item>`
  ).join("") +
  "</channel></rss>\n";
writeFileSync(join(DIST, "rss.xml"), rss);
console.log(`  rss.xml 항목 ${items.length}개`);

console.log("[build] 검색용 페이지 생성(/ai/, /category/, sitemap-ai.xml) — Supabase 읽기 실패하면 빌드 중단");
console.log("[build]", await generateSeoPages());

console.log("[build] 한국 여행 글(/korea/, /en/korea/, sitemap-korea.xml) — content/korea, 공개일(publish) 지난 글만");
console.log("[build]", generateKoreaPages());

// ---- 2026-10-13 메인 재설계(사용자 결정: 매거진형). 옛 메인(3D 지도 앱)은 /map/ 으로, 메인(/)은 gen-home.mjs가 새로 만듦.
console.log("[build] 3D 지도 앱 index.html -> dist/map/index.html (상대 경로를 절대 경로로)");
{
  let app = readFileSync(join(ROOT, "index.html"), "utf8");
  app = app.replace(/(src|href)="(vendor|data)\//g, '$1="/$2/').replace(/"(vendor|data)\//g, '"/$1/').replace(/'(vendor|data)\//g, "'/$1/");
  app = app.replace("<title>", "<title>3D 성단 지도 · ").replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://aigalaxy-map.com/map/">');
  // 메뉴의 ?q= 검색과 #board·#login 진입: 앱 스크립트가 다 뜬 뒤 검색창에 값 넣고, 게시판 버튼 누름
  // 메인과 같은 껍데기(신호 띠·제호·검색·메뉴)를 앱 맨 위에 얹고 앱의 옛 머리줄(#topbar)은 숨김. 머리줄 안 기능(☰·방문 수·설치·로그인·EN·라벨)은
  // 아래 스크립트가 껍데기의 제호 칸으로 옮긴다(요소를 그대로 옮기므로 이벤트는 유지). 게시판·채팅을 열어도 껍데기는 남는다. — 2026-10-13 "큰 틀 메인 기준으로 통일"
  app = app.replace(/<div id="app"[^>]*>/, (m) => m + scopedChrome("map") + `<style>#topbar{display:none!important}.site-chrome .mast .right>a.sc-lg{display:none}.site-chrome .mast #menuBtn{margin-right:6px}
.site-chrome .mast .right #visitBadge,.site-chrome .mast .right #topbarAuth{display:inline-flex;align-items:center;gap:6px}
@media (max-width:900px){.site-chrome .mast .right #visitBadge,.site-chrome .mast .right #pwaInstallBtn,.site-chrome .mast .right #labelsToggleBtn{display:none!important}}
#langBtn{display:none!important}
/* 게시판: 사이트 공통 틀 — 가운데 폭·세리프 제목·탭 칩·선 목록·카드 상세 (2026-10-14 "다른 페이지와 똑같은 디자인 패턴") */
#boardPage{width:100%;max-width:1320px;margin:0 auto;padding:22px 24px;box-sizing:border-box;font-family:"Pretendard Variable",Pretendard,-apple-system,"Malgun Gothic",sans-serif;overflow:auto}
#app:has(#boardPage:not([hidden])) #tipBar{display:none!important}
.bp-head{padding:0 0 8px;border-bottom:2px solid #262640;margin-bottom:16px;gap:10px}
#boardPageBack{display:none!important}
.bp-title{font-family:"Noto Serif KR",serif;font-size:24px;color:#fff;font-weight:700}
.bp-split{display:grid!important;grid-template-columns:360px minmax(0,1fr);gap:22px;min-height:0;flex:none}
.bp-rail{grid-column:1/-1;width:auto!important;flex-direction:row!important;border:0!important;padding:0!important;background:none!important;gap:6px!important;align-items:center!important}
.bp-rail-item{flex-direction:row!important;width:auto!important;padding:5px 12px!important;border:1px solid #262640!important;border-radius:4px!important;font-size:12.5px;gap:6px;color:#9d9fb6}
.bp-rail-item.active{background:rgba(168,155,240,.15)!important;border-color:#a89bf0!important;color:#fff!important}
.bp-rail-icon{font-size:14px!important}.bp-rail-label{font-size:12.5px!important;letter-spacing:0!important}
.bp-list-pane{width:auto!important;border:1px solid #262640!important;background:#0f0f1d;min-height:420px}
.board-list-header{padding:10px 16px!important}
.board-row{border-radius:0!important;border-bottom:1px solid #262640!important;padding:12px 14px!important}
.board-row-title{font-size:14px!important}
.bp-detail-pane{border:1px solid #262640;background:#0f0f1d;padding:22px 24px!important;min-height:420px}
.board-detail-title{font-family:"Noto Serif KR",serif;font-size:22px!important}
@media (max-width:760px){#boardPage{padding:14px}.bp-split{grid-template-columns:1fr}.bp-list-pane{max-height:none!important;min-height:0}.bp-detail-pane{min-height:200px}}</style>`);
  // #board 로 들어오면 앱이 그려지기 전부터 지도·사이드바를 숨기고 게시판 자리를 보여 "옛 화면이 1초 보였다가 바뀌는" 깜빡임을 없앰(2026-10-14 사용자 지적)
  app = app.replace("</head>", FONT_LINKS + '<script src="/chrome.js" defer></script><script>if(/^#board/.test(location.hash))document.documentElement.classList.add("want-board");</script>'
    + '<style>.want-board #sidebar,.want-board #tipBar{display:none!important}.want-board #stage:not([hidden]){position:absolute!important;left:0;top:0;width:100vw;height:100vh;visibility:hidden!important;pointer-events:none}.want-board #boardPage{display:flex!important}.bp-rail{display:none!important}</style></head>');
  app = app.replace("</body>", `<script>function __chromeInit(){var q=new URLSearchParams(location.search).get("q");var s=document.getElementById("search");if(q&&s){s.value=q;s.dispatchEvent(new Event("input",{bubbles:true}));}
/* 게시판 자동 열기는 3D 그래픽(canvas)이 만들어진 뒤에 — 그 전에 열면 앱이 지도를 display:none 으로 숨겨 WebGL 초기화가 깨짐 */
function openBoardWhenReady(){var tries=0,tm=setInterval(function(){var c=document.querySelector("#graph canvas");if(c||++tries>60){clearInterval(tm);var b=document.getElementById("boardOpenBtn");if(b)b.click();}},250);}
if(/^#board/.test(location.hash))openBoardWhenReady();
/* 같은 페이지 안에서 메뉴 이동: /map/ ↔ /map/#board 는 해시만 바뀌어 새로 뜨지 않으므로 직접 열고 닫음 */
document.querySelectorAll('.site-chrome .menu a[href="/map/"], .site-chrome .sc-brand, .site-chrome .brand').forEach(function(a){a.addEventListener("click",function(e){if(location.pathname==="/map/"&&a.getAttribute("href")==="/map/"){e.preventDefault();var bb=document.getElementById("boardPageBack");if(bb)bb.click();document.documentElement.classList.remove("want-board");history.replaceState(null,"","/map/");window.dispatchEvent(new Event("resize"));}});});
/* 페이지를 떠날 때 WebGL 컨텍스트를 바로 반납 — 지도 페이지를 여러 번 오가면 브라우저 한도(약 16개)에 걸려 "WebGL 비활성화" 오류가 나던 문제 */
window.addEventListener("pagehide",function(){try{var c=document.querySelector("#graph canvas");var gl=c&&(c.getContext("webgl2")||c.getContext("webgl"));var ext=gl&&gl.getExtension("WEBGL_lose_context");if(ext)ext.loseContext();}catch(e){}});
/* 게시판이 닫히면(지도로) 미리 숨김 해제 */
var bp=document.getElementById("boardPage");if(bp&&window.MutationObserver){new MutationObserver(function(){document.documentElement.classList.toggle("want-board",!bp.hidden);}).observe(bp,{attributes:true,attributeFilter:["hidden"]});}
if(/^#login/.test(location.hash)){var tries=0,tm=setInterval(function(){var bs=document.querySelectorAll(".topbar-social-btn");bs.forEach(function(x){x.classList.add("login-pulse");});if((bs.length&&tries>3)||++tries>20)clearInterval(tm);},400);}
document.querySelectorAll(".site-chrome .menu a").forEach(function(a){if(a.getAttribute("href")==="/map/#board"){a.addEventListener("click",function(e){e.preventDefault();var b=document.getElementById("boardOpenBtn");if(b)b.click();history.replaceState(null,"","/map/#board");});}});
/* 옛 머리줄의 기능 요소를 껍데기 제호 칸으로 옮김(요소 이동이라 이벤트 유지) */
function moveCtrls(){var mast=document.querySelector(".site-chrome .mast"),right=mast&&mast.querySelector(".right"),mb=document.getElementById("menuBtn");
if(mast&&mb&&mb.parentElement!==mast){mast.insertBefore(mb,mast.firstChild);}
if(right){["visitBadge","pwaInstallBtn","topbarAuth","labelsToggleBtn"].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentElement!==right)right.appendChild(el);});}}
moveCtrls();setTimeout(moveCtrls,1000);setTimeout(moveCtrls,3000);
/* 껍데기 검색창 → 앱 검색창으로 바로 전달(새로고침 없이) */
var cq=document.querySelector(".site-chrome .q input"),cf=document.querySelector(".site-chrome form.q");
if(cq&&s){cq.addEventListener("input",function(){s.value=cq.value;s.dispatchEvent(new Event("input",{bubbles:true}));});if(cf)cf.addEventListener("submit",function(e){e.preventDefault();});if(q)cq.value=q;}
/* 앱의 EN 버튼과 껍데기 글자를 같이 바꿈(앱은 localStorage galaxyLang 에 저장) */
function chromeLang(l){document.querySelectorAll(".site-chrome [data-en]").forEach(function(e){var v=e.getAttribute(l==="en"?"data-en":"data-ko");if(e.tagName==="INPUT")e.placeholder=v;else if(e.querySelector("i"))e.innerHTML='<i class="sc-star">✦</i> '+v.replace("✦","").trim();else e.textContent=v;});
document.querySelectorAll(".site-chrome .langbar a").forEach(function(a){a.classList.toggle("on",a.getAttribute("data-lang")===l);});}
function curLang(){try{return localStorage.getItem("galaxyLang")||"ko";}catch(e){return "ko";}}
chromeLang(curLang());
document.querySelectorAll(".site-chrome .langbar a").forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();var want=a.getAttribute("data-lang");if(want!==curLang()){var lb=document.getElementById("langBtn");if(lb)lb.click();}setTimeout(function(){chromeLang(curLang());},80);});});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",__chromeInit);else __chromeInit();</script></body>`);
  mkdirSync(join(DIST, "map"), { recursive: true });
  writeFileSync(join(DIST, "map", "index.html"), app);
}
// 옛 스타일 독립 페이지(도구 모음 galaxy_saas/*.html, 개인정보처리방침)에도 같은 얇은 메뉴를 얹음 — 어느 화면에서도 사이트 메뉴가 안 사라지게
{
  const targets = readdirSync(join(DIST, "galaxy_saas")).filter((f) => f.endsWith(".html")).map((f) => join(DIST, "galaxy_saas", f)).concat([join(DIST, "privacy.html")]);
  let n = 0;
  for (const f of targets) {
    if (!existsSync(f)) continue;
    let h = readFileSync(f, "utf8");
    if (h.includes('class="site-chrome"')) continue;
    // 옛 페이지는 body 자체에 최대 폭·여백이 걸려 있어 껍데기가 좁아짐 → body는 전체 폭, 원래 본문만 가운데 760px로 감싼다
    // 본문을 다른 페이지와 같은 틀(.wrap.cols: 본문 + 오른쪽 옆칸)에 담고, 페이지 자체의 "돌아가기" 링크·머리줄은 뺀다
    h = h.replace(/<a[^>]*>←\s*AI 성단 지도로 돌아가기<\/a>/g, "").replace(/<header class="nav-header">[\s\S]*?<\/header>/, "");
    // 도구 모음 중 밝은 배경(흰 카드)으로 만든 옛 도구 4쪽은 사이트 어두운 색으로 강제(카드·입력칸·글자색). 2026-10-14 틀 통일
    const dark = f.includes("galaxy_saas") ? `<style>html{color-scheme:dark}.wrap.cols main,.wrap.cols main *{color:#d9dae6}.wrap.cols main h1,.wrap.cols main h2,.wrap.cols main h3,.wrap.cols main b,.wrap.cols main strong{color:#fff}
.wrap.cols main a{color:#8fd6c4}.wrap.cols main [class*="card"],.wrap.cols main [class*="tile"],.wrap.cols main [class*="box"],.wrap.cols main [class*="panel"],.wrap.cols main [class*="item"],.wrap.cols main section,.wrap.cols main article,.wrap.cols main [style*="background"]{background:#0f0f1d!important;border-color:#262640!important;box-shadow:none!important}
.wrap.cols main input,.wrap.cols main select,.wrap.cols main textarea{background:#15152a!important;color:#d9dae6!important;border:1px solid #262640!important}
.wrap.cols main button{background:#1b1b30!important;color:#d9dae6!important;border:1px solid #262640!important}.wrap.cols main table,.wrap.cols main th,.wrap.cols main td{background:transparent!important;border-color:#262640!important}</style>` : "";
    h = h.replace(/<body[^>]*>/, (m) => m + `<style>body{max-width:none!important;padding:0!important;margin:0!important;background:#05050b!important}</style>` + dark + scopedChrome("") + '<div class="site-chrome"><div class="wrap cols"><main>')
         .replace("</head>", FONT_LINKS + "</head>").replace(/<\/body>/, `</main>${chromeSide()}</div>${chromeFoot()}</div></body>`);
    writeFileSync(f, h); n++;
  }
  console.log(`[build] 도구 모음·개인정보 페이지 ${n}개에 사이트 메뉴 얹음`);
}
console.log("[build] img/ -> dist/img/, chrome.js -> dist/");
copyDirRecursive(join(ROOT, "img"), join(DIST, "img"));
copyIfExists(join(ROOT, "chrome.js"), join(DIST, "chrome.js"));
console.log("[build] 새 메인(/)과 /category/ 생성");
console.log("[build]", generateHome());
console.log("[build] 공통 껍데기 CSS·머리줄을 dist/_worker.js 에 주입(/*<chrome>*/ … /*</chrome>*/)");
{
  const wp = join(DIST, "_worker.js");
  let w = readFileSync(wp, "utf8");
  const block = `/*<chrome>*/\nconst CHROME_CSS = ${JSON.stringify(CHROME_CSS)};\nconst FONT_LINKS = ${JSON.stringify(FONT_LINKS)};\nconst CHROME_TOP = ${JSON.stringify(chromeTop("trend", { date: "__DATE__" }))};\nconst CHROME_FOOT = ${JSON.stringify(chromeFoot())};\n/*</chrome>*/`;
  if (/\/\*<chrome>\*\/[\s\S]*?\/\*<\/chrome>\*\//.test(w)) { w = w.replace(/\/\*<chrome>\*\/[\s\S]*?\/\*<\/chrome>\*\//, block); writeFileSync(wp, w); console.log("  주입 완료"); }
  else console.warn("  (건너뜀) dist/_worker.js 에 /*<chrome>*/ 표시가 없음");
}

console.log("[build] 완료. dist/_worker.js, dist/selftest.html 은 그대로 유지됨.");
