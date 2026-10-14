// 수집 데이터로 만든 새 화면(조합 추천 /combos · 요금제별 /pricing · 밝은 별 순위 /rank · 검색 /search)용 데이터 함수.
// 기존 data.ts 는 손대지 않고 그 함수만 가져다 쓴다. 빌드 때만 실행(브라우저엔 안 감).
// 원본: ../data/ai_combos.json(686) · ai_enrichment.json · ai_landscape.json(747) · ai_top_rank.json(10) · ai_top10_relations.json(10) · dist/data/ai_pages.json(74)
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { searchAlias, loadTools, toolIndex, aiPageSlugs, combos, top10Relations, brightestStars, categories, GALAXY_ROOT, type Tool } from '~/lib/data';
import { clip } from '~/utils/utils';

/** 자료 정리일(화면 출처 표기용) — 자료 파일 수정일 중 가장 최근 날짜(KST) */
export function dataDate(): string {
  const files = ['ai_combos.json', 'ai_enrichment.json', 'ai_landscape.json', 'ai_top_rank.json', 'ai_top10_relations.json'];
  let max = 0;
  for (const f of files) {
    const p = join(GALAXY_ROOT, 'data', f);
    if (existsSync(p)) max = Math.max(max, statSync(p).mtimeMs);
  }
  return max ? new Date(max + 9 * 3600e3).toISOString().slice(0, 10) : '2026-10-14';
}

// 지도 등록일(ai_landscape.json added_date) — 이름(영문) 기준
let _added: Map<string, string> | null = null;
export function addedDate(nameEn: string): string {
  if (!_added) {
    const raw = JSON.parse(readFileSync(join(GALAXY_ROOT, 'data', 'ai_landscape.json'), 'utf8')) as any[];
    _added = new Map(raw.map((r) => [r.name_en, r.added_date || '']));
  }
  return _added.get(nameEn) || '';
}

// ---- 공통: 도구 이름 → 링크(안내 페이지 74개면 /ai/<slug>/, 아니면 지도 검색 /map/?q=이름) ----
let _pages: Set<string> | null = null;
const pages = () => (_pages ||= new Set(aiPageSlugs()));
export function toolLink(name: string): { href: string; t: Tool | null; hasPage: boolean } {
  const t = toolIndex().find(name);
  const hasPage = !!t && pages().has(t.slug);
  return { href: hasPage ? `/ai/${t!.slug}/` : `/map/?q=${encodeURIComponent(name)}`, t, hasPage };
}
export const toolHref2 = (t: Tool) => (pages().has(t.slug) ? `/ai/${t.slug}/` : `/map/?q=${encodeURIComponent(t.name_en || t.name)}`);
let _catSlug: Map<string, string> | null = null;
/** 분야 이름 → /category/<slug>/ (분야 페이지가 있는 21개만, 없으면 null) */
export function categoryHref(catName: string): string | null {
  if (!_catSlug) _catSlug = new Map(categories().map((c) => [c.name, `/category/${c.slug}/`]));
  return _catSlug.get(catName) || null;
}

