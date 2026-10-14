# site2 영어판 (/en/…) — 2026-10-14

사용자 지시: "우리 기본이 다국어였는데, 전부 번역해서 영문 사이트 선택 시 번역이 다 되어서 나오게." 로컬 빌드·확인만 했고 서버 배포는 하지 않았다.

## 1. 구조

| 무엇 | 어디 | 설명 |
|---|---|---|
| 영어 주소 | `src/pages/en/**` | 한국어 화면 파일을 `lang="en"`으로 그대로 쓰는 몇 줄짜리 연결 파일. 화면 코드는 한 벌(한국어 파일이 `Astro.props.lang`을 받음). 예외: `/en/board/`는 게시판 화면을 복사해 고정 문구만 영어로 바꿈(아래 남은 일 참고) |
| 화면 고정 문구 | `src/i18n/ui.ts` | 섹션 제목·버튼·안내 문장 한국어/영어 두 벌(영어 약 250개). 숫자 들어가는 문구는 함수 |
| 데이터 번역 | `src/i18n/cache/{tools,combos,rank,privacy,trend}.json` | 원문→번역. 빌드는 이 캐시만 읽음. 이미 데이터에 있는 영어(name_en·desc_en·category_en·subcategory_en)를 먼저 씀 |
| 번역 도우미 | `src/i18n/tr.ts` | `tx()`(캐시 조회), `toolName/toolDesc/toolCat…`, `lp()`·`hasEn()`(영어판 있는 경로) |
| 주소 | `src/lib/routes.ts`의 `R` | 화면 코드는 주소 문자열 대신 R 함수만 씀(코디네이터 규칙) |
| hreflang | `src/layouts/PageLayout.astro` | 한국어 화면에 영어 짝이 있으면 `ko·en·x-default` alternate와 언어 버튼 주소를 자동으로 넣음 → Layout의 언어 기억 스크립트가 영어 선택 시 /en/ 쪽으로 넘김(검색어 `?q=`와 해시 `#access_token`도 같이 넘기도록 고침) |
| 번역 스크립트 | `npm run translate` (`scripts/translate.mjs`) | 빌드와 분리. 캐시에 없는 문구만 묶음(60개·7,000자)으로 `claude -p --setting-sources project --model sonnet --json-schema …`(도구 없음, 구독 로그인)에 보내고 캐시에 저장. 실행 전 `claude auth status`가 claude.ai 구독인지 확인, `ANTHROPIC_API_KEY` 등이 있으면 멈춤, `CLAUDE*` 환경변수는 지우고 호출. 한글이 남거나 태그 수가 다르면 다시 번역 |
| 영어 검색 색인 | `/data/search-index-en.json` | 영문 이름·분야·desc_en(한국어 이름은 찾기용으로만) |
| 검사 | `scripts/count_hangul_en.mjs`, `scripts/qa_en.py` | 정적 한글 세기 / Playwright 캡처·클릭·링크 |

새 데이터가 들어오면: `npm run translate` → `npm run build`. 번역 안 된 문구는 빌드가 원문(한국어)으로 두므로 `node scripts/count_hangul_en.mjs`로 확인.

## 2. 숫자

- 번역한 데이터 문구 **1,480개**(도구 410 · 조합 938 · 순위/생태계 111 · 개인정보 덩어리 14 · 트렌드 제목·요약 7), 처음 한 번 **204초**(3개 동시), 이후 추가분 몇 초.
- 화면 고정 문구(영어) 약 **250개**(`ui.ts`).
- 영어 페이지 **132쪽**(전체 빌드 268쪽, 빌드 약 10초 — 번역 전 9초).
- 영어 주소: /en/ · /en/trend/ · /en/ai/(+74) · /en/category/(+21) · /en/combos/(+11) · /en/pricing/(+7) · /en/rank/ · /en/search/ · /en/board/ · /en/map/ · /en/privacy · /en/404.html · 기존 /en/korea/(+6) 유지.

## 3. QA (로컬 http://127.0.0.1:8792 = `npm run serve`, wrangler pages dev, Playwright 크로미움 1개)

### (a)(b) 화면별 — 머리줄 수/높이, 넘침, 콘솔 오류, 남은 한글

남은 한글 = 화면에 실제로 보이는 글자(innerText) 기준. 허용(세지 않음): 머리줄 "한국어" 버튼, "한국어로 보기" 링크, 괄호 속 한국 지명.

