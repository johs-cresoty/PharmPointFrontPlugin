# PharmPointFrontPlugin 인수인계 문서

> 본 문서는 PharmPoint 토스 플레이스 프론트 플러그인 프로젝트의 전반적인 구조, 핵심 흐름, API 명세, 운영 정보를 정리한 인수인계 자료입니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| **프로젝트명** | PharmPointFrontPlugin (cresoty-pharmpoint) |
| **목적** | 약국용 POS 단말기(태블릿) 에서 동작하는 토스 플레이스 프론트 플러그인. 약사가 결제 시점에 고객 포인트를 적립/사용/조회 |
| **배포 형태** | Toss Place 플랫폼이 호스팅하는 정적 웹 (HTML/CSS/JS) |
| **배포 URL** | `https://cresoty-pharmpoint.plugin.tossplace.com` |
| **타겟 환경** | Toss 플러그인 WebView (Android 기반) |
| **연동 시스템** | (1) Catpos POS PC → WebSocket / (2) 외부 카드 단말기 → Serial / (3) 매장 운영 백엔드 (catpos.co.kr) → HTTPS API |
| **자매 프로젝트** | `PharmPoint` (안드로이드 네이티브 앱) — 동일 비즈니스 로직의 안드로이드 구현. 본 플러그인이 이를 미러링 |

### 1.1 안드로이드와의 관계
모든 비즈니스 로직은 안드로이드 PharmPoint 앱의 대응 클래스를 미러링했습니다. 코드 곳곳에 `Android: <대응 클래스명>` 주석이 있어 두 프로젝트 간 매핑이 명확합니다.

예: `PharmHttpClient` ↔ Android `CryptoInterceptor`, `PointTransactionService` ↔ Android `CatposCloudApi.estimatePoint/upsertCustomerPoint`

---

## 2. 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 | Vanilla JavaScript (ES2020+), HTML, CSS |
| 빌드 | 별도 빌드 도구 없음 — `bundle.js` 가 수동 단일 번들 (`src/**/*.js` concat) |
| UI 프레임워크 | 없음 — Toss Front SDK 의 템플릿 API + 일부 커스텀 HTML 오버레이 |
| Toss SDK | `https://cdn.tossplace.com/toss-front-sdk/v0/index.js` (전역 `sdk` 객체) |
| WebSocket 서버 | Toss SDK 의 `sdk.websocket.start` 사용 (플러그인이 서버 역할) |
| Serial 통신 | Toss SDK 의 `sdk.serial.*` 사용 (RS-232 카드 단말기) |
| 저장소 | `sdk.storage` (key-value) |

---

## 3. 폴더 구조

