# 2026-10-14 오후 — 로그인 한 벌·영어판 복사본 제거·실시간 채팅 이전

## 바뀐 것

| 파일 | 내용 |
|---|---|
| `src/components/auth/auth-client.ts` (새) | 사이트 공통 Supabase 클라이언트·세션 한 곳. `window.__galaxySb` 하나를 머리줄·게시판·채팅이 같이 씀. 복귀 해시(`#access_token`) 캡처·주소창에서 지우기도 여기서 한 번만. `highlightSiteLogin()`(머리줄 버튼 강조, 모바일은 메뉴를 열고) |
| `src/components/auth/site-auth.ts` | 위 모듈을 쓰도록 정리. 로그인·로그아웃은 머리줄 한 벌만. 같은 화면 안에서 `#login` 링크를 눌러도 강조되게(전에는 새로 읽을 때만) |
| `src/components/board/BoardPage.astro` (새) | 게시판 본문 한 벌(`lang` prop). 자체 로그인 줄(G·K·N 버튼·로그아웃) 없앰 → 로그인 전엔 "글을 쓰려면 위 머리줄에서 로그인하세요" 한 줄(누르면 머리줄 버튼 강조). 스타일은 `is:global`(board.ts 가 그리는 목록에도 닿게) |
| `src/pages/board/index.astro`, `src/pages/en/board/index.astro` | `<BoardPage lang="ko|en" />` 한 줄씩(영어 복사본 156줄 삭제) |
| `src/components/board/board.ts` | 자체 클라이언트·로그인·로그아웃 함수 제거, `auth-client.ts` 의 세션을 받아 화면만 다시 그림. 라이브러리 실패 문구도 T/T_EN |
| `src/i18n/ui.ts` | `board`·`chat` 문구(ko/en) 추가 |
| `src/components/chat/ChatDock.astro`, `chat.ts` (새) | 모든 화면 오른쪽 아래 💬 → 작은 창. 원본 3D 앱 채팅과 같은 방: 채널 `galaxy-live`, presence key `sessionStorage.galaxyClientId`, presence `{name}`, broadcast `chat {id,text}`·`whisper {id,fromName,targetName,text}`, 1.2초 제한, 정원 50명(첫 sync), 혼자일 때 🌌 우주 메아리(3초 쿨다운)·25초 먼저 말 걸기, `/비밀사용자` 목록·귓속말, 80자. 연결은 창을 처음 열 때(안 여는 방문자는 연결 0 — 무료 동시 연결 아끼기), 창을 열어 둔 채 화면을 옮기면 그 화면에서도 열림(sessionStorage `galaxyChatOpen`). 창이 닫혀 있을 때 새 메시지 수 배지 |
| `src/layouts/PageLayout.astro` | `<ChatDock>` 추가. `chat` prop(기본 켬, `fullBleed`=지도면 끔) |
| `src/lib/routes.ts`, `src/navigation.ts` | `R.chat()` = `#chat`(창 열기). 꼬리말 데이터의 "채팅" 링크를 지도 → `R.chat()` (현재 꼬리말은 한 줄이라 화면엔 안 나옴) |
| 게시판 "실시간 채팅은 3D 지도에서" 링크 | → "💬 실시간 채팅 열기" 버튼(`data-chat-open`, 위젯 열기) |

## 시험(로컬 http://127.0.0.1:8792, `npm run build` 후 Playwright 크로미움, 결과 `_qa/boardchat_result_ui.json`·`_qa/boardchat_result_realtime.json`)

