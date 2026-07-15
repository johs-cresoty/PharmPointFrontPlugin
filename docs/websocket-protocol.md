# PharmPoint 플러그인 WebSocket 프로토콜 명세

PharmPoint 토스 플러그인이 외부 시스템(POS PC, "캣포스") 과 주고받는 WebSocket 통신 규약.
이 문서는 플러그인 측 코드에 이미 구현된 송수신 형식을 정리한 것으로, 송신 측 (POS PC) 이 본 명세대로 메시지를 보내면 플러그인이 정상 동작한다.

---

## 1. 연결 정보

| 항목 | 값 |
|---|---|
| 통신 방식 | WebSocket (text frame) |
| 인코딩 | UTF-8 |
| 포트 | **52391** (변경 시 `SocketConfig.port` 참고) |
| 경로 | `/` |
| 서버 / 클라이언트 역할 | **플러그인이 WebSocket 서버**, POS PC 가 클라이언트로 접속 |
| Server ID | `pharm-pad` (`sdk.websocket.start` 의 serverId) |
| 메시지 포맷 | **JSON 텍스트** (감싸기 없음, 한 메시지 = 한 JSON) |

플러그인 측 구현: [src/shared/socket/transport/websocket-transport.js](../src/shared/socket/transport/websocket-transport.js) — Toss Front SDK 의 `sdk.websocket.start` API 위에 동작.

---

## 2. 메시지 공통 구조

모든 메시지는 다음 봉투(envelope) 형식을 따름:

```json
{ "command": "<명령어>", "data": { /* 명령별 페이로드 */ } }
```

- `command`: 명령 종류 (대문자 SNAKE_CASE)
- `data`: 명령별 데이터 객체. 데이터가 없을 때도 `{}` 로 보내야 함 (생략 금지)
- 알 수 없는 `command` 는 플러그인이 무시함

상수 정의: [src/shared/socket/protocol/socket-constants.js](../src/shared/socket/protocol/socket-constants.js)

---

## 3. 송신측 (POS PC → 플러그인) 명령

POS PC 가 플러그인에 보내는 명령들. 플러그인은 이 명령을 받아 해당 화면으로 전환한다.

### 3.1 `CONNECT` — 연결 알림

POS PC 가 접속 직후 보냄. 플러그인은 즉시 `CONNECT_ACK` 응답.

```json
{ "command": "CONNECT", "data": {} }
```

| 필드 | - |
|---|---|
| `data` | 빈 객체 |

---

### 3.2 `SESSION_START` / `SESSION_END` — CAT 세션 토글

POS PC 가 진행 중일 때 단말기(시리얼) 신호를 무시하도록 플러그인에 알림.

```json
{ "command": "SESSION_START", "data": {} }
{ "command": "SESSION_END",   "data": {} }
```

- `SESSION_START` 와 `SESSION_END` 사이에는 플러그인이 시리얼 단말기 전문을 모두 차단함.
- 응답 없음.

---

### 3.3 `PHONE_INPUT_REQ` — 휴대폰 번호 입력 요청

플러그인에 휴대폰 번호 입력 화면을 띄우고 사용자가 입력한 번호를 응답 받기 위한 명령.

```json
{ "command": "PHONE_INPUT_REQ", "data": {} }
```

