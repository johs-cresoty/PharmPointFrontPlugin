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
import { createSerialTransport, toHex, type SerialTransport } from "./transport/serial-transport";
import { createVanTransport, type VanTransport } from "./transport/van-transport";

// ── 이벤트 payload 타입 ───────────────────────────

export type CatEventPayload = {
  data: Record<string, unknown>;
};

export type TerminalEventPayload = {
  fields: string[];
  raw:    Uint8Array;
};

/** 005 전용 — fields 대신 원본 바이트에서 직접 파싱한 구조체를 싣는다. */
export type TerminalBarcodePayload = {
  barcode: TerminalCodec.BarcodeDisplayData;
};

type AnyPayload =
  | CatEventPayload
  | TerminalEventPayload
  | TerminalBarcodePayload;

type EventListener = (payload: AnyPayload) => void;

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

  function emit(event: SocketEventType, payload: AnyPayload): void {
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
    case C.CATPOS_MARKETING_CONSENT_REQ:        return SocketEvent.CatMarketingConsent;
    case C.CATPOS_CART_UPDATE:                  return SocketEvent.CatCartUpdate;
    case C.CATPOS_CART_CLEAR:                   return SocketEvent.CatCartClear;
    default: return null;
  }
}

function mapTerminalCommandToEvent(cmd: string): SocketEventType | null {
  switch (cmd) {
    case C.TERMINAL_COMMAND_001: return SocketEvent.TerminalEarnPointSingle;
    case C.TERMINAL_COMMAND_002: return SocketEvent.TerminalEarnPointComplex;
    case C.TERMINAL_COMMAND_003: return SocketEvent.TerminalUsePoint;
    case C.TERMINAL_COMMAND_005: return SocketEvent.TerminalBarcodeDisplay;
    case C.TERMINAL_COMMAND_999: return SocketEvent.TerminalHideScreen;
    default: return null;
  }
}

// ── Gateway 팩토리 ───────────────────────────────

