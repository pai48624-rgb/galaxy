#!/usr/bin/env node
// board_posts 테이블 + RLS 정책만 적용하는 1회성 마이그레이션.
// 실행: node --env-file=.env scripts/migrate_board_posts.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing (.env)'); process.exit(1); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
const marker = 'create table if not exists public.board_posts';
const idx = sql.indexOf(marker);
if (idx === -1) { console.error('board_posts section not found in supabase_schema.sql'); process.exit(1); }
const boardSql = sql.slice(idx);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

async function main() {
  await client.connect();
  console.log('connected');
  await client.query(boardSql);
  console.log('board_posts schema applied');
  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name='board_posts';`
  );
  console.log('verify table exists:', rows);
  const { rows: pol } = await client.query(
    `select policyname, cmd, roles from pg_policies where tablename='board_posts';`
  );
  console.log('policies:', pol);
}
main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; }).finally(() => client.end());
