/**
 * WebSocketTransport — Toss 플러그인 SDK 의 WebSocket API 래퍼.
 *
 * 역할: CATPOS(PC) 텍스트 전문을 송수신.
 *   - sdk.websocket.start  로 서버 리스닝
 *   - connection / message / disconnection 이벤트 → onText 콜백
 *   - send(text) → 마지막으로 연결된 client 에게 전송
 *
 * docs.tossplace.com → /reference/plugin-sdk/front/websocket.html
 *
 * 의존: SocketConfig, sdk (Toss Front SDK)
 */
window.WebSocketTransport = (function () {

  const cfg = SocketConfig;

  /**
   * @param {{ onText: (text: string) => void, onError?: (e: any) => void }} handlers
   * @returns {{ start: () => Promise<void>, stop: () => Promise<void>, send: (text: string) => Promise<void> }}
   */
  function create({ onText, onError } = {}) {

    /** @type {{ serverId: string, connectionId?: string, handle?: any }} */
    const state = {
      serverId:     cfg.wsServerId,
      connectionId: null,
      handle:       null,
    };

    function decodePayloadData(data) {
      if (typeof data !== 'string') return String(data ?? '');
      if (!cfg.wsJsonWrap) return data;
      try {
        const parsed = JSON.parse(data);
        return typeof parsed === 'string' ? parsed : data;
      } catch {
        return data; // raw text 도 허용 (양방향 호환)
      }
    }

    function encodeSendData(text) {
      return cfg.wsJsonWrap ? JSON.stringify(text) : text;
    }

    async function start() {
      if (state.handle) return;
      state.handle = await sdk.websocket.start({
        serverId: state.serverId,
        port:     cfg.port,
        path:     cfg.wsPath,

        onConnection: ({ connectionId }) => {
          // 마지막 연결만 유지 (Android SocketManager 동일 정책)
          state.connectionId = connectionId;
        },

        onMessage: ({ connectionId, data }) => {
          state.connectionId = connectionId; // 최신화
          const text = decodePayloadData(data);
          try {
            onText && onText(text);
          } catch (e) {
            onError && onError(e);
          }
        },

        onDisconnection: ({ connectionId }) => {
          if (state.connectionId === connectionId) state.connectionId = null;
        },

        onError: (payload) => {
          onError && onError(payload);
        },
      });
    }

    async function stop() {
      if (!state.handle) return;
      try {
        await state.handle.stop?.();
      } finally {
        state.handle       = null;
        state.connectionId = null;
      }
    }

    async function send(text) {
      if (!state.connectionId) {
        console.warn('[WebSocketTransport] no active connection');
        return;
      }
      if (state.handle?.send) {
        await state.handle.send({ data: encodeSendData(text) });
        return;
      }
      await sdk.websocket.send({
        serverId:     state.serverId,
        connectionId: state.connectionId,
        data:         encodeSendData(text),
      });
    }

    return { start, stop, send };
  }

  return { create };
})();
