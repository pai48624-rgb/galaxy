// 3D 지도 앱(기존 dist/map/index.html)과 그 앱이 쓰는 뿌리 자산(vendor·data·img·chrome.js·galaxy-sw.js·galaxy_saas·manifest)을
// site2/public 으로 복사한다. 기존 파일은 손대지 않고, 사본(public/map/app/index.html)에만
// "iframe 안에서 열렸을 때 옛 머리줄·메뉴를 숨기는" 한 줄을 덧붙인다(머리줄은 site2 것 하나만 보이게).
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE2 = dirname(dirname(fileURLToPath(import.meta.url)));
const GALAXY = dirname(SITE2);
const DIST = join(GALAXY, 'dist');
const PUB = join(SITE2, 'public');

const need = ['map/index.html', 'vendor', 'data', 'img', 'chrome.js', 'galaxy-sw.js', 'galaxy_saas', 'manifest.webmanifest'];
for (const rel of need) if (!existsSync(join(DIST, rel))) throw new Error(`[prepare-map] 원본이 없음: dist/${rel}`);

for (const rel of ['vendor', 'data', 'img', 'galaxy_saas']) {
  rmSync(join(PUB, rel), { recursive: true, force: true });
  cpSync(join(DIST, rel), join(PUB, rel), { recursive: true });
}
for (const f of ['chrome.js', 'galaxy-sw.js', 'manifest.webmanifest']) cpSync(join(DIST, f), join(PUB, f));
// 배포 필수 루트 파일(2026-10-14 점검에서 빠져 있던 것): 애드센스 ads.txt, 네이버 소유 확인 2개, IndexNow 키. 원본은 galaxy 루트.
for (const f of ['ads.txt', 'naver11527827ffc572c4fc7337b69af3d8a9.html', 'naverf7a773b489c1dab0e775a86c8ababb3a.html', '3836b201693766a26e82d00418c13d65.txt']) {
  const src = join(GALAXY, f); if (existsSync(src)) cpSync(src, join(PUB, f)); else console.warn('[prepare-map] 루트 파일 없음:', f);
}
// robots.txt: 주소는 .env PUBLIC_SITE_URL 한 곳. 검색엔진에 등록된 옛 사이트맵 이름 4개 그대로(10/14)
const _envTxt = existsSync(join(SITE2, '.env')) ? readFileSync(join(SITE2, '.env'), 'utf8') : '';
const SITE_URL = ((process.env.PUBLIC_SITE_URL || (_envTxt.match(/^PUBLIC_SITE_URL=(.+)$/m) || [])[1] || '').trim()).replace(/\/$/, '');
if (!SITE_URL) throw new Error('[prepare-map] PUBLIC_SITE_URL 없음(.env)');
writeFileSync(join(PUB, 'robots.txt'), ['User-agent: *', 'Allow: /', 'Disallow: /frame-template', 'Disallow: /home/', 'Disallow: /map/app/',
  ...['sitemap.xml', 'sitemap-ai.xml', 'sitemap-trend.xml', 'sitemap-korea.xml'].map((f) => `Sitemap: ${SITE_URL}/${f}`), ''].join(String.fromCharCode(10)));
// chrome.js 는 원본 그대로(상대 주소 /api/trend/latest — 같은 출처 규칙, src/env.ts)

// 지도 앱 사본: /map/app/index.html (site2의 /map/ 은 템플릿 머리줄 + iframe 껍데기)
mkdirSync(join(PUB, 'map', 'app'), { recursive: true });
let html = readFileSync(join(DIST, 'map', 'index.html'), 'utf8');
const EMBED = `<script>if(self!==top)document.documentElement.classList.add("in-site2");</script><style>.in-site2 #boardOpenBtn,.in-site2 .side-trend,.in-site2 .side-ailist{display:none!important}.in-site2 .site-chrome{display:none!important}.in-site2 .ticker{display:none!important}</style>`;
if (!html.includes('in-site2')) html = html.replace('</head>', `${EMBED}</head>`);
// 앱 안의 /map/ 자기 링크(검색 폼·메뉴)는 사본 주소로
html = html.replace(/action="\/map\/"/g, 'action="/map/app/"');
// 로그인 자동 만료(2026-10-16): 지도 앱도 supabase 앞에 /session-limit.js (원본 20_modules/session_limit)
if (!html.includes('session-limit.js')) html = html.replace(/<script src="\/?vendor\/supabase\.min\.js"><\/script>/, (m) => '<script src="/session-limit.js"></script>' + m);
writeFileSync(join(PUB, 'map', 'app', 'index.html'), html);

// 미리보기 전용: 검색엔진 제외(_headers). 본 사이트로 합칠 땐 SITE2_PREVIEW 없이 빌드하면 안 만듦.
const headersPath = join(PUB, '_headers');
if (process.env.SITE2_PREVIEW === '1') writeFileSync(headersPath, '/*\n  X-Robots-Tag: noindex\n');
else if (existsSync(headersPath)) rmSync(headersPath);

// 워커(트렌드 글·API·RSS·네이버 로그인): site2/worker/_worker.js(본 사이트 워커 사본+틀 치환 수정) → public/_worker.js → dist/_worker.js (2026-10-14)
const workerSrc = join(SITE2, 'worker', '_worker.js');
if (existsSync(workerSrc)) cpSync(workerSrc, join(PUB, '_worker.js'));
console.log('[prepare-map] 복사 완료:', need.join(', '));
