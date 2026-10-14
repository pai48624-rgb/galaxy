// /rss.xml — 기존 build-dist.mjs 가 만들던 정적 RSS(고정 페이지)를 그대로 + 한국 여행 글 + 빌드 시점 AI 트렌드 글.
// 본 사이트로 합칠 때 워커(rssFeed)가 이 파일에 트렌드 최신 글을 덧붙이므로 중복 처리는 2단계에서 맞춘다.
import type { APIRoute } from 'astro';
import { koreaArticles, trendPosts, loadTools } from '~/lib/data';
import { esc } from '~/utils/utils';

import { SITE_URL as SITE } from '~/env';
export const GET: APIRoute = async () => {
  const n = loadTools().length;
  const fixed = [
    ['/', 'AI 성단 지도 — 전세계 AI 관계형 지도', `AI 도구 ${n}개를 성단으로 묶은 3D 관계형 지도와 AI 트렌드 글, 한국 여행 안내.`],
    ['/trend/', 'AI 트렌드', '요즘 뜨는 AI 도구 순위·요금·소식 정리.'],
    ['/ai/', 'AI 서비스 한눈에 보기', `전세계 AI ${n}개를 분야별로 정리. 가격과 대안, 조합까지.`],
    ['/category/', '분야별 AI 성단', '분야별 AI 도구 목록.'],
    ['/korea/', '한국 여행 — 공공데이터로 정리한 가기 전 체크', '주차·응급실·숙소·수질 같은 공공데이터로 정리한 한국 여행지 안내.'],
    ['/en/korea/', 'Korea travel — before-you-go guides from public data', 'Guides to places in Korea built from public data.'],
  ];
  const items: string[] = fixed.map(([p, t, d]) => `<item><title>${esc(t)}</title><link>${SITE}${p}</link><guid>${SITE}${p}</guid><description>${esc(d)}</description></item>`);
  for (const { m } of koreaArticles()) {
    items.push(`<item><title>${esc(m.title.ko)}</title><link>${SITE}/korea/${m.slug}/</link><guid>${SITE}/korea/${m.slug}/</guid><pubDate>${new Date(m.publish + 'T00:00:00+09:00').toUTCString()}</pubDate><description>${esc(m.description.ko)}</description></item>`);
  }
  for (const p of await trendPosts()) {
    items.push(`<item><title>${esc(p.title)}</title><link>${SITE}/trend/${p.id}</link><guid>${SITE}/trend/${p.id}</guid><pubDate>${new Date(p.created_at).toUTCString()}</pubDate><description>${esc(p.summary)}</description></item>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>AI 성단 지도</title><link>${SITE}/</link><description>전세계 AI 관계형 지도와 AI 트렌드, 한국 여행</description><language>ko</language>${items.join('')}</channel></rss>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
