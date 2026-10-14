// AI 도구 공식 자료(노트북 수집 tools.jsonl) → data/ai_official.json (2026-10-14)
// 왜: 747개 중 상세 페이지가 74개뿐 — 나머지는 한 줄 설명 + 'AI 추정' 문장뿐이라 1,000자 기준을 못 넘었음.
//     공식 페이지에서 받은 근거 있는 자료로 상세 페이지를 채우고, 기준을 넘는 도구는 상세 페이지를 연다.
// 하는 일: 화면에 쓸 칸만 골라 옮기고(근거 원문 인용은 옮기지 않음, 출처 주소만), 상세 페이지를 열지(eligible) 여기 한 곳에서 정한다.
//          site2(src/lib/data.ts)와 postbuild(dist/data/ai_pages.json 합치기)가 이 파일을 읽는다.
// 실행: node scripts/import-official-tools.mjs [수집 폴더]   (폴더를 안 주면 C:\dev\paths.json 기준 30_data/raw/galaxy_ai_tools_* 중 가장 최근)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // galaxy
// C:\dev\paths.json 이 있는 폴더(위로 올라가며 찾기)
let DEV = ROOT; while (!existsSync(join(DEV, 'paths.json')) && dirname(DEV) !== DEV) DEV = dirname(DEV);
const RAW = join(DEV, '30_data', 'raw');
const arg = process.argv[2];
const src = arg || (existsSync(RAW) ? readdirSync(RAW).filter((d) => d.startsWith('galaxy_ai_tools_')).sort().map((d) => join(RAW, d)).pop() : null);
if (!src || !existsSync(join(src, 'tools.jsonl'))) { console.error('tools.jsonl 을 못 찾음:', src); process.exit(1); }

// 상세 페이지를 여는 기준(공식 자료만으로 본문이 서는지). 바꾸면 이 줄과 README 설명만.
const RULE = { minWhat: 150, minFeatures: 5, minEvidence: 8 };
const okStatus = (s) => /^(ok|redirect)\b/.test(String(s || ''));
const known = (v) => v != null && v !== '' && v !== '불명';

const rows = readFileSync(join(src, 'tools.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const tools = {};
let eligible = 0;
for (const r of rows) {
  if (!okStatus(r.status)) continue; // 막힘·종료는 옮기지 않음(지금 자료 그대로)
  const ev = Array.isArray(r.evidence) ? r.evidence : [];
  const p = r.pricing || {};
  const ok = (r.what_it_does_ko || '').length >= RULE.minWhat && (r.key_features || []).length >= RULE.minFeatures && ev.length >= RULE.minEvidence;
  if (ok) eligible++;
  tools[r.slug] = {
    name_en: r.name_en,
    checked: String(r.checked_at || '').slice(0, 10),
    company: known(r.company) ? r.company : null,
    one_liner: r.one_liner_ko || null,
    what: r.what_it_does_ko || null,
    features: (r.key_features || []).filter(Boolean),
    uses: (r.use_cases_ko || []).filter(Boolean),
    free: known(p.free_tier) ? p.free_tier : null,
    plans: (p.plans || []).filter((x) => x && x.name).map((x) => ({ name: x.name, price: x.price ?? null, currency: x.currency || null, period: x.period || null, limits: x.limits || null })),
    pricing_url: p.pricing_url || null,
    open_source: known(r.open_source) ? r.open_source : null,
    api: known(r.api) ? r.api : null,
    platforms: (r.platforms || []).filter(Boolean),
    korean: known(r.korean_support) ? r.korean_support : null,
    github: r.github && (r.github.stars != null || r.github.license) ? { stars: r.github.stars ?? null, license: r.github.license || null } : null,
    sources: [...new Set(ev.map((e) => e && e.url).filter((u) => /^https?:\/\//.test(u || '')))].slice(0, 6),
    eligible: ok,
  };
}
const out = { generated: new Date().toISOString().slice(0, 10), source: src.replace(DEV, '').replace(/\\/g, '/'), rule: RULE, count: Object.keys(tools).length, eligible, tools };
writeFileSync(join(ROOT, 'data', 'ai_official.json'), JSON.stringify(out, null, 1));
console.log(`공식 자료 ${rows.length}줄 → 옮김 ${out.count}개, 상세 페이지 기준 통과 ${eligible}개 (기준: 설명 ${RULE.minWhat}자·기능 ${RULE.minFeatures}개·근거 ${RULE.minEvidence}개 이상) → data/ai_official.json`);
