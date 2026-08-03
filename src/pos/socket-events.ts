/**
 * SocketEvent — 소켓에서 파싱된 도메인 이벤트 (PharmPoint Android SocketEvent 미러).
 *
 * 사용:
 *   socketGateway.on(SocketEvent.TerminalEarnPointSingle, ({ fields }) => { ... });
 *   socketGateway.on(SocketEvent.CatRequestNum, () => { ... });
 */
export const SocketEvent = {
  // ── 단말기(TRM) 전문 ─────────────────────────
  TerminalEarnPointSingle:  "TERMINAL_EARN_POINT_SINGLE",   // 001
  TerminalEarnPointComplex: "TERMINAL_EARN_POINT_COMPLEX",  // 002
  TerminalUsePoint:         "TERMINAL_USE_POINT",           // 003

  // ── 캣포스(CAT) 전문 ─────────────────────────
  CatConnect:              "CAT_CONNECT",                   // CONNECT
  CatRequestNum:           "CAT_REQUEST_NUM",               // PHONE_INPUT_REQ
  CatRequestCustomer:      "CAT_REQUEST_CUSTOMER",          // CUSTOMER_REGISTER_REQ
  CatDisconnect:           "CAT_DISCONNECT",                // CANCEL
  CatEarnPointSingle:      "CAT_EARN_POINT_SINGLE",         // EARN_SINGLE_REQ
  CatEarnPointComplex:     "CAT_EARN_POINT_COMPLEX",        // EARN_MULTI_REQ
  CatUsePointNoCustomer:   "CAT_USE_POINT_NO_CUSTOMER",     // USE_POINT_REQ
  CatUsePointWithCustomer: "CAT_USE_POINT_WITH_CUSTOMER",   // USE_POINT_WITH_CUSTOMER_REQ
  CatMarketingConsent:     "CAT_MARKETING_CONSENT",         // MARKETING_CONSENT_REQ
} as const;

export type SocketEventType = typeof SocketEvent[keyof typeof SocketEvent];