```
PharmPointFrontPlugin/
├── *.html                  # 화면별 페이지 (entry HTML)
│   ├── index.html               — 시작 페이지 (실사용 X, 진입 redirect)
│   ├── onboarding.html          — 약국 초기 등록 (사업자번호 등)
│   ├── home.html                — 대기 화면 (idle)
│   ├── member-search.html       — 포인트 조회 (휴대폰 입력)
│   ├── point-earn-flow.html     — 포인트 적립 흐름 (휴대폰 입력 + 적립 확정)
│   ├── point-use-flow.html      — 포인트 사용 흐름 (휴대폰 입력 → 포인트 입력)
│   ├── point-use-with-customer-flow.html  — 포인트 사용 (캣포스가 고객 식별)
│   ├── result.html              — 조회 결과 화면
│   ├── settings.html            — 환경설정 (최소 포인트, 결과 화면 시간 등)
│   ├── order.html / payment.html — (사용 안 됨, 향후 확장용)
│
├── bundle.js               # 빌드 산출물 (모든 src/*.js 통합)
├── sdk.js                  # 토스 SDK 글로벌 alias 설정
├── global.css              # 공통 스타일
│
├── docs/
│   ├── handover.md              — 이 문서
│   └── websocket-protocol.md    — WebSocket 통신 명세
│
└── src/                    # 소스 코드 (편집 시 bundle.js 도 재생성/수동 갱신 필요)
    ├── features/                # 도메인별 서비스
    │   ├── app-config/                — 환경설정 read/write
    │   ├── app-session/               — 소켓 이벤트 → 화면 라우팅
    │   ├── point-earn/                — 적립 orchestration
    │   ├── point-estimate/            — 적립 예상 계산
    │   ├── point-inquiry/             — 고객/잔액 조회
    │   ├── point-settings/            — 적립 설정 조회
    │   ├── point-transaction/         — 적립/사용 확정 (upsert)
    │   ├── point-use/                 — 사용 orchestration
    │   ├── result-page/               — 결과 화면 (renderResultPage 래퍼)
    │   └── transaction-parser/        — 소켓 raw 필드 → TransactionData 변환
    └── shared/
        ├── constants/
        │   ├── api-config.js          — baseUrl, taxNo, cmptrName 등
        │   └── storage-keys.js        — sdk.storage 키 모음
        ├── http/
        │   └── http-client.js         — 암호화 인터셉터 포함 fetch 래퍼
        ├── socket/
        │   ├── protocol/
        │   │   ├── socket-constants.js  — 명령 상수 (CAT/TRM)
        │   │   ├── catpos-codec.js      — CAT JSON 인/디코더
        │   │   └── terminal-codec.js    — 단말기 바이너리 프레임 인/디코더
        │   ├── transport/
        │   │   ├── websocket-transport.js  — sdk.websocket 래퍼
        │   │   └── serial-transport.js     — sdk.serial 래퍼
        │   ├── socket-config.js         — 포트, 보레이트 등
        │   ├── socket-events.js         — 도메인 이벤트 이름
        │   └── socket-gateway.js        — 두 채널 통합 dispatcher
        └── utils/
            └── crypt.js                 — Cresoty 자체 암호화 (^ 구분자)
```

### 3.1 빌드 / 배포
- **현재 빌드 도구 없음**. `src/*.js` 수정 시 `bundle.js` 의 해당 섹션을 *수동으로* 동기화해야 함.
- `bundle.js` 는 IIFE 들의 단순 concat. 파일별 경계는 `/* ===== src/.../file.js ===== */` 주석으로 구분.
- 향후 esbuild / rollup 도입 권장 — 누락된 동기화 방지.
- 배포는 Toss Place 콘솔에 zip 업로드 (개발자센터 → 내 애플리케이션 → 배포).

---

## 4. 핵심 비즈니스 흐름

### 4.1 화면 전환 구조

```
home.html (대기)
  ├─ "포인트 조회" 버튼 → member-search.html → result.html
  ├─ Catpos WebSocket 명령 수신
  │   ├─ CONNECT             → 자동 ACK
  │   ├─ PHONE_INPUT_REQ     → home.html 내에서 renderPhoneInput (오버레이)
  │   ├─ CUSTOMER_REGISTER_REQ → renderCustomerLookup (오버레이)
  │   ├─ EARN_SINGLE/MULTI_REQ → point-earn-flow.html
  │   ├─ USE_POINT_REQ        → point-use-flow.html
  │   └─ USE_POINT_WITH_CUSTOMER_REQ → point-use-with-customer-flow.html
  └─ Serial 단말기 전문 수신
      ├─ 001 (단일 결제)  → point-earn-flow.html
      ├─ 002 (복합 결제)  → point-earn-flow.html
      └─ 003 (사용 요청)  → point-use-flow.html
```

### 4.2 포인트 적립 (적립 화면 진입 후)

```
1. point-earn-flow.html 로드
2. sessionStorage 의 ctx 로드 (trnDate, appNum, method, amount, payments 등)
3. POST /api/point/estimate  ← 적립 예상 P + SLE_SEQ 수령 (병렬, async)
   * CODE 8888 / 9303 → 1s, 2s 백오프로 최대 3회 재시도
4. 사용자 휴대폰 11자리 + 동의 → 확인 클릭
5. POST /api/terminals/customers/code  ← 적립 확정
   * sleSeq 있으면 BySleSeq, 없으면 결제 정보 기반
6. 응답 OK → ResultPageService.showEarnSuccess (renderResultPage)
7. 결과 화면 타이머 종료 → home.html 로 복귀
```