function create() {
  const bus = createEmitter();
  let catSessionActive = false;
  let ws:  WebSocketTransport | null = null;
  let ser: SerialTransport    | null = null;
  let van: VanTransport       | null = null;

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

  // ── TERMINAL(팜포인트 TRM) 프레임 수신 처리 ─────────
  // KIS 전문은 여기까지 오지 않는다(SerialTransport 라우터가 TRM 만 넘기고, KIS 는 onVanForward→VAN).
  function onSerialFrame(frame: Uint8Array): void {
    // 진입 즉시 원문부터 남긴다 — 아래 어느 분기로 빠지든(세션 차단·파싱 실패·미지원 커맨드)
    // 단말기가 실제로 뭘 보냈는지는 항상 확인 가능해야 한다.
    console.log(`[SocketGateway] <= TRM RAW (${frame.length} bytes) ${toHex(frame)}`);

    if (catSessionActive) {
      console.warn(`[SocketGateway] CAT 세션 활성 — 단말기 전문 무시 (${toHex(frame)})`);
      return; // CAT 세션 활성 중에는 단말기 신호 차단 (Android 동일)
    }

    const parsed = TerminalCodec.parse(frame);
    if (!parsed) {
      console.warn(`[SocketGateway] TRM 파싱 실패 — ${toHex(frame)}`);
      return;
    }
    // ACK 자동 회신 (Android SocketManager 동일)
    const ackBytes = TerminalCodec.ack();
    console.log(`[SocketGateway] => ACK ${toHex(ackBytes)}`);
    ser?.send(ackBytes).catch((e) => console.error("[SocketGateway] ACK send fail", e));

    // 005(바코드 표시)는 길이 필드가 BCD 바이너리라 fields(EUC-KR 디코딩)로 읽을 수 없다.
    // 원본 바이트에서 직접 파싱한 구조체를 실어 보낸다.
    if (parsed.cmd === C.TERMINAL_COMMAND_005) {
      const barcode = TerminalCodec.parseBarcodeDisplay(frame);
      if (!barcode) {
        console.warn(`[SocketGateway] 005 파싱 실패 — ${toHex(frame)}`);
        return;
      }
      console.log(
        `[SocketGateway] <= 005 바코드표시 수신 — 종류=${barcode.kindRaw}(${barcode.kind}) ` +
        `timeout=${barcode.timeoutSec}초 문구="${barcode.text}" 데이터=${barcode.dataLength}바이트`,
      );
      console.log(`[SocketGateway] <= 005 바코드 데이터: ${barcode.data}`);
      bus.emit(SocketEvent.TerminalBarcodeDisplay, { barcode });
      return;
    }

    console.log(`[SocketGateway] <= TRM cmd=${parsed.cmd} fields=${JSON.stringify(parsed.fields)}`);

    const event = mapTerminalCommandToEvent(parsed.cmd);
    if (!event) {
      // 매핑 안 된 커맨드도 조용히 버리지 않는다 — 미지원 전문이 오는지 로그로 드러나야 한다.
      console.warn(`[SocketGateway] TRM 미지원 커맨드 — cmd=${parsed.cmd} (무시)`);
      return;
    }
    bus.emit(event, { fields: parsed.fields, raw: parsed.raw });
  }

  // ── 단말(시리얼) → VAN 결제모듈 중계 ──────────
  // 팜포인트는 '리더기 모드' — 결제(KIS)를 개시하지 않고 단말의 KIS 전문을 VAN 모듈로 전달한다.
  //   · TRM(팜포인트) 전문은 SerialTransport 가 걸러 onSerialFrame 으로 넘긴다(여기 안 옴).
  //   · TRM 이 아닌 원본(KIS 등)만 여기로 와서 sdk.van.write 로 그대로 전달.
  //   · VAN 응답은 VAN 모듈이 단말기로 직접 회신한다(우리 반환 경로 불필요 — 토스 확인).
  function onVanForward(bytes: Uint8Array): void {
    if (!van) return;
    van.write(bytes).catch((e) => console.error("[SocketGateway] van.write 실패", e));
  }

  // ── 외부 API ─────────────────────────────────

  async function start(): Promise<void> {
    ws = createWebSocketTransport({
      onText:  onCatText,
      onError: (e) => console.error("[SocketGateway] websocket error", e),
    });
    ser = createSerialTransport({
      onFrame:      onSerialFrame,  // TRM(팜포인트) 완성 프레임 → 우리 처리
      onVanForward: onVanForward,   // TRM 아닌 원본(KIS 등) → VAN 중계
      onError: (e) => console.error("[SocketGateway] serial error", e),
    });
    van = createVanTransport(); // KIS 전문 → VAN 전달 (write only)
    // allSettled 는 실패를 삼키므로, 어느 채널이 못 떴는지 반드시 로그로 남긴다.
    const [wsRes, serRes] = await Promise.allSettled([ws.start(), ser.start()]);
    if (wsRes.status  === "rejected") console.error("[SocketGateway] ❌ websocket start 실패", wsRes.reason);
    if (serRes.status === "rejected") console.error("[SocketGateway] ❌ serial start 실패",    serRes.reason);
  }

  async function stop(): Promise<void> {
    van = null;
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
  function sendCATMarketingConsent(phone: string, marketingConsent: boolean): Promise<void> {
    return sendCAT(CatposCodec.ackMarketingConsent(phone, marketingConsent));
  }

  // ── 단말기(TRM) 응답 송신 ───────────────────

  function sendTerminal(bytes: Uint8Array, label: string): Promise<void> {
    if (!ser) {
      console.warn(`[SocketGateway] ⚠️ ${label} 송신 불가 — 시리얼 미기동(ser=null)`);
      return Promise.resolve();
    }
    console.log(`[SocketGateway] => ${label} ${toHex(bytes)}`);
    return ser.send(bytes).catch((e) => {
      console.error(`[SocketGateway] ❌ ${label} 송신 실패`, e);
    });
  }

  /** 004 — 포인트 사용 결과 */
  function sendTerminalUsePoint(phone: string, balance: string, delta: string): Promise<void> {
    return sendTerminal(TerminalCodec.makeUsePoint(phone, balance, delta), "004(사용결과)");
  }

  /** 006 — 바코드 표시 응답 (005 수신 즉시 회신) */
  function sendTerminalBarcodeAck(code = "0000"): Promise<void> {
    return sendTerminal(TerminalCodec.makeBarcodeDisplayAck(code), `006(바코드응답 ${code})`);
  }

  /** 010 — 진행중 취소 (INIT) */
  function sendTerminalInit(): Promise<void> {
    return sendTerminal(TerminalCodec.makeInit(), "010(취소/INIT)");
  }

  return {
    start, stop, on,
    // CAT
    sendCATOk, sendCATPhoneNumber, sendCATCustomerInfo, sendCATFail,
    sendCATUsePointResult, sendCATUsePointWithCustomerResult, sendCATMarketingConsent,
    // TRM
    sendTerminalUsePoint, sendTerminalInit, sendTerminalBarcodeAck,
    // CAT session 상태 (read-only)
    isCatSessionActive: () => catSessionActive,
  };
}

// 앱 전역 싱글톤 인스턴스 (Android @Singleton 미러)
export const SocketGateway = create();
