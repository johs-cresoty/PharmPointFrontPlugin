/**
 * SocketEvent — 소켓에서 파싱된 도메인 이벤트 타입 (Android SocketEvent 미러)
 *
 * 사용:
 *   socketGateway.on(SocketEvent.TerminalEarnPointSingle, ({ fields }) => { ... });
 *   socketGateway.on(SocketEvent.CatRequestNum, () => { ... });
 */
window.SocketEvent = Object.freeze({

  // ── 단말기(TRM) 전문 ─────────────────────────
  TerminalEarnPointSingle:  'TERMINAL_EARN_POINT_SINGLE',   // 001
  TerminalEarnPointComplex: 'TERMINAL_EARN_POINT_COMPLEX',  // 002
  TerminalUsePoint:         'TERMINAL_USE_POINT',           // 003

  // ── 캣포스(CAT) 전문 ─────────────────────────
  CatConnect:               'CAT_CONNECT',                   // 000
  CatRequestNum:            'CAT_REQUEST_NUM',               // 001
  CatRequestCustomer:       'CAT_REQUEST_CUSTOMER',          // 002
  CatDisconnect:            'CAT_DISCONNECT',                // 003
  CatEarnPointSingle:       'CAT_EARN_POINT_SINGLE',         // 004
  CatEarnPointComplex:      'CAT_EARN_POINT_COMPLEX',        // 005
  CatUsePointNoCustomer:    'CAT_USE_POINT_NO_CUSTOMER',     // 006
  CatUsePointWithCustomer:  'CAT_USE_POINT_WITH_CUSTOMER',   // 007
});