| 항목 | 결과 |
|---|---|
| /board/·/en/board/ × PC 1440·모바일 390: `header` 태그 수 | 4곳 모두 1 (채팅 창 머리는 `div` — 사이트 머리줄 판정 안 깨짐) |
| 로그인 버튼 | `[data-provider]` 3개, 전부 `#siteAuth`(머리줄) 안. 게시판 자체 버튼·로그아웃 0, 로그아웃은 머리줄 `#siteLogout` 1개 |
| 가로 넘침 / 콘솔 오류 | 0 / 0 (4곳) |
| 영어판 남은 한글 | PC 3글자 = 언어 전환 버튼 "한국어"(의도된 언어 이름), 모바일 0 |
| 로그인 전 | 글쓰기 버튼 숨김, 안내 줄 보임, 안내 줄 클릭 → 머리줄 G·K·N 강조(모바일은 메뉴 열린 뒤 강조) |
| 머리줄 구글 버튼 | `/api/auth/v1/authorize?provider=google&redirect_to=http://127.0.0.1:8792/board/` → `accounts.google.com` 도착 |
| 채팅 실제 연결 | 웹소켓 `ws://127.0.0.1:8792/api/realtime/v1/websocket`(로컬 워커 프록시) → `SUBSCRIBED` |
| 두 컨텍스트(A·B, /board/) | A→B "시험 메시지 1" 도착, B→A "시험 답장 B" 도착, B 상태 "지금 2명 접속 중", 입장·퇴장 알림 |
| 1.2초 제한 | A가 메시지 2·3을 바로 연달아 → 2만 전송(A 화면·B 화면 모두 3 없음), 1.3초 뒤 4 → 도착 |
| 혼자일 때 메아리 | A 혼자 "안녕…" → "🌌 우주 안녕하세요, 지나가던 별입니다 ⭐" |
| 귓속말·목록 | `/비밀사용자 시험손님B 귓속말 시험` → B에게만 "🔒 시험손님A → 나", `/비밀사용자` → "현재 접속자 (2): 시험손님A(나), 시험손님B" |
| 지도 앱과 같은 방 | `/map/app/` 앱의 presence sync 로그에 시험손님A·B가 보임(앱은 서버 프록시로 연결 — Supabase 방은 같음) |
| /map/·/en/map/ | 사이트 위젯 버튼 0, `chat-dock` 숨김(앱 안 💬만) |
| /trend/·/ai/claude/ | 💬 열기 → 창 보임, ✕ → 닫힘. 게시판 "실시간 채팅 열기" 버튼 → 창 열림, 열어 둔 채 /ai/claude/ 이동 → 그대로 열림 |
| 모바일 390 창 | 화면 안(45~375px), 넘침 0, 하단 탭 위에 버튼 |

캡처: `_qa/boardchat_*`, `_qa/chat_open_*`, `_qa/chat_two_B.png`.

## 못 한 것·미확인

- 실계정 로그인 완료(복귀 → 머리줄 이름 표시 → 게시판 글쓰기 버튼 노출 → 등록·신고·삭제·운영자 패널)는 미확인. 로컬 복귀 주소 `http://127.0.0.1:8792/...`는 Supabase Redirect URLs 허용 목록에 없을 수 있음.
- 로그인한 사람의 채팅 이름(구글 이름) 반영·로그인/로그아웃 때 이름 바꾸기(retrackPresence)는 코드만, 실계정으로 눌러 보지 않음.
- 정원 50명 초과 처리는 실제 50명을 만들 수 없어 미시험(코드는 원본과 같은 순서).
- 시험 메시지("시험 메시지 1~4", "시험 답장 B", 귓속말)는 실제 `galaxy-live` 방으로 나가서, 그 순간 실서버 지도에 있던 방문자가 있었다면 보였을 수 있음(저장은 안 됨).
- 혼자일 때 메아리는 보낼 때 인원 기준이라, 상대 입장 알림이 늦게 오면 2명인데도 한 번 답할 수 있음(원본과 같은 동작).
- /map/ 페이지의 콘솔 오류(THREE.GLTFLoader 텍스처)는 3D 앱 안 것으로 이번 작업과 무관.

---

# site2 게시판(/board/) — 독립 페이지 전환 기록 (2026-10-14)

`/board/`를 3D 앱 iframe(`/map/app/#board`)에서 **사이트 틀(고정 머리줄 + 왼쪽 메뉴 + 본문) 안의 진짜 페이지**로 바꿨다. 기능은 기존 앱(`C:\dev\10_projects\galaxy\index.html`)의 게시판 코드를 이름 그대로 옮긴 것이고 새 설계는 없다. 실시간 채팅은 이번에 옮기지 않았다(페이지 상단에 "실시간 채팅은 3D 지도 화면에서" 링크 한 줄). 서버 배포는 하지 않았다(로컬 빌드·확인만). `site2` 밖 원본 소스는 읽기만 했다.