// ---- 1. AI 조합 추천(/combos/) ----
// ai_combos.json 의 category 값은 11개(영문 키). 화면 이름은 여기서 정한다.
export const COMBO_CATS: Record<string, { name: string; desc: string }> = {
  video: { name: '영상 제작', desc: '기획·대본부터 영상 생성·편집까지 이어지는 조합' },
  data_eng: { name: '데이터 엔지니어링', desc: '수집·정제·적재·분석 파이프라인을 AI와 데이터 도구로 잇는 조합' },
  automation: { name: '업무 자동화', desc: 'AI가 판단하고 자동화 도구가 실행하는 반복 업무 조합' },
  image: { name: '이미지·디자인', desc: '콘셉트 정리부터 이미지 생성·편집까지의 조합' },
  research: { name: '리서치·조사', desc: '자료 검색·요약·검증을 나눠 맡는 조합' },
  dev: { name: '개발·코딩', desc: '설계·코드 생성·검토·배포를 잇는 조합' },
  audio: { name: '오디오·음성', desc: '대본·음성 합성·음악·더빙 조합' },
  writing: { name: '글쓰기', desc: '초안·교정·SEO·발행까지의 글쓰기 조합' },
  general: { name: '범용', desc: '특정 분야에 묶이지 않는 일반 업무 조합' },
  presentation: { name: '프레젠테이션', desc: '구성·슬라이드 생성·시각화 조합' },
  agent_rag: { name: '에이전트·RAG', desc: '문서 검색(RAG)과 에이전트 실행을 붙인 조합' },
};
export interface ComboView {
  id: string; title: string; workflow: string; pricing: string; impact: number; category: string;
  brain: { name: string; href: string; hasPage: boolean };
  executors: Array<{ name: string; href: string; hasPage: boolean }>;
}
export interface ComboCategory {
  slug: string; name: string; desc: string; n: number; combos: ComboView[];
  topBrains: Array<{ name: string; n: number; href: string }>;
  topExecutors: Array<{ name: string; n: number; href: string }>;
  nTools: number; impact10: number; avgImpact: number;
}
const toView = (c: any): ComboView => ({
  id: c.id, title: c.title_ko || '', workflow: c.workflow_ko || '', pricing: c.pricing_summary_ko || '', impact: Number(c.impact) || 0, category: c.category,
  brain: { name: c.brain, ...toolLink(c.brain) },
  executors: (c.executors || []).map((n: string) => ({ name: n, ...toolLink(n) })),
});
const topOf = (names: string[], k = 3) => {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([name, n]) => ({ name, n, href: toolLink(name).href }));
};
let _comboCats: ComboCategory[] | null = null;
export function comboCategories(): ComboCategory[] {
  if (_comboCats) return _comboCats;
  const m = new Map<string, any[]>();
  for (const c of combos()) { const k = c.category || 'general'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); }
  _comboCats = [...m].map(([slug, list]) => {
    const meta = COMBO_CATS[slug] || { name: slug, desc: '' };
    const views = list.map(toView).sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
    const tools = new Set(list.flatMap((c) => c.tools || []));
    return {
      slug, name: meta.name, desc: meta.desc, n: views.length, combos: views,
      topBrains: topOf(list.map((c) => c.brain).filter(Boolean)),
      topExecutors: topOf(list.flatMap((c) => c.executors || [])),
      nTools: tools.size, impact10: views.filter((v) => v.impact >= 10).length,
      avgImpact: Math.round((views.reduce((s, v) => s + v.impact, 0) / Math.max(1, views.length)) * 10) / 10,
    };
  }).sort((a, b) => b.n - a.n);
  return _comboCats;
}
export const comboStats = () => {
  const all = combos();
  const tools = new Set(all.flatMap((c) => c.tools || []));
  return { n: all.length, nCats: comboCategories().length, nTools: tools.size, topBrains: topOf(all.map((c) => c.brain).filter(Boolean), 5) };
};

// ---- 2. 요금제별 AI 모음(/pricing/) ----
// ai_enrichment.json 의 pricing_policy(자유 문장 39가지)를 6묶음으로 정규화. 묶음 기준은 화면에도 한 줄로 적는다.
export const PRICING_GROUPS: Array<{ slug: string; name: string; rule: string; short: string }> = [
  { slug: 'free-open', name: '무료·오픈소스', short: '무료', rule: '요금이 없거나(공개 벤치마크 등) 코드·가중치가 공개돼 있고 유료 플랜 표기가 없는 도구' },
  { slug: 'freemium', name: '프리미엄(무료+유료 구독)', short: '무료+구독', rule: '무료 구간이 있고 더 쓰려면 월 구독으로 올리는 도구' },
  { slug: 'open-paid', name: '오픈소스 + 유료 플랜', short: '오픈소스+유료', rule: '코드는 공개하되 클라우드·호스팅·엔터프라이즈·API 종량제 같은 유료 플랜을 함께 두는 도구' },
  { slug: 'usage', name: 'API 종량제', short: '종량제', rule: '토큰·GPU 시간 등 쓴 만큼 내는 도구(모델별로 다른 경우 포함)' },
  { slug: 'subscription', name: '유료 구독', short: '구독', rule: '무료 구간 없이 월 구독이나 다른 구독 요금제에 포함돼 쓰는 도구' },
  { slug: 'enterprise', name: '가격 문의(엔터프라이즈)', short: '문의', rule: '공개 가격 없이 문의·계약으로만 쓰는 도구' },
];
export const NA_GROUP = { slug: 'na', name: '해당 없음(연구 조직·기업)' };
export function pricingGroupOf(policy: string | undefined): string {
  const p = String(policy || '').trim();
  if (!p || p.startsWith('해당없음')) return 'na';
  if (p.startsWith('프리미엄')) return 'freemium';
  if (p.startsWith('무료')) return 'free-open';
  if (p.startsWith('오픈소스')) {
    const rest = p.replace(/^오픈소스(\([^)]*\))?/, ''); // 첫 괄호(무료, 라이선스 조건부 등)는 빼고 뒤에 붙은 플랜만 본다
    return /유료|프리미엄|종량|구독|엔터프라이즈|호스팅|API|멤버십|클라우드/.test(rest) ? 'open-paid' : 'free-open';
  }
  if (p.startsWith('엔터프라이즈') || p.startsWith('연구/엔터프라이즈')) return 'enterprise';
  if (p.startsWith('API 종량제') || p.startsWith('사용량 기반') || p.startsWith('모델별 상이')) return 'usage';
  if (p.startsWith('유료 구독') || p.startsWith('애드온') || p.startsWith('구독')) return 'subscription';
  return 'other';
}
/** 무료 구간이 있는가(무료로 시작하는 AI 목록용) */
export const hasFreeTier = (policy: string | undefined) => /무료|오픈소스|프리미엄/.test(String(policy || ''));
export interface PricingRow { t: Tool; href: string; hasPage: boolean; catHref: string | null; policy: string; detail: string; group: string; added: string; url: string | null }
let _rows: PricingRow[] | null = null;
export function pricingRows(): PricingRow[] {
  if (_rows) return _rows;
  _rows = loadTools().map((t) => {
    const group = pricingGroupOf(t.pricing_policy);
    if (group === 'other') console.warn('[data2] 요금 묶음을 못 정함:', t.name_en, t.pricing_policy);
    return { t, href: toolHref2(t), hasPage: pages().has(t.slug), catHref: categoryHref(t.category), policy: t.pricing_policy || '', detail: t.pricing_detail || '', group, added: addedDate(t.name_en), url: t.url };
  });
  return _rows;
}
const sortRows = (rows: PricingRow[]) => rows.slice().sort((a, b) => Number(b.hasPage) - Number(a.hasPage) || a.t.category.localeCompare(b.t.category, 'ko') || a.t.name.localeCompare(b.t.name, 'ko'));
export interface PricingGroupView { slug: string; name: string; short: string; rule: string; n: number; rows: PricingRow[]; nPage: number; cats: Array<{ name: string; n: number }> }
const catCounts = (rows: PricingRow[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.t.category, (m.get(r.t.category) || 0) + 1);
  return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
};
export function pricingGroups(): PricingGroupView[] {
  const rows = pricingRows();
  return PRICING_GROUPS.map((g) => {
    const list = sortRows(rows.filter((r) => r.group === g.slug));
    return { ...g, n: list.length, rows: list, nPage: list.filter((r) => r.hasPage).length, cats: catCounts(list) };
  });
}
/** /pricing/free/ — 무료 구간 있는 도구만(무료·오픈소스 + 프리미엄 + 오픈소스+유료 플랜) */
export function freeStartGroup(): PricingGroupView {
  const list = sortRows(pricingRows().filter((r) => r.group !== 'na' && hasFreeTier(r.policy)));
  return { slug: 'free', name: '무료로 시작하는 AI', short: '무료 시작', rule: '요금 정책에 무료 구간·오픈소스·프리미엄이 적힌 도구(무료·오픈소스, 프리미엄, 오픈소스+유료 플랜 묶음의 합)', n: list.length, rows: list, nPage: list.filter((r) => r.hasPage).length, cats: catCounts(list) };
}
export const pricingNA = () => pricingRows().filter((r) => r.group === 'na').length;