### 4.3 포인트 사용

`point-use-flow.html`:
```
1. ctx 로드 (payAmount 등)
2. 휴대폰 11자리 입력 + 확인
3. GET /api/terminals/customers       ← 회원 등록 여부 (LIST 빔/안빔)
   * 비어있으면 "등록된 회원이 없습니다." 토스트, 재시도 가능
4. GET /api/terminals/customers/code  ← 상세 (보유 포인트, 코드, 이름)
5. 잔액 검증 (최소 포인트, balance > 0)
   * 부족 시 ResultPageService.showInsufficientPoint + sendCATFail (CAT 소스만)
6. 사용 포인트 입력 화면 (number 키패드)
   * 입력 < minPoint → 사용하기 버튼 비활성
   * 입력 > 보유 → 자동으로 보유값으로 보정
7. 사용하기 클릭 → SocketGateway 로 source 별 응답 송신
   * TERMINAL → 단말기 004 전문
   * CAT      → CATPOS USE_POINT_ACK
8. ResultPageService.showUseSuccess
```

`point-use-with-customer-flow.html`: 위 1~4 단계 스킵 (캣포스가 balance/payAmount 이미 전달). 5단계부터 동일.

### 4.4 포인트 조회

`member-search.html`:
```
1. 휴대폰 11자리 입력 + 확인
2. GET /api/terminals/customers  ← 등록 여부
   * 비어있으면 "등록된 회원이 없습니다." 토스트
3. GET /api/terminals/customers/code  ← 상세
4. result.html 로 이동 (sessionStorage 로 전달)
5. renderResultPage 로 표시
```

---

## 5. API 명세 (catpos.co.kr 백엔드)

### 5.1 공통 사항

| 항목 | 값 |
|---|---|
| **Base URL (DEV)** | `http://dev.catpos.co.kr` |
| **Base URL (PROD)** | `http://catpos.co.kr:13922` |
| **선택 기준** | `location.hostname` 이 localhost 면 DEV, 그 외 PROD |
| **응답 포맷** | `{ MSG, CODE, DATA, DTL }` 표준 envelope (Catpos 표준) |
| **인증** | 별도 토큰 없음 — TAXNO + 단말 식별자(CMPTR_NAME) 기반 |
| **암호화** | 모든 요청 파라미터/본문 값은 [CresotyCrypt](../src/shared/utils/crypt.js) 로 암호화 후 전송. 응답에 `^` 포함된 문자열은 자동 복호화 |
| **공통 응답 코드** | `0000` 성공 / `8888`,`9303` 일시적 (estimate 재시도) / 그 외 비즈니스 에러 |

### 5.2 공통 파라미터 (대부분 요청에 포함)

| 필드 | 의미 | 출처 |
|---|---|---|
| `TAXNO` | 약국 사업자번호 (10자리) | `sdk.app.getMerchant().businessNumber` |
| `CMPTR_NAME` | 단말 식별자 (고정 "TossFront_Plugin") | `ApiConfig.cmptrName` |
| `POS_VER` | 단말 앱 버전 (현재 "1.0.0") | `ApiConfig.posVer` |
| `POS_GUBN` | POS 구분 ("CP" = Catpos Plugin) | `ApiConfig.posGubn` |
| `CST_HP` | 고객 휴대폰 11자리 (하이픈 없음) | 사용자 입력 |

### 5.3 엔드포인트 목록

