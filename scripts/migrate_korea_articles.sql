-- 한국 여행 글 = DB 글 칸 + 템플릿 (2026-10-19) — Supabase SQL Editor에서 사람이 1회 실행. 여러 번 실행해도 안전.
-- 사용자 원칙 "대본 텍스트·이미지만 DB에 저장하고 화면은 전부 템플릿이 그린다".
-- 글 공장이 POST /api/korea 로 글 칸(doc — AI 트렌드와 같은 공통 글 구조)을 보내면 워커(site2/worker/_worker.js §KOREA)가 검사·정리 후
-- factory_korea 로 저장하고, /korea/<slug>/ · /en/korea/<slug>/ · 목록 · sitemap-korea.xml 은 이 표를 읽어 사이트 공통 틀로 그린다.
-- 옛 저장 화면(site_pages)은 지우지 않는다 — 워커가 이 표 → 정적 빌드 → site_pages 순서로 본다.
-- 순서 무관: 이 SQL 전에 워커를 배포해도 한국 여행 화면은 예전(site_pages → 정적)과 똑같음. 표가 비어 있어도 목록·사이트맵은 예전 그대로.
-- 기존 글 옮기기: node scripts/korea_articles_to_sql.mjs 가 만든 SQL 파일을 이 다음에 실행.

-- 1) 표 — 글 한 편 = (slug, lang) 한 줄
create table if not exists public.korea_articles (
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  lang text not null check (lang in ('ko', 'en')),
  title text not null,
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),   -- 공통 글 구조(chip·title·subtitle·hero·tiles·intro·sections·cta·sources …)
  menu_code text,      -- 예 GP.01.01
  cat_code text,       -- 예 02.03.01
  design_code text,    -- 틀 코드 예 B1 (지금은 저장만)
  publish_date date not null,                                -- 공개일(한국 날짜) — 이 날 전에는 안 보임
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),  -- [{title, url?, date}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slug, lang)
);
create index if not exists korea_articles_publish on public.korea_articles (lang, publish_date desc);

-- 2) 읽기: 누구나, 단 공개일이 지난 글만(예약 글은 REST로도 안 보임). 쓰기는 아래 함수로만.
alter table public.korea_articles enable row level security;
drop policy if exists korea_articles_read on public.korea_articles;
create policy korea_articles_read on public.korea_articles for select to anon, authenticated
  using (publish_date <= (now() at time zone 'Asia/Seoul')::date);

-- 3) 공장 저장 함수 — factory_post 와 같은 토큰 확인(factory_tokens 의 sha256). 같은 slug·lang 이면 갱신(처음 만든 날은 그대로)
create or replace function public.factory_korea(
  p_token text, p_slug text, p_lang text, p_title text, p_doc jsonb,
  p_menu_code text, p_cat_code text, p_design_code text, p_publish_date date, p_sources jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_old boolean;
begin
  if p_token is null or not exists (
      select 1 from public.factory_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'bad_token' using errcode = '28000';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'bad_doc'; end if;
  if p_publish_date is null then raise exception 'bad_publish_date'; end if;
  select true into v_old from public.korea_articles where slug = p_slug and lang = p_lang;
  insert into public.korea_articles(slug, lang, title, doc, menu_code, cat_code, design_code, publish_date, sources)
  values (p_slug, p_lang, btrim(p_title), p_doc, nullif(btrim(p_menu_code), ''), nullif(btrim(p_cat_code), ''), nullif(btrim(p_design_code), ''),
          p_publish_date, coalesce(p_sources, '[]'::jsonb))
  on conflict (slug, lang) do update set title = excluded.title, doc = excluded.doc, menu_code = excluded.menu_code, cat_code = excluded.cat_code,
    design_code = excluded.design_code, publish_date = excluded.publish_date, sources = excluded.sources, updated_at = now();
  return json_build_object('ok', true, 'slug', p_slug, 'lang', p_lang, 'updated', coalesce(v_old, false));
end $$;
revoke all on function public.factory_korea(text, text, text, text, jsonb, text, text, text, date, jsonb) from public;
grant execute on function public.factory_korea(text, text, text, text, jsonb, text, text, text, date, jsonb) to anon, authenticated;

-- 확인(실행 후):
-- select column_name, data_type from information_schema.columns where table_name = 'korea_articles' order by ordinal_position;
-- select proname from pg_proc where proname = 'factory_korea';
-- select slug, lang, publish_date, title from public.korea_articles order by publish_date desc, slug;
-- 되돌리기(필요할 때만): drop function public.factory_korea(text, text, text, text, jsonb, text, text, text, date, jsonb); drop table public.korea_articles;
--   → 워커는 표가 없으면 예전(site_pages → 정적) 순서로 돌아감
