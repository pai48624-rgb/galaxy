#!/usr/bin/env node
// ============================================================================
//  data/ai_landscape.json  →  Supabase (ai_tools + relations)
//
//  준비:  npm install
//  실행:  node --env-file=.env import-data.mjs
//         (.env 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — .env.example 참고)
//
//  · service_role 키를 쓰므로 RLS를 우회합니다. 절대 커밋/브라우저 노출 금지.
//  · slug(=name_en) 기준 upsert 라서 몇 번을 돌려도 중복이 안 생깁니다.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`
  환경변수가 없습니다. 이렇게 실행하세요:

    node --env-file=.env import-data.mjs

  .env 파일 (.env.example 복사):
    SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← Settings ▸ API ▸ service_role (secret)
  `);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DATA = new URL('./data/ai_landscape.json', import.meta.url);

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const clean = v => (v == null || v === '' ? null : v);
const slugify = s =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // 결합 발음기호 제거
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ai';

// tags 로 요금제를 대충 추정 (open-source → 무료, 그 외 → 부분유료).
// 정확한 값은 나중에 Table Editor 에서 수정하세요.
const pricingFromTags = tags => {
  const t = tags.map(x => x.toLowerCase());
  if (t.some(x => /open[-\s]?source|open[-\s]?weights?|\boss\b/.test(x))) return '무료';
  return '부분유료';
};

async function main() {
  const raw = JSON.parse(await readFile(DATA, 'utf8'));
  console.log(`· ${raw.length}개 항목 읽음`);

  // ── 1. ai_tools ────────────────────────────────────────────────────────────
  const used = new Set();
  const rows = raw.map(r => {
    const tags = String(r.tags || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let base = slugify(r.name_en || r.name_ko);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);

    return {
      slug,
      name_en: r.name_en || r.name_ko || slug,
      name_ko: clean(r.name_ko),
      category: r.category || '기타',
      category_en: clean(r.category_en),
      subcategory: clean(r.subcategory),
      subcategory_en: clean(r.subcategory_en),
      url: clean(r.url),
      github: clean(r.github),
      twitter: clean(r.twitter),
      desc_en: clean(r.desc_en),
      desc_ko: clean(r.desc_ko),
      tags,
      pricing: pricingFromTags(tags),
      source: 'seed',
      added_date: clean(r.added_date),
      _related: Array.isArray(r.related_names) ? r.related_names : [],
      _nameEn: r.name_en || null,
    };
  });

  const toolPayload = rows.map(({ _related, _nameEn, ...keep }) => keep);
  for (const c of chunk(toolPayload, 500)) {
    const { error } = await db.from('ai_tools').upsert(c, { onConflict: 'slug' });
    if (error) throw error;
    process.stdout.write('.');
  }
  console.log(`\n· ai_tools upsert 완료 (${toolPayload.length})`);

  // ── 2. slug → id 매핑 ─────────────────────────────────────────────────────
  const idBySlug = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('ai_tools').select('id,slug').range(from, from + 999);
    if (error) throw error;
    data.forEach(d => idBySlug.set(d.slug, d.id));
    if (data.length < 1000) break;
  }
  const slugByNameEn = new Map(rows.filter(r => r._nameEn).map(r => [r._nameEn, r.slug]));
  const catBySlug = new Map(rows.map(r => [r.slug, r.category]));

  // ── 3. relations (related_names → 무방향 쌍) ──────────────────────────────
  const seen = new Set();
  const rels = [];
  for (const r of rows) {
    const aId = idBySlug.get(r.slug);
    if (!aId) continue;
    for (const nm of r._related) {
      const bSlug = slugByNameEn.get(nm);
      const bId = bSlug && idBySlug.get(bSlug);
      if (!bId || bId === aId) continue;

      const [s, t] = aId < bId ? [aId, bId] : [bId, aId];
      const kind = catBySlug.get(r.slug) === catBySlug.get(bSlug) ? 'alternative' : 'complement';
      const key = `${s}:${t}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rels.push({
        source_id: s,
        target_id: t,
        kind,
        label: kind === 'alternative' ? '비슷한 대안' : '함께 쓰면 좋음',
      });
    }
  }
  for (const c of chunk(rels, 500)) {
    const { error } = await db
      .from('relations')
      .upsert(c, { onConflict: 'source_id,target_id,kind', ignoreDuplicates: true });
    if (error) throw error;
    process.stdout.write('.');
  }
  console.log(`\n· relations upsert 완료 (${rels.length})`);
  console.log('\n✓ 임포트 끝. index.html 을 열어 확인하세요.');
}

main().catch(err => {
  console.error('\n✗ 임포트 실패:', err.message || err);
  process.exit(1);
});
