# AI 성단 지도 (AI Constellation Map)

운영 중인 사이트: **https://aigalaxy-map.com**

731개 AI 툴(31개 대분류, 107개 세부분류)을 하나의 force-directed network
그래프로 보여주는 인터랙티브 지도 사이트입니다. 데이터 출처는 실제 운영중인
AI 디렉토리 [ailandscape.org](https://ailandscape.org)의 공개 저장소입니다.

## 로컬에서 테스트 / 배포

지금은 파이썬 서버가 아니라 **정적 `index.html` + Supabase + Cloudflare Pages**로
운영됩니다. 로컬 테스트와 배포는 `PIPELINE.md`를 참고하세요 (요약: `npm test`로
로컬 확인 → `npm run deploy`로 배포). 상세 아키텍처는 `README-DEPLOY.md` 참고.

## 데이터 구조

- `data/ai_landscape.json`: 731개 AI 툴 원본 데이터 (영문/국문 이름, 대분류,
  세부분류, 공식 URL, GitHub, X(Twitter), 영/국문 설명, 태그, 등록일, 연관 툴) —
  `npm run import`로 Supabase에 적재
- `data/ai_enrichment.json`: 가격정책/핵심기능 등 보강 데이터 — `npm run bootstrap`
  이후 `node apply-enrichment.mjs`로 적용 (`name_en` 매칭 UPDATE 방식)
- 연관관계(관계선)는 "같은 세부분류" 기준으로 최대 5개씩 자동 생성됨 (2184개)
- 가격 정보(무료/부분유료/유료)는 원본 저장소에 없어서 대부분 "정보없음"으로
  표시됩니다. 알고 있는 정보가 있으면 Supabase Table Editor에서 하나씩 수정 가능합니다.
- 인기도 순위(크기 결정 요소)는 이전에 직접 조사했던 56개 주요 툴에만
  존재하고, 나머지 675개는 기본 크기로 표시됩니다.

## 주요 기능

현재 기능 목록은 계속 바뀌고 있어서 최신 상태는 `WORK_SUMMARY.md`를 참고하세요
(은하 배경, 태양계, 88개 별자리, 커뮤니티 게시판, 조합 추천 등).

## 다국어 확장 대비

지금은 한글이 기본이고 영문 이름(`name_en`)·영문 설명(`description_en`)을
같이 저장해뒀습니다. 나중에 다른 언어를 추가하려면:
1. `nodes` 테이블에 `name_ja`, `description_ja`처럼 언어별 컬럼을 추가하거나,
   별도의 `translations` 테이블(node_id, lang, field, value)을 만드는 방법이 있습니다.
2. 화면에는 `?lang=ja` 같은 파라미터나 언어 선택 드롭다운을 추가해서
   API 응답에서 어떤 언어 필드를 내려줄지 분기하면 됩니다.
3. 구조는 이미 이렇게 확장 가능하게 짜여 있어서, 실제 다국어 작업을 시작할 때
   말씀해주시면 이어서 진행할 수 있습니다.

## 알아두실 점

- 이전 버전에 있던 "위성(주기능)" 개념(MCP, 코드실행 등)은 이번 731개
  전환 과정에서 데이터 출처가 완전히 바뀌면서 일단 제외했습니다. 필요하시면
  주요 AI 몇 개에 대해서만 다시 붙일 수 있습니다.
- 노드가 많아 물리 시뮬레이션이 안정화되는 데 몇 초 걸립니다(로컬 테스트
  기준 약 8초). "전체 보기" 버튼은 그 전에도 눌러서 화면을 맞출 수 있습니다.
- `_legacy_flask_app/`: 731개 전환 이전에 쓰던 옛날 Flask 버전(admin 화면,
  SQLite `constellation.db` 등)을 참고용으로 보관해둔 폴더입니다. 더 이상
  실행되지 않고, 지금 운영 사이트와 무관합니다.
