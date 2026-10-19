-- 구조화된 글(doc) 받기 (2026-10-19) — Supabase SQL Editor에서 사람이 1회 실행. 여러 번 실행해도 안전.
-- 글 공장이 완성 HTML 대신 글 칸(doc)과 메뉴·카테고리·틀 코드를 보내면 워커(site2/worker/_worker.js §DOC)가
-- 검사·정리해서 factory_post_doc 으로 넣고, /trend/<id> 는 doc 가 있으면 템플릿으로 그린다.
-- 순서 무관: 이 SQL 전에 워커를 배포해도 코드·doc 없는 요청·기존 글 화면은 예전과 똑같음
--   (단, SQL 전에 코드·doc 를 보내면 factory_post_doc 이 없어서 등록 실패 응답이 남).

-- 1) 칸 추가 — 기존 글은 전부 null(지금 body_html 그대로 보임)
alter table public.board_posts add column if not exists menu_code text;    -- 예 GP.01.01
alter table public.board_posts add column if not exists cat_code text;     -- 예 02.03.01
alter table public.board_posts add column if not exists design_code text;  -- 틀 코드 예 B1 (지금은 저장만)
alter table public.board_posts add column if not exists doc jsonb;         -- 구조화된 글
alter table public.board_posts drop constraint if exists board_posts_doc_obj;
alter table public.board_posts add constraint board_posts_doc_obj check (doc is null or jsonb_typeof(doc) = 'object');

-- 2) 일반 사용자는 지금처럼 커뮤니티(free)에만, HTML·external_id·코드·doc 없이만 쓸 수 있음
--    (scripts/migrate_board_ai_trend.sql 의 같은 정책에 새 칸 4개 조건만 더함)
drop policy if exists "insert board_posts own" on public.board_posts;
create policy "insert board_posts own" on public.board_posts for insert to authenticated
  with check (auth.uid() = user_id and ((board = 'free' and body_html is null and external_id is null
    and menu_code is null and cat_code is null and design_code is null and doc is null) or public.is_board_admin()));

-- 3) 워커가 코드·doc 가 있는 요청일 때 부르는 함수 — factory_post 와 같은 동작(토큰 확인 → 같은 external_id 면 기존 id)에 칸 4개만 더 넣음.
--    기존 factory_post 는 그대로 둔다(코드·doc 없는 요청은 계속 그걸 씀).
create or replace function public.factory_post_doc(
  p_token text, p_external_id text, p_title text, p_body text, p_body_html text, p_tags text[],
  p_menu_code text, p_cat_code text, p_design_code text, p_doc jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_admin uuid; v_id bigint;
begin
  if p_token is null or not exists (
      select 1 from public.factory_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'bad_token' using errcode = '28000';
  end if;
  if p_doc is not null and jsonb_typeof(p_doc) <> 'object' then raise exception 'bad_doc'; end if;
  if p_external_id is not null then
    select id into v_id from public.board_posts where external_id = p_external_id;
    if v_id is not null then return json_build_object('id', v_id, 'dup', true); end if;
  end if;
  select user_id into v_admin from public.admins limit 1;
  if v_admin is null then raise exception 'no_admin'; end if;
  insert into public.board_posts(user_id, author_name, title, body, body_html, tags, board, external_id,
                                 menu_code, cat_code, design_code, doc)
  values (v_admin, 'AI 성단 지도', btrim(p_title), btrim(p_body), p_body_html, coalesce(p_tags, '{}'), 'ai_trend', p_external_id,
          nullif(btrim(p_menu_code), ''), nullif(btrim(p_cat_code), ''), nullif(btrim(p_design_code), ''), p_doc)
  returning id into v_id;
  return json_build_object('id', v_id, 'dup', false);
end $$;
revoke all on function public.factory_post_doc(text, text, text, text, text, text[], text, text, text, jsonb) from public;
grant execute on function public.factory_post_doc(text, text, text, text, text, text[], text, text, text, jsonb) to anon, authenticated;

-- 확인(실행 후):
-- select column_name, data_type from information_schema.columns where table_name = 'board_posts' and column_name in ('menu_code','cat_code','design_code','doc');
-- select proname from pg_proc where proname in ('factory_post', 'factory_post_doc');
