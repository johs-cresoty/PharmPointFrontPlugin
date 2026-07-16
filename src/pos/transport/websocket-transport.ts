/**
 * WebSocketTransport — Toss Front SDK WebSocket API 래퍼.
 *
 * 역할: CATPOS(PC) 텍스트 전문을 송수신.
 *   - sdk.websocket.start  로 서버 리스닝
 *   - onConnection / onMessage / onDisconnection 이벤트 → onText 콜백
 *   - send(text) → 마지막 client 에게 전송
 *
 * Phase 5 에서 App lifecycle 에 붙여 세션 유지 (재연결 반복 해결) 예정.
 * 지금은 기존 IIFE 로직을 ESM 으로 그대로 이식.
 */
import { SocketConfig as cfg } from "../socket-config";

export type WebSocketTransportHandlers = {
  onText:   (text: string) => void;
  onError?: (e: unknown) => void;
};

export type WebSocketTransport = {
  start(): Promise<void>;
  stop():  Promise<void>;
  send(text: string): Promise<void>;
};

type InternalState = {
  serverId:     string;
  connectionId: string | null;
  handle:       TossWebSocketServerHandle | null;
};

export function createWebSocketTransport({ onText, onError }: WebSocketTransportHandlers): WebSocketTransport {

  const state: InternalState = {
    serverId:     cfg.wsServerId,
    connectionId: null,
    handle:       null,
  };

  function decodePayloadData(data: string): string {
    if (typeof data !== "string") return String(data ?? "");
    if (!cfg.wsJsonWrap) return data;
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === "string" ? parsed : data;
    } catch {
      return data;
    }
  }

  function encodeSendData(text: string): string {
    return cfg.wsJsonWrap ? JSON.stringify(text) : text;
  }

  async function start(): Promise<void> {
    if (state.handle) return;

    // 이전 세션에서 남은 고아 서버 정리 — 우리 serverId 또는 우리 port 와 일치하는 것만.
    // (Toss 내부 서비스(로그 서버 등)까지 close 하면 개발자 도구가 죽음)
    try {
      const listRes = await sdk.websocket.list();
      for (const s of listRes.servers ?? []) {
        if (s.serverId !== cfg.wsServerId && s.port !== cfg.port) continue;
        try { await sdk.websocket.close({ serverId: s.serverId }); }
        catch (e) { console.warn("[WS] close 실패 serverId=" + s.serverId, e); }
      }
    } catch (e) {
      console.warn("[WS] 서버 목록 정리 실패", e);
    }

    state.handle = await sdk.websocket.start({
      serverId: state.serverId,
      port:     cfg.port,
      path:     cfg.wsPath,

      onConnection: ({ connectionId }) => {
        state.connectionId = connectionId;
      },

      onMessage: ({ connectionId, data }) => {
        state.connectionId = connectionId;
        const text = decodePayloadData(data);
        console.log("[WS] 수신 ←", text);
        try { onText(text); }
        catch (e) { onError?.(e); }
      },

      onDisconnection: ({ connectionId }) => {
        if (state.connectionId === connectionId) state.connectionId = null;
      },

      onError: (payload) => {
        console.error("[WS] 에러", payload);
        onError?.(payload);
      },
    });
  }

  async function stop(): Promise<void> {
    if (!state.handle) return;
    try {
      await state.handle.stop?.();
    } finally {
      state.handle       = null;
      state.connectionId = null;
    }
  }

  async function send(text: string): Promise<void> {
    if (!state.connectionId || !state.handle) {
      console.warn("[WS] 송신 실패 — 연결 없음");
      return;
    }
    console.log("[WS] 송신 →", text);
    await state.handle.send(state.connectionId, encodeSendData(text));
  }

  return { start, stop, send };
}