플러그인 응답: [`PHONE_INPUT_ACK`](#41-phone_input_ack--휴대폰-번호-응답) 또는 [`FAIL`](#45-fail--사용자-취소)

---

### 3.4 `CUSTOMER_REGISTER_REQ` — 회원 조회/등록 요청

휴대폰 번호로 회원을 조회하고, 미등록이면 신규 등록 후 회원 코드를 응답.

```json
{ "command": "CUSTOMER_REGISTER_REQ", "data": {} }
```

플러그인 응답: [`CUSTOMER_REGISTER_ACK`](#42-customer_register_ack--회원-코드-응답) 또는 [`FAIL`](#45-fail--사용자-취소)

---

### 3.5 `EARN_SINGLE_REQ` — 단일 결제 적립 요청

단일 결제건에 대한 포인트 적립 흐름 시작.

```json
{
  "command": "EARN_SINGLE_REQ",
  "data": {
    "trnDate": "20260616",   // 거래 날짜 (yyyyMMdd)
    "appNum":  "00012345",    // 승인번호
    "method":  "M",            // 거래구분 (예: "M", "P" → 내부 "M" 정규화)
    "amount":  10000           // 결제 금액 (number 또는 정수형 문자열)
  }
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `trnDate` | string `yyyyMMdd` | ✓ | |
| `appNum` | string | ✓ | 카드사 승인번호 |
| `method` | string | ✓ | 결제수단 코드 |
| `amount` | number\|string | ✓ | 정수로 파싱됨 |

---

### 3.6 `EARN_MULTI_REQ` — 복합 결제 적립 요청

2건의 결제(예: 카드+현금)를 합산해 적립.

```json
{
  "command": "EARN_MULTI_REQ",
  "data": {
    "trnDate": "20260616",
    "payments": [
      { "appNum": "00012345", "method": "M", "amount": 7000 },
      { "appNum": "00012346", "method": "C", "amount": 3000 }
    ]
  }
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `trnDate` | string `yyyyMMdd` | ✓ | |
| `payments` | array of 2 items | ✓ | 정확히 2건 |
| `payments[i].appNum` | string | ✓ | |
| `payments[i].method` | string | ✓ | |
| `payments[i].amount` | number\|string | ✓ | |

총 결제 금액 = `payments[0].amount + payments[1].amount` (플러그인 측에서 자동 합산).

---

### 3.7 `USE_POINT_REQ` — 포인트 사용 요청 (고객 정보 없음)

휴대폰 번호 입력부터 시작하는 사용 흐름.

```json
{
  "command": "USE_POINT_REQ",
  "data": {
    "trnDate":   "20260616",
    "payAmount": 50000
  }
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `trnDate` | string `yyyyMMdd` | — | |
| `payAmount` | number\|string | ✓ | 결제 예정 금액 (사용 가능 포인트 상한 계산에 사용) |

플러그인 응답: [`USE_POINT_ACK`](#43-use_point_ack--포인트-사용-결과) 또는 [`FAIL`](#45-fail--사용자-취소)

---

### 3.8 `USE_POINT_WITH_CUSTOMER_REQ` — 포인트 사용 요청 (고객 정보 포함)

POS PC 가 이미 고객을 식별한 경우. 휴대폰 번호 입력 스킵하고 곧바로 사용 포인트 입력 화면으로.

```json
{
  "command": "USE_POINT_WITH_CUSTOMER_REQ",
  "data": {
    "balance":   112800,   // 고객의 현재 보유 포인트
    "payAmount": 50000     // 결제 예정 금액
  }
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `balance` | number\|string | ✓ | 보유 포인트 |
| `payAmount` | number\|string | ✓ | 결제 예정 금액 |

플러그인 응답: [`USE_POINT_WITH_CUSTOMER_ACK`](#44-use_point_with_customer_ack--포인트-사용-결과-고객-포함) 또는 [`FAIL`](#45-fail--사용자-취소)

---

### 3.9 `CANCEL` — 진행 중 취소

POS PC 측에서 현재 진행 중인 흐름을 취소 (예: POS 화면에서 취소 버튼). 플러그인은 대기 화면으로 복귀.

```json
{ "command": "CANCEL", "data": {} }
```

응답 없음.

---

## 4. 수신측 (플러그인 → POS PC) 명령

플러그인이 POS PC 에 보내는 응답 명령들.

### 4.1 `PHONE_INPUT_ACK` — 휴대폰 번호 응답

[`PHONE_INPUT_REQ`](#33-phone_input_req--휴대폰-번호-입력-요청) 에 대한 응답.

```json
{
  "command": "PHONE_INPUT_ACK",
  "data": { "phone": "01012345678" }
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `phone` | string (11자리) | 하이픈 없음 |

---

### 4.2 `CUSTOMER_REGISTER_ACK` — 회원 코드 응답

[`CUSTOMER_REGISTER_REQ`](#34-customer_register_req--회원-조회등록-요청) 에 대한 응답.

```json
{
  "command": "CUSTOMER_REGISTER_ACK",
  "data": {
    "phone":        "01012345678",
    "customerCode": "2106000002"
  }
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `phone` | string (11자리) | |
| `customerCode` | string | 회원 코드 |

---

### 4.3 `USE_POINT_ACK` — 포인트 사용 결과

[`USE_POINT_REQ`](#37-use_point_req--포인트-사용-요청-고객-정보-없음) 에 대한 응답 (포인트 사용 확정 후).

```json
{
  "command": "USE_POINT_ACK",
  "data": {
    "customerCode": "2106000002",
    "balance":      112800,
    "usePoint":     5000
  }
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `customerCode` | string | 식별된 고객 코드 |
| `balance` | number | 사용 직전 보유 포인트 |
| `usePoint` | number | 실제 사용 포인트 |

---

### 4.4 `USE_POINT_WITH_CUSTOMER_ACK` — 포인트 사용 결과 (고객 포함)

[`USE_POINT_WITH_CUSTOMER_REQ`](#38-use_point_with_customer_req--포인트-사용-요청-고객-정보-포함) 에 대한 응답.

```json
{
  "command": "USE_POINT_WITH_CUSTOMER_ACK",
  "data": { "usePoint": 5000 }
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `usePoint` | number | 실제 사용 포인트 |

---

### 4.5 `FAIL` — 사용자 취소

플러그인 화면에서 사용자가 ← / "다음에 하기" 등으로 취소하면 전송.

```json
{
  "command": "FAIL",
  "data": { "message": "다음에하기" }
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `message` | string | 현재 고정값 `"다음에하기"` |

---

### 4.6 `CONNECT_ACK` — 연결 확인 응답

[`CONNECT`](#31-connect--연결-알림) 수신 직후 자동 전송.

```json
{ "command": "CONNECT_ACK", "data": {} }
```

---

## 5. 요청 ↔ 응답 매핑 요약

| POS → 플러그인 (요청) | 플러그인 → POS (응답) |
|---|---|
| `CONNECT` | `CONNECT_ACK` (즉시) |
| `PHONE_INPUT_REQ` | `PHONE_INPUT_ACK` 또는 `FAIL` |
| `CUSTOMER_REGISTER_REQ` | `CUSTOMER_REGISTER_ACK` 또는 `FAIL` |
| `EARN_SINGLE_REQ` | 직접 응답 없음 (적립 완료 화면 자동 표시) |
| `EARN_MULTI_REQ` | 직접 응답 없음 |
| `USE_POINT_REQ` | `USE_POINT_ACK` 또는 `FAIL` |
| `USE_POINT_WITH_CUSTOMER_REQ` | `USE_POINT_WITH_CUSTOMER_ACK` 또는 `FAIL` |
| `CANCEL` | 응답 없음 (플러그인은 대기 화면으로 복귀) |
| `SESSION_START` / `SESSION_END` | 응답 없음 |

---

## 6. 동작 시나리오 (대표 예시)

### 6.1 단일 결제 후 포인트 적립

```
POS → 플러그인 :  CONNECT
플러그인 → POS :  CONNECT_ACK
POS → 플러그인 :  EARN_SINGLE_REQ { trnDate, appNum, method, amount }
                 (플러그인이 휴대폰 입력 화면 표시 + 사용자 입력 + 적립 API 자체 호출 + 완료 화면 표시)
```

### 6.2 포인트 사용 (고객 정보 없음)

```
POS → 플러그인 :  USE_POINT_REQ { trnDate, payAmount }
                 (플러그인이 휴대폰 입력 → 사용 포인트 입력 → 사용 처리 후 응답)
플러그인 → POS :  USE_POINT_ACK { customerCode, balance, usePoint }
```

### 6.3 포인트 사용 (POS 가 이미 고객 알고 있음)

```
POS → 플러그인 :  USE_POINT_WITH_CUSTOMER_REQ { balance, payAmount }
                 (플러그인이 사용 포인트 입력 화면 → 처리 후 응답)
플러그인 → POS :  USE_POINT_WITH_CUSTOMER_ACK { usePoint }
```

### 6.4 사용자 취소

```
POS → 플러그인 :  PHONE_INPUT_REQ {}
                 (사용자가 ← 또는 "다음에 하기" 클릭)
플러그인 → POS :  FAIL { message: "다음에하기" }
```

---

## 7. 송신 측 구현 체크리스트

- [ ] WebSocket 클라이언트로 `ws://<단말기-IP>:52391/` 에 접속
- [ ] 접속 직후 `CONNECT` 송신, `CONNECT_ACK` 수신 확인
- [ ] 각 명령의 `data` 필드를 반드시 객체로 포함 (`{}` 라도)
- [ ] `appNum`, `method`, `amount` 등 필수 필드 누락 시 플러그인이 정상 흐름 진행 못 함
- [ ] `EARN_*_REQ` 응답이 없는 점에 유의 — 적립은 플러그인이 직접 API 호출하여 완료
- [ ] `FAIL` 수신 시 진행 중인 요청을 취소 처리

---

## 8. 관련 코드 위치 (인수인계용)

| 파일 | 역할 |
|---|---|
| [src/shared/socket/protocol/socket-constants.js](../src/shared/socket/protocol/socket-constants.js) | 모든 명령 문자열 상수 |
| [src/shared/socket/protocol/catpos-codec.js](../src/shared/socket/protocol/catpos-codec.js) | JSON 인/디코더 + 응답 빌더 |
| [src/shared/socket/socket-events.js](../src/shared/socket/socket-events.js) | 명령 → 내부 도메인 이벤트 매핑 키 |
| [src/shared/socket/socket-gateway.js](../src/shared/socket/socket-gateway.js) | WebSocket transport 통합, 이벤트 dispatch, ACK 송신 헬퍼 |
| [src/shared/socket/transport/websocket-transport.js](../src/shared/socket/transport/websocket-transport.js) | Toss SDK 위 WebSocket 서버 래퍼 |
| [src/shared/socket/socket-config.js](../src/shared/socket/socket-config.js) | 포트, 서버 ID 등 런타임 설정 |
| [src/features/app-session/app-session.service.js](../src/features/app-session/app-session.service.js) | 명령 수신 → 화면 라우팅 결정 |
| [src/features/transaction-parser/transaction-parser.service.js](../src/features/transaction-parser/transaction-parser.service.js) | `EARN_*` / `USE_*` 데이터 → 내부 TransactionData 변환 |

---

## 9. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-06 | 초기 작성 — 현재 구현 기준 |
