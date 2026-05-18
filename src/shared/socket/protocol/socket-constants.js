/**
 * SocketConstants — TCP 소켓 프로토콜 상수 (Android Val.kt 미러)
 *
 * 두 가지 채널 전문:
 *   1) Terminal(TRM)  : EUC-KR 바이너리 + STX/ETX/LRC  (시리얼 포트)
 *   2) CATPOS  (CAT)  : UTF-8 텍스트 "CAT|cmd|f1|f2\r\n"   (웹소켓)
 */
window.SocketConstants = Object.freeze({

  // ── 단말기(TRM) 명령 ─────────────────────────────
  TERMINAL_COMMAND_001: '001',  // TRM → PAD : 포인트 적립
  TERMINAL_COMMAND_002: '002',  // TRM → PAD : 포인트 적립(복합 결제)
  TERMINAL_COMMAND_003: '003',  // TRM → PAD : [요청] 포인트 사용
  TERMINAL_COMMAND_004: '004',  // TRM ← PAD : [응답] 포인트 사용
  TERMINAL_COMMAND_010: '010',  // PAD → TRM : 취소

  // ── 캣포스(CAT) 명령 ─────────────────────────────
  CATPOS:                       'CAT',
  CATPOS_CONNECT:               '000',
  CATPOS_NUM:                   '001',
  CATPOS_CST:                   '002',
  CATPOS_DISCONNECT:            '003',
  CATPOS_EARN_POINT:            '004',
  CATPOS_EARN_POINT_COMPLEX:    '005',
  CATPOS_USE_POINT_NO_CUSTOMER: '006',
  CATPOS_USE_POINT_WITH_CUSTOMER:'007',
  CATPOS_SESSION_START:         '777',
  CATPOS_SESSION_END:           '444',

  // ── 단말기 전문 ASCII 제어문자 ───────────────────
  TERMINAL_FLAG: 'TRM',
  COMM_STX: 0x02,
  COMM_ETX: 0x03,
  COMM_FS:  0x1C,
  COMM_ACK: 0x06,
  COMM_NAK: 0x15,

  KOR_CHARSET: 'euc-kr',
});
