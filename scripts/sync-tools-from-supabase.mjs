// Supabase ai_tools(3D 지도가 읽는 원본) → data/ai_landscape.json · data/ai_enrichment.json 맞추기 (2026-10-14).
// 왜: 9/16 Supabase에만 16개(캡컷·Vrew·뤼튼…)가 추가돼 지도 747개 / 새 틀(site2) 731개로 갈라짐. 사용자 결정: 747(Supabase) 기준.
// 하는 일: JSON에 없는 도구만 뒤에 덧붙인다(기존 731개 줄은 건드리지 않음). 읽기 전용 공개 키로 조회, DB에 쓰지 않음.
// 실행: node scripts/sync-tools-from-supabase.mjs        (바뀔 내용만 보기: --dry)
// 주소·키: .env 의 SUPABASE_URL · SUPABASE_ANON_KEY (없으면 중단)
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const env = Object.fromEntries(
  (existsSync(new URL('.env', ROOT)) ? readFileSync(new URL('.env', ROOT), 'utf8') : '')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.error('.env 에 SUPABASE_URL · SUPABASE_ANON_KEY 가 없어 중단'); process.exit(1); }
const DRY = process.argv.includes('--dry');

const res = await fetch(`${URL_}/rest/v1/ai_tools?select=*&order=id&limit=5000`, { headers: { apikey: KEY } });
if (!res.ok) { console.error('Supabase 조회 실패', res.status); process.exit(1); }
const sb = await res.json();
if (sb.length < 700) { console.error(`ai_tools 가 ${sb.length}개뿐 — 데이터 이상으로 보고 중단`); process.exit(1); }

const LP = new URL('data/ai_landscape.json', ROOT), EP = new URL('data/ai_enrichment.json', ROOT);
const L = JSON.parse(await readFile(LP, 'utf8')), E = JSON.parse(await readFile(EP, 'utf8'));
const have = new Set(L.map((r) => r.name_en)), haveE = new Set(E.map((r) => r.name_en));
const add = sb.filter((t) => !have.has(t.name_en));

// 연관 도구: 엑셀 원본 규칙과 같게 "같은 세부분류, 최대 5개"(Supabase에 관계가 없는 새 도구용)
const all = [...L, ...add.map((t) => ({ name_en: t.name_en, subcategory: t.subcategory }))];
const peers = (t) => all.filter((x) => x.subcategory === t.subcategory && x.name_en !== t.name_en).slice(0, 5).map((x) => x.name_en);

const newL = add.map((t) => ({
  name_en: t.name_en, name_ko: t.name_ko ?? null, category: t.category, category_en: t.category_en,
  subcategory: t.subcategory, subcategory_en: t.subcategory_en, url: t.url || '', github: t.github || '', twitter: t.twitter || '',
  desc_en: t.desc_en || '', desc_ko: t.desc_ko || t.description || '', tags: (t.tags || []).join(', '),
  added_date: t.added_date || String(t.created_at || '').slice(0, 10), related_names: peers(t),
}));
const newE = add.filter((t) => !haveE.has(t.name_en)).map((t) => ({
  name_en: t.name_en, pricing_policy: t.pricing_policy || '', pricing_detail: t.pricing_detail || '',
  long_desc_ko: t.long_desc_ko || '', key_features: t.key_features || [],
  info_confidence: t.info_confidence || '', info_verified: !!t.info_verified,
}));

console.log(`Supabase ${sb.length} · JSON ${L.length} → 덧붙일 도구 ${newL.length}개, 보강 ${newE.length}개`);
newL.forEach((t) => console.log(`  + ${t.name_en} | ${t.category} | ${t.added_date}`));
const onlyJson = L.filter((r) => !sb.some((t) => t.name_en === r.name_en)).map((r) => r.name_en);
if (onlyJson.length) console.log('  JSON에만 있는 도구(그대로 둠):', onlyJson.join(', '));
if (DRY || !newL.length) process.exit(0);

const stamp = new Date().toISOString().slice(0, 10);
await copyFile(LP, new URL(`data/ai_landscape.before-sync-${stamp}.json`, ROOT));
await copyFile(EP, new URL(`data/ai_enrichment.before-sync-${stamp}.json`, ROOT));
// 기존 파일 형식 그대로(한 칸 들여쓰기, 줄끝은 파일마다 원래 것) — 덧붙인 줄만 차이로 보이게
const fmt = (rows, src) => { const s = JSON.stringify(rows, null, 1); return src.includes('\r\n') ? s.replace(/\n/g, '\r\n') : s; };
await writeFile(LP, fmt([...L, ...newL], await readFile(LP, 'utf8')));
await writeFile(EP, fmt([...E, ...newE], await readFile(EP, 'utf8')));
console.log(`저장: ai_landscape ${L.length + newL.length} · ai_enrichment ${E.length + newE.length} (이전 파일은 *.before-sync-${stamp}.json)`);
