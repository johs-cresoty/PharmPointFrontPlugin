/**
 * SocketConfig — 소켓 통신 런타임 설정.
 *
 * port       : 웹소켓 서버 리스닝 포트 (PharmPoint Android = 52391)
 * wsServerId : sdk.websocket.start 의 serverId
 * baudRate   : 시리얼 포트 통신 속도
 * wsJsonWrap : true → 전문을 JSON.stringify 로 래핑 (레거시 호환용).
 *              현재는 JSON 프로토콜을 원문 그대로 송수신하므로 false.
 */
export const SocketConfig = {
  port:       52391,
  wsPath:     "/",
  wsServerId: "pharm-pad",
  wsJsonWrap: false,
  baudRate:   9600,
} as const;
