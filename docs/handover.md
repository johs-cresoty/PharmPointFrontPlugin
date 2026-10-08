# PharmPoint 토스 플러그인 인수인계 문서

> 저장소: `PharmPointFrontPlugin` (GitHub `johs-cresoty/PharmPointFrontPlugin`)
> 기준 시점: 2026-10-08 · 커밋 `2507dea`

---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 무엇 | 토스플레이스 프론트(약국 고객용 단말기)에서 돌아가는 팜포인트 플러그인. 고객이 휴대폰 번호로 포인트를 조회·적립·사용한다 |
| 플러그인 ID | `cresoty-pharmpoint` |
| 실행 주소 | 라이브 `https://cresoty-pharmpoint.plugin.tossplace.com` · 개발 `https://cresoty-pharmpoint.plugin-dev.tossplace.com` |
| 연동 대상 | ① 캣포스(약국 POS PC) — 웹소켓 ② 결제 단말기(CAT) — 시리얼 ③ 팜포인트 서버(`app-api.catpos.co.kr`) — HTTPS |
| 자매 프로젝트 | `PharmPointFrontPlugin-Naver` (네이버 커넥트용, 같은 화면 사용) · `PharmPoint` (안드로이드 원본 앱. 업무 로직의 원형) |
| 디자인 | Figma「커넥트_고객화면_디자인」 (`v0WOZg8LbT1tT30e7Rjlb3`) 페이지 "최종디자인" |

### 화면 방식 — Template API 대신 직접 그린 화면
토스 가이드는 Template API(`sdk.template.*`)로 화면을 만들라고 하지만, 팜포인트는 **토스 검수 예외 승인**을 받고 Figma 디자인을 React 로 직접 그린다.
- 화면은 네이버 플러그인과 **같은 파일**을 쓴다 (아래 4장).
- 지금 Template API 는 설정 페이지(settings.html)의 토스트(`sdk.template.openToast`) 한 곳만 쓴다.

---

## 2. 개발 환경

| 항목 | 내용 |
|---|---|
| 언어 | TypeScript (흐름·연동) + React 19 (화면, `src/ui`) |
| 빌드 | Vite 8 · Tailwind 3 (preflight 끔) |
| 폰트 | Noto Sans KR (`@fontsource-variable/noto-sans-kr`, 앱과 함께 배포) |
| SDK | Toss Front SDK (`cdn.tossplace.com/toss-front-sdk/v0`) — 전역 `sdk` |
| 오류 수집 | Sentry (`@sentry/browser`, DSN 은 `src/monitoring/sentry.ts`) |

```bash
npm install
npm run dev            # 개발 서버 (브라우저 확인용. SDK mock 으로 화면만 동작)
npm run build          # 배포본 (상세 로그 꺼짐)
npm run build:verbose  # 배포본 + 상세 로그 (실단말 문제 추적용)
npm run preview        # 빌드 결과 확인 (settings.html 확인은 이걸로)
```

- 개발 서버는 `/api` 를 vite proxy 로 개발 서버(`dev-app-api`)에 넘긴다(CORS 우회).
- `dist` 는 하위 폴더 없이 평평하게 나온다 (토스 개발자센터가 하위 폴더를 지원하지 않음).
- `global.css` · `sdk.js` 는 빌드마다 `?v=` 가 붙어 단말이 새로 받는다.

---

## 3. 폴더 구조

```
src/
├── main.ts                 부팅 · 라우트 등록 · 소켓 이벤트 → 화면 연결
├── router.ts               hash 라우터 (#/경로)
├── api/                    서버 통신 (axios · 인증 · 토큰 · 관리자 비밀번호)
├── features/               업무 로직
│   ├── admin/              관리자 진입 잠금 (admin-session)
│   ├── app-config/         단말 저장소(sdk.storage) 설정 읽기·쓰기
│   ├── app-session/        소켓 이벤트 → 화면 이동 연결
│   ├── point-inquiry/      회원 · 잔액 조회
│   ├── point-earn/         적립 (예상 → 확정, 실패 시 재시도)
│   ├── point-transaction/  적립 예상 · 확정 API
│   ├── point-use/          사용 결과 회신 · 취소 회신
│   ├── point-settings/     적립 사용 여부 조회
│   ├── result-page/        결과 화면 이동
│   └── barcode/            EAN-13 바코드 생성
├── pages/                  라우트별 흐름 (화면 띄우기 + 회신)
├── pos/                    캣포스 · 단말기 프로토콜과 전송 계층
│   ├── protocol/           전문 상수 · 코덱 · 파서
│   └── transport/          websocket · serial · van
├── monitoring/             Sentry · 연동 상태 기록
├── shared/constants/       저장소 키
├── ui/                     새 디자인 화면 (React) — 네이버와 공용 파일 포함
└── utils/                  로그 · 개인정보 가림 · 화면 활성 여부
public/                     settings.html · sdk.js · global.css · 이미지 · 아이콘
docs/                       이 문서 · websocket-protocol.md
*.md (루트)                 단말기 · 가격표시기 연동 명세
```

