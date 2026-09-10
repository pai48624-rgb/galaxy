-- ============================================================================
--  AI 성단 지도 (AI GALAXY) — Supabase schema
--  Supabase Dashboard  ▸  SQL Editor  ▸  New query  ▸  붙여넣고 RUN
--  (재실행해도 안전 — 전부 IF NOT EXISTS / OR REPLACE)
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
--  1. ai_tools  —  별(노드) 하나 = AI 서비스 하나
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_tools (
  id             bigint generated always as identity primary key,
  slug           text not null unique,
  name_en        text not null,
  name_ko        text,
  name           text generated always as (coalesce(nullif(name_ko, ''), name_en)) stored,
  category       text not null default '기타',
  category_en    text,
  subcategory    text,
  subcategory_en text,
  url            text,
  github         text,
  twitter        text,
  desc_en        text,
  desc_ko        text,
  description    text generated always as (coalesce(nullif(desc_ko, ''), desc_en)) stored,
  tags           text[] not null default '{}',
  pricing        text check (pricing in ('무료', '부분유료', '유료')),
  rank           int,
  source         text not null default 'seed' check (source in ('seed', 'community')),
  added_date     date,
  created_at     timestamptz not null default now()
);
create index if not exists ai_tools_category_idx on public.ai_tools (category);
create index if not exists ai_tools_pricing_idx  on public.ai_tools (pricing);

-- ────────────────────────────────────────────────────────────────────────────
--  2. relations  —  별과 별을 잇는 선 (무방향, 쌍당 1행)
--     kind = 'complement'  → 보완재(함께 사용) : 실선 + 입자 흐름
--     kind = 'alternative' → 대체재(비슷한 대안) : 옅은 점선 느낌
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.relations (
  id         bigint generated always as identity primary key,
  source_id  bigint not null references public.ai_tools(id) on delete cascade,
  target_id  bigint not null references public.ai_tools(id) on delete cascade,
  kind       text not null default 'complement' check (kind in ('complement', 'alternative')),
  label      text,
  created_at timestamptz not null default now(),
  constraint relations_distinct check (source_id <> target_id),
  constraint relations_uniq unique (source_id, target_id, kind)
);
create index if not exists relations_source_idx on public.relations (source_id);
create index if not exists relations_target_idx on public.relations (target_id);

-- ────────────────────────────────────────────────────────────────────────────
--  3. reviews  —  방문자 한 줄 리뷰 : 로그인 없이 INSERT → 지도에 즉시 반영
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  ai_id       bigint not null references public.ai_tools(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  body        text not null,
  author_name text not null default '익명',
  created_at  timestamptz not null default now(),
  constraint reviews_body_len   check (char_length(btrim(body)) between 2 and 2000),
  constraint reviews_author_len check (char_length(author_name) between 1 and 40)
);
create index if not exists reviews_ai_idx on public.reviews (ai_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
--  4. suggestions  —  "이 AI 추가해주세요" 제보 : INSERT는 누구나, 노출은 검토 후
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.suggestions (
  id         bigint generated always as identity primary key,
  name       text not null,
  url        text,
  category   text,
  note       text,
  contact    text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint suggestions_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint suggestions_note_len check (note is null or char_length(note) <= 2000)
);

-- ────────────────────────────────────────────────────────────────────────────
--  5. sponsors  —  유료 스폰서 : 해당 별을 2배 + Glow, 상단 슬롯 노출
--     관리는 Table Editor에서 직접 (공개 INSERT/UPDATE 정책 없음)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.sponsors (
  id         bigint generated always as identity primary key,
  ai_id      bigint not null references public.ai_tools(id) on delete cascade,
  tier       text not null default 'gold' check (tier in ('gold', 'silver')),
  blurb      text,
  link       text,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create or replace view public.active_sponsors as
  select s.id, s.ai_id, s.tier, s.blurb, s.link, s.starts_at, s.ends_at,
         t.slug, t.name
  from public.sponsors s
  join public.ai_tools t on t.id = s.ai_id
  where now() between s.starts_at and s.ends_at;

-- ============================================================================
--  Row Level Security
--  · 카탈로그(ai_tools/relations)는 읽기 전용 공개
--  · reviews / suggestions 는 INSERT만 공개 (수정·삭제 불가)
--  · 시드/관리는 service_role 키(임포트 스크립트) 또는 Table Editor로
-- ============================================================================
alter table public.ai_tools    enable row level security;
alter table public.relations   enable row level security;
alter table public.reviews     enable row level security;
alter table public.suggestions enable row level security;
alter table public.sponsors    enable row level security;

drop policy if exists "read ai_tools"     on public.ai_tools;
drop policy if exists "read relations"    on public.relations;
drop policy if exists "read reviews"      on public.reviews;
drop policy if exists "read sponsors"     on public.sponsors;
drop policy if exists "insert reviews"    on public.reviews;
drop policy if exists "insert suggestions" on public.suggestions;
drop policy if exists "read suggestions"  on public.suggestions;

create policy "read ai_tools"  on public.ai_tools  for select using (true);
create policy "read relations" on public.relations for select using (true);
create policy "read reviews"   on public.reviews   for select using (true);
create policy "read sponsors"  on public.sponsors  for select using (now() between starts_at and ends_at);

create policy "insert reviews" on public.reviews for insert
  with check (
    rating between 1 and 5
    and char_length(btrim(body)) between 2 and 2000
    and char_length(author_name) between 1 and 40
  );

create policy "insert suggestions" on public.suggestions for insert
  with check (
    status = 'pending'
    and char_length(btrim(name)) between 1 and 120
  );

create policy "read suggestions" on public.suggestions for select using (status = 'approved');

-- PostgREST 노출용 권한 (Supabase 기본 grant를 명시적으로 재확인)
grant usage on schema public to anon, authenticated;
grant select on public.ai_tools, public.relations, public.reviews, public.sponsors,
                public.active_sponsors, public.suggestions to anon, authenticated;
grant insert on public.reviews, public.suggestions to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- (선택) Realtime 로 리뷰 스트림을 받고 싶으면:
-- alter publication supabase_realtime add table public.reviews;
