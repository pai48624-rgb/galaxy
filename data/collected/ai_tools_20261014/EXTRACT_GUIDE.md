# 정리 지침 (extracted/<slug>.json 작성자용 — 2단계, 2026-10-14)

받아 둔 **공식 페이지 본문만** 보고 도구별 사실을 정리한다. 웹을 보지 말고, 도구에 대해 원래 아는 것도 쓰지 않는다. `_ko` 로 끝나는 칸은 한국어.

폴더: `C:\dev\10_projects\galaxy\data\collected\ai_tools_20261014`

도구마다:
1. `raw\<slug>.txt` 읽기. 구간은 `=== [home|pricing|pricing2|pricing_ko|about|github|meta] 주소 (lang=xx)` 로 나뉨.
   `[meta]` 구간에는 html lang · hreflang 목록 · 화면에 보이는 언어 이름이 있음(한국어 지원 판단과 인용에 사용).
2. `input_tools.json` 에서 그 slug 의 기존 `pricing_policy` 확인(mismatch·plan_change 판단에만 사용).
3. `extracted\<slug>.json` (UTF-8) 작성:

```json
{
 "company": "회사 이름" ,
 "one_liner_ko": "공식 문구를 우리말로 요약한 1문장",
 "what_it_does_ko": "3~5문장, 페이지 근거만",
 "key_features": ["5~8개, 공식 페이지에 있는 기능만, 한국어로"],
 "use_cases_ko": ["누가 무엇에 쓰나, 최대 3개 — 페이지 근거가 있을 때만"],
 "pricing": {"free_tier": "있음 (한도…)" , "plans": [{"name": "", "price": 0, "currency": "USD|KRW|EUR…", "period": "month|year|one-time|usage", "limits": "주요 한도 짧게", "page_lang": "그 가격을 읽은 구간의 lang 값(없으면 null)"}], "pricing_url": "가격을 읽은 구간 주소"},
 "open_source": "라이선스 이름 또는 null",
 "api": "있음|없음|불명",
 "platforms": ["웹","윈도","맥","iOS","안드로이드","CLI","API"],
 "korean_support": "UI 한국어|한국어 입력·출력|없음(영어 등만)|불명",
 "evidence": [{"field": "company|one_liner_ko|...|pricing|korean_support", "url": "인용을 가져온 구간 주소", "quote": "raw 파일에서 글자 그대로 복사한 30~200자"}],
 "mismatch": [{"official": "공식 페이지 내용 요약", "diff": "기존 pricing_policy 와 무엇이 다른가", "url": "주소"}],
 "plan_change": [{"official": "공식 요금제 요약", "diff": "분류는 같아도 요금제 이름·가격 구조가 크게 다른 점", "url": "주소"}]
}
```

절대 규칙:
- 비어 있지 않은 칸마다 근거(evidence)가 1개 이상 있어야 하고, quote 는 raw 파일 글을 **한 글자도 바꾸지 않고** 복사(검사 프로그램이 본문에 없는 인용은 버리고 그 칸을 불명으로 되돌림). 번역·요약 금지, 짧고 특징 있는 부분으로.
- 페이지에 없는 것은 null / "불명" / []. 기억·일반 지식으로 채우지 않기(오픈소스·가격·API 를 추측하지 말 것).
- 같은 요금제가 영어 요금 페이지(USD)와 한국어 요금 페이지(KRW)에 둘 다 있으면 **둘 다** plans 에 넣고 각각 currency·page_lang 을 적는다(버리지 않음).
- korean_support:
  - "UI 한국어": 본문이 한국어 화면이거나, 언어 선택·hreflang 에 한국어(ko)가 있음 → [meta] 구간 줄을 인용.
  - "한국어 입력·출력": 지원 언어 목록에 Korean/한국어가 있음(화면은 아님).
  - "없음(영어 등만)": 언어 선택이나 hreflang 이 있는데 한국어가 없음, **또는** 언어 선택이 아예 없고 html lang 이 ko 가 아니며 본문도 한국어가 아님(한 언어 사이트) → [meta] 구간 줄을 인용.
  - "불명": 위를 판단할 근거가 정말 없을 때만.
- mismatch: 공식 내용이 기존 pricing_policy 분류와 분명히 반대일 때만(예: '오픈소스 무료'인데 유료 API).
- plan_change: 분류는 맞아도 요금제 이름·가격 구조가 크게 다를 때(예: 다른 회사 구독과 묶임, 종량제→구독 추가). 아니면 [].
- 가격은 페이지에 적힌 숫자와 기간 그대로만(연간 결제액으로 월 가격을 계산하는 식의 역산 금지). 연간 결제 기준 월 가격이면 period 에 "month(연간 결제)"처럼 페이지 표기대로.
- 개인정보(개인 이름·메일) 적지 않기.
- raw 파일이 없거나 비면 모든 칸을 불명으로 두고 evidence 는 [].
- raw 본문이 그 도구가 아니라 다른 제품·저장소(주소 이동·인수 등)면 그 제품 내용을 쓰지 말고 모든 칸을 비운 뒤 "note" 에 사정을 적는다(사람 확인용).

끝나면 표로 짧게 답: slug | 요금 확인(예/아니오) | 한국어 | mismatch | plan_change | 비고.
