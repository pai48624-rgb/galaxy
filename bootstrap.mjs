#!/usr/bin/env node
// ============================================================================
//  원샷 부트스트랩: 스키마(supabase_schema.sql) 적용 + 데이터 임포트
//  Postgres 에 직접 연결합니다 (service_role 키 불필요).
//
//  실행:  DATABASE_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
//         node bootstrap.mjs
//  또는:  node --env-file=.env bootstrap.mjs      (.env 에 DATABASE_URL=...)
//
//  URI 는 Supabase 대시보드 ▸ 프로젝트 ▸ [Connect] ▸ "Session pooler" 에서 복사.
// ============================================================================
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(`
  DATABASE_URL 이 없습니다.

    DATABASE_URL='postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres' node bootstrap.mjs

  (Supabase 대시보드 ▸ Connect ▸ Session pooler 의 URI)
  `);
  process.exit(1);
}

const SCHEMA = new URL('./supabase_schema.sql', import.meta.url);
const DATA = new URL('./data/ai_landscape.json', import.meta.url);

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const clean = v => (v == null || v === '' ? null : v);
const slugify = s =>
  (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ai';
const pricingFromTags = tags => {
  const t = tags.map(x => x.toLowerCase());
  return t.some(x => /open[-\s]?source|open[-\s]?weights?|\boss\b/.test(x)) ? '무료' : '부분유료';
};

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

async function main() {
  await client.connect();
  console.log('· 연결됨');

  // ── 1. 스키마 ────────────────────────────────────────────────────────────
  await client.query(await readFile(SCHEMA, 'utf8'));
  console.log('· 스키마 적용 완료');

  // ── 2. 변환 ──────────────────────────────────────────────────────────────
  const raw = JSON.parse(await readFile(DATA, 'utf8'));
  const used = new Set();
  const rows = raw.map(r => {
    const tags = String(r.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    let base = slugify(r.name_en || r.name_ko), slug = base;
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
      url: clean(r.url), github: clean(r.github), twitter: clean(r.twitter),
      desc_en: clean(r.desc_en), desc_ko: clean(r.desc_ko),
      tags, pricing: pricingFromTags(tags),
      added_date: clean(r.added_date),
      _related: Array.isArray(r.related_names) ? r.related_names : [],
      _nameEn: r.name_en || null,
    };
  });

  // ── 3. ai_tools upsert ──────────────────────────────────────────────────
  const COLS = ['slug', 'name_en', 'name_ko', 'category', 'category_en', 'subcategory',
    'subcategory_en', 'url', 'github', 'twitter', 'desc_en', 'desc_ko', 'tags', 'pricing', 'added_date'];
  for (const part of chunk(rows, 200)) {
    const vals = [], ph = [];
    part.forEach((r, i) => {
      const b = i * COLS.length;
      ph.push(`(${COLS.map((_, j) => `$${b + j + 1}`).join(',')}, 'seed')`);
      vals.push(r.slug, r.name_en, r.name_ko, r.category, r.category_en, r.subcategory,
        r.subcategory_en, r.url, r.github, r.twitter, r.desc_en, r.desc_ko, r.tags, r.pricing, r.added_date);
    });
    await client.query(
      `insert into ai_tools (${COLS.join(',')}, source) values ${ph.join(',')}
       on conflict (slug) do update set
         name_en=excluded.name_en, name_ko=excluded.name_ko, category=excluded.category,
         category_en=excluded.category_en, subcategory=excluded.subcategory,
         subcategory_en=excluded.subcategory_en, url=excluded.url, github=excluded.github,
         twitter=excluded.twitter, desc_en=excluded.desc_en, desc_ko=excluded.desc_ko,
         tags=excluded.tags, pricing=excluded.pricing, added_date=excluded.added_date`,
      vals,
    );
    process.stdout.write('.');
  }
  console.log(`\n· ai_tools ${rows.length}행`);

  // ── 4. relations ───────────────────────────────────────────────────────
  const { rows: idRows } = await client.query('select id, slug from ai_tools');
  const idBySlug = new Map(idRows.map(r => [r.slug, r.id]));
  const slugByNameEn = new Map(rows.filter(r => r._nameEn).map(r => [r._nameEn, r.slug]));
  const catBySlug = new Map(rows.map(r => [r.slug, r.category]));

  const seen = new Set(), rels = [];
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
      rels.push([s, t, kind, kind === 'alternative' ? '비슷한 대안' : '함께 쓰면 좋음']);
    }
  }
  for (const part of chunk(rels, 300)) {
    const vals = [], ph = [];
    part.forEach((r, i) => { const b = i * 4; ph.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`); vals.push(...r); });
    await client.query(
      `insert into relations (source_id, target_id, kind, label) values ${ph.join(',')}
       on conflict (source_id, target_id, kind) do nothing`,
      vals,
    );
    process.stdout.write('.');
  }
  console.log(`\n· relations ${rels.length}행`);

  const { rows: [c] } = await client.query('select (select count(*) from ai_tools) t, (select count(*) from relations) r');
  console.log(`\n✓ 완료 — ai_tools=${c.t}, relations=${c.r}`);
}

main()
  .catch(e => { console.error('\n✗ 실패:', e.message || e); process.exitCode = 1; })
  .finally(() => client.end());