---

## 4. 화면 구조

### 4-1. 무대(stage)
- Figma 는 네이버 단말 해상도 **534×854** 로 그려져 있다. 토스 단말은 **400×640** 으로 비율(5:8)이 같다.
- `src/ui/stage.tsx` 가 534×854 크기로 그린 화면을 통째로 줄여 #app 위에 덮는다. 그래서 화면 코드는 Figma 수치(px)를 그대로 쓴다.
- 한 번에 한 화면만 띄운다. 주소(hash)가 바뀌면 무대를 내린다.

### 4-2. 네이버와 같이 쓰는 파일 — 고칠 때 두 저장소를 함께 고친다

| 파일 | 화면 (Figma) |
|---|---|
| `IdleView.tsx` · `main-themes.ts` | 대기화면 (01-1~5) |
| `PriceDisplayView.tsx` | 가격표시기 (02-1 · 02-2) |
| `PhoneInputView.tsx` · `Keypad.tsx` | 번호 입력 (04-1~7, 05-1) |
| `Popups.tsx` | 안내 팝업 4종 (05-2) |
| `UsePointView.tsx` | 사용 포인트 입력 (06-1 · 06-2) |
| `MarketingAgreementView.tsx` · `AgreementDetailView.tsx` · `agreement-content.ts` | 약관 동의 · 상세 (07-1~3) |
| `AdminPasswordView.tsx` | 관리자 비밀번호 (09-1 · 09-2) |
| `settings/*` | 환경설정 (09-3 · 09-5 · 09-6 · 09-7) |

결과 화면(`ResultScreen.tsx`)은 토스 쪽에 따로 옮겨 둔 사본이다.

토스 전용 파일은 공용 화면을 띄우고 입력·타이머를 관리한다: `idle.tsx` · `phone-input.tsx` · `use-point-input.tsx` · `marketing-agreement.tsx` · `show-result.tsx` · `use-inactivity.ts`.

### 4-3. 스타일 주의
- Tailwind preflight(전역 초기화)를 껐다. 켜면 토스 디자인 시스템 CSS 로 그리는 예전 화면(바코드 표시 · settings.html)이 깨진다.
- 대신 `src/ui/ui.css` 가 무대 안에서만 필요한 초기화(테두리 · 입력칸 · 글꼴)를 한다. 공용 파일이 네이버(preflight 켬)와 같은 모양으로 보이게 하기 위함이다.
- 토스 CSS 영향으로 `aspect-ratio` 가 눌린 적이 있어 테마 카드 높이는 px 로 직접 준다.

---

## 5. 라우트

| 경로 | 화면 | 진입 |
|---|---|---|
| `#/` | 대기화면 · 캣포스 요청용 입력(번호 요청 · 고객 코드 요청 · 마케팅 동의) | 기본 |
| `#/member-search` | 포인트 조회 (번호 입력 → 결과) | 대기화면 [포인트 조회] |
| `#/point-earn-flow` | 포인트 적립 | 캣포스 EARN_* · 단말기 001/002 |
| `#/point-use-flow` | 포인트 사용 (번호 입력 → 포인트 입력) | 캣포스 USE_POINT_REQ · 단말기 003 |
| `#/point-use-with-customer-flow` | 포인트 사용 (고객 지정, 번호 입력 없음) | 캣포스 USE_POINT_WITH_CUSTOMER_REQ |
| `#/result` | 결과 화면 (조회 · 적립 · 사용 · 포인트 부족) | 각 흐름 완료 |
| `#/price-display` | 가격표시기 | 캣포스 CART_UPDATE (대기 중일 때만) |
| `#/barcode-display` | 바코드 표시 | 단말기 005 |
| `#/settings` | 환경설정 (Figma) — 관리자 진입 후만 | 매장명 2초 길게 누르기 + 비밀번호 |
| `settings.html` | 플러그인 설정 (Toss SN · 시리얼 속도 · 진단 보내기) | 토스 관리자 '플러그인 설정' |

