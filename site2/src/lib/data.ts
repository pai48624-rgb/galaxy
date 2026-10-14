// 기존 사이트 데이터를 그대로 읽어 화면용으로 정리(빌드 때만 실행, 브라우저엔 안 감).
// 원본: ../data/ai_landscape.json · ai_enrichment.json(747, 10/14 Supabase와 맞춤: scripts/sync-tools-from-supabase.mjs) · ai_combos.json · ai_top_rank.json · ai_top10_relations.json
//       ../dist/data/ai_pages.json(도구 페이지 74개 슬러그) · ../content/korea/<slug>/(meta.json·ko.html·en.html)
// 규칙은 scripts/gen-seo-pages.mjs · import-data.mjs · gen-home.mjs · gen-korea-pages.mjs 와 같게 맞춤.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kstToday, textLen } from '~/utils/utils';

// galaxy 프로젝트 뿌리: 빌드 묶음이 dist/.prerender/ 로 옮겨져도 맞게, 현재 폴더에서 위로 올라가며 data/ai_landscape.json 을 찾음
function findRoot() {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const s of starts) {
    let d = s;
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(d, 'data', 'ai_landscape.json')) && existsSync(join(d, 'site2'))) return d;
      d = dirname(d);
    }
  }
  throw new Error('[site2] galaxy 프로젝트 뿌리(data/ai_landscape.json)를 못 찾음');
}
export const GALAXY_ROOT = findRoot();
const readJson = <T>(rel: string, fallback: T): T => {
  const p = join(GALAXY_ROOT, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
};

// ---- 도구 ----
export interface Tool {
  idx: number;
  slug: string;
  name: string; // 화면 이름(한국어 이름 있으면 그것)
  name_en: string;
  name_ko: string | null;
  category: string;
  category_en: string;
  subcategory: string | null;
  url: string | null;
  desc_ko: string;
  desc_en: string; // 영어판(2026-10-14) — 데이터에 원래 있는 영어 설명
  subcategory_en: string | null;
  tags: string[];
  pricing: string; // 무료 / 부분유료 (import-data.mjs 규칙)
  pricing_policy?: string;
  pricing_detail?: string;
  long_desc_ko?: string;
  key_features: string[];
  info_confidence?: string;
  info_verified: boolean;
  related_names: string[];
}

// import-data.mjs 의 slugify 와 같음
export const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ai';
export const catSlug = (en: string) => String(en || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normTool = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const TOOL_ALIASES: Record<string, string> = { chatgpt: 'gpt' };
const pricingFromTags = (tags: string[]) => (tags.some((x) => /open[-\s]?source|open[-\s]?weights?|\boss\b/.test(x.toLowerCase())) ? '무료' : '부분유료');

let _tools: Tool[] | null = null;
export function loadTools(): Tool[] {
  if (_tools) return _tools;
  const raw = readJson<any[]>('data/ai_landscape.json', []);
  const enrich = readJson<any[]>('data/ai_enrichment.json', []);
  const enrichByName = new Map(enrich.map((e) => [e.name_en, e]));
  const used = new Set<string>();
  _tools = raw.map((r, idx) => {
    const tags = String(r.tags || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const base = slugify(r.name_en || r.name_ko);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    const e = enrichByName.get(r.name_en) || enrich[idx] || {};
    return {
      idx,
      slug,
      name: r.name_ko || r.name_en || slug,
      name_en: r.name_en || r.name_ko || slug,
      name_ko: r.name_ko || null,
      category: r.category || '기타',
      category_en: r.category_en || '',
      subcategory: r.subcategory || null,
      url: r.url || null,
      desc_ko: r.desc_ko || r.desc_en || '',
      desc_en: r.desc_en || '',
      subcategory_en: r.subcategory_en || null,
      tags,
      pricing: pricingFromTags(tags),
      pricing_policy: e.pricing_policy || undefined,
      pricing_detail: e.pricing_detail || undefined,
      long_desc_ko: e.long_desc_ko || undefined,
      key_features: (e.key_features || []).filter(Boolean),
      info_confidence: e.info_confidence || undefined,
      info_verified: !!e.info_verified,
      related_names: Array.isArray(r.related_names) ? r.related_names : [],
    } as Tool;
  });
  return _tools;
}

export const aiPageSlugs = (): string[] => readJson<string[]>('dist/data/ai_pages.json', []);
export const combos = () => readJson<any[]>('data/ai_combos.json', []);
export const topRank = () => readJson<any[]>('data/ai_top_rank.json', []);
export const top10Relations = () => readJson<any[]>('data/ai_top10_relations.json', []);

export function toolIndex() {
  const tools = loadTools();
  const bySlug = new Map(tools.map((t) => [t.slug, t]));
  const byName = new Map<string, Tool>();
  for (const t of tools) for (const n of [t.name, t.name_en, t.name_ko]) if (n && !byName.has(normTool(n))) byName.set(normTool(n), t);
  const find = (s: string) => { const k = normTool(s); return byName.get(TOOL_ALIASES[k] || k) || byName.get(k) || null; };
  return { tools, bySlug, find };
}

// ---- 분야(카테고리) ----
export interface Category { slug: string; name: string; name_en: string; n: number; tools: Tool[] }
const MIN_CATEGORY_TOOLS = 5;
export function categories(): Category[] {
  const tools = loadTools();
  const m = new Map<string, Tool[]>();
  for (const t of tools) { if (!m.has(t.category)) m.set(t.category, []); m.get(t.category)!.push(t); }
  // 분야 페이지는 기존 사이트가 만든 21개(dist/category/<slug>/)만 — 옛 생성기는 본문 1,000자 미만인 작은 분야를 뺐음
  const existing = new Set(existsSync(join(GALAXY_ROOT, 'dist', 'category')) ? readdirSync(join(GALAXY_ROOT, 'dist', 'category')).filter((d) => existsSync(join(GALAXY_ROOT, 'dist', 'category', d, 'index.html'))) : []);
  return [...m].filter(([, l]) => l.length >= MIN_CATEGORY_TOOLS)
    .map(([name, l]) => ({ slug: catSlug(l[0].category_en), name, name_en: l[0].category_en, n: l.length, tools: l }))
    .filter((c) => existing.size === 0 || existing.has(c.slug))
    .sort((a, b) => b.n - a.n);
}

// ---- 이번 달 가장 밝은 별(인기 순위 1~10) ----
export interface RankItem { rank: number; name: string; name_en: string; reason: string; href: string; slug: string | null }
const RANK_SLUG_FIX: Record<string, string> = { canva: 'canva-magic-edit', 'perplexity-ai': 'perplexity' };
export function brightestStars(): RankItem[] {
  const pages = new Set(aiPageSlugs());
  const { find } = toolIndex();
  return topRank().slice(0, 10).map((r) => {
    let slug = slugify(r.matched_name_en || r.tool_name);
    slug = RANK_SLUG_FIX[slug] || slug;
    if (!pages.has(slug)) { const t = find(r.matched_name_en) || find(r.tool_name); if (t && pages.has(t.slug)) slug = t.slug; }
    const ok = pages.has(slug);
    return { rank: r.rank, name: r.matched_name_ko || r.tool_name, name_en: r.matched_name_en || r.tool_name, reason: r.reason || '', slug: ok ? slug : null, href: ok ? `/ai/${slug}/` : `/map/?ai=${encodeURIComponent(slug)}` };
  });
}

// ---- 도구 페이지 본문 재료(gen-seo-pages.mjs renderTool 과 같은 내용) ----
export interface ToolPage {
  t: Tool; display: string; rank: any | null; combos: any[]; alts: Tool[]; groups: any[];
  cmp: Array<{ t: Tool; combos: number; links: number }>; peers: number; linkRank: number;
  faq: Array<[string, string]>; hasPage: (slug: string) => boolean; today: string;
}
const SEARCH_NAME: Record<string, string> = { gpt: 'ChatGPT' };
export const displayName = (t: Tool) => {
  const main = SEARCH_NAME[t.slug] || t.name_en || t.name;
  const ko = t.name_ko || (t.name !== main && !/^[\x00-\x7F]+$/.test(t.name) ? t.name : '');
  return ko && ko !== main ? `${main} (${ko.replace(/^.*\((.*)\)$/, '$1')})` : main;
};
let _ctx: any = null;
function ctx() {
  if (_ctx) return _ctx;
  const { tools, bySlug, find } = toolIndex();
  const pages = new Set(aiPageSlugs());
  const combosOf = new Map<string, any[]>();
  for (const c of combos()) {
    const slugs = [...new Set((c.tools || []).map(find).filter(Boolean).map((t: Tool) => t.slug))] as string[];
    for (const s of slugs) { if (!combosOf.has(s)) combosOf.set(s, []); combosOf.get(s)!.push(c); }
  }
  const rankOf = new Map<string, any>();
  for (const r of topRank()) { const t = find(r.matched_name_en) || find(r.tool_name); if (t) rankOf.set(t.slug, r); }
  const groupsOf = new Map<string, any[]>();
  for (const r of top10Relations()) { const t = find(r.tool_name_en); if (t) groupsOf.set(t.slug, r.groups || []); }
  const altsOf = new Map<string, Set<string>>();
  for (const t of tools) for (const n of t.related_names) {
    const o = find(n); if (!o || o.slug === t.slug) continue;
    for (const [a, b] of [[t.slug, o.slug], [o.slug, t.slug]]) { if (!altsOf.has(a)) altsOf.set(a, new Set()); altsOf.get(a)!.add(b); }
  }
  _ctx = { tools, bySlug, find, pages, combosOf, rankOf, groupsOf, altsOf };
  return _ctx;
}
export function toolPage(slug: string): ToolPage | null {
  const c = ctx();
  const t: Tool | undefined = c.bySlug.get(slug);
  if (!t) return null;
  const hasPage = (s: string) => c.pages.has(s);
  const myCombos = (c.combosOf.get(slug) || []).slice().sort((a: any, b: any) => (b.impact || 0) - (a.impact || 0)).slice(0, 8);
  const alts: Tool[] = [...(c.altsOf.get(slug) || [])].map((s) => c.bySlug.get(s)).filter(Boolean)
    .sort((a: Tool, b: Tool) => (Number(hasPage(b.slug)) - Number(hasPage(a.slug))) || a.name.localeCompare(b.name)).slice(0, 12);
  const nCombo = (x: Tool) => (c.combosOf.get(x.slug) || []).length;
  const nLink = (x: Tool) => (c.altsOf.get(x.slug) || new Set()).size;
  const peersCat = c.tools.filter((x: Tool) => x.category === t.category);
  const cmpTools = [t, ...alts.filter((a) => a.category === t.category && hasPage(a.slug)).slice(0, 4)];
  const byLink = peersCat.map(nLink).sort((a: number, b: number) => b - a);
  const linkRank = byLink.findIndex((v: number) => v <= nLink(t)) + 1;
  const faq: Array<[string, string]> = [];
  if (t.pricing_policy || t.pricing) faq.push([`${t.name}, 무료로 쓸 수 있나요?`, `${t.pricing_policy || t.pricing}. 요금은 바뀔 수 있으니 결제 전 공식 사이트에서 확인하세요.`]);
  if (myCombos.length) {
    const members = [...new Set(myCombos[0].tools.map(c.find).filter(Boolean))] as Tool[];
    faq.push([`${t.name}, 무엇과 함께 쓰면 좋나요?`, `지도에 정리된 조합 기준으로 '${myCombos[0].title_ko}'처럼 ${members.filter((m) => m.slug !== t.slug).map((m) => m.name).slice(0, 3).join(', ')} 등과 함께 쓰는 흐름이 있어요.`]);
  }
  if (alts.length) faq.push([`${t.name} 대신 쓸 수 있는 AI는?`, `같은 일을 하는 도구로 ${alts.slice(0, 4).map((a) => a.name).join(', ')} 등이 지도에 연결돼 있어요.`]);
  return {
    t, display: displayName(t), rank: c.rankOf.get(slug) || null, combos: myCombos, alts, groups: c.groupsOf.get(slug) || [],
    cmp: cmpTools.length >= 2 ? cmpTools.map((x) => ({ t: x, combos: nCombo(x), links: nLink(x) })) : [],
    peers: peersCat.length, linkRank, faq, hasPage, today: kstToday(),
  };
}
export const comboMembers = (c: any): Tool[] => [...new Set((c.tools || []).map(ctx().find).filter(Boolean))] as Tool[];
export const toolHref = (t: Tool) => (ctx().pages.has(t.slug) ? `/ai/${t.slug}/` : `/map/?ai=${encodeURIComponent(t.slug)}`);

// ---- 한국 여행 글 ----
export interface KoreaMeta {
  slug: string; publish: string; hidden?: boolean;
  region: { ko: string; en: string }; kind: { ko: string; en: string };
  title: { ko: string; en: string }; description: { ko: string; en: string };
  photo?: { url: string; width?: number; height?: number; alt: { ko: string; en: string }; credit: { ko: string; en: string } };
  facts?: Array<{ ko: string; en: string; v: string }>;
  sources?: Array<{ ko: string; en: string; date: { ko: string; en: string } }>;
  links?: { guide?: { ko: string; en: string; url: string; live?: boolean } };
  chart?: any;
}
export interface KoreaArticle { m: KoreaMeta; html: { ko: string; en: string } }
let _korea: KoreaArticle[] | null = null;
export function koreaArticles(today = kstToday()): KoreaArticle[] {
  if (_korea) return _korea;
  const dir = join(GALAXY_ROOT, 'content', 'korea');
  const out: KoreaArticle[] = [];
  if (!existsSync(dir)) return (_korea = out);
  for (const slug of readdirSync(dir).sort()) {
    if (slug.startsWith('_')) continue;
    const d = join(dir, slug);
    if (!existsSync(join(d, 'meta.json'))) continue;
    const m = JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')) as KoreaMeta;
    if (m.publish > today || m.hidden) continue; // 예약 글은 그 날부터
    const html = { ko: readFileSync(join(d, 'ko.html'), 'utf8'), en: readFileSync(join(d, 'en.html'), 'utf8') };
    if (textLen(html.ko) < 900 || textLen(html.en) < 1800) continue; // gen-korea-pages.mjs 최소 분량 규칙
    out.push({ m, html });
  }
  out.sort((a, b) => (b.m.publish + b.m.slug).localeCompare(a.m.publish + a.m.slug));
  return (_korea = out);
}

// ---- AI 트렌드 글(빌드 때 Supabase 공개 읽기 — 워커 trendList 와 같은 조회) ----
const UPSTREAM = 'https://urflispegkzouclljxzg.supabase.co';
const ANON_KEY = 'sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr'; // 기존 index.html·gen-seo-pages.mjs 에 있는 공개 키
export interface TrendPost { id: number; title: string; tags: string[]; created_at: string; summary: string; img?: string }
/** 글 본문의 첫 그림(https만) — 목록 사진 칸용 */
export const firstImg = (html?: string) => { const m = String(html || '').match(/<img[^>]+src="(https:[^"]+)"/i); return m ? m[1] : undefined; };
const summary = (body: string, n: number) => { const s = String(body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
let _trend: TrendPost[] | null = null;
export async function trendPosts(): Promise<TrendPost[]> {
  if (_trend) return _trend;
  try {
    const r = await fetch(`${UPSTREAM}/rest/v1/board_posts?select=id,title,body,body_html,tags,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=100`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    const rows = (await r.json()) as any[];
    _trend = rows.map((p) => ({ id: p.id, title: p.title, tags: p.tags || [], created_at: p.created_at, summary: summary(p.body, 120), img: firstImg(p.body_html) }));
  } catch (e) {
    console.warn('[site2] 트렌드 글 목록을 못 읽음(빌드는 계속):', (e as Error).message);
    _trend = [];
  }
  return _trend;
}

// ---- 메인 시안 공용 데이터(한 곳) — 모든 메인 블록·시안(a/b/c)은 이것만 받는다 ----
export interface HomeData {
  nTools: number; nCombos: number; cats: Category[]; stars: RankItem[]; korea: KoreaArticle[]; posts: TrendPost[];
  toolList: Array<{ t: Tool; href: string; combos: number; hasPage: boolean }>;
  today: string;
}
let _home: HomeData | null = null;
// 빌드 중 한 번만 계산(모든 페이지의 틀(PageLayout)이 왼쪽 메뉴용으로 부르므로 117쪽이 117번 읽지 않게)
let _homeDataCache: Promise<HomeData> | null = null;
export function homeData(): Promise<HomeData> {
  if (!_homeDataCache) _homeDataCache = _homeData();
  return _homeDataCache;
}
async function _homeData(): Promise<HomeData> {
  if (_home) return _home;
  const c = ctx();
  const pages = aiPageSlugs();
  // 도구 목록: 안내 페이지가 있는 74개 중 지도 속 조합이 많은 순 20개
  const toolList = pages.map((s) => c.bySlug.get(s) as Tool).filter(Boolean)
    .map((t) => ({ t, href: `/ai/${t.slug}/`, combos: (c.combosOf.get(t.slug) || []).length, hasPage: true }))
    .sort((a, b) => b.combos - a.combos || a.t.name.localeCompare(b.t.name)).slice(0, 20);
  _home = { nTools: loadTools().length, nCombos: combos().length, cats: categories(), stars: brightestStars(), korea: koreaArticles(), posts: await trendPosts(), toolList, today: kstToday() };
  return _home;
}

// ---- 검색 자동완성 색인(/search-index.json): 이름 전체 + 안내 페이지 유무 ----
// 검색 별칭(src/data/search-aliases.json, 흔히 부르는 이름 → slug)
let _alias: Record<string, string[]> | null = null;
export function searchAlias(slug: string): string {
  if (!_alias) { const f = join(GALAXY_ROOT, 'site2', 'src', 'data', 'search-aliases.json'); _alias = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; }
  const v = (_alias as any)[slug]; return Array.isArray(v) ? v.join(' ') : '';
}
export function searchIndex() {
  const pages = new Set(aiPageSlugs());
  return loadTools().map((t) => ({ n: t.name, e: t.name_en, s: t.slug, c: t.category, k: t.category_en, p: pages.has(t.slug) ? 1 : 0, ...(searchAlias(t.slug) ? { a: searchAlias(t.slug) } : {}) }));  // a = 별칭, k = 분야 영어(영어판 자동완성)
}
