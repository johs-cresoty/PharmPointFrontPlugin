/**
 * SocketGateway — WebSocket(CATPOS) + Serial(TERMINAL) 통합 디스패처.
 *
 * PharmPoint Android SocketEventRepositoryImpl + SocketResponseRepositoryImpl 대응.
 *
 * 책임:
 *   1) 두 채널 transport 를 start/stop 관리 (앱 lifecycle 하나에 붙임)
 *   2) 수신 전문 파싱 → SocketEvent 로 디스패치 (pub/sub)
 *   3) CAT 세션 (SESSION_START/END) 동안 단말기 신호 차단
 *   4) 단말기 전문 수신 시 ACK 자동 회신
 *   5) 외부에 응답 송신 API 제공 (sendCATXxx, sendTerminalUsePoint, sendTerminalInit)
 *
 * SPA 전환 후 이 게이트웨이는 앱 시작 시 1회 start → 앱 종료까지 유지.
 * (기존 multi-page 는 페이지마다 재시작하던 문제 해결)
 */
import { SocketConstants as C } from "./protocol/socket-constants";
import { SocketEvent, type SocketEventType } from "./socket-events";
import * as CatposCodec from "./protocol/catpos-codec";
import * as TerminalCodec from "./protocol/terminal-codec";
import { createWebSocketTransport, type WebSocketTransport } from "./transport/websocket-transport";
import { createSerialTransport, type SerialTransport } from "./transport/serial-transport";

// ── 이벤트 payload 타입 ───────────────────────────

export type CatEventPayload = {
  data: Record<string, unknown>;
};

export type TerminalEventPayload = {
  fields: string[];
  raw:    Uint8Array;
};

type EventListener = (payload: CatEventPayload | TerminalEventPayload) => void;

// ── pub/sub 버스 ─────────────────────────────────

function createEmitter() {
  const listeners = new Map<SocketEventType, Set<EventListener>>();

  function on(event: SocketEventType, fn: EventListener): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event: SocketEventType, payload: CatEventPayload | TerminalEventPayload): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); }
      catch (e) { console.error("[SocketGateway] listener error", e); }
    }
  }

  return { on, emit };
}

// ── 커맨드 → 이벤트 매핑 ─────────────────────────

function mapCatCommandToEvent(cmd: string): SocketEventType | null {
  switch (cmd) {
    case C.CATPOS_CONNECT:                      return SocketEvent.CatConnect;
    case C.CATPOS_PHONE_INPUT_REQ:              return SocketEvent.CatRequestNum;
    case C.CATPOS_CUSTOMER_REGISTER_REQ:        return SocketEvent.CatRequestCustomer;
    case C.CATPOS_CANCEL:                       return SocketEvent.CatDisconnect;
    case C.CATPOS_EARN_SINGLE_REQ:              return SocketEvent.CatEarnPointSingle;
    case C.CATPOS_EARN_MULTI_REQ:               return SocketEvent.CatEarnPointComplex;
    case C.CATPOS_USE_POINT_REQ:                return SocketEvent.CatUsePointNoCustomer;
    case C.CATPOS_USE_POINT_WITH_CUSTOMER_REQ:  return SocketEvent.CatUsePointWithCustomer;
    default: return null;
  }
}

function mapTerminalCommandToEvent(cmd: string): SocketEventType | null {
  switch (cmd) {
    case C.TERMINAL_COMMAND_001: return SocketEvent.TerminalEarnPointSingle;
    case C.TERMINAL_COMMAND_002: return SocketEvent.TerminalEarnPointComplex;
    case C.TERMINAL_COMMAND_003: return SocketEvent.TerminalUsePoint;
    default: return null;
  }
}

// ── Gateway 팩토리 ───────────────────────────────

