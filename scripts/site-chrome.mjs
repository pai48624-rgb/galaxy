// 사이트 공통 껍데기(2026-10-13, 사용자 결정 "메인·글 화면 UI 통일, 매거진형").
// 메인(gen-home.mjs)·AI/분야(gen-seo-pages.mjs)·한국 여행(gen-korea-pages.mjs)·워커(dist/_worker.js, build-dist가 주입)가 전부 이걸 씀.
// 구성: 맨 위 "이번 주 신호" 띠(최신 글 제목, /chrome.js가 채움) → 제호(로고·날짜·검색·로그인) → 메뉴(✦ 3D 성단 지도 강조) → 본문 → 꼬리말.
// 어두운 우주 테마 고정(밝은 모드 없음). 25_templates/site/galaxy_main/m2_magazine.html 시안이 원본.

export const CHROME_CSS = `
:root{--bg:#05050b;--card:#0f0f1d;--card2:#141a3a;--line:#262640;--ink:#d9dae6;--soft:#c3c4d4;--dim:#9d9fb6;--faint:#6b6d86;--purple:#a89bf0;--amber:#f0b429;--teal:#8fd6c4;--red:#e5766b;--acc:#a89bf0;--chip:#1b1b30;--sea:#8fd6c4;--gold:#f0b429}
*{box-sizing:border-box}html{overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:14.5px;line-height:1.6;word-break:keep-all}
a{color:inherit}img{max-width:100%}
.serif{font-family:"Noto Serif KR","Pretendard Variable",serif}
.star{color:var(--amber);text-shadow:0 0 8px var(--amber),0 0 18px var(--purple);font-style:normal;animation:tw 2.6s ease-in-out infinite}@keyframes tw{0%,100%{opacity:1}50%{opacity:.65}}
.ticker{display:flex;gap:22px;align-items:center;padding:7px 24px;border-bottom:1px solid var(--line);background:#0a0a16;font-size:12px;color:var(--dim);overflow:hidden;white-space:nowrap}
.ticker b{color:var(--amber);flex:none}.ticker a{color:var(--dim);text-decoration:none}.ticker a::before{content:"◆";color:var(--purple);font-size:8px;margin-right:8px}.ticker a:hover{color:var(--ink)}
.mast{display:flex;align-items:center;gap:18px;padding:12px 24px;border-bottom:1px solid var(--line)}
.mast .brand{font-size:23px;color:#fff;font-weight:700;display:flex;align-items:center;gap:8px;letter-spacing:-.02em;text-decoration:none}
.mast .date{font-size:12px;color:var(--dim)}.mast .right{margin-left:auto;display:flex;align-items:center;gap:8px}
.mast .q{display:flex;align-items:center;gap:6px;border:1px solid var(--line);padding:0 10px;height:32px;color:var(--dim);font-size:12.5px;width:210px;border-radius:6px}.mast .q input{background:none;border:0;color:var(--ink);width:100%;outline:none;font-size:13px}
.lg{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-weight:800;font-size:11px;flex:none;text-decoration:none}.lg-g{background:#fff;color:#4285f4}.lg-k{background:#fee500;color:#191919}.lg-n{background:#03c75a;color:#fff}
.langbar{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;flex:none}.langbar a{padding:4px 11px;font-size:12px;font-weight:700;color:var(--dim);text-decoration:none;line-height:1.5}.langbar a.on{background:var(--purple);color:#0b0b14}.langbar a:not(.on):hover{color:#fff}
.menu{display:flex;gap:2px;padding:0 24px;border-bottom:2px solid var(--line);overflow-x:auto;scrollbar-width:none}.menu::-webkit-scrollbar{display:none}
.menu a{padding:10px 14px;font-weight:700;font-size:14px;color:var(--ink);white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;text-decoration:none}
.menu a:hover,.menu a.on{color:#fff;border-bottom-color:var(--amber)}.menu a.map{color:var(--amber)}
.wrap{max-width:1320px;margin:0 auto;padding:22px 24px}
.wrap.cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start}
.sec{display:flex;align-items:baseline;margin:26px 0 12px;border-bottom:2px solid var(--line);padding-bottom:6px}
.sec h2{margin:0;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#fff}.sec a{margin-left:auto;font-size:12px;color:var(--dim);text-decoration:none}
.side{display:grid;gap:22px;align-content:start}
.rank{border:1px solid var(--line);background:var(--card2)}.rank .hd{padding:12px 14px;background:#1a2250;color:#fff;font-weight:700;font-size:14px}.rank .hd small{display:block;font-weight:400;font-size:11px;color:#b9bfdc}
.rank ol{list-style:none;margin:0;padding:6px 0}.rank li{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid rgba(255,255,255,.08);font-size:13.5px}
.rank li:first-child{border-top:0}.rank .rk{font-family:"Noto Serif KR",serif;font-weight:700;font-size:15px;color:var(--dim);text-align:center}.rank li:nth-child(-n+3) .rk{color:#ff5a5a}.rank b{color:#fff;font-weight:600}.rank .val{font-size:12px;color:var(--dim)}.rank a{text-decoration:none}
.sidebox{border:1px solid var(--line);padding:14px 16px;background:var(--card)}.sidebox b{display:block;color:#fff;margin-bottom:6px}.sidebox span,.sidebox small{font-size:12.5px;color:var(--dim)}
.sidebox ul{list-style:none;margin:8px 0 0;padding:0}.sidebox li{padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}.sidebox li:first-child{border-top:0}.sidebox li a{color:var(--soft);text-decoration:none}.sidebox li a:hover{color:#fff}
.mapbtn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;border:1px solid #4a3fa0;background:linear-gradient(180deg,#2a2360,#15152c);color:#fff;font-weight:700;box-shadow:0 0 24px -6px var(--purple);text-decoration:none}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips a{font-size:12.5px;border:1px solid var(--line);padding:4px 10px;color:var(--dim);text-decoration:none;border-radius:4px}.chips a:hover{color:#fff;border-color:var(--purple)}
.ft{font-size:11.5px;color:var(--dim);display:flex;flex-wrap:wrap;gap:14px;padding:16px 0;border-top:1px solid var(--line)}.ft a{color:var(--dim);text-decoration:none}
.paper{background:#fff;color:#1d1d2b;border-radius:14px;padding:24px 22px;overflow-wrap:anywhere}.paper h2,.paper h3{color:#102a43}.paper table{display:block;overflow-x:auto}
/* 본문 공통 글꼴·제목·카드 — 어느 페이지든 같은 모양(.wrap.cols main 안). 페이지 자체 CSS(h1{…})보다 구체도가 높아 이것이 이긴다 */
.wrap.cols main{font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:var(--ink);line-height:1.7}
.wrap.cols main h1{font-family:"Noto Serif KR","Pretendard Variable",serif;font-size:26px;line-height:1.35;margin:4px 0 8px;color:#fff;font-weight:700;letter-spacing:-.2px}
.wrap.cols main h2{font-size:19px;line-height:1.4;margin:28px 0 10px;color:var(--soft);font-weight:700}
.wrap.cols main h3{font-size:16px;margin:18px 0 6px;color:var(--soft);font-weight:700}
.wrap.cols main p,.wrap.cols main li{font-size:15px;color:var(--ink)}.wrap.cols main a{color:var(--teal)}
.wrap.cols main .lead,.wrap.cols main .meta,.wrap.cols main .note,.wrap.cols main .crumb,.wrap.cols main .updated,.wrap.cols main small{color:var(--dim)}
.wrap.cols main .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0}
.wrap.cols main .cta,.wrap.cols main .guide{display:inline-block;margin:24px 8px 0 0;background:linear-gradient(90deg,var(--purple),#7c6eff);color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;border:0}
.wrap.cols main .cta.ghost{background:transparent;color:var(--purple);border:1px solid var(--purple)}
.wrap.cols main table{border-collapse:collapse;width:100%;font-size:14px}.wrap.cols main th,.wrap.cols main td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.wrap.cols main th{color:var(--dim);font-weight:600;font-size:12.5px}
.wrap.cols main img{max-width:100%;height:auto;border-radius:12px}.wrap.cols main code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px;font-size:12.5px}
.wrap.cols main .chips a,.wrap.cols main .chips span{font-size:12.5px;border:1px solid var(--line);padding:4px 10px;color:var(--dim);text-decoration:none;border-radius:4px;background:none}
.mast .brand{white-space:nowrap;flex:none}
@media (max-width:900px){.mast{padding:10px 14px;gap:8px}.mast .brand{font-size:17px}.mast .brand svg{width:18px;height:18px}.mast .date,.mast .q{display:none}.mast .right{gap:6px}.langbar a{padding:3px 8px;font-size:11px}.lg{width:26px;height:26px}.menu{padding:0 16px}.ticker{padding:6px 16px}
 .wrap{padding:16px}.wrap.cols{grid-template-columns:minmax(0,1fr);gap:20px}.wrap.cols>main{min-width:0}}
`;