| # | 메서드 | 경로 | 용도 | 사용 서비스 |
|---|---|---|---|---|
| 1 | GET | `/api/terminals/customers` | 회원 등록 여부 + 기본 정보 (LIST) | `PointInquiryService.getCustomer` |
| 2 | GET | `/api/terminals/customers/code` | 회원 상세 + 잔액 (INFO) | `PointInquiryService.getPointBalance` |
| 3 | POST | `/api/terminals/customers/code` | 포인트 적립 확정 (upsert) | `PointTransactionService.commit*` |
| 4 | POST | `/api/point/estimate` | 적립 예상 포인트 + SLE_SEQ 발급 | `PointTransactionService.estimatePoint` |
| 5 | GET | `/api/point/settings` | 적립 기능 사용 여부 | `PointSettingsService.getPointSaveSetting` |
| 6 | GET | `/api/point/payment-settings` | 최소 사용 포인트 (BASE_AMT) | `PointSettingsService.getPointAmountSetting` |

---

### 5.4 엔드포인트 상세

#### ① GET `/api/terminals/customers`
> 휴대폰 번호로 등록된 회원 존재 여부 확인. LIST 비어있으면 미등록.

**Query Params**
```
TAXNO, CST_HP, CMPTR_NAME, POS_VER
```

**Response**
```json
{
  "MSG":  "",
  "CODE": "0000",
  "DATA": {
    "LIST": [
      {
        "CST_CODE": "2106000002",
        "CST_HP":   "01012345678",
        "CST_NAME": "홍길동",
        "CST_GNDR": "M",
        "CST_BRTH": "19900101",
        "PNT_AMT":  "12000"
      }
    ]
  },
  "DTL":  ""
}
```

- `LIST` 가 빈 배열 = 미등록 회원 (에러 아님)
- 동일 번호로 여러 명 등록 가능 — 플러그인은 `LIST[0]` 만 사용

---

#### ② GET `/api/terminals/customers/code`
> 고객 코드 + 상세 정보 + 잔액 조회 (최근 방문 고객 1명).

**Query Params**
```
TAXNO, CST_HP, CMPTR_NAME, POS_VER, POS_GUBN
```

**Response**
```json
{
  "MSG":  "",
  "CODE": "0000",
  "DATA": {
    "INFO": [
      {
        "CST_CODE": "2106000002",
        "CST_HP":   "01012345678",
        "CST_NAME": "홍길동",
        "CST_GNDR": "M",
        "CST_BRTH": "19900101",
        "PNT_BLC":  "12000"
      }
    ]
  },
  "DTL":  ""
}
```

- `INFO[0]` 한 건만 사용
- `PNT_BLC` (잔액) 사용 — `PNT_AMT` 와 다름에 주의

---

#### ③ POST `/api/terminals/customers/code` (적립 확정)
> 3가지 호출 형태가 있음. 본문 구성에 따라 서버가 적립 방식 선택.

**Body — (a) SLE_SEQ 기반**
```json
{
  "TAXNO":      "1234567890",
  "CMPTR_NAME": "TossFront_Plugin",
  "POS_VER":    "1.0.0",
  "CST_HP":     "01012345678",
  "TRN_DATE":   "20260616",
  "SLE_SEQ":    "704208459"
}
```

**Body — (b) 단건 결제 정보 기반**
```json
{
  "TAXNO":      "...",
  "CMPTR_NAME": "...",
  "POS_VER":    "...",
  "CST_HP":     "...",
  "TRN_DATE":   "20260616",
  "TRN_GUBN":   "M",
  "TRN_TIME":   "143000",
  "TRN_AMT":    "10000",
  "APP_NUM":    "00012345"
}
```

**Body — (c) 복합 결제 정보 기반**
```json
{
  "TAXNO":      "...",
  "CMPTR_NAME": "...",
  "POS_VER":    "...",
  "CST_HP":     "...",
  "TRN_DATE":   "20260616",
  "TRN_AMT":    "10000",
  "ADD": [
    { "TRN_GUBN": "M", "TRN_DATE": "20260616", "TRN_TIME": "143000", "APP_NUM": "00012345", "TRN_AMT": "7000" },
    { "TRN_GUBN": "C", "TRN_DATE": "20260616", "TRN_TIME": "143000", "APP_NUM": "00012346", "TRN_AMT": "3000" }
  ]
}
```

