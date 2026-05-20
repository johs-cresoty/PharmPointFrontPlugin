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

      // 이전 세션에서 남은 고아 서버 정리
      try {
        const { servers } = await sdk.websocket.list();
        for (const s of servers) {
          if (s.serverId === cfg.wsServerId || s.port === cfg.port) {
            console.log('[WS] 이전 서버 정리 serverId=' + s.serverId);
            await sdk.websocket.close({ serverId: s.serverId });
          }
        }
      } catch (e) {
        console.warn('[WS] 서버 목록 정리 실패', e);
      }

      console.log('[WS] 서버 시작 port=' + cfg.port);
      state.handle = await sdk.websocket.start({
        serverId: state.serverId,
        port:     cfg.port,
        path:     cfg.wsPath,

        onConnection: ({ connectionId }) => {
          state.connectionId = connectionId;
          console.log('[WS] 연결됨 connectionId=' + connectionId);
        },

        onMessage: ({ connectionId, data }) => {
          state.connectionId = connectionId;
          const text = decodePayloadData(data);
          console.log('[WS] 수신 ←', text);
          try {
            onText && onText(text);
          } catch (e) {
            onError && onError(e);
          }
        },

        onDisconnection: ({ connectionId }) => {
          console.log('[WS] 연결 해제 connectionId=' + connectionId);
          if (state.connectionId === connectionId) state.connectionId = null;
        },

        onError: (payload) => {
          console.error('[WS] 에러', payload);
          onError && onError(payload);
        },
      });
      console.log('[WS] 서버 시작 완료');
    }

    async function stop() {
      if (!state.handle) return;
      console.log('[WS] 서버 중지');
      try {
        await state.handle.stop?.();
      } finally {
        state.handle       = null;
        state.connectionId = null;
      }
    }

    async function send(text) {
      if (!state.connectionId || !state.handle) {
        console.warn('[WS] 송신 실패 — 연결 없음');
        return;
      }
      console.log('[WS] 송신 →', text);
      await state.handle.send(state.connectionId, encodeSendData(text));
    }

    return { start, stop, send };
  }

  return { create };
})();