function create() {
  const bus = createEmitter();
  let catSessionActive = false;
  let ws:  WebSocketTransport | null = null;
  let ser: SerialTransport    | null = null;

  // ── CATPOS JSON 수신 처리 ──────────────────────
  function onCatText(text: string): void {
    const msg = CatposCodec.parse(text);
    if (!msg) return;

    switch (msg.command) {
      case C.CATPOS_SESSION_START: catSessionActive = true;  break;
      case C.CATPOS_SESSION_END:   catSessionActive = false; break;
    }

    const event = mapCatCommandToEvent(msg.command);
    if (!event) return;
    bus.emit(event, { data: msg.data });
  }

  // ── TERMINAL 바이너리 프레임 수신 처리 ─────────
  function onSerialFrame(frame: Uint8Array): void {
    // CAT 세션 활성 중에는 단말기 신호 차단 (Android 동일)
    if (catSessionActive) return;

    const parsed = TerminalCodec.parse(frame);
    if (!parsed) return;

    // ACK 자동 회신 (Android SocketManager 동일)
    ser?.send(TerminalCodec.ack()).catch((e) => console.error("[SocketGateway] ACK send fail", e));

    const event = mapTerminalCommandToEvent(parsed.cmd);
    if (!event) return;
    bus.emit(event, { fields: parsed.fields, raw: parsed.raw });
  }

  // ── 외부 API ─────────────────────────────────

  async function start(): Promise<void> {
    ws = createWebSocketTransport({
      onText:  onCatText,
      onError: (e) => console.error("[SocketGateway] websocket error", e),
    });
    ser = createSerialTransport({
      onFrame: onSerialFrame,
      onError: (e) => console.error("[SocketGateway] serial error", e),
    });
    await Promise.allSettled([ws.start(), ser.start()]);
  }

  async function stop(): Promise<void> {
    await Promise.allSettled([
      ws  ? ws.stop()  : Promise.resolve(),
      ser ? ser.stop() : Promise.resolve(),
    ]);
    ws  = null;
    ser = null;
  }

  function on(event: SocketEventType, fn: EventListener): () => void {
    return bus.on(event, fn);
  }

  // ── CATPOS(PC) 응답 송신 ────────────────────

  function sendCAT(text: string): Promise<void> {
    if (!ws) return Promise.resolve();
    return ws.send(text);
  }

  function sendCATOk():                                                                Promise<void> { return sendCAT(CatposCodec.ok()); }
  function sendCATPhoneNumber(phone: string):                                          Promise<void> { return sendCAT(CatposCodec.ackPhoneNumber(phone)); }
  function sendCATCustomerInfo(phone: string, customerCode: string):                   Promise<void> { return sendCAT(CatposCodec.ackCustomerInfo(phone, customerCode)); }
  function sendCATFail(message?: string):                                              Promise<void> { return sendCAT(CatposCodec.fail(message)); }
  function sendCATUsePointResult(code: string, balance: string | number, usePoint: string | number): Promise<void> {
    return sendCAT(CatposCodec.ackUsePointResult(code, balance, usePoint));
  }
  function sendCATUsePointWithCustomerResult(usePoint: string | number): Promise<void> {
    return sendCAT(CatposCodec.ackUsePointWithCustomer(usePoint));
  }

  // ── 단말기(TRM) 응답 송신 ───────────────────

  function sendTerminal(bytes: Uint8Array): Promise<void> {
    if (!ser) return Promise.resolve();
    return ser.send(bytes);
  }

  /** 004 — 포인트 사용 결과 */
  function sendTerminalUsePoint(phone: string, balance: string, delta: string): Promise<void> {
    return sendTerminal(TerminalCodec.makeUsePoint(phone, balance, delta));
  }

  /** 010 — 진행중 취소 (INIT) */
  function sendTerminalInit(): Promise<void> {
    return sendTerminal(TerminalCodec.makeInit());
  }

  return {
    start, stop, on,
    // CAT
    sendCATOk, sendCATPhoneNumber, sendCATCustomerInfo, sendCATFail,
    sendCATUsePointResult, sendCATUsePointWithCustomerResult,
    // TRM
    sendTerminalUsePoint, sendTerminalInit,
    // CAT session 상태 (read-only)
    isCatSessionActive: () => catSessionActive,
  };
}

// 앱 전역 싱글톤 인스턴스 (Android @Singleton 미러)
export const SocketGateway = create();
