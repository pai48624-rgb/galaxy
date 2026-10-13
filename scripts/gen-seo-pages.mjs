// 검색엔진용 정적 페이지 생성 (2026-10-03) — build-dist.mjs 가 마지막에 부름.
// 메인(index.html)은 3D 지도라 JS로만 그려져서 구글이 읽는 글자가 약 1,100자뿐이었음 → AI별·카테고리별
// 페이지를 완성된 HTML로 만들어 dist/ai/, dist/category/ 에 둠 + dist/sitemap-ai.xml.
//
// 얇은 대량 페이지(구글 스팸 정책 Scaled Content Abuse, 애드센스 '가치 없는 콘텐츠')를 피하려고
// AI 페이지는 내용이 충분한 것만 만듦: 정보 검증됨(info_verified) / TOP10 순위 / 조합 데이터 3개 이상.
// 카테고리 페이지는 AI 5개 이상인 카테고리만.
//
// 데이터: Supabase ai_tools·relations(공개 읽기, anon 키) + data/ai_combos.json, ai_top_rank.json, ai_top10_relations.json
// Supabase를 못 읽으면 예외로 빌드를 멈춤(조용히 페이지가 사라진 채 배포되는 것 방지).

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");
const SITE = "https://aigalaxy-map.com";
const UPSTREAM = "https://urflispegkzouclljxzg.supabase.co";
const ANON_KEY = "sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr"; // index.html 에도 있는 공개 키

const MIN_COMBOS = 3;
const MIN_CATEGORY_TOOLS = 5;
const MAX_COMBOS_PER_PAGE = 8;
// 본문(태그 제외) 글자 수가 이보다 적은 페이지는 만들지 않음 — 얇은 페이지는 검색 품질 평가에서 감점 요인
const MIN_TEXT_CHARS = 1000;
const textLen = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;

async function selectAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${UPSTREAM}/rest/v1/${table}?select=${cols}&order=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`${table} 읽기 실패 ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const readJson = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// index.html 의 normTool/TOOL_ALIASES 와 같은 규칙. 단 부분일치(퍼지)는 안 씀 — 페이지 내용이 틀리면 안 되므로.
const normTool = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
const TOOL_ALIASES = { chatgpt: "gpt" };
const catSlug = (en) => String(en || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a89bf0' d='M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'/%3E%3C/svg%3E";

// /trend/ 페이지(_worker.js trendShell)와 같은 모양 — 사이트 안에서 글 페이지들이 한 벌로 보이게.
function shell({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><!-- Google Analytics(GA4, 2026-10-13) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-DMZLKJKCFG"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","G-DMZLKJKCFG");</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AI 성단 지도">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="${ICON}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1632907475675251" crossorigin="anonymous"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>
:root{--bg:#f7f7fb;--card:#fff;--ink:#1d1d2b;--dim:#6b6b80;--line:#e3e3ee;--acc:#5b4bd6;--chip:#efedff}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d18;--card:#161626;--ink:#e8e8f2;--dim:#9a9ab0;--line:#2a2a40;--acc:#9d8cff;--chip:#24203f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.7}
header{border-bottom:1px solid var(--line);background:var(--card)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;gap:14px;height:56px}
.top a{color:var(--ink);text-decoration:none;font-weight:700}.top .sp{flex:1}.top .lnk{font-weight:500;color:var(--dim);font-size:14px}
main{padding:24px 0 60px}
.crumb{font-size:13px;color:var(--dim);margin-bottom:8px}.crumb a{color:var(--dim)}
h1{font-size:26px;line-height:1.35;margin:0 0 6px}
h2{font-size:19px;margin:32px 0 10px}
.lead{font-size:16px;margin:12px 0 0}
.meta{color:var(--dim);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 18px;margin:12px 0;overflow-wrap:anywhere}
.card h3{font-size:16px;margin:0 0 6px}.card p{margin:6px 0 0;font-size:15px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chips a,.chips span{font-size:13px;background:var(--chip);color:var(--ink);border-radius:999px;padding:3px 11px;text-decoration:none}
.chips a:hover{color:var(--acc)}
ul.feat{margin:6px 0 0;padding-left:20px}
.note{font-size:12.5px;color:var(--dim);margin-top:8px}
.list{list-style:none;padding:0;margin:0}.list li{border-bottom:1px solid var(--line);padding:12px 2px}
.list a{color:var(--ink);font-weight:700;text-decoration:none}.list a:hover{color:var(--acc)}.list small{display:block;color:var(--dim);font-size:13.5px}
.cta{display:inline-block;margin:24px 8px 0 0;background:var(--acc);color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700}
.cta.ghost{background:transparent;color:var(--acc);border:1px solid var(--acc)}
footer{color:var(--dim);font-size:12px;text-align:center;padding:24px 0}footer a{color:var(--dim)}
</style></head><body>
<header><div class="wrap top"><a href="/">✦ AI 성단 지도</a><span class="sp"></span><a class="lnk" href="/korea/">한국 여행</a><a class="lnk" href="/ai/">AI 목록</a><a class="lnk" href="/trend/">AI 트렌드</a><a class="lnk" href="/">3D 지도</a></div></header>
<main class="wrap">${body}</main>
<footer class="wrap">© AI 성단 지도 · <a href="/privacy">개인정보처리방침</a></footer>
</body></html>`;
}

