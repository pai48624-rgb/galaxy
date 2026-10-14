import { SITE_URL } from './env';
// 사이트 공통 설정 — astrowind의 config.yaml + 'astrowind:config' 가상 모듈을 이 파일 하나로 대신함.
export const SITE = {
  name: 'AI 성단 지도',
  nameEn: 'AI Galaxy Map',
  site: SITE_URL,
};
export const UI = { theme: 'dark:only' }; // 어두운 테마 고정(사용자 지시)
// 메인(/) 시안 — 이 값 하나만 바꾸면 메인이 바뀜. 각 시안은 /home/a/ · /home/b/ · /home/c/ 로 따로 볼 수 있음.
//   a = 매거진형(큰 기사+카드+옆칸) · b = 왼쪽 고정 사이드 메뉴+콘텐츠 격자(디렉터리형) · c = 검색 중심 격자형
export const homeVariant: 'a' | 'b' | 'c' = 'b';  // 2026-10-14 사용자 선택: B(왼쪽 고정 메뉴 + 격자). 이 틀을 모든 화면이 같이 쓴다(PageLayout).
export const GA_ID = 'G-DMZLKJKCFG';
export const ADSENSE_CLIENT = 'ca-pub-1632907475675251';
export const ICON_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a89bf0' d='M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'/%3E%3C/svg%3E";
// 트렌드 글 API(기존 워커). site2 안에는 워커가 없으므로 절대 주소로 부름.
export { TREND_API } from './env';  // 상대 주소(로컬=로컬, 서버=서버)
// 미리보기 빌드(SITE2_PREVIEW=1)면 모든 화면 noindex — 본 사이트로 합칠 때는 환경변수 없이 빌드
export const IS_PREVIEW = process.env.SITE2_PREVIEW === '1';
