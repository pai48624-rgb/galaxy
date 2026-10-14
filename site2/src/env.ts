// 주소 규칙(2026-10-14 사용자: "로컬은 로컬만, 서버는 서버만 — 링크를 하나하나 박지 마라")
// 1) 사이트 안 링크·API는 전부 "같은 출처 상대 주소"(/trend/25, /api/...). 로컬(wrangler pages dev)과 서버(Cloudflare Pages)가
//    같은 워커·같은 경로를 쓰므로 로컬에서 누르면 로컬, 서버에서 누르면 서버로 간다. 화면 코드에 https://… 를 쓰지 않는다.
// 2) 절대 주소가 꼭 필요한 곳(canonical·OG·사이트맵·RSS·JSON-LD — 검색엔진용)만 SITE_URL 하나를 쓴다. .env 의 PUBLIC_SITE_URL 로 바꿀 수 있다.
export const SITE_URL: string = (import.meta.env.PUBLIC_SITE_URL as string) || 'https://aigalaxy-map.com';
export const API = '/api';                       // 워커 프록시(Supabase·트렌드·네이버 로그인)
export const TREND_API = `${API}/trend/latest`;
