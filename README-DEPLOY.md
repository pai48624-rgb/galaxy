# AI 성단 지도 — 서버리스 배포 가이드

백엔드(파이썬) 없이 **정적 파일 + Supabase** 로만 돌아갑니다.

```
index.html            ← 앱 전체 (인라인 CSS/JS, CDN 라이브러리)
supabase_schema.sql   ← Supabase SQL Editor 에 붙여넣을 테이블/RLS
import-data.mjs        ← data/ai_landscape.json → Supabase 적재
package.json / .env.example
```

---

## 1. Supabase 준비

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **SQL Editor ▸ New query** → `supabase_schema.sql` 전체 붙여넣고 **Run**
3. **Project Settings ▸ API** 에서 아래 3개를 확인
   - `Project URL` → 예: `https://abcdefgh.supabase.co`
   - `anon` / `publishable` 키 → 브라우저에 넣는 공개 키
   - `service_role` 키 → 임포트 전용, **절대 공개 금지**

## 2. 데이터 적재 (1회)

```bash
npm install
cp .env.example .env          # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 채우기
npm run import                # = node --env-file=.env import-data.mjs
```

→ `ai_tools` 731행, `relations` 약 2,184행이 들어갑니다. 재실행해도 중복 없음(slug upsert).

## 3. 프런트엔드 설정

`index.html` 상단 `CONFIG` 두 줄만 교체:

```js
const CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_....",
};
```

로컬 확인: `npx serve .` 또는 `python -m http.server` 후 브라우저.

## 4. 배포

### Cloudflare Pages
- GitHub 저장소 연결 → **Framework preset: None**
- **Build command: (비움)**, **Build output directory: `/`**
- 저장 후 자동 배포. `index.html` 이 루트에 있으면 끝.

### GitHub Pages
- Settings ▸ Pages ▸ Source: `main` / `/root`
- `.nojekyll` 파일이 이미 있어 그대로 서빙됩니다.

배포 후 `index.html` 의 `<link rel="canonical">` 와 `og:` 태그 도메인을 실제 주소로 바꾸세요.

---

## 운영 메모

| 테이블 | 누가 읽나 | 누가 쓰나 |
|---|---|---|
| `ai_tools`, `relations` | 누구나 | 임포트 스크립트 / Table Editor (service_role) |
| `reviews` | 누구나 | **누구나 INSERT** → 지도에 즉시 반영. 수정·삭제 불가 |
| `suggestions` | `approved` 만 공개 | 누구나 INSERT (`pending` 고정). Table Editor 에서 승인 |
| `sponsors` | 기간 내 행만 | Table Editor 에서 직접 (`ai_id`, `tier`, `starts_at`, `ends_at`, `link`) |

- **스폰서 등록**: `sponsors` 에 행 추가 → 해당 별이 2배 + Glow, 상단 슬롯에 노출.
- **어뷰징 방어**: 현재는 길이/별점 CHECK 만 있습니다. 트래픽이 늘면 Supabase 의
  Auth Captcha(Turnstile) 또는 Edge Function 프록시로 rate-limit 을 추가하세요.
- **요금제(pricing)** 값은 import 시 tags 로 대충 추정합니다(open-source→무료, 그 외→부분유료).
  Table Editor 에서 바로잡으면 됩니다.
- **SEO**: `#seoList` 는 JS 로 채우는 텍스트 목록입니다. 완전한 정적 SEO 가 필요하면
  빌드 시 이 목록을 HTML 로 미리 렌더(프리렌더)하는 스텝을 추가하세요.