---

## 6. 외부 연동

### 6-1. 캣포스 — 웹소켓
- 플러그인이 **서버**, 캣포스가 클라이언트. 포트 **52391**, 경로 `/`, serverId `pharm-pad` (`src/pos/socket-config.ts`).
- 메시지는 JSON 텍스트 `{"command":"...","data":{...}}`. 자세한 필드는 `docs/websocket-protocol.md`, 가격표시기는 `catpos-cart-display-spec.md`.
- 회신은 마지막으로 메시지를 보낸 연결로 간다.

| 수신 command | 하는 일 | 회신 |
|---|---|---|
| CONNECT | 접속 확인 | CONNECT_ACK |
| PHONE_INPUT_REQ | 번호 입력 | PHONE_INPUT_ACK (번호) |
| CUSTOMER_REGISTER_REQ | 번호 입력 → 회원 조회 | CUSTOMER_REGISTER_ACK (번호 · 고객코드) |
| MARKETING_CONSENT_REQ | 번호 입력 → 약관 동의 | MARKETING_CONSENT_ACK (번호 · 마케팅 동의 여부) |
| EARN_SINGLE_REQ · EARN_MULTI_REQ | 적립 (단건 · 복합) | 성공 시 회신 없음 |
| USE_POINT_REQ | 사용 (번호 입력부터) | USE_POINT_ACK (고객코드 · 잔액 · 사용) |
| USE_POINT_WITH_CUSTOMER_REQ | 사용 (고객 지정) | USE_POINT_WITH_CUSTOMER_ACK (사용) |
| CART_UPDATE · CART_CLEAR | 가격표시기 갱신 · 종료 | 없음 |
| CANCEL | 대기화면 복귀 | 없음 |

취소 · 시간 초과 · 포인트 부족은 `FAIL` (사유 문구) 로 회신한다. 캣포스(Delphi)는 줄바꿈을 `\r\n` 으로만 인식한다.

### 6-2. 결제 단말기(CAT) — 시리얼
- 9600bps · 8N1. 명세: `terminal-serial-protocol-spec.md` · `terminal-005-999-spec.md`.
- 한 시리얼 포트로 팜포인트 전문과 결제(KIS VAN) 전문이 같이 들어온다. **`"XX"` 마커 + `"TRM"` 플래그**가 있는 전문만 팜포인트가 처리하고, 나머지는 `sdk.van.write` 로 VAN 모듈에 넘긴다.
- 유효 전문을 받으면 ACK(`06 06 06`)를 자동 회신한다.

| 수신 CMD | 하는 일 | 회신 |
|---|---|---|
| 001 · 002 | 적립 (단건 · 복합) | 성공 시 없음 (화면에서 완료) / 실패·취소 010 (INIT) |
| 003 | 사용 | 완료 004 (번호 · 잔액 · 사용) / 취소·시간 초과 010 (INIT) |
| 005 | 바코드(QR · EAN-13) 표시 | 006 |
| 999 | 단말기가 띄운 화면 닫기 | ACK 만 |

### 6-3. 팜포인트 서버
API 명세는 노션 "PharmPoint 토스 플러그인 API 명세" 참고. 요약:

| API | 용도 |
|---|---|
| `POST /api/v1/point/auth/enroll` · `/token` | 토큰 발급 · 재발급 (사업자번호 + 단말 시리얼) |
| `GET /api/terminals/customers` | 회원 조회 |
| `GET /api/terminals/customers/code` | 잔액 조회 |
| `POST /api/point/estimate` | 적립 예상 (8888 · 9303 이면 최대 3회) |
| `POST /api/terminals/customers/code` | 적립 확정 (매출순번 / 단건 / 복합) |
| `GET /api/point/settings` | 적립 사용 여부 |
| `POST /api/v1/plugin/settings/verify-password` | 관리자 비밀번호 (`platform: "TOSS"`) |

