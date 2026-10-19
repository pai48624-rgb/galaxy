// site2 — aigalaxy-map.com 새 뼈대. AstroWind(MIT) 템플릿 구성에서 쓰는 것만 남김.
// 정적 출력(Cloudflare Pages용). build.format 'preserve':
//   pages/privacy.astro → /privacy.html (기존 주소 /privacy 유지)
//   pages/ai/[slug]/index.astro → /ai/<slug>/index.html
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://aigalaxy-map.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'preserve' },
  integrations: [
    icon({ include: { tabler: ['*'] } }),
    sitemap({ filter: (p) => !/\/board\/?$|\/404|\/frame-template|\/frame-korea|\/home\/[abc](\/|$)|\/map\/app\//.test(p) }),  // 게시판·404·글 틀·시안·지도 앱 사본 제외, /map/ 은 서버처럼 색인(10/14)
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias: { '~': path.resolve(__dirname, './src') } },
  },
});
