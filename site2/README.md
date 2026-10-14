# site2 — aigalaxy-map.com 새 뼈대 (2026-10-14)

기존 사이트(`C:\dev\10_projects\galaxy` 뿌리·`dist/`)는 손대지 않고, 이 폴더 안에서만 **깃허브의 완성된 디자인 템플릿(AstroWind) 위에 기존 기능을 복사**해 다시 만든 사이트. 배포는 사용자 지시 전까지 하지 않는다(로컬 빌드·확인만).

## 1. 템플릿 고르기

받아 둔 것(`C:\dev\25_templates\site\collected\`)은 관리자 대시보드(tabler·flowbite·mosaic·notus)와 디렉터리 SaaS(aigotools, Next+MongoDB), 블로그(tailwind-nextjs-starter-blog)뿐이라 "콘텐츠·매거진·디렉터리" 조건에 맞는 Astro 템플릿을 깃허브에서 3개 받아 비교했다(`site2/_candidates/`, `git clone --depth 1`, 2026-10-14 `gh api` 확인).

| 후보 | 스타 | 라이선스 | 최근 갱신 | 다국어 | 블로그 | 카드 목록 | 어두운 테마 | 비고 |
|---|---|---|---|---|---|---|---|---|
| **arthelokyo/astrowind** (옛 onwidget/astrowind) | 6,039 | MIT | 2026-09-12 | 설정값(언어 1개), 라우팅은 직접 | 있음(카테고리·태그·관련 글) | 있음(Features·Blog Grid·Bento 등 위젯 30여 개) | 있음(system/dark:only) | Astro 7 + Tailwind 4, 머리줄(메뉴·액션·모바일 토글)·꼬리말·히어로·FAQ·통계 위젯이 바로 있음 |
| satnaing/astro-paper | 5,117 | MIT | 2026-10-08 | 없음(i18n 폴더는 문구만) | 있음(개인 블로그형) | 글 목록만 | 있음 | 글 하나 읽는 데 최적, 디렉터리·카드 격자 없음 |
| timlrx/tailwind-nextjs-starter-blog | 10,559 | MIT | 2026-02-08 | 없음 | 있음 | 글 목록만 | 있음 | Next 15 + React 19 — `EXPORT=1`이면 정적 내보내기 가능하나 의존성이 무겁고(메모리 빠듯한 PC) 사이트가 블로그 전용 |
| (참고) saicaca/fuwari | 5,076 | MIT | 2026-03-10 | 있음 | 있음 | 글 목록만 | 있음 | Svelte 섞임, 블로그 전용이라 제외 |

**고른 것: AstroWind.** 이유 — (1) 메인(큰 기사+카드 격자+옆칸)·목록·글·FAQ·통계·CTA 같은 매거진 구성 요소가 템플릿 안에 이미 있어 "디자인은 템플릿 것 그대로"를 지키기 쉽다. (2) 정적 출력(Cloudflare Pages 무료)과 Tailwind 토큰(`--aw-*`) 한 벌로 색·글꼴을 바꾸면 전 화면이 같이 바뀐다. (3) 의존성이 가볍다(astro·tailwind·astro-icon만 설치, 228 패키지).

템플릿에서 가져온 파일: `src/assets/styles/tailwind.css`·`shadcn.css`, `components/ui/Button·Headline·WidgetWrapper`, `components/widgets/Header·Footer·FAQs·Features·Stats·CallToAction`, `components/common/ToggleMenu·Intersect·Breadcrumbs`, `types.d.ts`. `astrowind:config` 가상 모듈·astro-seo·limax·Fonts API 의존은 `src/config.ts`·`components/common/Metadata.astro`로 대신했다. 스크롤 등장 애니메이션(`intersect` 클래스)은 뺐다(FAQ가 캡처에서 빈칸으로 보였고, 글 중심 사이트엔 불필요).

디자인 토큰(`src/components/CustomStyles.astro`): 글꼴 Pretendard 한 벌, 배경 `rgb(8 9 10)`, 본문 `#e5ecf6`(명암비 ≈16:1), 흐린 글 66%(≈7:1), 링크 `#a89bf0`(≈8:1), 버튼 `#6d5ff5` 위 흰 글자(≈4.5:1). 어두운 테마 고정.

## 2. 폴더 구조

```
site2/
  package.json · astro.config.mjs · tsconfig.json
  scripts/prepare-map.mjs   기존 dist/map 앱·vendor·data·img·chrome.js 등을 public/ 으로 복사(사본에만 iframe 머리줄 숨김 한 줄)
  scripts/serve_local.py    dist 를 Cloudflare Pages 처럼 띄우는 로컬 서버(/privacy→privacy.html, 404.html)
  scripts/qa.py             Playwright QA(캡처·머리줄 수·가로 넘침·콘솔 오류·개발용 문구·내부 링크 상태)
  src/config.ts             사이트 이름·GA(G-DMZLKJKCFG)·애드센스(ca-pub-1632907475675251)·트렌드 API
  src/navigation.ts         머리줄·꼬리말 메뉴(한국어/영어)
  src/lib/data.ts           기존 데이터 읽기(ai_landscape·ai_enrichment·combos·top_rank·top10_relations·ai_pages.json·content/korea·Supabase 트렌드 글)
  src/layouts/              Layout(머리 메타) · PageLayout(머리줄 1벌 + 본문 + 꼬리말 + 모바일 하단 탭)
  src/layouts/home/         메인 시안 A·B·C — 같은 블록·같은 데이터, "배치만 다른" 파일
  src/components/blocks/      메인 블록(재사용): HeroMap · StatsRow · SectionNav(섹션 바로가기 고정 띠) · LatestTrend · RankBox · ToolList · KoreaLatest · CategoryChips(접기/더 보기) · Intro · SubscribeBox · SideMenu(B 전용)
  src/components/blocks/    그 밖의 기능 블록: SearchBox(자동완성) · MobileTabBar · TrendList(런타임 갱신) · KoreaArticle · KoreaList
  src/components/           CustomStyles(토큰) · Logo · ui/(Card·Button·Headline·SectionHead…) · widgets/(Header·Footer·FAQs…) · common/
  src/pages/                index(= config homeVariant) · home/[v]/(시안 비교, noindex) · trend/ · ai/ · ai/[slug]/ · category/ · category/[slug]/ · korea/ · korea/[slug]/ · en/korea/ · en/korea/[slug]/ · map/ · board/ · privacy · 404 · rss.xml · search-index.json
  public/                   _redirects(/en→/en/korea/) + prepare-map 이 채우는 map/app·vendor·data·img·chrome.js·galaxy-sw.js·galaxy_saas·manifest
  dist/                     빌드 결과(120쪽 + 사본 자산, 약 11MB)
  _candidates/              비교용 템플릿 3개(읽기용)
  _qa/                      캡처 PNG 36장 + qa_result.md / qa_result.json
```

## 3. 화면(기존 기능 복사 → 템플릿 모양)

| 화면 | 주소 | 내용 출처 |
|---|---|---|
| 메인 | `/` | 큰 기사=3D 지도 미리보기(`img/map_preview.jpg`) · 최신 AI 트렌드 글(빌드 때 Supabase 공개 읽기 + 열릴 때 `https://aigalaxy-map.com/api/trend/latest`로 갱신) · 이번 달 가장 밝은 별 1~10(`data/ai_top_rank.json`, canva→canva-magic-edit·perplexity-ai→perplexity 보정) · 한국 여행 최신 3(`content/korea`, publish ≤ 오늘) · 분야 성단 21 칩 |
| AI 트렌드 목록 | `/trend/` | 목록만 템플릿. 글은 기존 워커 화면 `https://aigalaxy-map.com/trend/<id>`로 연결(2단계에서 통합) |
| AI 목록·도구 74쪽·분야 21쪽 | `/ai/`, `/ai/<slug>/`, `/category/<slug>/` | 슬러그=`dist/data/ai_pages.json`(74), 본문 구성은 기존 `gen-seo-pages.mjs`와 같음(소개·기능·가격·조합·연동·대안·비교표·지도 속 위치·FAQ+FAQPage JSON-LD·3D 지도 링크). 대안은 `ai_landscape.json`의 `related_names`. 분야 21개는 `dist/category/` 폴더와 같게 |
| 한국 여행 | `/korea/`, `/korea/<slug>/`, `/en/korea/…` | `content/korea/<slug>/ko.html·en.html·meta.json` 그대로(사진·숫자 칸·표·차트·출처·hreflang·Article JSON-LD) |
| 3D 지도 | `/map/` | 기존 앱 사본 `/map/app/`을 머리줄 아래 전체 높이 iframe. `?q=`·`?ai=`·`#login`·`#board`는 iframe 주소로 전달 |
| 게시판 | `/board/` | iframe `/map/app/#board` |
| 개인정보 | `/privacy` | `privacy.html` 본문 그대로(영문 요약 제목만 h2로) |
| 404 | `404.html` | |

공통 머리줄 한 벌: 로고 · 메뉴 7개 · 검색창(→`/map/?q=`, 1280px 이상과 모바일 메뉴에서 표시) · 언어 한국어|English(한국 여행은 짝 페이지로, 그 외는 홈/영어 목록으로) · 로그인 G/K/N(→`/map/#login`). 영어는 `/en/…`(메뉴·꼬리말 영어). 모든 화면에 GA·애드센스 스크립트.

## 3-1. 메인 구조 — "템플릿만 바꾸면 전체가 따라오는" 틀 (10/14 2차)

- **데이터 한 곳**: `src/lib/data.ts`의 `homeData()`가 메인에 필요한 전부(도구 수·조합 수·분야 21·순위 10·여행 글·트렌드 글·도구 목록 20)를 돌려준다. 블록은 `d` 하나만 받는다.
- **블록 = 재사용 컴포넌트**(`src/components/blocks/`, 스킬 web-template-first 표준 구조: ①데이터 lib/data ②블록 components/blocks ③틀 layouts/home ④선택 config.ts): HeroMap(큰/작은) · StatsRow · SectionNav · LatestTrend(격자/줄) · RankBox(상자/가로 칩) · ToolList(줄/카드) · KoreaLatest(3/4열) · CategoryChips(접기) · Intro · SubscribeBox(상자/띠) · SideMenu.
- **시안 = 배치 파일**(`src/layouts/home/A·B·C.astro`): 블록 순서·열 구성만 다르다. `src/config.ts`의 `homeVariant: 'a'|'b'|'c'` 하나로 `/`가 바뀐다(지금 'a').
- **비교 주소(로컬)**: http://127.0.0.1:8792/home/a/ (매거진형: 큰 기사→숫자→격자+옆칸 순위) · http://127.0.0.1:8792/home/b/ (왼쪽 고정 사이드 메뉴+콘텐츠 격자, 참고 s3_shadcn_admin) · http://127.0.0.1:8792/home/c/ (가운데 큰 검색창+분야 칩+도구 카드 4열(첫 칸 2×2 지도)+순위 칩+최신 글, 참고 m3_grid). 캡처 `_qa/home-a_pc.png`·`home-b_pc.png`·`home-c_pc.png`(+`_mobile`).
- **화면 축소**: 기본 글자 16→14.5px(`html{font-size}`; 손전화 15px), 컨테이너 최대 폭 1200px(`--container-7xl`), 제목 한 단계씩(h1 2xl/3xl, 구역 제목 xl/2xl), 섹션 여백 py-7/9, 카드 p-4/5. 명암비는 토큰 그대로(본문 16:1·흐린 글 7:1·링크 8:1·버튼 4.5:1).
- **고정 머리줄**: 머리줄 sticky(스크롤 1500px 뒤 top 0 확인) + 메인에 섹션 바로가기 띠(SectionNav, 머리줄 바로 아래 sticky, 보고 있는 섹션 표시). 긴 섹션은 접음(분야 칩 12개+더 보기, 도구 목록 10행).
- **덤**: 검색창 자동완성(`/search-index.json` 731개, 이름·영문명 앞글자→포함 순, 안내 페이지 있으면 `/ai/<slug>/` 없으면 `/map/?ai=`; 머리줄·C 시안·404 공용) · 메인 "AI 도구 목록 10행"(조합 많은 순) · 모바일 하단 고정 탭(홈·검색·트렌드·도구, "검색"은 메뉴 열고 검색창에 초점) · 404에 검색창 · 이미지 lazy·크기 지정, Pretendard 동적 서브셋(CDN).

## 4. 로컬 실행

```powershell
cd C:\dev\10_projects\galaxy\site2
npm install              # 처음 한 번
npm run build            # prepare-map → astro build → dist/
npm run serve            # http://127.0.0.1:8792/  (python -X utf8 scripts/serve_local.py 8792)
npm run qa               # Playwright 캡처·표 → _qa/ (시안 a/b/c 포함 19화면×2폭)
```

배포 명령은 package.json 에서 뺐다. 사용자가 지시하면 `npx wrangler pages deploy dist --project-name ai-galaxy --branch site2 --commit-dirty=true`(미리보기 가지)로 올린다. 미리보기용 noindex 는 `$env:SITE2_PREVIEW='1'; npm run build`.

## 5. QA 결과 (로컬 http://127.0.0.1:8792, Playwright 크로미움 1개)

표는 `_qa/qa_result.md` 를 그대로 옮긴 것. 캡처는 `_qa/<화면>_pc.png`(1440)·`_qa/<화면>_mobile.png`(390).

| 화면 | 주소 | 폭 | 상태 | header 수 | 가로 넘침 | h1 수 | 콘솔 오류(자체/외부) | 개발용 문구 | 캡처 |
|---|---|---|---|---|---|---|---|---|---|
| home | / | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home_pc.png |
| home-a | /home/a/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-a_pc.png |
| home-b | /home/b/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-b_pc.png |
| home-c | /home/c/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-c_pc.png |
| trend | /trend/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | trend_pc.png |
| ai | /ai/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai_pc.png |
| ai-claude | /ai/claude/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai-claude_pc.png |
| ai-gpt | /ai/gpt/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai-gpt_pc.png |
| category | /category/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | category_pc.png |
| category-foundation | /category/foundation-models/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | category-foundation_pc.png |
| korea | /korea/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea_pc.png |
| korea-seoraksan | /korea/seoraksan/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea-seoraksan_pc.png |
| korea-gwangjin | /korea/gwangjin-beach/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea-gwangjin_pc.png |
| en-korea | /en/korea/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | en-korea_pc.png |
| en-korea-seoraksan | /en/korea/seoraksan/ | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | en-korea-seoraksan_pc.png |
| map | /map/ | pc | 200 | 1 | 없음 | 0 | 0/0 | 없음 | map_pc.png |
| board | /board/ | pc | 200 | 1 | 없음 | 0 | 0/0 | 없음 | board_pc.png |
| privacy | /privacy | pc | 200 | 1 | 없음 | 1 | 0/0 | 없음 | privacy_pc.png |
| 404 | /no-such-page/ | pc | 404 | 1 | 없음 | 1 | 0/2 | 없음 | 404_pc.png |
| home | / | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home_mobile.png |
| home-a | /home/a/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-a_mobile.png |
| home-b | /home/b/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-b_mobile.png |
| home-c | /home/c/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | home-c_mobile.png |
| trend | /trend/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | trend_mobile.png |
| ai | /ai/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai_mobile.png |
| ai-claude | /ai/claude/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai-claude_mobile.png |
| ai-gpt | /ai/gpt/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | ai-gpt_mobile.png |
| category | /category/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | category_mobile.png |
| category-foundation | /category/foundation-models/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | category-foundation_mobile.png |
| korea | /korea/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea_mobile.png |
| korea-seoraksan | /korea/seoraksan/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea-seoraksan_mobile.png |
| korea-gwangjin | /korea/gwangjin-beach/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | korea-gwangjin_mobile.png |
| en-korea | /en/korea/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | en-korea_mobile.png |
| en-korea-seoraksan | /en/korea/seoraksan/ | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | en-korea-seoraksan_mobile.png |
| map | /map/ | mobile | 200 | 1 | 없음 | 0 | 0/0 | 없음 | map_mobile.png |
| board | /board/ | mobile | 200 | 1 | 없음 | 0 | 0/0 | 없음 | board_mobile.png |
| privacy | /privacy | mobile | 200 | 1 | 없음 | 1 | 0/0 | 없음 | privacy_mobile.png |
| 404 | /no-such-page/ | mobile | 404 | 1 | 없음 | 1 | 0/2 | 없음 | 404_mobile.png |

## 내부 링크 상태 — 확인 122개, 200 아님 0개


## 콘솔 오류 상세

- [외부] 404/pc: HTTP 404 http://127.0.0.1:8792/no-such-page/
- [외부] 404/pc: Failed to load resource: the server responded with a status of 404 (Not Found)
- [외부] 404/mobile: HTTP 404 http://127.0.0.1:8792/no-such-page/
- [외부] 404/mobile: Failed to load resource: the server responded with a status of 404 (Not Found)

추가 확인(눌러 봄): 머리줄 높이 1024/1280/1440 폭 모두 한 줄(한국어·영어), 스크롤 1500px 뒤 머리줄 top 0(고정)·섹션 띠가 머리줄 바로 아래(62px)·현재 섹션 표시, 검색창에 "클로" 입력 → 제안 1개 → 클릭 → /ai/claude/ 이동, 분야 "+9개 더 보기" → 21칩, 모바일 하단 탭 "검색" → 메뉴 열리고 검색창 초점, 모바일 메뉴 토글 열림, FAQ `<details>` 3개 표시, `/map/`에서 지도 앱이 iframe 안에 옛 머리줄 없이 뜸(`_qa/map_pc.png`). 모바일 전체 캡처에는 하단 고정 탭이 화면 중간에 찍힘(전체 캡처 특성, 실제는 바닥 고정 — `_qa/home-c_mobile_viewport.png` 참고).

## 6. 못 한 것·미확인

- **배포 안 함**(사용자 지시). 미리보기 주소 없음.
- **iframe 안 로그인(G/K/N → `/map/#login`)**: 구글 로그인 화면은 iframe 안에서 열리지 않는 것이 보통이라 실제 로그인은 미확인. 2단계(게시판·로그인 분리)에서 풀어야 함.
- **`/trend/<id>` 글 화면**은 여전히 기존 워커가 그림(site2 안에 없음). site2를 본 사이트로 합칠 때 `_worker.js`를 `dist/`에 같이 두어야 `/api/*`·`/trend/*`·RSS 병합이 된다. site2의 `rss.xml`은 고정 페이지+여행 글+빌드 시점 트렌드 글이라 워커의 RSS 병합과 중복 처리를 맞춰야 함.
- **분야 도구 수**가 옛 페이지와 조금 다름(예: 이미지·영상 생성 32→24). 옛 페이지는 Supabase `ai_tools`(747개, 나중에 16개 추가됨)로 만들었고 site2는 지시대로 `data/ai_landscape.json`(731)을 썼다. 합칠 때 어느 쪽을 원본으로 할지 결정 필요.
- 지도 앱 사본 안의 네이버 로그인 시작 주소 `/api/auth/naver/start`는 워커가 있어야 동작(로컬에선 404).
- 콘솔 오류 0은 로컬 기준. 실서버에선 GA·애드센스·Supabase 실시간 연결이 추가되므로 다시 확인.