- 운영/개발 서버는 `src/api/config.ts` 의 `API_TARGET` 하나로 정한다. **배포본은 반드시 `"prod"`.**
- 포인트 사용은 API 없이 캣포스 · 단말기 회신만 한다.

---

## 7. 설정

### 7-1. 두 가지 설정 화면

| 화면 | 들어가는 법 | 항목 |
|---|---|---|
| 환경설정 (Figma) | 대기화면 **매장명 2초 길게 누르기** → 관리자 비밀번호(서버 대조) | 포인트설정 · 테마설정(대기화면 배경 A~E · 가격표시 라이트/다크) · 화면대기 |
| 플러그인 설정 (settings.html) | 토스 단말 설정 → 플러그인 → 플러그인 설정 | Toss SN · 시리얼 통신 속도 · 진단 보내기 |

- 환경설정은 비밀번호를 거치지 않고 주소(`#/settings`)로 들어오면 대기화면으로 돌려보낸다. 대기화면으로 돌아오면 다시 잠근다.
- 대기화면 **오른쪽 위 4번 연달아 탭** → 토스 단말 설정(`sdk.app.openSetting`). 토스 기본 대기화면의 숨은 동작(우측 상단 5회 + 7055)을 우리 화면이 덮어서 만든 대체 입구다.
- 매장명은 대기화면에 항상 보인다(관리자 진입 자리라 숨김 설정 없음).

### 7-2. 단말 저장소(`sdk.storage`) 키 — `src/shared/constants/storage-keys.ts`

| 키 | 기본값 | 내용 |
|---|---|---|
| `settings_min_point` | 1000 | 최소 사용 포인트 |
| `settings_is_min_point_enabled` | true | 최소 사용 포인트 사용 여부 |
| `settings_result_timeout_seconds` | 5 | 완료 화면 자동 꺼짐(초) |
| `settings_inactivity_timeout_seconds` | 30 | 입력 화면 미동작 자동 꺼짐(초) |
| `settings_idle_theme_index` | 0 | 대기화면 배경 테마 (0~4) |
| `settings_price_display_theme` | LIGHT | 가격표시 테마 |
| `settings_baud_rate` | - | 시리얼 통신 속도 |

네이버와 달리 설정을 서버(`/api/v1/plugin/settings`)에 저장하지 않는다.

---

## 8. 화면 동작 규칙 (자주 묻는 것)

- **무입력 타이머:** 입력 화면에서 설정 시간 동안 조작이 없으면 마지막 5초에 "대기화면으로 이동합니다" 팝업. 팝업이 떠 있는 동안은 **[계속 사용할게요]로만** 닫힌다(손가락이 닿는 순간 닫으면 뒤 화면이 같이 눌리던 문제 때문).
- **가격표시기:** 대기 상태에서만 띄운다. 고객이 번호 입력 · 결과 · 관리자 팝업 중이면 카트가 와도 화면을 바꾸지 않는다(로그에 "고객이 조작 중인 화면이라 그대로 둠").
- **결제금액 < 최소 사용 포인트:** 결과 화면 대신 입력 화면 위 "포인트를 사용할 수 없어요" 팝업 + 캣포스 FAIL.
- **오류 팝업:** 연결 실패 → "네트워크에 연결할 수 없어요", 서버 오류 → "일시적인 서버 오류가 발생했어요". 둘 다 [닫기] 하나. 와이파이 재연결은 플러그인에서 할 수 없다.
- **팝업 아이콘**은 코드 안(data URI)에 들어 있어 오프라인에서도 보인다.

---

## 9. 로그 · 진단