## 1. 만든 것·고친 것

| 파일 | 내용 |
|---|---|
| `src/pages/board/index.astro` | PageLayout(왼쪽 메뉴 있음) 안의 게시판 본문: 제목 "커뮤니티 게시판", 로그인 상태 줄(전: 구글·카카오·네이버 버튼 3개 / 후: "로그인됨: 이름"+로그아웃), 글쓰기·신고 관리 버튼(로그인·운영자일 때만), 왼쪽 목록(제목·닉네임·시간, 15개씩 이전/다음) + 오른쪽 상세(제목·작성자·시간·본문, 신고 또는 내 글이면 삭제), `<dialog id="boardWriteDlg">`(제목 120자·내용 3000자·확인 숫자), `<dialog id="boardAdminDlg">`(신고 관리). 모바일은 목록 위·상세 아래 1열. 색은 틀의 토큰(`--aw-*`)·slate 팔레트만 사용 |
| `src/components/board/board.ts` | 원본 1434~1727줄·3687~3728줄 함수를 이름 그대로: `initBoardAuth`·`updateBoardAuthUI`·`refreshBoardAdminUI`(RPC `is_board_admin`)·`boardLogout`·`boardOAuthLogin`·`boardNaverLogin`·`newBoardCaptcha`·`loadBoardPosts`(select `id,user_id,author_name,title,body,created_at`, count exact, `board=eq.free`, 42703 폴백)·`boardPagerHTML`·`boardRowHTML`·`renderBoardDetail`·`reportBoardPost`·`submitBoardPost`·`deleteBoardPost`·`openBoardAdminPanel`·`loadBoardAdminList`·`restoreBoardPost`·`adminDeleteBoardPost`. `RETURNING_FROM_OAUTH`를 스크립트 맨 위(클라이언트 생성 전)에서 캡처하고 복귀 시 해시를 즉시 지우는 처리, 프록시 주소(`https://ai-galaxy.pages.dev/api`)·ANON 키·`persistSession: true`·카카오 scopes 모두 원본과 동일. 바뀐 것: DOM id, `redirectTo = location.origin + '/board/'`, `retrackPresence()` 호출 제거(채팅 미이전), `#login` 해시면 로그인 줄 강조 |
| `src/navigation.ts` | 꼬리말 "로그인"(한·영) `/map/#login` → `/board/#login` |
| `src/components/blocks/SideMenu.astro` | 참여 > 로그인 `/map/#login` → `/board/#login` ("게시판 · 채팅"은 이미 `/board/`) |
| `src/components/widgets/Header.astro` | 로그인 아이콘 G/K/N `/map/#login` → `/board/#login` (머리줄 메뉴 "게시판 · 채팅"은 이미 `/board/`) |
| `src/pages/map/index.astro` | 손대지 않음(3D 앱 iframe 그대로, 앱 안의 게시판 버튼도 그대로) |

supabase-js UMD는 페이지 `<head>`에서 `/vendor/supabase.min.js`(이미 `public/vendor/`에 있던 사본)를 먼저 읽고, `board.ts`는 모듈 스크립트라 그 뒤에 실행된다. 숨김 글(`hidden`) 제외·내 글 삭제·운영자 권한은 원본과 같이 DB RLS(`supabase_schema.sql` §6·§8)가 처리한다.

## 2. 시험 결과 (로컬 http://127.0.0.1:8792, `npm run build` 후 Playwright 크로미움 1개)