// ---- 3. 가장 밝은 별 순위(/rank/) ----
export interface RankView {
  rank: number; name: string; name_en: string; reason: string; href: string; hasPage: boolean; t: Tool | null;
  groups: Array<{ category: string; items: Array<{ name: string; reason: string; href: string; hasPage: boolean }> }>; nItems: number;
}
export function rankViews(): RankView[] {
  const { find } = toolIndex();
  const rel = new Map(top10Relations().map((r) => [r.tool_name_en, r.groups || []]));
  return brightestStars().map((s) => {
    const t = find(s.name_en) || find(s.name);
    const groups = (rel.get(s.name_en) || []).map((g: any) => ({ category: g.category_ko || '', items: (g.items || []).map((i: any) => ({ name: i.name, reason: i.reason_ko || '', ...toolLink(i.name) })) }));
    return { rank: s.rank, name: s.name, name_en: s.name_en, reason: s.reason, href: s.slug ? s.href : `/map/?q=${encodeURIComponent(s.name_en)}`, hasPage: !!s.slug, t, groups, nItems: groups.reduce((n: number, g: any) => n + g.items.length, 0) };
  });
}

// ---- 4. 검색 색인(public/data/search-index.json, 100KB 이내) ----
// 분야 이름은 번호로(cats 배열), 슬러그는 안내 페이지가 있는 도구에만 넣어 크기를 줄인다. 나머지는 /map/?q=영문이름 으로 간다.
export function searchIndex2() {
  const tools = loadTools();
  const cats = [...new Set(tools.map((t) => t.category))];
  const ci = new Map(cats.map((c, i) => [c, i]));
  return {
    date: dataDate(), n: tools.length, cats,
    tools: tools.map((t) => ({ n: t.name_ko || t.name, e: t.name_en, c: ci.get(t.category)!, d: clip(t.desc_ko, 60), ...(searchAlias(t.slug) ? { a: searchAlias(t.slug) } : {}), ...(pages().has(t.slug) ? { s: t.slug } : {}) })),
  };
}
/** 빌드 때 public/data/search-index.json 을 다시 쓴다(검색 화면 frontmatter 에서 호출). 되돌려주는 값은 쓴 바이트 수. */
export function writeSearchIndex(): number {
  const dir = join(GALAXY_ROOT, 'site2', 'public', 'data');
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(searchIndex2());
  writeFileSync(join(dir, 'search-index.json'), body);
  return Buffer.byteLength(body, 'utf8');
}
