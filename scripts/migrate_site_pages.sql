-- 공장이 만든 화면(한국 여행 글 등)을 배포 없이 바로 올리는 저장소 (2026-10-14)
-- 쓰기: factory_page(토큰 해시 확인 — factory_post와 같은 factory_tokens 사용)
-- 읽기: 사이트 워커(site2/worker/_worker.js §PAGES)가 anon 키로 path 하나씩 읽어 그대로 보여 줌
-- 적용: Supabase SQL 편집기에 붙여 넣고 실행(한 번). 기존 표·글은 건드리지 않고 새로 더하기만 함.
create table if not exists public.site_pages (
  path text primary key,
  html text not null,
  content_type text not null default 'text/html; charset=utf-8',
  source text,
  updated_at timestamptz not null default now()
);
alter table public.site_pages enable row level security;
drop policy if exists site_pages_read on public.site_pages;
create policy site_pages_read on public.site_pages for select to anon, authenticated using (true);

create or replace function public.factory_page(p_token text, p_path text, p_html text, p_content_type text default null, p_source text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if p_token is null or not exists (
      select 1 from public.factory_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'bad_token' using errcode = '28000';
  end if;
  -- 올릴 수 있는 주소만: 한국 여행 글·목록(한·영)과 그 사이트맵
  if p_path !~ '^/(en/)?korea/([a-z0-9][a-z0-9-]{0,80}/)?$' and p_path <> '/sitemap-korea.xml' then
    raise exception 'bad_path';
  end if;
  if p_html is null or length(p_html) < 200 or length(p_html) > 3000000 then
    raise exception 'bad_size';
  end if;
  insert into public.site_pages(path, html, content_type, source, updated_at)
  values (p_path, p_html, coalesce(p_content_type, 'text/html; charset=utf-8'), p_source, now())
  on conflict (path) do update set html = excluded.html, content_type = excluded.content_type, source = excluded.source, updated_at = now();
  return json_build_object('ok', true, 'path', p_path);
end $$;
revoke all on function public.factory_page(text, text, text, text, text) from public;
grant execute on function public.factory_page(text, text, text, text, text) to anon, authenticated;