| 항목 | 확인 방법 | 결과 |
|---|---|---|
| (a) PC 캡처 | 1440×900 full page → `_qa/board2_pc.png` | 머리줄 1개 · 왼쪽 메뉴 1개(보임) · 가로 넘침 없음(1440/1440) · h1 1개 · 콘솔 오류 0 · 개발용 문구 0 |
| (a) 모바일 캡처 | 390×844 full page → `_qa/board2_mobile.png` | 머리줄 1개 · 왼쪽 메뉴는 lg 미만에서 숨김(정상) · 가로 넘침 없음(390/390) · 콘솔 오류 0 · 목록 위·상세 아래 1열 · 로그인 버튼 3개 줄바꿈 |
| (b) 목록이 실제 Supabase에서 오는지 | 네트워크 응답 감시 | `GET https://ai-galaxy.pages.dev/api/rest/v1/board_posts?select=…&board=eq.free&order=created_at.desc&offset=0&limit=15` → **200**. curl로 같은 주소 직접 호출 시 `Content-Range: */0`(공개 글 0건) → 화면에 "아직 글이 없어요. 첫 글을 남겨보세요." 표시됨 |
| (c) 구글 버튼 | 클릭 후 이동 추적 | `…/api/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2F127.0.0.1%3A8792%2Fboard%2F` 거쳐 `https://accounts.google.com/v3/signin/identifier?…` 로 이동. **redirect_to = `http://127.0.0.1:8792/board/`** (실서버에선 origin이 사이트 주소로 바뀜) |
| (d) 로그인 전 글쓰기 버튼 | DOM 검사 | `#boardWriteOpen` hidden=true, 화면에 안 보임. `#boardAdminOpen`도 숨김. 로그인 줄은 보이고 "로그인됨" 줄은 숨김 |
| (d') 미로그인 상태로 등록 시도 | 글쓰기 창을 강제로 열어 제출 | 토스트 "글을 쓰려면 먼저 로그인해주세요" (원본과 같은 순서로 검사). 확인 숫자 4자리 생성됨. 창 모양 `_qa/board2_write_pc.png` |
| (e) 왼쪽 메뉴 → 게시판 | `/trend/`에서 사이드 메뉴 "게시판 · 채팅" 클릭 | `/board/` 도착 |
| (e) 머리줄 → 게시판 | `/ai/`에서 머리줄 "게시판 · 채팅" 클릭 | `/board/` 도착 |
| (e) 머리줄 로그인 아이콘 G | `/ai/`에서 클릭 | `/board/#login` 도착, 로그인 줄 3개 버튼 강조(테두리·빛) + 첫 버튼에 초점. `_qa/board2_login_pc.png` |
| 빌드 | `npm run build` | 143쪽 생성. 첫 시도는 `dist/_astro` 파일 이동이 Windows 파일 잠금으로 실패(ENOENT rename) → 재시도에서 정상 |

세부 수치는 `_qa/board2_result.json`.

## 3. 못 한 것·미확인

- **실제 로그인 완료·글 등록·신고·삭제·운영자 패널**: 실계정으로 OAuth를 끝까지 진행하지 않아 미확인. 코드는 원본과 동일하지만, 실서버에서 로그인 후 복귀(`/board/#access_token=…` → 해시 제거 → "로그인됨: 이름" 표시 → 글쓰기 버튼 노출)까지 사용자가 한 번 확인해야 한다.
- **Supabase 대시보드의 Redirect URLs**: 로컬 `http://127.0.0.1:8792/board/`는 허용 목록에 없을 수 있어 로컬에서 로그인 완료는 안 될 수 있다(구글 화면까지는 감). 실서버 `https://aigalaxy-map.com/board/`가 허용 목록에 있는지는 대시보드에서 확인 필요(기존엔 `/` 복귀만 썼음).
- **네이버 로그인**: `/api/auth/naver/start?returnTo=…/board/`는 Cloudflare 워커(`_worker.js`)가 처리하므로 로컬 정적 서버에선 404. 실서버에서만 동작.
- **실시간 채팅**: 옮기지 않음(3D 지도 화면 링크만).
- **AI 트렌드 레일**: 원본 게시판 화면의 "AI 트렌드" 탭은 site2에 `/trend/` 페이지가 따로 있어 이 페이지엔 넣지 않았다(커뮤니티 `free` 게시판만).
- **영어판**: `/en/` 게시판은 없어 한국어 문구만.
- 서버 배포·wrangler 실행 안 함.
