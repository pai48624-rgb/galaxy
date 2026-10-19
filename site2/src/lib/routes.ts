// 링크 관리 한 곳(2026-10-14 사용자: "링크 하나하나 박지 마라").
// 화면 코드는 주소 문자열을 직접 쓰지 않고 여기 함수만 부른다. 언어(ko/en)·영어판 유무는 lp()가 처리, 주소는 전부 같은 출처 상대 경로.
import { lp, type Lang } from '~/i18n/tr';

const P = {
  home: '/', map: '/map/', board: '/board/', trend: '/trend/', ai: '/ai/', category: '/category/',
  combos: '/combos/', pricing: '/pricing/', rank: '/rank/', search: '/search/', korea: '/korea/', privacy: '/privacy', about: '/about', contact: '/contact',
} as const;

export const R = {
  home: (l: Lang = 'ko') => (l === 'en' ? '/en/' : P.home),
  map: (l: Lang = 'ko', q?: { ai?: string; q?: string }) => lp(P.map, l) + (q?.ai ? `?ai=${encodeURIComponent(q.ai)}` : q?.q ? `?q=${encodeURIComponent(q.q)}` : ''),
  board: (l: Lang = 'ko') => lp(P.board, l),
  login: () => '#login',
  chat: () => '#chat',   // 사이트 공통 실시간 채팅 창 열기(components/chat/chat.ts 가 가로챔)
  trend: (l: Lang = 'ko') => lp(P.trend, l),
  // 한국어 글은 서버(워커)가 그림. 영어는 번역된 글만 정적 /en/trend/<id>/ (없으면 한국어 원문 주소 그대로 — lp 가 판단)
  trendPost: (id: number | string, l: Lang = 'ko') => lp(`/trend/${id}`, l),
  ai: (l: Lang = 'ko', slug?: string) => lp(slug ? `${P.ai}${slug}/` : P.ai, l),
  category: (l: Lang = 'ko', slug?: string) => lp(slug ? `${P.category}${slug}/` : P.category, l),
  combos: (l: Lang = 'ko', cat?: string) => lp(cat ? `${P.combos}${cat}/` : P.combos, l),
  pricing: (l: Lang = 'ko', group?: string) => lp(group ? `${P.pricing}${group}/` : P.pricing, l),
  rank: (l: Lang = 'ko') => lp(P.rank, l),
  search: (l: Lang = 'ko', q?: string) => lp(P.search, l) + (q ? `?q=${encodeURIComponent(q)}` : ''),
  korea: (l: Lang = 'ko', slug?: string) => (l === 'en' ? '/en/korea/' : P.korea) + (slug ? `${slug}/` : ''),
  privacy: (l: Lang = 'ko') => lp(P.privacy, l),
  about: (l: Lang = 'ko') => lp(P.about, l),
  contact: (l: Lang = 'ko') => lp(P.contact, l),
  rss: () => '/rss.xml',
};
