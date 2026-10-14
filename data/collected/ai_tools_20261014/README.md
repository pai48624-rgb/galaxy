# AI 도구 공식 자료 수집 — 시험 20개 (2026-10-14, 노트북)

<!-- PROGRESS -->
## 2단계 진행 (10-14 15:43 갱신)

| 받기 | ok | redirect | blocked | dead | 정리(extracted) | 요청 수 | 온도 |
|---|---|---|---|---|---|---|---|
| 311/747 | 233 | 63 | 7 | 8 | 206 | 1974 | 46°C(15:50, 열 영역) |
<!-- /PROGRESS -->


지시서: `[galaxy] AI 도구 747개 공식 자료 수집 — 노트북 작업 지시 (2026-10-14)`.
**지금은 시험 20개만 했다.** 나머지 727개는 데스크톱에서 이 결과를 보고 판단한 뒤 진행한다(사용자 결정 10/14).

## 결과 한눈에

| 항목 | 값 |
|---|---|
| 대상 | 20개 (지시서의 시험 목록) |
| 받기 | 19 성공(ok 13, redirect 6) · **blocked 1 (Midjourney — robots.txt 금지)** |
| 요금 확인 | 14개 |
| 한국어 지원 확인 | 9개 (UI 한국어 8, 한국어 입력·출력 1) |
| 기존 요금 정보와 다름(mismatch) | 4개 — Mistral Large·Notion AI·ollama·Pictory |
| 근거 검사 | 모든 값에 공식 페이지 인용, 인용이 받은 본문에 실제로 있는지 프로그램으로 대조 → 없는 인용 0건 |
| 요청 수 | 73회 (robots 포함) |
| 받기 시각 | 14:25~14:32 (고친 뒤 다시 받은 2개 포함), 정리(요약·기능·요금) 약 4분 |

## 파일

| 파일 | 내용 |
|---|---|
| `tools.jsonl` | 도구별 결과(지시서 형식): status·company·one_liner_ko·what_it_does_ko·key_features·use_cases_ko·pricing·open_source·api·platforms·korean_support·github·evidence + 검사에서 되돌린 값 `dropped` |
| `mismatch.csv` | 기존 `pricing_policy` 와 공식 페이지가 다른 것 |
| `failed.csv` | 막힘·종료·못 찾음과 이유 |
| `raw/<slug>.txt` | 받은 공식 페이지 본문(도구당 30KB 이내, `=== [home|pricing|about|github] 주소` 로 구분) |
| `fetch.jsonl` | 받기 기록(최종 주소·HTTP 상태·페이지별 글자 수·브라우저 사용 여부·GitHub 수치) |
| `extracted/<slug>.json` | 본문을 읽고 만든 정리(검사 전) |
| `input_tools.json` | Supabase `ai_tools` 747개 읽기 전용 사본(공개 키로 GET만, 쓰기 없음) |
| `collect.py` / `extract.py` | 받기 / 근거 검사·조립 |

## 실행 방법

```
cd C:\dev\10_projects\galaxy\data\collected\ai_tools_20261014
python collect.py fetch            # 747개 전부(이미 받은 slug 건너뜀, 끊겨도 이어서) — 특정 도구만: python collect.py fetch cursor suno
python collect.py status
# 정리: raw\<slug>.txt 를 읽고 extracted\<slug>.json 작성(시험 때는 Claude 하위 작업 2개가 10개씩, 다른 지식 없이 본문만)
python extract.py build            # 근거 검사 → tools.jsonl · mismatch.csv · failed.csv
```

- 받기 규칙: 공식 페이지만(홈 + 요금 + 소개/문서 1곳 + GitHub README·별·라이선스·마지막 커밋 `gh api`), 최대 4페이지.
- 예의: robots.txt 지킴, 같은 도메인 3초 간격, 동시 4개, 로그인·유료벽·캡차 안 넘음(막히면 blocked).
- 이름(UA): `AIGalaxyMap-research/1.0 (+https://aigalaxy-map.com; official-page reader)`.
- 글자가 거의 없는 자바스크립트 화면은 크롬(보이지 않게)으로 읽기만.

## 시험하면서 고친 것

1. 인증서 확인 실패(윈도 인증서 묶음에 중간 인증서 없음) → certifi 인증서 묶음 사용 (Hugging Face·Vrew 요금 쪽이 0글자였음).
2. 압축된 응답(gzip)을 풀지 않아 본문이 깨짐 → 풀도록 고치고 다시 받음 (Gemma·Google Veo).
3. 하위 페이지가 막히면(0·403) 브라우저로 한 번 더 읽기.

## 한계 · 판단할 것

- **요금 링크가 홈에 없는 곳은 요금 '불명'**: Gemma·Google Veo·Falcon(모델 소개 쪽이라 요금 페이지가 따로 있음), Perplexity·Wrtn(받은 본문이 앱 화면뿐).
  → 판단: 도구별 알려진 요금 주소를 따로 넣어 줄지, 지금처럼 '불명'으로 둘지.
- Vrew는 플랜 이름만 있고 가격은 화면이 그려진 뒤에 채워지는 듯 비어 있음("US$ -").
- Typecast는 API 요금만 받음(스튜디오 요금 쪽은 못 찾음).
- Cursor 요금 쪽에 Grok·X 구독과 묶인 요금제가 나옴 — 받은 본문 그대로(이상하면 확인 필요).
- 오픈소스 라이선스 이름: GitHub에서 확인된 것만(LangChain·ollama MIT). Falcon·Gemma·Fooocus는 페이지에 "오픈"이라고만 있음.
- 정리(요약·기능·요금 표)는 언어 판단이 필요해 프로그램만으로는 안 되고, 하위 작업(Claude)이 본문만 보고 작성 → 근거 검사로 추측을 걸러냄.
  747개 전체면 10개씩 약 73묶음.
- 텔레그램 보고: 노트북에 봇 키가 없어 채팅으로 보고함.

## 나머지 727개를 하면(예상)

받기 약 30~40분(요청 약 2,700회) + 정리 약 40분~1시간(4묶음씩 동시). 온도는 30분마다 확인(노트북은 ACPI 열 영역 값만 읽힘, 14:30 기준 43°C).