export const FONT_LINKS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap" rel="stylesheet">`;

// 메뉴: [키, 주소, 한국어, 영어, 강조 클래스]. 영어 쪽은 영어 페이지(/en/…)와 3D 앱의 EN 전환에 쓴다.
const NAV = [
  ["map", "/map/", "<i class=\"star\">✦</i> 3D 성단 지도", "<i class=\"star\">✦</i> 3D Galaxy Map", "map"],
  ["home", "/", "홈", "Home"], ["trend", "/trend/", "AI 트렌드", "AI Trends"], ["ai", "/ai/", "AI 목록 731", "AI Tools 731"], ["category", "/category/", "분야 21", "Fields 21"],
  ["korea", "/korea/", "한국 여행", "Korea Travel"], ["board", "/map/#board", "게시판 · 채팅", "Board · Chat"],
];
const T = {
  ko: { signal: "이번 주 신호", seeNew: "AI 트렌드 새 글 보기", brand: "AI 성단 지도", tag: "전세계 AI 관계형 지도", search: "AI 이름 검색", searchA: "AI 검색", g: "구글 로그인", k: "카카오 로그인", n: "네이버 로그인",
        copy: "© 2026 AI 성단 지도 · aigalaxy-map.com", privacy: "개인정보 처리방침", rss: "RSS", sitemap: "사이트맵", contact: "문의 · 게시판",
        rank: "이번 달 가장 밝은 별 1~10", rankSub: "월 방문 · Visual Capitalist 2026-06", latest: "최신 트렌드 글", list: "AI 트렌드 목록", get: "새 글 받아 보기", rssSub: "RSS 구독", openMap: "✦ 3D 성단 지도 열기" },
  en: { signal: "This week", seeNew: "New AI trend posts", brand: "AI Galaxy Map", tag: "Relationship map of AI tools worldwide", search: "Search AI tools", searchA: "Search AI", g: "Sign in with Google", k: "Sign in with Kakao", n: "Sign in with Naver",
        copy: "© 2026 AI Galaxy Map · aigalaxy-map.com", privacy: "Privacy", rss: "RSS", sitemap: "Sitemap", contact: "Contact · Board",
        rank: "Brightest stars this month 1–10", rankSub: "Monthly visits · Visual Capitalist 2026-06", latest: "Latest trend posts", list: "AI trends", get: "Get new posts", rssSub: "RSS feed", openMap: "✦ Open the 3D map" },
};
// 영어 페이지에서는 메뉴의 "English" 자리가 "한국어"(한국어판으로)가 되고, 한국 여행 링크는 영어판 목록으로
function navFor(lang) {
  return NAV.map(([k, href, ko, en, cls]) => {
    if (lang === "en" && k === "korea") href = "/en/korea/";
    return [k, href, lang === "en" ? en : ko, cls, ko, en];
  });
}

