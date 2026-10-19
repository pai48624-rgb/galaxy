// 머리줄·꼬리말 메뉴(한국어/영어). 영어 메뉴는 2026-10-14부터 /en/… 영어판 주소로. 기존 사이트 공통 껍데기(scripts/site-chrome.mjs)의 메뉴 항목을 그대로 옮김.
import { R } from '~/lib/routes';
import { loadTools, categories } from '~/lib/data';
// 메뉴 숫자 = 실제 데이터 개수(10/14: 숫자를 박아 두어 747로 바뀐 뒤에도 731로 남던 문제)
const nTools = () => loadTools().length, nCats = () => categories().length;
export type Lang = 'ko' | 'en';

export const headerLinks = (lang: Lang) =>
  lang === 'en'
    ? [
        { text: '3D Galaxy Map', href: R.map('en'), icon: 'tabler:sparkles' },
        { text: 'Home', href: R.home('en') },
        { text: 'AI Trends', href: R.trend('en') },
        { text: `AI Tools ${nTools()}`, href: R.ai('en') },
        { text: `Fields ${nCats()}`, href: R.category('en') },
        { text: 'Korea Travel', href: R.korea('en') },
        { text: 'Board · Chat', href: R.board('en') },
      ]
    : [
        { text: '3D 성단 지도', href: R.map(), icon: 'tabler:sparkles' },
        { text: '홈', href: R.home() },
        { text: 'AI 트렌드', href: R.trend() },
        { text: `AI 목록 ${nTools()}`, href: R.ai() },
        { text: `분야 ${nCats()}`, href: R.category() },
        { text: '한국 여행', href: R.korea() },
        { text: '게시판 · 채팅', href: R.board() },
      ];

export const footerData = (lang: Lang) =>
  lang === 'en'
    ? {
        links: [
          { title: 'Explore', links: [{ text: '3D Galaxy Map', href: R.map('en') }, { text: 'AI Trends', href: R.trend('en') }, { text: 'AI Tools', href: R.ai('en') }, { text: 'Fields', href: R.category('en') }, { text: 'AI Combos', href: R.combos('en') }, { text: 'Pricing', href: R.pricing('en') }, { text: 'Top 10', href: R.rank('en') }, { text: 'Search', href: R.search('en') }] },
          { title: 'Travel', links: [{ text: 'Korea Travel (English)', href: R.korea('en') }, { text: 'Korea Travel (in Korean)', href: R.korea() }] },
          { title: 'Community', links: [{ text: 'Board', href: R.board('en') }, { text: 'Chat', href: R.chat() }, { text: 'Sign in', href: R.login() }] },
        ],
        secondaryLinks: [{ text: 'About', href: R.about('en') }, { text: 'Contact', href: R.contact('en') }, { text: 'Privacy', href: R.privacy('en') }, { text: 'RSS', href: R.rss() }, { text: 'Sitemap', href: '/sitemap-index.xml' /* 검색엔진 파일 */ }],
        footNote: '© 2026 AI Galaxy Map · aigalaxy-map.com',
      }
    : {
        links: [
          { title: '둘러보기', links: [{ text: '3D 성단 지도', href: R.map() }, { text: 'AI 트렌드', href: R.trend() }, { text: 'AI 목록', href: R.ai() }, { text: '분야 성단', href: R.category() }, { text: 'AI 조합 추천', href: R.combos() }, { text: '요금제별 AI', href: R.pricing() }, { text: '가장 밝은 별 TOP 10', href: R.rank() }, { text: 'AI 검색', href: R.search() }] },
          { title: '여행', links: [{ text: '한국 여행', href: R.korea() }, { text: 'Korea Travel (English)', href: R.korea('en') }] },
          { title: '함께', links: [{ text: '게시판', href: R.board() }, { text: '채팅', href: R.chat() }, { text: '로그인', href: R.login() }] },
        ],
        secondaryLinks: [{ text: '사이트 소개', href: R.about() }, { text: '문의', href: R.contact() }, { text: '개인정보 처리방침', href: R.privacy() }, { text: 'RSS', href: R.rss() }, { text: '사이트맵', href: '/sitemap-index.xml' /* 검색엔진 파일 */ }],
        footNote: '© 2026 AI 성단 지도 · aigalaxy-map.com',
      };
