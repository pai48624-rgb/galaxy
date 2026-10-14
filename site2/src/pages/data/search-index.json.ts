// /data/search-index.json — AI 검색 화면(/search/)용 색인. 빌드 때 엔드포인트로 생성(2026-10-14).
// 전엔 frontmatter에서 public/data에 파일을 썼는데 Astro가 public/을 먼저 복사해 결과물에 안 들어갔음 → 엔드포인트로 바꿈.
import type { APIRoute } from 'astro';
import { searchIndex2 } from '~/lib/data2';
export const GET: APIRoute = () => new Response(JSON.stringify(searchIndex2()), { headers: { 'content-type': 'application/json; charset=utf-8' } });