| 화면 | 주소 | 폭 | 상태 | lang | header 수/높이 | 가로 넘침 | h1 | 콘솔 오류(자체/외부) | 남은 한글(자) | 남은 한글 예 | 캡처 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| home | /en/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_home_pc.png |
| trend | /en/trend/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_trend_pc.png |
| ai | /en/ai/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_ai_pc.png |
| ai-claude | /en/ai/claude/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_ai-claude_pc.png |
| ai-gpt | /en/ai/gpt/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_ai-gpt_pc.png |
| category | /en/category/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_category_pc.png |
| category-foundation | /en/category/foundation-models/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_category-foundation_pc.png |
| combos | /en/combos/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_combos_pc.png |
| combos-video | /en/combos/video/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_combos-video_pc.png |
| pricing | /en/pricing/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_pricing_pc.png |
| pricing-free | /en/pricing/free/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_pricing-free_pc.png |
| rank | /en/rank/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_rank_pc.png |
| search | /en/search/?q=claude | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_search_pc.png |
| board | /en/board/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 26 | 아직 글이 없어요 첫 글을 남겨보세요 | en_board_pc.png |
| map | /en/map/ | pc | 200 | en | 1/63px | 없음 | 0 | 0/0 | 0 |  | en_map_pc.png |
| privacy | /en/privacy | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_privacy_pc.png |
| 404 | /en/no-such-page/ | pc | 404 | en | 1/63px | 없음 | 1 | 0/2 | 0 |  | en_404_pc.png |
| korea | /en/korea/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_korea_pc.png |
| korea-seoraksan | /en/korea/seoraksan/ | pc | 200 | en | 1/63px | 없음 | 1 | 0/0 | 0 |  | en_korea-seoraksan_pc.png |
| home | /en/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_home_mobile.png |
| trend | /en/trend/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_trend_mobile.png |
| ai | /en/ai/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_ai_mobile.png |
| ai-claude | /en/ai/claude/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_ai-claude_mobile.png |
| ai-gpt | /en/ai/gpt/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_ai-gpt_mobile.png |
| category | /en/category/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_category_mobile.png |
| category-foundation | /en/category/foundation-models/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_category-foundation_mobile.png |
| combos | /en/combos/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_combos_mobile.png |
| combos-video | /en/combos/video/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_combos-video_mobile.png |
| pricing | /en/pricing/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_pricing_mobile.png |
| pricing-free | /en/pricing/free/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_pricing-free_mobile.png |
| rank | /en/rank/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_rank_mobile.png |
| search | /en/search/?q=claude | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_search_mobile.png |
| board | /en/board/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 26 | 아직 글이 없어요 첫 글을 남겨보세요 | en_board_mobile.png |
| map | /en/map/ | mobile | 200 | en | 1/69px | 없음 | 0 | 0/0 | 0 |  | en_map_mobile.png |
| privacy | /en/privacy | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_privacy_mobile.png |
| 404 | /en/no-such-page/ | mobile | 404 | en | 1/69px | 없음 | 1 | 0/2 | 0 |  | en_404_mobile.png |
| korea | /en/korea/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_korea_mobile.png |
| korea-seoraksan | /en/korea/seoraksan/ | mobile | 200 | en | 1/69px | 없음 | 1 | 0/0 | 0 |  | en_korea-seoraksan_mobile.png |


404 화면의 "외부" 오류 2건은 없는 주소를 일부러 연 것(상태 404)이라 정상.

### (b') 영어 페이지 132쪽 전체 정적 검사(`node scripts/count_hangul_en.mjs`)

| 페이지 | 남은 한글(자) | 내용 | 원인 |
|---|---|---|---|
| /en/korea/bukhansan/ | 15 | 대한병원, 경기도의료원의정부병원 | 원본 `content/korea/*/en.html`에 병원·주차장 이름이 한글 그대로(site2 밖 원본이라 손대지 않음) |
| /en/korea/jeongam-beach/ | 13 | 정암해수욕장, 물치공영주차장 | 같음 |
| /en/korea/hantangang-river/ | 10 | 포천 한탄강 멍우리 협곡 | 같음 |
| /en/korea/gwangjin-beach/ | 6 | 광진해수욕장 | 같음(사진 출처 표기) |
| 나머지 128쪽 | 0 | | |
| /en/board/ (화면 실행 뒤) | 26 | "아직 글이 없어요. 첫 글을 남겨보세요." 등 | `components/board/board.ts`가 한국어 문구만 가짐(이번 작업 범위 밖이라 수정 안 함) |

