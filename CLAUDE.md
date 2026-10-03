# galaxy (aigalaxy-map.com) — 프로젝트 방향성

AI 도구 관계형 지도 + 소셜로그인 + 실시간 방문자 채팅 + 커뮤니티 게시판. 서버리스 정적 웹 (Cloudflare Pages + Supabase). 전역 목표(수익화/노출/체류시간)와 공통 자원/제약은 `~/.claude/CLAUDE.md`의 "나의 현재 상태" 참고.

## 나를 알고 적을 알아야 (2026-09-29 상태 점검)

### 나를 알기 (현재 실제 가진 것)
- **애드센스 이미 라이브** — `ca-pub-1632907475675251`, `ads.txt`와 `index.html`의 `adsbygoogle.js` 삽입 둘 다 확인함. galaxy_pick과 달리 "승인받아야 하는" 단계가 아니라 **"이미 도는 광고 계정을 지켜야 하는"** 단계. 정책 위반으로 계정 정지되면 이 프로젝트뿐 아니라 같은 계정을 쓰는 다른 사이트까지 영향받을 수 있음 — 리스크 관리가 galaxy_pick보다 훨씬 중요함.
- 인프라 비용 $0: Cloudflare Pages(무료) + Supabase 무료 티어. 단 Supabase 무료 티어는 **200 동시 연결 / 100 msg-sec** 프로젝트 전역 한도 — 이 프로젝트가 여는 Realtime 채널(`galaxy-live`)이 이 한도를 다 쓴다. 방문자 프레즌스는 이미 50명 캡+1.2초 전송 제한으로 방어 중([[project_galaxy_live_chat]] 참고).
- 소셜 로그인 3사(Google/Kakao/Naver) 전부 작동 확인됨 — 회원 기반 콘텐츠(게시판 글쓰기 등)를 붙이기 쉬운 상태.
- 콘텐츠 자산: AI 도구 시드 데이터(수백 개 항목), `galaxy_saas/` 하위에 도구 8종(단축영상 기획, 프롬프트 엔진, 영문 이름 생성기 등) — galaxy_pick의 "제휴 딜 12개"보다 콘텐츠 볼륨 자체는 훨씬 큼.

### 적을 알기 (실제 위협/제약)
- **UGC 모더레이션 부재 — 애드센스 계정 전체를 위협하는 가장 실질적인 리스크.** 커뮤니티 게시판(`#boardPage`)에 캡차는 있지만 신고/모더레이션 기능이 없음(코드 확인: `report`/`신고` 관련 UI 없음). 광고가 뜬 상태에서 스팸/부적절 게시글이 방치되면 애드센스 정책 위반으로 계정 전체가 위험해질 수 있음 — galaxy_pick 쪽 컴플라이언스 조사에서 나온 "Valuable Inventory/정책 위반" 리스크가 여기선 자동수집이 아니라 **UGC 쪽에서 재현될 수 있는 구조**.
- 실시간 채팅/방문자 스타 기능이 Supabase Realtime 무료 한도를 공유 — 트래픽이 늘수록 이 캡이 먼저 병목이 됨.
- DuckDNS 리스크는 이 프로젝트엔 해당 없음(Cloudflare Pages라서 동적 IP 문제 없음) — galaxy_pick/steellotto와 구분해서 기억.
- SEO 기술적 실수가 반복될 수 있음 — 최근 `/privacy.html` 리디렉션으로 색인 실패한 사례처럼, 새 정적 페이지를 추가할 때마다 sitemap.xml/canonical을 같이 챙겨야 함.

## 로드맵

### 🎯 큰 흐름
1. 이미 라이브인 애드센스 계정을 지키면서 트래픽/노출을 키운다 (galaxy_pick처럼 "승인받기"가 아니라 "안 잃기"가 우선).
2. 게시판 모더레이션 체계 구축 — 광고 계정 보호의 최우선 과제.
3. `galaxy_saas/` 도구 콘텐츠를 확장해서 검색 유입 채널을 다각화 (이미 검증된 패턴).
4. 로그인 회원 기반 체류시간 늘리는 기능(게시판, 채팅) 계속 고도화.

### 📍 중간 흐름 (2~4주)
1. 게시판에 최소한의 신고 버튼 + 관리자 삭제 플로우 추가.
2. `galaxy_saas/` 도구 페이지 추가 확장 (검증된 SEO 성과 패턴 반복).
3. Supabase Realtime 사용량을 주기적으로 점검 — 무료 한도 근접 여부 확인.
4. 네이버 허브 API(galaxy_pick에서 사용 중) 만료일 확인 — 이 프로젝트엔 직접 영향 없지만 포트폴리오 전체 자원 추적 차원.

### ✅ 작은 흐름 (이번 주)
1. `/privacy.html` 리디렉션 색인 이슈 후속 확인 — Search Console 재검사 결과 확인.
2. 게시판 신고 기능 설계 시작.

## 작업 기록: AI 트렌드 게시판 (2026-10-03, 노트북에서 작업 — 노트북에서도 가끔 개발함)
- 커밋 `2e49421` (로컬만, **push·배포 안 함**). 노트북엔 galaxy `.env`·wrangler 로그인이 없음 → DB는 Supabase 연결 도구로 읽기만 했고, 변경은 권한 검사에 막혀 미적용.
- 만든 것:
  - `dist/_worker.js` §TREND: `POST /api/posts`(콘텐츠 공장 → DB 함수 `factory_post`, 토큰은 DB에 sha256 해시만), `/trend/`·`/trend/<id>`(서버에서 완성 HTML — 게시판은 JS로만 그려서 구글이 못 읽기 때문), `/sitemap-trend.xml`. `robots.txt`에 두 번째 Sitemap 줄.
  - `index.html`: 게시판 레일에 "🔥 AI 트렌드" 탭(`boardKind`), 그 탭에선 글쓰기 버튼 숨김, 상세에 '전체 글 보기 →' (/trend/<id>).
  - `scripts/migrate_board_ai_trend.sql`: board/external_id/body_html/tags 칼럼, AI 트렌드 본문 20000자, 일반 사용자는 free 게시판만 쓰기, factory_tokens·factory_post.
- 가짜 Supabase 응답으로 워커 시험함(목록·글·404·사이트맵·토큰 맞음/틀림/없음, script·onerror 제거, 390px 폭 가로 넘침 없음). 실제 DB·실서버에서는 아직 확인 못 함.
- **남은 순서**: ① SQL 실행 → ② 토큰 만들어 해시 등록 + nas `.env`에 `GALAXY_POST_URL=https://aigalaxy-map.com/api/posts`·`GALAXY_POST_TOKEN` → ③ 배포(`npm run deploy`, wrangler 로그인 필요) → ④ 관리 화면 '발행'으로 재고 9개 중 하나 등록해 실서버 확인 → ⑤ 서치콘솔·네이버 서치어드바이저에 sitemap-trend.xml 제출.
- 측정(10/03): 방문 기록 `site_visit_log` 9/17~10/3 총 137회(하루 1~30회). 메인 index.html 1.2MB 중 검색엔진이 읽는 글자 약 1,100자, JS 830KB, AI별 개별 페이지 없음 → 유입이 없는 가장 큰 원인으로 판단.
