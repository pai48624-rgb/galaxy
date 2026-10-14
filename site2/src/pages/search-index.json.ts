// 검색창 자동완성용 색인(빌드 때 한 번 생성, 약 60KB). 로컬 자료만 씀(유료 API 없음).
import type { APIRoute } from 'astro';
import { searchIndex } from '~/lib/data';
export const GET: APIRoute = () => new Response(JSON.stringify(searchIndex()), { headers: { 'content-type': 'application/json; charset=utf-8' } });
