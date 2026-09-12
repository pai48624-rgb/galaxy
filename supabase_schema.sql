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

-- 상세정보 보강(2026-09-11): 가격정책/요금제 상세/보강 설명/핵심기능 — 대부분 AI(Claude) 학습지식 기반
-- 추정치이며 실시간 크롤링이 아님(info_verified=true 인 42개 주요 툴만 공식 발표 기준 비교적 신뢰 가능).
-- UI에는 반드시 info_verified=false 인 항목에 "AI 추정" 같은 표시를 같이 보여줄 것.
alter table public.ai_tools add column if not exists pricing_policy  text;
alter table public.ai_tools add column if not exists pricing_detail  text;
alter table public.ai_tools add column if not exists long_desc_ko    text;
alter table public.ai_tools add column if not exists key_features    text[] not null default '{}';
alter table public.ai_tools add column if not exists info_confidence text;
alter table public.ai_tools add column if not exists info_verified   boolean not null default false;

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

-- ────────────────────────────────────────────────────────────────────────────
--  6. board_posts — 사용자 커뮤니티 게시판 (2026-09-13 추가)
--     · 글쓰기는 로그인(이메일 매직링크) 필요, 읽기는 누구나 공개
--     · "체크는 최소화" 방침에 따라 이메일 인증 자체를 Supabase Auth에 맡기고
--       앱 쪽에서는 별도 승인/검수 로직을 두지 않음(reviews와 동일한 철학)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.board_posts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint board_posts_title_len  check (char_length(btrim(title)) between 1 and 120),
  constraint board_posts_body_len   check (char_length(btrim(body)) between 1 and 4000),
  constraint board_posts_author_len check (char_length(author_name) between 1 and 40)
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);

alter table public.board_posts enable row level security;
drop policy if exists "read board_posts" on public.board_posts;
drop policy if exists "insert board_posts own" on public.board_posts;
drop policy if exists "delete board_posts own" on public.board_posts;

create policy "read board_posts" on public.board_posts for select using (true);
create policy "insert board_posts own" on public.board_posts for insert
  to authenticated
  with check (auth.uid() = user_id);
create policy "delete board_posts own" on public.board_posts for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.board_posts to anon, authenticated;
grant insert, delete on public.board_posts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
--  7. signup_ip_log — 같은 IP로 7일 이내 재가입 막기 (2026-09-13 추가)
--     · 이메일 인증 없이 순수 IP+시간 기록만으로 막음(요청사항: 이메일 발송 불필요)
--     · 실제 판단은 SECURITY DEFINER 함수 안에서만 하고, 테이블 자체는 anon/authenticated
--       모두 직접 접근 불가 — Cloudflare Worker(_worker.js)가 가입 요청을 가로채서
--       이 함수를 먼저 호출하고, false가 나오면 Supabase로 전달하지 않고 429를 돌려줌
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.signup_ip_log (
  ip           text primary key,
  last_attempt timestamptz not null default now()
);
alter table public.signup_ip_log enable row level security;
-- 일부러 select/insert 정책을 anon/authenticated에게 안 줌 — 아래 함수를 통해서만 건드릴 수 있게

create or replace function public.check_signup_ip_ok(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  last_ts timestamptz;
begin
  select last_attempt into last_ts from public.signup_ip_log where ip = p_ip;
  if last_ts is not null and last_ts > now() - interval '7 days' then
    return false;
  end if;
  insert into public.signup_ip_log (ip, last_attempt) values (p_ip, now())
    on conflict (ip) do update set last_attempt = now();
  return true;
end;
$$;
grant execute on function public.check_signup_ip_ok(text) to anon, authenticated;
