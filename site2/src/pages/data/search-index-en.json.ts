// /data/search-index-en.json — 영어판 AI 검색(/en/search/)용 색인(2026-10-14). 한국어판(search-index.json)과 같은 모양.
// n=영문 이름, e=비움(영문만 표시), k=한국어 이름(찾기에만 씀), cats=분야 영문 이름, d=영어 한 줄 설명(desc_en 60자)
import type { APIRoute } from 'astro';
import { loadTools, aiPageSlugs, searchAlias } from '~/lib/data';
import { dataDate } from '~/lib/data2';
import { clip } from '~/utils/utils';
import { toolDesc } from '~/i18n/tr';
export const GET: APIRoute = () => {
  const tools = loadTools();
  const pages = new Set(aiPageSlugs());
  const cats = [...new Set(tools.map((t) => t.category_en || t.category))];
  const ci = new Map(cats.map((c, i) => [c, i]));
  const body = {
    date: dataDate(), n: tools.length, cats,
    tools: tools.map((t) => ({ n: t.name_en || t.name, e: '', ...(t.name_ko ? { k: t.name_ko } : {}), c: ci.get(t.category_en || t.category)!, d: clip(toolDesc(t, 'en'), 60), ...(searchAlias(t.slug) ? { a: searchAlias(t.slug) } : {}), ...(pages.has(t.slug) ? { s: t.slug } : {}) })),
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
