// 영어판 번역 도우미(빌드 때만 실행). 2026-10-14
// - 데이터 문구: src/i18n/cache/*.json(원문→번역, `npm run translate`가 만듦)을 읽어 바꾼다. 캐시에 없으면 원문 그대로 + 빌드 끝에 개수 경고.
// - 주소: 영어판이 있는 화면이면 /en/… 으로 바꾼다(lp).
// - 도구·분야 이름: 데이터에 이미 있는 영어(name_en·desc_en·category_en·subcategory_en)를 먼저 쓴다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GALAXY_ROOT, type Tool } from '~/lib/data';

export type Lang = 'ko' | 'en';

const CACHE_DIR = join(GALAXY_ROOT, 'site2', 'src', 'i18n', 'cache');
let _map: Map<string, string> | null = null;
function map() {
  if (_map) return _map;
  _map = new Map();
  if (existsSync(CACHE_DIR)) for (const f of readdirSync(CACHE_DIR).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8')) as Record<string, string>;
    for (const [k, v] of Object.entries(j)) if (typeof v === 'string') _map.set(k.trim(), v); // trend_posts.json(글 본문, 객체)은 아래 trendEn 이 따로 읽음
  }
  return _map;
}
const missing = new Set<string>();
let warned = false;
function warnLater() {
  if (warned) return; warned = true;
  process.on('beforeExit', () => { if (missing.size) console.warn(`[i18n] 번역 캐시에 없는 데이터 문구 ${missing.size}개 — npm run translate 로 채우세요. 예: ${[...missing].slice(0, 3).join(' | ')}`); });
}

/** 데이터 문구 번역: ko면 그대로, en이면 캐시에서. 한글이 없는 문구는 그대로. */
export function tx(s: string | null | undefined, lang: Lang): string {
  const v = String(s ?? '');
  if (lang === 'ko' || !/[가-힣]/.test(v)) return v;
  const hit = map().get(v.trim());
  if (hit) return hit;
  missing.add(v.trim()); warnLater();
  return v;
}
export const txMissing = () => missing.size;

// ---- 트렌드 글 본문 영어판(2026-10-14) — src/i18n/cache/trend_posts.json(npm run translate:trend 가 만듦) ----
export interface TrendEn { title: string; tags: string[]; body_html: string; created_at: string; src_hash: string; translated_at: string }
let _trendEn: Record<string, TrendEn> | null = null;
export function trendEnAll(): Record<string, TrendEn> {
  if (_trendEn) return _trendEn;
  const f = join(CACHE_DIR, 'trend_posts.json');
  _trendEn = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, TrendEn>) : {};
  return _trendEn;
}
export const trendEn = (id: number | string): TrendEn | undefined => trendEnAll()[String(id)];
export const hasTrendEn = (id: number | string) => !!trendEn(id);

// ---- 도구·분야 ----
export const toolName = (t: Pick<Tool, 'name' | 'name_en'>, lang: Lang) => (lang === 'en' ? t.name_en || t.name : t.name);
export const toolDesc = (t: Tool, lang: Lang) => (lang === 'en' ? t.desc_en || tx(t.desc_ko, lang) : t.desc_ko);
export const toolCat = (t: Tool, lang: Lang) => (lang === 'en' ? t.category_en || tx(t.category, lang) : t.category);
export const toolSub = (t: Tool, lang: Lang) => (lang === 'en' ? t.subcategory_en || tx(t.subcategory, lang) : t.subcategory);
/** 무료/부분유료(태그 규칙) */
export const toolPricing = (p: string, lang: Lang) => (lang === 'en' ? ({ 무료: 'Free', 부분유료: 'Free + paid' } as Record<string, string>)[p] || tx(p, lang) : p);
export const catLabel = (c: { name: string; name_en: string }, lang: Lang) => (lang === 'en' ? c.name_en || tx(c.name, lang) : c.name);

// ---- 주소 ----
// 영어판이 있는 한국어 경로(앞부분 일치). /korea/ 는 영어판이 /en/korea/ (같은 규칙).
const EN_PREFIX = ['/trend/', '/ai/', '/category/', '/combos/', '/pricing/', '/rank/', '/search/', '/board/', '/map/', '/korea/'];
const EN_EXACT = ['/', '/privacy'];
export function hasEn(koPath: string): boolean {
  const p = koPath.split(/[?#]/)[0];
  if (EN_EXACT.includes(p)) return true;
  return EN_PREFIX.some((x) => p === x || p.startsWith(x));
}
/** 사이트 안 주소를 그 언어판 주소로(영어판 없는 주소·바깥 주소·#는 그대로) */
export function lp(href: string, lang: Lang): string {
  if (lang === 'ko' || !href || !href.startsWith('/') || href.startsWith('/en/') || href === '/en') return href;
  // 트렌드 글 하나(/trend/<id>)는 번역된 글만 영어판이 있다(빌드 때 정적 /en/trend/<id>/)
  const tm = href.match(/^\/trend\/(\d+)\/?([?#].*)?$/);
  if (tm) return hasTrendEn(tm[1]) ? `/en/trend/${tm[1]}/${tm[2] || ''}` : href;
  return hasEn(href) ? '/en' + href : href;
}
/** /en/… → 한국어 경로 */
export const koPathOf = (p: string) => (p === '/en' || p === '/en/' ? '/' : p.startsWith('/en/') ? p.slice(3) : p);