### (c) 실제 클릭 — 53/53 통과

한국어 메인(/) → 머리줄 English 클릭 → /en/ 도착(lang=en) → 머리줄 메뉴 7개·로고·왼쪽 메뉴 13개·꼬리말 17개·하단 탭 3개를 하나씩 눌러 모두 /en/… 영어 화면 도착(RSS·사이트맵·#login·"Korea Travel (in Korean)"은 일부러 언어 없음/한국어). /en/ai/claude/·/en/combos/video/·/en/pricing/free/·/en/ 에서 "한국어" 클릭 → 같은 화면 한국어판. 영어 기억 상태에서 /category/ 직접 열기 → /en/category/, /search/?q=gemini → /en/search/?q=gemini(결과 9개, 영어 설명), 머리줄 자동완성 "clau" → /en/ai/claude/, 한국어 기억 상태에서 /en/rank/ → /rank/. 상세는 `_qa/en_result.md`.

### (d) 링크 — 영어 페이지 132쪽의 사이트 안 주소 270개 전부 200

(/en/ 132개 + 언어 버튼이 가리키는 한국어 짝·/rss.xml·/sitemap-index.xml·/_astro 등 138개)

## 4. 못 한 것·미확인

- **트렌드 글 본문 영어 번역(2단계)**: /en/trend/ 와 메인은 제목·요약만 영어, 글(/trend/<id>)은 한국어 원문 + "Korean article" 표시. 영어판 목록은 열릴 때 갱신(/api/trend/latest)을 하지 않음(새 글은 번역이 없어서) — 새 글은 `npm run translate` 후 빌드해야 들어옴.
- **게시판 실행 문구**: `board.ts`(목록 비었을 때·토스트·"N분 전")와 `components/auth/site-auth.ts`(로그인 실패 알림, 이름 없을 때 "회원")는 한국어만. 담당 작업에서 영어 사전 필요. `/en/board/`는 한국어 게시판 화면 복사본이라 한국어 게시판을 고치면 같이 고쳐야 함. 로그인 복귀는 board.ts가 `/board/`로 돌려보내고, 영어를 고른 사람은 언어 기억 스크립트가 해시를 들고 /en/board/로 넘김 — 실제 로그인으로는 확인 못 함.
- **한국 여행 영어 글의 한글 이름 44자**(위 표): 원본 콘텐츠 수정 필요(site2 밖).
- **메인 시안 A·C**(/home/a/, /home/c/, 비교용·noindex)는 영어 문구를 넣지 않음. /en/은 지금 메인인 B만 영어.
- **3D 지도 앱 안**: /en/map/ 이 `galaxyLang=en`을 적어 앱이 영어로 뜨는 것까지만 확인(앱 안 문구 완성도는 앱 쪽 사전).
- 번역 품질은 표본만 눈으로 봄(전수 검토 안 함). 요금·순위 문구는 원문 그대로 옮긴 것이라 원문이 바뀌면 다시 번역됨(원문이 캐시 키).
- 배포 안 함.

## 5. 트렌드 글 본문 영어판(2026-10-14 추가)

### 구조
- **번역 등록**: `npm run translate:trend` = `node scripts/translate.mjs trend trend_posts`
  - `trend` = 목록 제목·요약(기존), `trend_posts` = 글 본문(새로). 공개 글(board=ai_trend, hidden=false)을 워커 API `/api/rest/v1/board_posts`(읽기만)로 받음 — `.env`의 `LOCAL_SITE_URL`(로컬 8792) 먼저, 안 되면 `PUBLIC_SITE_URL`(본 사이트 프록시).
  - 저장: `src/i18n/cache/trend_posts.json` = `{id: {title, tags, body_html, created_at, src_hash, translated_at}}`. 제목+본문+태그 해시가 같으면 건너뜀, 바뀌면 다시 번역, 비공개로 빠진 글은 지움.
  - HTML을 통째로 맡기지 않음: 블록 태그 사이 글자 덩어리(줄 안 태그 b·a·span·q 등 포함)와 alt·title 속성만 뽑아 옮긴 뒤 다시 끼움 → `<style>`(.gx 글 틀 CSS)·class·블록 구조는 원문 그대로. 덩어리마다 태그 수 같음·한글 0 검사, 실패 조각이 하나라도 있으면 그 글은 저장 안 함(다음 실행 때 다시).
  - 경로: claude -p 구독 로그인(과금 환경변수 있으면 멈춤) — 기존 번역과 같음.
- **화면**: `src/pages/en/trend/[id]/index.astro` → 정적 `/en/trend/<id>/`(캐시에 있고 공개 목록에 있는 글만). 틀 = PageLayout + 글 + 옆칸(Related posts·Get new posts), 글 CSS는 `src/components/blocks/TrendPostStyles.astro`(한국어 글 틀 frame-template과 같이 씀). 본문 안 사이트 링크는 `lp` 규칙으로 영어판이 있으면 /en/…. hreflang: en(자기)·ko(/trend/<id>), 머리줄 "한국어" = /trend/<id>, 글 끝에 "Read the Korean original" 링크. JSON-LD Article(inLanguage en, translationOfWork = 한국어 글).
- **목록·메인 링크**: `R.trendPost(id, lang)` → 번역된 글이면 `/en/trend/<id>/`, 아니면 `/trend/<id>` + "Korean article" 표시(TrendList·메인 B 칩). `lp('/trend/<id>','en')`도 같은 판단(전에는 없는 /en/trend/<id>로 바꿨음).
- **한 번에**: `npm run build:full` = translate:trend → build.

### 시험(로컬 8792, `python -X utf8 scripts/qa_en_trend.py`, 결과 `_qa/en_trend_result.md`)
- 번역: 3편(23·24·25) 31초, 시험 중 새로 공개된 26·27도 build:full 한 번에 30초(번역)+약 11초(빌드). 재실행 시 5편 모두 "그대로"(1초).
- /en/trend/23~27 PC 1440·모바일 390: 상태 200, 보이는 머리줄 1, 가로 넘침 0(처음엔 24번 모바일 .steps 3칸에서 영어 긴 단어로 17px 넘침 → 영어 글에만 칸 안 줄바꿈·좁은 화면 1칸 CSS로 해결), 콘솔 오류 0, 화면 남은 한글 0.
- 글 틀 비교(한국어 원문 화면 ↔ 영어): 본문 요소 수·class 붙은 요소·표 칸·링크 수 5편 모두 같음(23: paper 120/5/24칸/8, 24: gx 102/41, 25: gx 94/41, 26: gx 171/92, 27: gx 97/45).
- 클릭 17/17: /en/trend/ 카드 5개 → 각 영어 글, 메인 /en/ 트렌드 링크 10개 전부 /en/trend/<id>/ + 클릭 도착, 영어 글 머리줄 "한국어"·"Read the Korean original" → /trend/<id>(5편 모두).
- 영어 글 안 사이트 링크 36개 전부 200. `count_hangul_en.mjs`: /en/trend/* 모두 0.

### 남은 것
- **23번 글의 그림 2장**(galaxy-pick 서버의 PNG 카드 "확인할 것"·"꼭 기억할 한 마디")은 그림 안 글자가 한국어 — 글자 수 검사엔 안 잡힘. alt는 영어로 옮김. 영어 그림을 만들거나 영어 글에서 숨길지 결정 필요.
- **한국어 글 화면(워커)의 alternate en 없음**: 워커 `trendPost`가 그리는 /trend/<id> 머리에 `<link rel="alternate" hreflang="en" href="/en/trend/<id>/">`(번역된 글만)를 넣어야 짝이 완성되고, 영어를 고른 사람이 /trend/<id>로 들어와도 영어 글로 넘어감. 워커 담당 작업.
- **공장 자동 빌드 연결**: `common_prj/app/site2_build.py`가 `npm run build` 대신 `npm run build:full`을 부르게 한 줄 바꾸면 새 글 발행 → 번역 → 빌드가 이어짐(common_prj는 손대지 않음). 번역이 실패해도 빌드는 그대로 돌아야 하면 `translate:trend || true` 식으로 묶을지 결정 필요(지금은 번역 실패 시 빌드 안 함).
- 23번(옛 형식 .paper) 글은 한국어 화면과 똑같이 h2가 본문 크기로 보임 — 영어판 문제가 아니라 공통 글 CSS 문제.
- 번역 품질은 표본만 눈으로 봄. 배포 안 함.