| 수단 | 내용 |
|---|---|
| `log.status` | 운영 빌드에서도 남는 연동 상태 줄. 줄머리 `[캣포스]` `[단말기]` `[팜포인트·적립]` 등이 그 일을 한 주체다 |
| `log.debug` · `log.info` | 개발 서버 · `build:verbose` 에서만 출력 (전문 덤프 · HTTP 본문) |
| 실시간 로그 | 개발 모드 단말 화면 위쪽의 `IP:PORT` 를 같은 네트워크 PC 브라우저로 연다 |
| Sentry | JS 오류 + 연동 끊김 자동 보고. 태그 `merchant`(사업자번호) · `device`(시리얼) 로 검색 |
| 진단 보내기 | settings.html 의 [진단 보내기] → 최근 연동 기록 · 현재 연결 상태를 Sentry 로 1건 전송 (1분에 1번) |

개인정보는 로그에서 가린다: 휴대폰 번호 뒤 4자리만, 고객명 · 비밀번호 · 토큰은 `***`.

---

## 10. 빌드 · 배포

1. `git status` 로 커밋 안 된 변경이 없는지 확인
2. `src/api/config.ts` 의 `API_TARGET` 이 `"prod"` 인지 확인
3. 빌드 · 압축
   ```powershell
   cd C:\Users\USER\WebProjects\PharmPointFrontPlugin; npm run build; if ($LASTEXITCODE -eq 0) { Compress-Archive -Path .\dist\* -DestinationPath ..\PharmPointFrontPlugin.zip -Force }
   ```
4. 토스 개발자센터 → 내 플러그인 → 개발 배포(테스트 단말 최대 5대, 검수 없음) 또는 라이브 배포(검수 월·목)
5. 단말 반영
   - 대기화면 오른쪽 위 4번 탭 → 설정 → `7055` → 플러그인 → 업데이트, 또는 **단말 재시작**
   - 라이브는 새벽 3~4시 프론트 재기동 때 자동 반영
   - 테스트 단말은 개발 배포만 받는다. 라이브 확인은 테스트 단말 등록 해제 + 재온보딩(설정 → 7055 → 매장명 → 로그아웃)

---

## 11. 테스트 방법

| 대상 | 방법 |
|---|---|
| 캣포스 요청 (예: 마케팅 동의) | 같은 네트워크 PC 에서 단말로 웹소켓 접속해 대신 보낸다 (아래) |
| 화면만 빨리 | `npm run dev` 후 콘솔: `sessionStorage.setItem("pharm_cat_request_mode","CAT_MARKETING_CONSENT"); location.reload();` |
| 네트워크 오류 팝업 | 번호 입력 화면에서 단말 와이파이를 끄고 [확인] |
| 서버 오류 팝업 | 개발 서버 콘솔에서 회원 조회 주소를 망가뜨린 뒤 [확인] (요청 URL 의 `/api/terminals/customers` 를 없는 경로로 바꾸는 XHR 패치) |
| settings.html | `npm run build` → `npm run preview` → `/settings.html` |

```powershell
node -e "const ws=new WebSocket('ws://단말IP:52391/');ws.onopen=()=>{ws.send(JSON.stringify({command:'MARKETING_CONSENT_REQ',data:{}}));console.log('요청 보냄')};ws.onmessage=e=>console.log('받음:',e.data)"
```

---

## 12. 알아둘 것 · 남은 일

- **Template API 예외:** 토스 검수 예외 승인으로 직접 그린 화면을 쓴다. 새 화면을 추가할 때도 같은 방식이지만, 검수 기준이 바뀌면 토스와 다시 확인해야 한다.
- **바코드 표시 화면**은 Figma 디자인이 없어 예전 HTML 화면 그대로다. 새 디자인이 나오면 공용 화면으로 옮기고, 그때 토스 디자인 시스템 CSS(`index.html` 의 tds · tps 링크)를 걷어낼 수 있다.
- **관리자 비밀번호**는 플랫폼(TOSS / NAVER)별 공통 고정값이다. 약국별 비밀번호는 장기 검토 과제.
- 네이버 커넥트의 CAT 릴레이 Base64(`==`) 거부 문제는 네이버 쪽만 해당한다. 토스는 시리얼을 직접 써서 영향이 없다.
- 루트의 명세 문서(`terminal-*.md` · `catpos-cart-display-spec.md`)와 `docs/websocket-protocol.md` 는 외부(단말기 · 캣포스 개발사)에 전달한 명세다. 프로토콜을 바꾸면 함께 고쳐 다시 전달한다. `websocket-protocol.md` 안의 소스 경로는 예전 구조 기준이다.
