/**
 * SocketConstants — 소켓 프로토콜 상수 (PharmPoint Android Val.kt 대응).
 *
 * 두 채널:
 *   1) Terminal(TRM)  : EUC-KR 바이너리 + STX/ETX/LRC  (시리얼 포트)
 *   2) CATPOS  (CAT)  : JSON {"command":"...","data":{...}}  (웹소켓)
 */
export const SocketConstants = {
  // ── 단말기(TRM) 명령 ─────────────────────────────
  TERMINAL_COMMAND_001: "001", // TRM → PAD : 포인트 적립
  TERMINAL_COMMAND_002: "002", // TRM → PAD : 포인트 적립(복합)
  TERMINAL_COMMAND_003: "003", // TRM → PAD : 포인트 사용 요청
  TERMINAL_COMMAND_004: "004", // TRM ← PAD : 포인트 사용 응답
  TERMINAL_COMMAND_005: "005", // TRM → PAD : 바코드 표시 요청
  TERMINAL_COMMAND_006: "006", // TRM ← PAD : 바코드 표시 응답
  TERMINAL_COMMAND_010: "010", // PAD → TRM : 취소
  TERMINAL_COMMAND_999: "999", // TRM → PAD : 화면 미노출(팜포인트 화면 종료). 응답 전문 없음(ACK 만)

  // ── 캣포스(CAT) 수신 커맨드 (PC → PAD) ────────────
  CATPOS_CONNECT:                     "CONNECT",
  CATPOS_PHONE_INPUT_REQ:             "PHONE_INPUT_REQ",
  CATPOS_CUSTOMER_REGISTER_REQ:       "CUSTOMER_REGISTER_REQ",
  CATPOS_CANCEL:                      "CANCEL",
  CATPOS_EARN_SINGLE_REQ:             "EARN_SINGLE_REQ",
  CATPOS_EARN_MULTI_REQ:              "EARN_MULTI_REQ",
  CATPOS_USE_POINT_REQ:               "USE_POINT_REQ",
  CATPOS_USE_POINT_WITH_CUSTOMER_REQ: "USE_POINT_WITH_CUSTOMER_REQ",
  CATPOS_MARKETING_CONSENT_REQ:       "MARKETING_CONSENT_REQ",
  CATPOS_SESSION_START:               "SESSION_START",
  CATPOS_SESSION_END:                 "SESSION_END",
  // 고객 가격표시기 (catpos-cart-display-spec.md)
  CATPOS_CART_UPDATE:                 "CART_UPDATE",           // POS → PAD : 카트 스냅샷 갱신
  CATPOS_CART_CLEAR:                  "CART_CLEAR",            // POS → PAD : 결제 개시 직전 종료

  // ── 캣포스(CAT) 송신 커맨드 (PAD → PC) ────────────
  CATPOS_CONNECT_ACK:                 "CONNECT_ACK",
  CATPOS_PHONE_INPUT_ACK:             "PHONE_INPUT_ACK",
  CATPOS_CUSTOMER_REGISTER_ACK:       "CUSTOMER_REGISTER_ACK",
  CATPOS_USE_POINT_ACK:               "USE_POINT_ACK",
  CATPOS_USE_POINT_WITH_CUSTOMER_ACK: "USE_POINT_WITH_CUSTOMER_ACK",
  CATPOS_MARKETING_CONSENT_ACK:       "MARKETING_CONSENT_ACK",
  CATPOS_FAIL:                        "FAIL",

  // ── 단말기 전문 ASCII 제어문자 ───────────────────
  TERMINAL_FLAG: "TRM",
  COMM_STX: 0x02,
  COMM_ETX: 0x03,
  COMM_FS:  0x1C,
  COMM_ACK: 0x06,
  COMM_NAK: 0x15,

  KOR_CHARSET: "euc-kr",
} as const;
