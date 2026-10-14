// 빌드 뒤 손질(2026-10-14)
// 1) sitemap-index.xml 에 워커가 만드는 트렌드 글 사이트맵(/sitemap-trend.xml) 추가
// 2) 검색엔진에 이미 등록된 옛 사이트맵 이름 유지: sitemap.xml(=색인 목록), sitemap-ai.xml(AI·분야·조합·요금·순위), sitemap-korea.xml(한국 여행)
// 3) 옛 소개 글 /galaxy_saas/* (정적 HTML, astro 사이트맵에 안 잡힘)를 sitemap-ai.xml 에 포함
// 주소는 .env PUBLIC_SITE_URL 한 곳에서.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const env = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const SITE = ((process.env.PUBLIC_SITE_URL || (env.match(/^PUBLIC_SITE_URL=(.+)$/m) || [])[1] || '').trim()).replace(/\/$/, '');
if (!SITE) throw new Error('[postbuild] PUBLIC_SITE_URL 없음(.env)');
const idxF = join(DIST, 'sitemap-index.xml');
if (!existsSync(idxF)) throw new Error('[postbuild] sitemap-index.xml 없음');
let idx = readFileSync(idxF, 'utf8');
if (!idx.includes('sitemap-trend.xml')) idx = idx.replace('</sitemapindex>', `<sitemap><loc>${SITE}/sitemap-trend.xml</loc></sitemap></sitemapindex>`);
// 하위 사이트맵 전체 주소 모으기
const subs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !u.endsWith('/sitemap-trend.xml'));
const locs = [];
for (const u of subs) { const f = join(DIST, u.replace(SITE + '/', '')); if (existsSync(f)) locs.push(...[...readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])); }
const saasDir = join(DIST, 'galaxy_saas');
const saas = existsSync(saasDir) ? readdirSync(saasDir).filter((f) => f.endsWith('.html') && !/_v1\.html$/.test(f)).map((f) => `${SITE}/galaxy_saas/${f === 'index.html' ? '' : f.replace(/\.html$/, '')}`) : [];
const urlset = (list) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(list)].map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
const path = (u) => u.replace(SITE, '');
const korea = locs.filter((u) => /^\/(en\/)?korea\//.test(path(u)));
const ai = locs.filter((u) => !korea.includes(u)).concat(saas);
writeFileSync(join(DIST, 'sitemap-ai.xml'), urlset(ai));
writeFileSync(join(DIST, 'sitemap-korea.xml'), urlset(korea));
if (!idx.includes('sitemap-ai.xml')) idx = idx.replace('</sitemapindex>', `<sitemap><loc>${SITE}/sitemap-ai.xml</loc></sitemap><sitemap><loc>${SITE}/sitemap-korea.xml</loc></sitemap></sitemapindex>`);
writeFileSync(idxF, idx);
writeFileSync(join(DIST, 'sitemap.xml'), idx);  // 옛 sitemap.xml 주소 = 같은 색인 목록
console.log(`[postbuild] 사이트맵: ai ${ai.length} · korea ${korea.length} · galaxy_saas ${saas.length} · sitemap.xml=색인 목록`);