// 날짜는 빌드 시각(KST). 워커는 매 요청 시각. data-ko/data-en 은 3D 앱에서 언어를 바꿀 때 메뉴 글자를 바꾸는 데 쓴다.
// urls: 언어 전환 줄이 가리킬 주소 {ko, en}. 제조 지도(industry)의 langbar 와 같은 방식 — 언어 전환은 머리줄 오른쪽 한 곳뿐.
export function chromeTop(active = "", { date = kstDateText(), lang = "ko", urls = {} } = {}) {
  const t = T[lang] || T.ko;
  const u = { ko: "/", en: "/en/korea/", ...urls };
  const strip = (s) => s.replace(/<[^>]+>/g, "").trim();
  const menu = navFor(lang).map(([k, href, label, cls, ko, en]) => `<a href="${href}" class="${[cls, k === active ? "on" : ""].filter(Boolean).join(" ")}" data-ko="${strip(ko)}" data-en="${strip(en)}">${label}</a>`).join("");
  const langbar = `<div class="langbar" aria-label="언어"><a href="${u.ko}" hreflang="ko" lang="ko" data-lang="ko" class="${lang === "ko" ? "on" : ""}">한국어</a><a href="${u.en}" hreflang="en" lang="en" data-lang="en" class="${lang === "en" ? "on" : ""}">English</a></div>`;
  return `<div class="ticker" id="ticker"><b data-ko="${T.ko.signal}" data-en="${T.en.signal}">${t.signal}</b><a href="/trend/">${t.seeNew}</a></div>
<header class="mast"><a class="brand serif" href="${lang === "en" ? "/en/korea/" : "/"}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg><span data-ko="${T.ko.brand}" data-en="${T.en.brand}">${t.brand}</span></a><span class="date">${date} · <span data-ko="${T.ko.tag}" data-en="${T.en.tag}">${t.tag}</span></span>
<div class="right"><form class="q" action="/map/" method="get"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input type="search" name="q" placeholder="${t.search}" data-ko="${T.ko.search}" data-en="${T.en.search}" aria-label="${t.searchA}"></form>${langbar}<a class="lg lg-g" href="/map/#login" title="${t.g}">G</a><a class="lg lg-k" href="/map/#login" title="${t.k}">K</a><a class="lg lg-n" href="/map/#login" title="${t.n}">N</a></div></header>
<nav class="menu">${menu}</nav>`;
}