function writePage(rel, html) {
  const dir = join(DIST, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

export async function generateSeoPages() {
  const [tools, rels] = await Promise.all([
    selectAll("ai_tools", "id,slug,name,name_en,name_ko,category,category_en,subcategory,url,github,desc_ko,description,pricing,pricing_policy,pricing_detail,long_desc_ko,key_features,info_confidence,info_verified"),
    selectAll("relations", "source_id,target_id,kind,label"),
  ]);
  if (tools.length < 100) throw new Error(`ai_tools 가 ${tools.length}개뿐 — 데이터 이상으로 보고 중단`);
  const combos = readJson("ai_combos.json");
  const topRank = readJson("ai_top_rank.json");
  const top10Rel = readJson("ai_top10_relations.json");

  const byId = new Map(tools.map((t) => [t.id, t]));
  const byName = new Map();
  for (const t of tools) for (const n of [t.name, t.name_en, t.name_ko]) if (n && !byName.has(normTool(n))) byName.set(normTool(n), t);
  const find = (s) => { const k = normTool(s); return byName.get(TOOL_ALIASES[k] || k) || byName.get(k) || null; };

  const combosOf = new Map();
  for (const c of combos) {
    const ids = [...new Set(c.tools.map(find).filter(Boolean).map((t) => t.id))];
    for (const id of ids) { if (!combosOf.has(id)) combosOf.set(id, []); combosOf.get(id).push(c); }
  }
  const rankOf = new Map();
  for (const r of topRank) { const t = find(r.matched_name_en) || find(r.tool_name); if (t) rankOf.set(t.id, r); }
  const top10RelOf = new Map();
  for (const r of top10Rel) { const t = find(r.tool_name_en); if (t) top10RelOf.set(t.id, r.groups || []); }
  const altsOf = new Map();
  for (const r of rels) {
    for (const [a, b] of [[r.source_id, r.target_id], [r.target_id, r.source_id]]) {
      if (!byId.has(b)) continue;
      if (!altsOf.has(a)) altsOf.set(a, new Set());
      altsOf.get(a).add(b);
    }
  }

  const candidates = tools.filter((t) => t.info_verified || rankOf.has(t.id) || (combosOf.get(t.id)?.length || 0) >= MIN_COMBOS);
  let hasPage = new Set(candidates.map((t) => t.id));
  const catCount = new Map();
  for (const t of tools) catCount.set(t.category, (catCount.get(t.category) || 0) + 1);
  let catsWithPage = [...catCount].filter(([, n]) => n >= MIN_CATEGORY_TOOLS).map(([c]) => c);
  const catEn = new Map(tools.map((t) => [t.category, t.category_en]));
  const catHref = (c) => (catsWithPage.includes(c) ? `/category/${catSlug(catEn.get(c))}/` : null);
  const toolLink = (t) => (hasPage.has(t.id) ? `<a href="/ai/${esc(t.slug)}/">${esc(t.name)}</a>` : `<a href="/?ai=${encodeURIComponent(t.slug)}">${esc(t.name)}</a>`);
  // 데이터셋 이름과 사람들이 실제로 검색하는 이름이 다른 경우(데이터: GPT, 검색: ChatGPT)
  const SEARCH_NAME = { gpt: "ChatGPT" };
  const displayName = (t) => {
    const main = SEARCH_NAME[t.slug] || t.name_en || t.name;
    const ko = t.name_ko || (t.name !== main && !/^[\x00-\x7F]+$/.test(t.name) ? t.name : "");
    return ko && ko !== main ? `${main} (${ko.replace(/^.*\((.*)\)$/, "$1")})` : main;
  };

  const faqLd = new Map();  // 10/12: 도구 페이지 자주 묻는 질문 구조화 데이터
  const TODAY = new Date().toISOString().slice(0, 10);
  rmSync(join(DIST, "ai"), { recursive: true, force: true });
  rmSync(join(DIST, "category"), { recursive: true, force: true });

  // ---- AI별 페이지 ----
  const renderTool = (t, extra = true) => {  // extra=false: 페이지를 만들지 정하는 분량 판단엔 10/12 추가 칸을 빼고(페이지 수가 늘지 않게)
    const rank = rankOf.get(t.id);
    const myCombos = (combosOf.get(t.id) || []).slice().sort((a, b) => (b.impact || 0) - (a.impact || 0)).slice(0, MAX_COMBOS_PER_PAGE);
    const alts = [...(altsOf.get(t.id) || [])].map((id) => byId.get(id))
      .sort((a, b) => (hasPage.has(b.id) - hasPage.has(a.id)) || a.name.localeCompare(b.name)).slice(0, 12);
    const desc = t.desc_ko || t.description || "";
    const feats = (t.key_features || []).filter(Boolean);
    const ch = catHref(t.category);
    const parts = [];
    parts.push(`<div class="crumb"><a href="/ai/">AI 목록</a> › ${ch ? `<a href="${ch}">${esc(t.category)}</a>` : esc(t.category)}${t.subcategory ? ` › ${esc(t.subcategory)}` : ""}</div>`);
    parts.push(`<h1>${esc(displayName(t))}</h1>`);
    parts.push(`<div class="meta">${esc(t.category)}${t.pricing ? ` · ${esc(t.pricing)}` : ""}${rank ? ` · 인기 순위 ${rank.rank}위` : ""}</div>`);
    if (desc) parts.push(`<p class="lead">${esc(desc)}</p>`);
    if (rank) parts.push(`<div class="card"><h3>🏆 인기 순위 ${rank.rank}위</h3><p>${esc(rank.reason)}</p><p class="note"><a href="/trend/">AI 트렌드 글에서 전체 순위 보기 →</a></p></div>`);
    if (feats.length || t.long_desc_ko) {
      parts.push(`<h2>${esc(t.name)}는 어떤 AI인가요?</h2><div class="card">${t.long_desc_ko && t.long_desc_ko !== desc ? `<p>${esc(t.long_desc_ko)}</p>` : ""}${feats.length ? `<ul class="feat">${feats.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</div>`);
    }
    if (t.pricing_policy || t.pricing_detail) {
      parts.push(`<h2>가격</h2><div class="card">${t.pricing_policy ? `<p><b>${esc(t.pricing_policy)}</b></p>` : ""}${t.pricing_detail ? `<p>${esc(t.pricing_detail)}</p>` : ""}
<p class="note">${t.info_verified ? "공식 정보 확인됨. 요금은 바뀔 수 있으니 결제 전 공식 사이트에서 다시 확인하세요." : esc(t.info_confidence || "요금은 바뀔 수 있으니 공식 사이트에서 확인하세요.")}</p></div>`);
    }
    if (myCombos.length) {
      parts.push(`<h2>${esc(t.name)}와 함께 쓰면 좋은 조합</h2>`);
      for (const c of myCombos) {
        const members = [...new Set(c.tools.map(find).filter(Boolean))];
        parts.push(`<div class="card"><h3>${esc(c.title_ko)}</h3><div class="chips">${members.map((m) => (m.id === t.id ? `<span>${esc(m.name)}</span>` : toolLink(m))).join("")}</div><p>${esc(c.workflow_ko)}</p>${c.pricing_summary_ko ? `<p class="note">비용: ${esc(c.pricing_summary_ko)}</p>` : ""}</div>`);
      }
    }
    const groups = top10RelOf.get(t.id) || [];
    if (groups.length) {
      parts.push(`<h2>${esc(t.name)} 연동·생태계</h2>`);
      for (const g of groups) parts.push(`<div class="card"><h3>${esc(g.category_ko)}</h3><ul class="feat">${(g.items || []).map((i) => `<li><b>${esc(i.name)}</b> — ${esc(i.reason_ko)}</li>`).join("")}</ul></div>`);
    }
    if (alts.length) parts.push(`<h2>${esc(t.name)}와 비슷한 AI (대안)</h2><div class="chips">${alts.map(toolLink).join("")}</div>`);
    if (!extra) return parts.join(String.fromCharCode(10)) + `<a class="cta" href="/?ai=${encodeURIComponent(t.slug)}">✦ 3D 지도에서 ${esc(t.name)} 보기</a>`;
    // 10/12: 서치콘솔 '크롤링됨-색인 안 됨'(유명 AI는 비슷한 소개 글이 많아 우리 페이지만의 내용이 필요) → 우리 지도 자료로만 만든 비교·위치·질문
    const nCombo = (x) => (combosOf.get(x.id) || []).length;
    const nLink = (x) => (altsOf.get(x.id) || new Set()).size;
    const peersCat = tools.filter((x) => x.category === t.category);
    const cmp = [t, ...alts.filter((a) => a.category === t.category && hasPage.has(a.id)).slice(0, 4)];
    if (cmp.length >= 2) {
      parts.push(`<h2>${esc(t.name)}와 대안 한눈에 비교</h2><div class="card"><table class="cmp"><tr><th>AI</th><th>가격</th><th>지도 속 조합</th><th>연결된 도구</th></tr>${cmp.map((x) => `<tr><td>${x.id === t.id ? `<b>${esc(x.name)}</b>` : toolLink(x)}</td><td>${esc(x.pricing || "-")}</td><td>${nCombo(x)}개</td><td>${nLink(x)}개</td></tr>`).join("")}</table><p class="note">조합·연결 수는 AI 갤럭시 지도에 정리된 관계 기준(${esc(TODAY)})이며 품질 순위가 아닙니다.</p></div>`);
    }
    if (peersCat.length >= 5) {
      const byLink = peersCat.map(nLink).sort((a, b) => b - a);
      const rankL = byLink.findIndex((v) => v <= nLink(t)) + 1;
      parts.push(`<h2>AI 갤럭시 지도에서 본 ${esc(t.name)}</h2><div class="card"><ul class="feat"><li>${esc(t.category)} 분야 AI <b>${peersCat.length}개</b> 가운데 하나예요.</li><li>다른 도구와 연결된 수 <b>${nLink(t)}개</b> — 같은 분야에서 <b>${rankL}위</b>예요.</li>${nCombo(t) ? `<li>지도에 정리된 작업 조합 <b>${nCombo(t)}개</b>에 들어가 있어요.</li>` : ""}</ul></div>`);
    }
    const faq = [];
    if (t.pricing_policy || t.pricing) faq.push([`${t.name}, 무료로 쓸 수 있나요?`, `${t.pricing_policy || t.pricing}. 요금은 바뀔 수 있으니 결제 전 공식 사이트에서 확인하세요.`]);
    if (myCombos.length) faq.push([`${t.name}, 무엇과 함께 쓰면 좋나요?`, `지도에 정리된 조합 기준으로 '${myCombos[0].title_ko}'처럼 ${[...new Set(myCombos[0].tools.map(find).filter(Boolean))].filter((m) => m.id !== t.id).map((m) => m.name).slice(0, 3).join(", ")} 등과 함께 쓰는 흐름이 있어요.`]);
    if (alts.length) faq.push([`${t.name} 대신 쓸 수 있는 AI는?`, `같은 일을 하는 도구로 ${alts.slice(0, 4).map((a) => a.name).join(", ")} 등이 지도에 연결돼 있어요.`]);
    if (faq.length) {
      parts.push(`<h2>자주 묻는 질문</h2><div class="card">${faq.map(([q, a]) => `<p><b>Q. ${esc(q)}</b><br>A. ${esc(a)}</p>`).join("")}</div>`);
      faqLd.set(t.id, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
    }
    parts.push(`<a class="cta" href="/?ai=${encodeURIComponent(t.slug)}">✦ 3D 지도에서 ${esc(t.name)} 보기</a>${t.url ? `<a class="cta ghost" href="${esc(t.url)}" rel="noopener nofollow" target="_blank">공식 사이트</a>` : ""}`);
    return parts.join("\n");
  };
  const renderCategory = (c) => {
    const list = tools.filter((t) => t.category === c).sort((a, b) => (hasPage.has(b.id) - hasPage.has(a.id)) || a.name.localeCompare(b.name));
    const others = catsWithPage.filter((x) => x !== c).map((x) => `<a href="${catHref(x)}">${esc(x)}</a>`).join("");
    return { list, body: `<div class="crumb"><a href="/ai/">AI 목록</a> › ${esc(c)}</div>
<h1>${esc(c)} AI ${list.length}개</h1><p class="lead">${esc(catEn.get(c) || "")} 분야의 AI 서비스를 모았습니다. 이름을 누르면 자세한 설명·가격·대안을 볼 수 있어요.</p>
<ul class="list">${list.map((t) => `<li>${toolLink(t)}${t.pricing ? ` <span class="meta">· ${esc(t.pricing)}</span>` : ""}<small>${esc(t.desc_ko || t.description || "")}</small></li>`).join("")}</ul>
<h2>다른 분야 AI</h2><div class="chips">${others}</div>
<a class="cta" href="/">✦ 3D 지도에서 전체 보기</a>` };
  };
  // 1차로 그려 보고 분량 미달 페이지를 뺀 뒤(그러면 링크 대상이 바뀌므로) 최종본을 다시 그림
  hasPage = new Set(candidates.filter((t) => textLen(renderTool(t, false)) >= MIN_TEXT_CHARS).map((t) => t.id));
  catsWithPage = catsWithPage.filter((c) => textLen(renderCategory(c).body) >= MIN_TEXT_CHARS);
  const selected = candidates.filter((t) => hasPage.has(t.id));
  for (const t of selected) {
    const desc = t.desc_ko || t.description || "";
    const canonical = `${SITE}/ai/${t.slug}/`;
    writePage(`ai/${t.slug}`, shell({
      title: `${SEARCH_NAME[t.slug] || t.name_en || t.name} — ${clip(desc || t.category, 40)} | 가격·대안·활용 조합`,
      description: clip(`${t.name}: ${desc} 가격, 비슷한 AI, 함께 쓰면 좋은 조합까지 한 번에 정리.`, 155),
      canonical,
      body: renderTool(t),
      jsonLd: [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: t.name, applicationCategory: t.category_en || t.category,
        description: desc, url: canonical, ...(t.url ? { sameAs: t.url } : {}) }, ...(faqLd.get(t.id) ? [faqLd.get(t.id)] : [])],
    }));
  }

  // ---- 카테고리 페이지 ----
  for (const c of catsWithPage) {
    const { list, body } = renderCategory(c);
    const canonical = `${SITE}/category/${catSlug(catEn.get(c))}/`;
    writePage(`category/${catSlug(catEn.get(c))}`, shell({
      title: `${c} AI ${list.length}개 정리 — 종류·가격·대안 | AI 성단 지도`,
      description: clip(`${c} 분야 AI ${list.length}개를 한눈에. ${list.slice(0, 6).map((t) => t.name).join(", ")} 등 용도와 가격을 쉽게 정리했습니다.`, 155),
      canonical,
      body,
    }));
  }

  // ---- AI 목록(허브) ----
  const hubCats = [...new Set(selected.map((t) => t.category))].sort((a, b) => (catCount.get(b) || 0) - (catCount.get(a) || 0));
  writePage("ai", shell({
    title: `AI 서비스 ${tools.length}개 한눈에 — 분야별 AI 목록·가격·대안 | AI 성단 지도`,
    description: `ChatGPT, Claude, Gemini부터 코딩·이미지·영상 AI까지 ${tools.length}개 AI를 분야별로 정리. 가격과 비슷한 대안, 함께 쓰면 좋은 조합까지.`,
    canonical: `${SITE}/ai/`,
    body: `<h1>AI 서비스 한눈에 보기</h1><p class="lead">전세계 AI ${tools.length}개 중 많이 쓰고 정보가 충분한 ${selected.length}개를 자세히 정리했습니다. 분야별 전체 목록은 아래 분야를 눌러 보세요.</p>
<h2>분야별 전체 목록</h2><div class="chips">${catsWithPage.map((c) => `<a href="${catHref(c)}">${esc(c)} (${catCount.get(c)})</a>`).join("")}</div>
${hubCats.map((c) => `<h2>${esc(c)}</h2><ul class="list">${selected.filter((t) => t.category === c).sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<li>${toolLink(t)}<small>${esc(clip(t.desc_ko || t.description, 90))}</small></li>`).join("")}</ul>`).join("\n")}
<a class="cta" href="/">✦ 3D 지도에서 전체 보기</a><a class="cta ghost" href="/trend/">AI 트렌드 글</a>`,
  }));

  // ---- 사이트맵 + 메인 화면용 링크 목록 ----
  const urls = [`${SITE}/ai/`, ...catsWithPage.map((c) => `${SITE}${catHref(c)}`), ...selected.map((t) => `${SITE}/ai/${t.slug}/`)];
  writeFileSync(join(DIST, "sitemap-ai.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  mkdirSync(join(DIST, "data"), { recursive: true });
  writeFileSync(join(DIST, "data", "ai_pages.json"), JSON.stringify(selected.map((t) => t.slug)));
  return { tools: tools.length, candidates: candidates.length, aiPages: selected.length, categoryPages: catsWithPage.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateSeoPages().then((r) => console.log("[seo] 생성:", r)).catch((e) => { console.error("[seo] 실패:", e.message); process.exit(1); });
}