**Response (성공)**
```json
{
  "MSG":  "",
  "CODE": "0000",
  "DATA": {
    "INFO": [{
      "SLE_SEQ":  "704208459",
      "CST_CODE": "2106000002",
      "CST_HP":   "01012345678",
      "CST_NAME": "홍길동",
      "PNT_AMT":  "100",
      "PNT_BLC":  "12100"
    }]
  },
  "DTL":  ""
}
```

- `PNT_AMT`: 이번 거래로 적립된 포인트
- `PNT_BLC`: 적립 후 총 잔액

**Fallback 동작**: 플러그인은 sleSeq 로 commit 실패 시 자동으로 (b)/(c) 방식으로 1회 재시도 (`commitWithFallback`).

---

#### ④ POST `/api/point/estimate` (적립 예상)
> 결제 정보로 적립 예상 포인트 및 SLE_SEQ 발급.

**Body — 단건**
```json
{
  "TAXNO":      "...",
  "CMPTR_NAME": "...",
  "POS_VER":    "...",
  "TRN_DATE":   "20260616",
  "TRN_GUBN":   "M",
  "TRN_AMT":    "10000",
  "APP_NUM":    "00012345"
}
```

**Body — 복합**
```json
{
  "TAXNO":      "...",
  "CMPTR_NAME": "...",
  "POS_VER":    "...",
  "ADD": [
    { "TRN_GUBN": "M", "TRN_DATE": "20260616", "TRN_TIME": "143000", "APP_NUM": "00012345", "TRN_AMT": "7000" },
    { "TRN_GUBN": "C", "TRN_DATE": "20260616", "TRN_TIME": "143000", "APP_NUM": "00012346", "TRN_AMT": "3000" }
  ]
}
```

**Response**
```json
{
  "MSG":  "",
  "CODE": "0000",
  "DATA": {
    "INFO": [{
      "SLE_SEQ": "704208459",
      "PNT_AMT": "100"
    }]
  },
  "DTL":  ""
}
```

**재시도 정책** (`PointTransactionService.estimatePoint`)
- `CODE` 가 `8888` 또는 `9303` 이면 일시 실패 — 1초 후 1회, 2초 후 1회 추가 시도 (총 3회)
- 3회 모두 실패 시 graceful: `{ success: true, data: null, retried: true }` → SLE_SEQ 없이 적립 단계 진행 (b)/(c) 폴백)

---

#### ⑤ GET `/api/point/settings`
> 매장의 적립 기능 사용 여부 확인.

**Query Params**
```
TAXNO, CMPTR_NAME, POS_VER, POS_GUBN
```

**Response**
```json
{
  "MSG": "", "CODE": "0000",
  "DATA": { "INFO": [{ "PNT_GUBN": "USE" }] },
  "DTL": ""
}
```

- `PNT_GUBN === "NON"` 이면 적립 비활성 → 플러그인은 적립 흐름 자동 차단
- 그 외 ("USE" 등) → 적립 활성

---

#### ⑥ GET `/api/point/payment-settings`
> 최소 사용 포인트 (가장 작은 BASE_AMT) 조회.

**Query Params**
```
TAXNO, CMPTR_NAME, POS_VER, POS_GUBN
```

**Response**
```json
{
  "MSG": "", "CODE": "0000",
  "DATA": {
    "INFO": [
      { "BASE_AMT": "1000" },
      { "BASE_AMT": "5000" }
    ]
  },
  "DTL": ""
}
```

- 여러 BASE_AMT 중 `Math.min` 값을 사용 (위 예시 → 1000)
- 응답이 비어있으면 기본값 `20000` 사용

---

## 6. WebSocket 프로토콜 (Catpos PC ↔ 플러그인)

별도 문서 [docs/websocket-protocol.md](./websocket-protocol.md) 참조.

요약:
- 플러그인이 **서버 역할** (port 52391, path `/`)
- 메시지 봉투: `{ "command": "...", "data": {...} }`
- 송수신 명령 10여 개 (`EARN_SINGLE_REQ`, `USE_POINT_ACK` 등)

