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
  TerminalBarcodeDisplay:   "TERMINAL_BARCODE_DISPLAY",     // 005
  TerminalHideScreen:       "TERMINAL_HIDE_SCREEN",         // 999

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

  // ── 고객 가격표시기 (catpos-cart-display-spec.md) ──
  CatCartUpdate:           "CAT_CART_UPDATE",               // CART_UPDATE — 카트 스냅샷 갱신
  CatCartClear:            "CAT_CART_CLEAR",                // CART_CLEAR — 결제 개시 직전 종료
} as const;

export type SocketEventType = typeof SocketEvent[keyof typeof SocketEvent];
