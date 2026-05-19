/**
 * SocketConfig — 소켓 통신 런타임 설정.
 *
 *  port       : WebSocket 서버 리스닝 포트 (PharmPoint Android = 52391)
 *  baudRate   : 시리얼 포트 통신 속도
 *  wsJsonWrap : false → JSON 전문을 원문 그대로 송수신 (JSON 프로토콜 사용)
 */
window.SocketConfig = (function () {

  return Object.freeze({
    port:       52391,
    wsPath:     '/',
    wsServerId: 'pharm-pad',
    wsJsonWrap: false,
    baudRate:   9600,
  });
})();