---

## 7. Serial 통신 (외부 카드 단말기)

| 항목 | 값 |
|---|---|
| 방식 | RS-232 (Toss SDK `sdk.serial.*`) |
| 보레이트 | 9600 |
| 프레임 | STX(0x02) + 본문 + ETX(0x03) + LRC |
| 인코딩 | EUC-KR |
| FS 구분자 | 0x1C |
| ACK / NAK | 0x06 / 0x15 |
| 명령 | 001 (적립 단일) / 002 (적립 복합) / 003 (사용 요청) / 004 (사용 응답) / 010 (취소) |

상세는 [terminal-codec.js](../src/shared/socket/protocol/terminal-codec.js) 참고.

**CAT 세션 활성 중에는 단말기 신호 전부 차단** (Catpos PC 가 진행 중일 때 단말기와 충돌 방지).

---

## 8. 토스 Front SDK 사용 요약

| API | 용도 |
|---|---|
| `sdk.template.renderIdlePage` | 대기 화면 (home.html) |
| `sdk.template.renderInputPage({ type: 'phone' })` | 휴대폰 번호 입력 |
| `sdk.template.renderInputPage({ type: 'number' })` | 사용 포인트 입력 |
| `sdk.template.renderResultPage` | 적립/사용/조회 결과 화면 |
| `sdk.template.openToast` | 토스트 메시지 (**커스텀 AppToast 로 override 됨** — `bundle.js` 끝부분 참조) |
| `sdk.app.getMerchant` | 사업자번호 + 매장명 조회 |
| `sdk.storage.get/set` | 환경설정 저장 |
| `sdk.websocket.start/close/send` | Catpos PC 통신 |
| `sdk.serial.*` | 단말기 통신 |
| `sdk.payment.requestPayment` | (현재 미사용, 향후 결제 직접 연동 대비) |

### 8.1 토스 docs 접근 불가 시
`docs.tossplace.com` 가 403 으로 막혀있을 때가 있음. 그땐 CDN 번들에서 직접 시그니처 확인:
```bash
curl -sL "https://cdn.tossplace.com/toss-front-sdk/v0/index.js" -o /tmp/toss-sdk.js
grep -oE 'renderXxxPage=function\([^}]{0,500}' /tmp/toss-sdk.js
```

### 8.2 커스텀 UI 패턴
입력 화면 등 일부 화면에선 토스 SDK 의 풀스크린 템플릿 위에 **`position: fixed` 오버레이** 로 커스텀 헤더/푸터를 덮는 구조 사용. 자세히는 `point-earn-flow.html` 의 `.overlay-top` / `.overlay-bottom` CSS 와 `body > #app { padding-top/-bottom }` 참고.

---

## 9. 환경설정 (sdk.storage 키)

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `min_point` | number | 0 | 최소 사용 포인트 |
| `is_min_point_enabled` | boolean | false | 최소 포인트 활성 여부 (min_point > 0 일 때 자동 true) |
| `show_store_name` | boolean | true | 대기 화면에 매장명 노출 |
| `result_timeout_seconds` | number (3~10) | 5 | 결과 화면 자동 닫힘 시간 |

수정 화면: `settings.html`. read/write: [AppConfigService](../src/features/app-config/app-config.service.js).

---

## 10. 알려진 이슈 / 진행 중

### 10.1 ⚠️ CORS 미설정 (서버 측 작업 필요)
플러그인 도메인 (`https://cresoty-pharmpoint.plugin.tossplace.com`) 에서 catpos 백엔드 POST API 호출 시 CORS preflight 가 차단됨. **백엔드에 다음 설정 요청 필요**:

```
Access-Control-Allow-Origin: https://cresoty-pharmpoint.plugin.tossplace.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
+ OPTIONS 메서드 200 응답
```

GET 은 simple request 라 preflight 없이 통과 (mixed content 경고만), POST 는 차단됨.
- 영향 받는 endpoint: `/api/terminals/customers/code` (POST), `/api/point/estimate`
- DEV / PROD 양 환경 동일 적용 필요

