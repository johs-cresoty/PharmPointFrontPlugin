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
    if (state.handle) { console.log("[WS] start 스킵 — 이미 handle 있음"); return; }

    // 이전 세션에서 남은 고아 서버 정리 (전부 close — serverId/port 불일치도 무조건).
    try {
      const listRes = await sdk.websocket.list();
      console.log("[WS] list() 결과 servers.length=" + (listRes?.servers?.length ?? 0) + " raw=" + JSON.stringify(listRes));
      for (const s of listRes.servers ?? []) {
        console.log("[WS] 이전 서버 close serverId=" + s.serverId + " port=" + s.port);
        try { await sdk.websocket.close({ serverId: s.serverId }); }
        catch (e) { console.warn("[WS] close 실패 serverId=" + s.serverId, e); }
      }
    } catch (e) {
      console.warn("[WS] 서버 목록 정리 실패", e);
    }

    console.log("[WS] 서버 시작 port=" + cfg.port + " serverId=" + cfg.wsServerId);
    state.handle = await sdk.websocket.start({
      serverId: state.serverId,
      port:     cfg.port,
      path:     cfg.wsPath,

      onConnection: ({ connectionId }) => {
        state.connectionId = connectionId;
        console.log("[WS] 연결됨 connectionId=" + connectionId);
      },

      onMessage: ({ connectionId, data }) => {
        state.connectionId = connectionId;
        const text = decodePayloadData(data);
        console.log("[WS] 수신 ←", text);
        try { onText(text); }
        catch (e) { onError?.(e); }
      },

      onDisconnection: ({ connectionId }) => {
        console.log("[WS] 연결 해제 connectionId=" + connectionId);
        if (state.connectionId === connectionId) state.connectionId = null;
      },

      onError: (payload) => {
        console.error("[WS] 에러", payload);
        onError?.(payload);
      },
    });
    console.log("[WS] 서버 시작 완료");
  }

  async function stop(): Promise<void> {
    if (!state.handle) return;
    console.log("[WS] 서버 중지");
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
