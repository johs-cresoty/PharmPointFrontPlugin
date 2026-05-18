/**
 * SocketConfig — 소켓 통신 런타임 설정.
 *
 *  port       : WebSocket 서버 리스닝 포트 (PharmPoint Android = 52391)
 *  baudRate   : 시리얼 포트 통신 속도
 *  wsJsonWrap : Toss 웹소켓 API 는 `data` 필드가 "valid JSON string" 으로 명세됨.
 *               true  → JSON.stringify(rawText) 로 감싸서 전송 (안전 기본값)
 *               false → 원문 그대로 전송 (PC 측이 raw text 를 처리하는 경우)
 */
window.SocketConfig = (function () {

  return Object.freeze({
    port:       52391,
    wsPath:     '/',
    wsServerId: 'pharm-pad',
    wsJsonWrap: true,
    baudRate:   9600,
  });
})();