### 10.2 ⚠️ HTTP 통신 (Mixed Content)
catpos 백엔드가 HTTPS 미지원 → 플러그인(HTTPS) 에서 HTTP 호출 시 Mixed Content 경고. 토스 WebView 는 현재 허용하지만 향후 차단될 수 있으니 **catpos HTTPS 화** 권장.

### 10.3 빌드 도구 부재
`src/*.js` 수정 시 `bundle.js` 수동 동기화 필요. 누락 사고 방지를 위해 esbuild/rollup 도입 권장.

---

## 11. 개발 / 테스트 팁

### 11.1 로컬 테스트
- 페이지를 `localhost`/`127.0.0.1` 로 띄우면 `ApiConfig.baseUrl` 이 자동으로 DEV URL 반환
- 실제 플러그인 환경 (Toss WebView) 흐름 테스트는 토스 콘솔에 zip 업로드 + 단말기 연결 필요

### 11.2 임시로 DEV 강제하기
`src/shared/constants/api-config.js` 의 `baseUrl` getter 를 `BASE_URL_DEV` 반환으로 일시 변경 (현재 코드에서 반드시 원복할 것).

### 11.3 로그 확인
- 플러그인 콘솔: 토스 개발자 도구 → 로그 뷰어 (보통 `192.168.x.x:9900/logs` 같은 로컬 stream)
- WebSocket 송수신은 `[WS]` 태그로 모두 콘솔에 출력
- HTTP 응답 에러는 `console.warn` / `console.error` 로 출력

### 11.4 sessionStorage 키 (페이지 간 데이터 전달)
| 키 | 사용처 |
|---|---|
| `pharm_lookup_result` | 조회 결과 → result.html |
| `pharm_earn_point_ctx` | 적립 흐름 컨텍스트 → point-earn-flow.html |
| `pharm_use_point_ctx` | 사용 흐름 컨텍스트 → point-use-flow.html |
| `pharm_use_point_with_customer_ctx` | 고객 정보 포함 사용 → point-use-with-customer-flow.html |

---

## 12. 자주 묻는 질문

### Q. `bundle.js` 와 `src/*.js` 의 관계?
A. `bundle.js` 는 `src/*.js` 의 모든 IIFE 를 단순 concat 한 결과물. 빌드 도구가 없어서 **현재는 수동 동기화**. 페이지(HTML)는 `bundle.js` 만 로드함. 따라서 `src` 수정 후 반드시 `bundle.js` 의 해당 섹션도 같이 수정.

### Q. 응답에 `^` 기호가 들어간 이상한 문자열은?
A. Catpos 의 자체 암호화 (CresotyCrypt) 결과물. `^` 는 length-prefix 구분자. [`PharmHttpClient`](../src/shared/http/http-client.js) 가 자동 복호화하므로 일반 코드에선 신경 쓸 필요 없음.

### Q. 안드로이드 앱과 비즈니스 로직이 달라지면?
A. 안드로이드 앱이 원본(spec)이고 본 플러그인은 미러링. 새 변경은 안드로이드 먼저 반영 후 본 프로젝트에 포팅하는 흐름이 자연스러움. 코드 주석의 `Android: <클래스명>` 가 매핑 단서.

---

## 13. 관련 문서 / 링크

| 자료 | 경로 |
|---|---|
| WebSocket 프로토콜 명세 | [docs/websocket-protocol.md](./websocket-protocol.md) |
| 코딩 컨벤션 / 아키텍처 원칙 | [CLAUDE.md](../CLAUDE.md) |
| Toss Place 개발자센터 | https://docs.tossplace.com (인증 필요 — 403 자주 발생) |
| Toss Front SDK 번들 | https://cdn.tossplace.com/toss-front-sdk/v0/index.js |
| 안드로이드 미러링 원본 | (사내 git) `PharmPoint` 프로젝트 |

---

## 14. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-06 | 초기 인수인계 문서 작성 — 현재 구현 기준 정리 |
