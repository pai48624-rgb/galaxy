#!/usr/bin/env node
// signup_ip_log 테이블 + check_signup_ip_ok() 함수만 적용하는 1회성 마이그레이션.
// 실행: node --env-file=.env scripts/migrate_signup_ip_log.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing (.env)'); process.exit(1); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
const marker = '7. signup_ip_log';
const idx = sql.indexOf(marker);
if (idx === -1) { console.error('signup_ip_log section not found in supabase_schema.sql'); process.exit(1); }
// 주석 줄까지 포함해서 자르면 -- 로 시작 안 하는 줄이 생기니, 실제 SQL 시작점(create table)부터 자름
const createIdx = sql.indexOf('create table if not exists public.signup_ip_log', idx);
const migSql = sql.slice(createIdx);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

async function main() {
  await client.connect();
  console.log('connected');
  await client.query(migSql);
  console.log('signup_ip_log schema + function applied');
  const { rows } = await client.query(
    `select proname from pg_proc where proname = 'check_signup_ip_ok';`
  );
  console.log('verify function exists:', rows);
}
main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; }).finally(() => client.end());