// 3D 지도 앱(/map/) 맨 위에 얹는 얇은 사이트 메뉴(2026-10-13 사용자: "게시판 누르면 전체화면 되고 메뉴 사라짐").
// 앱의 CSS 변수와 안 섞이게 .site-menu 로만 꾸민다. 앱 안 게시판·채팅을 열어도 이 줄은 그대로 남는다.
export function mapMenuBar(active = "map") {
  const menu = NAV.map(([k, href, label, cls]) => `<a href="${href}" class="${[cls, k === active ? "on" : ""].filter(Boolean).join(" ")}">${label}</a>`).join("");
  return `<style>.site-menu{flex:none;display:flex;align-items:center;gap:2px;padding:0 14px;height:38px;background:#07070f;border-bottom:1px solid #262640;overflow-x:auto;scrollbar-width:none;font-family:"Pretendard Variable",Pretendard,-apple-system,"Malgun Gothic",sans-serif}
.site-menu::-webkit-scrollbar{display:none}.site-menu .brand{color:#fff;font-weight:800;font-size:14px;text-decoration:none;margin-right:10px;white-space:nowrap}
.site-menu a{color:#d9dae6;text-decoration:none;font-size:13px;font-weight:700;padding:0 10px;height:38px;line-height:38px;white-space:nowrap;border-bottom:2px solid transparent}
.site-menu a:hover,.site-menu a.on{color:#fff;border-bottom-color:#f0b429}.site-menu a.map{color:#f0b429}.site-menu .star{color:#f0b429}
.login-pulse{box-shadow:0 0 0 3px #f0b429,0 0 18px #f0b429!important;animation:lp 1s ease-in-out 4}@keyframes lp{50%{box-shadow:0 0 0 6px rgba(240,180,41,.35)}}</style>
<nav class="site-menu" aria-label="사이트 메뉴"><a class="brand" href="/">✦ AI 성단 지도</a>${menu}</nav>`;
}

// 공통 CSS의 선택자 앞에 접두 클래스를 붙여 다른 화면(3D 앱·옛 독립 페이지)의 CSS와 안 섞이게 한다.
// :root 변수는 접두 요소에 두고, html/body 규칙은 접두 요소 자체 규칙으로 바꾼다. @keyframes 안은 손대지 않는다.
export function prefixCss(css, pre) {
  let out = "", i = 0;
  while (i < css.length) {
    const at = css.indexOf("@", i), open = css.indexOf("{", i);
    if (open < 0) { out += css.slice(i); break; }
    if (at >= 0 && at < open && /^@keyframes/.test(css.slice(at))) {
      // @keyframes 블록 통째로 복사
      let depth = 0, j = open;
      for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (depth === 0) break; } }
      out += css.slice(i, j + 1); i = j + 1; continue;
    }
    if (at >= 0 && at < open && /^@media/.test(css.slice(at))) {
      let depth = 0, j = open;
      for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (depth === 0) break; } }
      out += css.slice(i, open + 1) + prefixCss(css.slice(open + 1, j), pre) + "}"; i = j + 1; continue;
    }
    const close = css.indexOf("}", open);
    const sel = css.slice(i, open).trim(), body = css.slice(open, close + 1);
    const fixed = sel.split(",").map((s) => { s = s.trim(); if (!s) return s; if (s === ":root" || s === "html" || s === "body" || s === "html,body") return pre; if (s === "*") return pre + " *"; return pre + " " + s; }).join(",");
    out += fixed + body; i = close + 1;
  }
  return out;
}

