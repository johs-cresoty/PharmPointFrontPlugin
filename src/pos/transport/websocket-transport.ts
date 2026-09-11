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
import { maskPiiText } from "../../utils/pii-mask";
import { log } from "../../utils/log";
import { setLinkStatus } from "../../monitoring/link-status";
import { isPageActive } from "../../utils/page-active";

/**
 * 캣포스가 끊긴 뒤 이만큼 안 돌아오면 진짜 끊긴 것으로 본다.
 * 캣포스는 전문마다 새로 접속하므로 곧바로 판정하면 거래마다 끊김이 찍힌다.
 */
const CATPOS_DROP_GRACE_MS = 30_000;

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
  /** 한 번이라도 붙은 적 있는지. 최초 연결만 기록하기 위함. */
  everConnected: boolean;
  /** 끊김을 기록했는지. 기록했을 때만 "다시 연결됨" 을 남긴다. */
  dropLogged:   boolean;
  /** 끊김 판정 대기 타이머. 유예 안에 돌아오면 취소된다. */
  dropTimer:    ReturnType<typeof setTimeout> | null;
};

export function createWebSocketTransport({ onText, onError }: WebSocketTransportHandlers): WebSocketTransport {
  const state: InternalState = {
    serverId:      cfg.wsServerId,
    connectionId:  null,
    handle:        null,
    everConnected: false,
    dropLogged:    false,
    dropTimer:     null,
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
      const targets = (listRes.servers ?? []).filter((s) => s.serverId === cfg.wsServerId || s.port === cfg.port);
      for (const s of targets) {
        try { await sdk.websocket.close({ serverId: s.serverId }); }
        catch (e) { console.warn("[WS] 기존 서버 close 실패 serverId=" + s.serverId, e); }
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
        setLinkStatus("캣포스", "연결됨");

        // 끊긴 것으로 기록하려던 참이면 취소한다 — 재접속했으니 끊긴 게 아니다.
        if (state.dropTimer) { clearTimeout(state.dropTimer); state.dropTimer = null; }

        // 캣포스는 전문 하나 보낼 때마다 새로 접속한다. 그때마다 남기면 기록이
        // 접속 줄로 가득 찬다. 처음 붙은 순간과, 끊긴 뒤 돌아온 순간만 남긴다.
        if (!state.everConnected) {
          state.everConnected = true;
          log.status(`[연동] 캣포스 연결됨 (포트 ${cfg.port})`);
        } else if (state.dropLogged) {
          state.dropLogged = false;
          log.status("[연동] 캣포스 다시 연결됨");
        }
      },

      onMessage: ({ connectionId, data }) => {
        state.connectionId = connectionId;
        const text = decodePayloadData(data);
        // 전문에 고객 전화번호가 실린다(PHONE_INPUT_ACK 등) — 번호만 가리고 남긴다.
        log.info(`[WS] 수신 ← ${maskPiiText(text)}`);
        try { onText(text); }
        catch (e) { onError?.(e); }
      },

      onDisconnection: ({ connectionId }) => {
        if (state.connectionId !== connectionId) return;
        state.connectionId = null;

        // 설정 화면으로 옮겨가면 이 웹뷰가 내려가면서 캣포스도 떨어져 나간다.
        // 고장이 아니라 화면을 벗어난 것이므로 끊김으로 남기지 않는다.
        if (!isPageActive()) {
          setLinkStatus("캣포스", "화면 이탈");
          return;
        }

        // 캣포스는 전문을 보내고 바로 끊었다가 다음 전문 때 다시 붙는다.
        // 끊기자마자 남기면 거래마다 '끊김'이 찍혀 진짜 끊긴 것과 구분되지 않는다.
        // 잠시 기다려 보고 그래도 안 돌아올 때만 남긴다.
        if (state.dropTimer) clearTimeout(state.dropTimer);
        state.dropTimer = setTimeout(() => {
          state.dropTimer = null;
          if (state.connectionId || !isPageActive()) return; // 돌아왔거나 화면을 벗어남
          state.dropLogged = true;
          setLinkStatus("캣포스", "연결 끊김");
          log.status(`[연동] 캣포스 연결 끊김 — ${CATPOS_DROP_GRACE_MS / 1000}초간 재접속 없음`);
        }, CATPOS_DROP_GRACE_MS);
      },

      onError: (payload) => {
        console.error("[WS] 에러", payload);
        onError?.(payload);
      },
    });
  }

  async function stop(): Promise<void> {
    if (state.dropTimer) { clearTimeout(state.dropTimer); state.dropTimer = null; }
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
    log.info(`[WS] 송신 → ${maskPiiText(text)}`);
    await state.handle.send(state.connectionId, encodeSendData(text));
  }

  return { start, stop, send };
}
