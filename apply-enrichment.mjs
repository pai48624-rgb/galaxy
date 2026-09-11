#!/usr/bin/env node
// ============================================================================
//  data/ai_enrichment.json  →  Supabase (ai_tools 보강 컬럼만 UPDATE)
//
//  출처: 사용자가 제공한 AI_Landscape_731개_상세정보포함.xlsx의 "전체목록" 시트.
//  가격정책/요금제 상세/상세설명(보강)/핵심기능은 실시간 크롤링이 아니라
//  Claude(AI)의 학습 지식을 바탕으로 일괄 작성됨 — info_verified=true 인 42개
//  (ChatGPT/Claude/Gemini/Cursor 등 널리 알려진 제품)만 공식 발표 기준으로
//  비교적 신뢰 가능하고, 나머지는 카테고리 통념에 근거한 추정치임.
//  → UI에서는 info_verified=false 항목에 반드시 "AI 추정" 표시를 함께 보여줄 것.
//
//  이 스크립트는 name_en 을 키로 매칭해서 보강 컬럼만 UPDATE 함(기존 핵심 필드는
//  건드리지 않음). import-data.mjs 를 다시 돌려도 이 컬럼들은 그대로 남아있음
//  (upsert 페이로드에 이 필드들이 없어서 안 건드려짐).
//
//  실행:  node --env-file=.env apply-enrichment.mjs
// ============================================================================
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 이 없습니다. node --env-file=.env apply-enrichment.mjs 로 실행하세요.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await client.connect();

try {
  console.log('· 컬럼 확인/추가...');
  await client.query(`
    alter table public.ai_tools add column if not exists pricing_policy  text;
    alter table public.ai_tools add column if not exists pricing_detail  text;
    alter table public.ai_tools add column if not exists long_desc_ko    text;
    alter table public.ai_tools add column if not exists key_features    text[] not null default '{}';
    alter table public.ai_tools add column if not exists info_confidence text;
    alter table public.ai_tools add column if not exists info_verified   boolean not null default false;
  `);

  const rows = JSON.parse(await readFile(new URL('./data/ai_enrichment.json', import.meta.url), 'utf8'));
  console.log(`· ${rows.length}개 행 적용 시작`);

  let updated = 0;
  const missed = [];
  for (const r of rows) {
    if (!r.name_en) continue;
    const res = await client.query(
      `update public.ai_tools set
         pricing_policy = $1, pricing_detail = $2, long_desc_ko = $3,
         key_features = $4, info_confidence = $5, info_verified = $6
       where name_en = $7`,
      [r.pricing_policy, r.pricing_detail, r.long_desc_ko, r.key_features, r.info_confidence, r.info_verified, r.name_en]
    );
    if (res.rowCount > 0) updated += res.rowCount;
    else missed.push(r.name_en);
  }
  console.log(`· ${updated}개 업데이트 완료`);
  if (missed.length) console.log('· name_en 매칭 안 된 항목:', missed);
  console.log('\n✓ 끝. index.html 의 인라인 seed-data 를 최신 상태로 유지하려면 별도로 재생성하세요.');
} finally {
  await client.end();
}