// 3D 지도 앱·옛 독립 페이지 맨 위에 얹는 "메인과 같은" 껍데기(신호 띠·제호·검색·로그인·메뉴). 2026-10-13 사용자: "큰 테두리 틀 전부 메인 기준으로 통일".
export function scopedChrome(active = "map") {
  // 3D 앱이 전역으로 쓰는 .star .lg .brand .chips 와 이름이 겹쳐서 껍데기 쪽만 sc- 접두로 바꾼다
  const ren = (s) => s.replace(/\.(star|lg|lg-g|lg-k|lg-n|brand|chips)\b/g, ".sc-$1");
  const css = ren(prefixCss(CHROME_CSS, ".site-chrome")) + `.site-chrome{flex:none;font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:14.5px;line-height:1.6;color:#d9dae6;background:#05050b;word-break:keep-all}.site-chrome a{color:inherit}.site-chrome .mast .right{gap:8px}`;
  const html = chromeTop(active).replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(/\s+/).map((t) => (/^(star|lg|lg-g|lg-k|lg-n|brand|chips)$/.test(t) ? "sc-" + t : t)).join(" ")}"`);
  return `<style>${css}</style><div class="site-chrome">${html}</div>`;
}

export function chromeFoot(lang = "ko") {
  const t = T[lang] || T.ko;
  return `<div class="wrap"><footer class="ft"><span>${t.copy}</span><a href="/privacy">${t.privacy}</a><a href="/rss.xml">${t.rss}</a><a href="/sitemap.xml">${t.sitemap}</a><a href="/map/#board">${t.contact}</a></footer></div>
<script src="/chrome.js" defer></script>`;
}

// 옆칸(오른쪽 300px): 가장 밝은 별 1~10(data/ai_top_rank.json) + 최신 글(chrome.js가 채움) + RSS
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const _ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export function rankBox(lang = "ko") {
  const t = T[lang] || T.ko;
  const f = join(_ROOT, "data", "ai_top_rank.json");
  const rank = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
  const vis = lang === "en" ? { 1: "5.3B/mo", 2: "1.1B/mo", 3: "968M/mo", 4: "760M/mo", 5: "319M/mo" } : { 1: "월 53억", 2: "월 11억", 3: "월 9.68억", 4: "월 7.6억", 5: "월 3.19억" };
  const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 순위마다 링크: 도구 페이지(/ai/<slug>/)가 있으면 거기로, 없으면 지도 검색으로 (2026-10-14 "링크도 없이 뭐 하는 짓")
  const pagesFile = join(_ROOT, "dist", "data", "ai_pages.json");  // 74개 도구 페이지 슬러그 목록(빌드 결과)
  const slugs = new Set(existsSync(pagesFile) ? JSON.parse(readFileSync(pagesFile, "utf8")) : []);
  const special = { canva: "canva-magic-edit", chatgpt: "gpt", "perplexity-ai": "perplexity" };
  const linkOf = (r) => {
    const en = String(r.matched_name_en || r.tool_name || "").trim();
    const base = en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = special[base] || base;
    return slugs.has(slug) ? `/ai/${slug}/` : `/map/?q=${encodeURIComponent(en)}`;
  };
  return `<div class="rank"><div class="hd">${t.rank}<small>${t.rankSub}</small></div><ol>${rank.slice(0, 10).map((r) => `<li><span class="rk">${r.rank}</span><a href="${linkOf(r)}"><b>${e(lang === "en" ? (r.matched_name_en || r.tool_name) : (r.matched_name_ko || r.tool_name))}</b></a><span class="val">${vis[r.rank] || ""}</span></li>`).join("")}</ol></div>`;
}
export function chromeSide(extra = "", lang = "ko") {
  const t = T[lang] || T.ko;
  return `<aside class="side">${rankBox(lang)}<div class="sidebox"><b>${t.latest}</b><ul data-latest-list><li><a href="/trend/">${t.list}</a></li></ul></div>${extra}<div class="sidebox"><b>${t.get}</b><ul><li><a href="/rss.xml">${t.rssSub}</a></li><li><a href="/map/">${t.openMap}</a></li></ul></div></aside>`;
}

export function kstDateText(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}
