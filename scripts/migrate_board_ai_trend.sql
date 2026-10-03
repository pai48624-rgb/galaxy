-- AI 트렌드 게시판 (2026-10-03) — Supabase SQL Editor에서 1회 실행. 여러 번 실행해도 안전.
-- ⚠ index.html 의 게시판 목록이 board 칼럼으로 거르기 때문에, 이 SQL을 먼저 실행한 뒤에 배포해야 함
--   (순서가 바뀌면 커뮤니티 게시판 목록이 비어 보임).

-- 게시판 구분: free(커뮤니티) / ai_trend(운영자 자동 등록 글)
alter table public.board_posts add column if not exists board text not null default 'free';
alter table public.board_posts add column if not exists external_id text;
alter table public.board_posts add column if not exists body_html text;
alter table public.board_posts add column if not exists tags text[] not null default '{}';
alter table public.board_posts drop constraint if exists board_posts_board_chk;
alter table public.board_posts add constraint board_posts_board_chk check (board in ('free','ai_trend'));
create unique index if not exists board_posts_external_id_uq on public.board_posts(external_id) where external_id is not null;
create index if not exists board_posts_board_created_idx on public.board_posts(board, created_at desc);

-- 본문 길이: 커뮤니티는 그대로 4000자, AI 트렌드(운영자 글)는 20000자
alter table public.board_posts drop constraint if exists board_posts_body_len;
alter table public.board_posts add constraint board_posts_body_len check (
  char_length(btrim(body)) >= 1 and char_length(btrim(body)) <= (case when board = 'free' then 4000 else 20000 end));

-- 일반 사용자는 커뮤니티(free)에만, HTML 본문·external_id 없이만 쓸 수 있음
drop policy if exists "insert board_posts own" on public.board_posts;
create policy "insert board_posts own" on public.board_posts for insert to authenticated
  with check (auth.uid() = user_id and ((board = 'free' and body_html is null and external_id is null) or public.is_board_admin()));

-- 콘텐츠 공장 등록용 토큰 (해시만 저장, 정책이 없어서 API로는 읽기·쓰기 불가)
create table if not exists public.factory_tokens (
  token_hash text primary key,
  label text,
  created_at timestamptz not null default now()
);
alter table public.factory_tokens enable row level security;
revoke all on public.factory_tokens from anon, authenticated;

-- 워커의 POST /api/posts 가 부르는 함수: 토큰 확인 → 같은 external_id 있으면 기존 글 id → 없으면 운영자 글로 등록
create or replace function public.factory_post(
  p_token text, p_external_id text, p_title text, p_body text, p_body_html text, p_tags text[])
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_admin uuid; v_id bigint;
begin
  if p_token is null or not exists (
      select 1 from public.factory_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'bad_token' using errcode = '28000';
  end if;
  if p_external_id is not null then
    select id into v_id from public.board_posts where external_id = p_external_id;
    if v_id is not null then return json_build_object('id', v_id, 'dup', true); end if;
  end if;
  select user_id into v_admin from public.admins limit 1;
  if v_admin is null then raise exception 'no_admin'; end if;
  insert into public.board_posts(user_id, author_name, title, body, body_html, tags, board, external_id)
  values (v_admin, 'AI 성단 지도', btrim(p_title), btrim(p_body), p_body_html, coalesce(p_tags, '{}'), 'ai_trend', p_external_id)
  returning id into v_id;
  return json_build_object('id', v_id, 'dup', false);
end $$;
revoke all on function public.factory_post(text, text, text, text, text, text[]) from public;
grant execute on function public.factory_post(text, text, text, text, text, text[]) to anon, authenticated;

-- 토큰 등록 (토큰 원문은 노트북 nas_automation_project/.env 의 GALAXY_POST_TOKEN 에만 둠):
-- insert into public.factory_tokens(token_hash, label) values ('<토큰의 sha256 hex>', 'content_factory');
