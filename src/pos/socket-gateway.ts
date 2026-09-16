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
import { createSerialTransport, toHexMasked, type SerialTransport } from "./transport/serial-transport";
import { createVanTransport, type VanTransport } from "./transport/van-transport";
import { maskPiiText } from "../utils/pii-mask";
import { log } from "../utils/log";
import { reportLinkFailure } from "../monitoring/sentry";
import { setLinkStatus } from "../monitoring/link-status";
import { catCommandLabel, terminalCommandLabel } from "./protocol/command-names";
import { SocketConfig } from "./socket-config";

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

/**
 * 도착 사실만으로는 기록에 남길 값이 없는 커맨드.
 * 자세한 사정은 아래 onCatText 의 주석 참고.
 */
const SILENT_CAT_COMMANDS = new Set<string>([
  C.CATPOS_CONNECT,
  C.CATPOS_CART_UPDATE,
  C.CATPOS_CART_CLEAR,
]);

// ── Gateway 팩토리 ───────────────────────────────

function create() {
  const bus = createEmitter();
  let catSessionActive = false;
  let ws:  WebSocketTransport | null = null;
  let ser: SerialTransport    | null = null;
  let van: VanTransport       | null = null;
  // 팜포인트 전문이 한 번이라도 도착했는지. 연동 성립을 1회만 알리기 위한 표식.
  let trmLinkConfirmed = false;

  // ── CATPOS JSON 수신 처리 ──────────────────────
  function onCatText(text: string): void {
    const msg = CatposCodec.parse(text);
    if (!msg) {
      console.warn("[연동] 캣포스가 보낸 전문을 읽지 못했습니다 — 형식이 규격과 다릅니다");
      return;
    }
    // 어떤 요청이 실제로 도착했는지 남긴다.
    // 이 줄이 없으면 캣포스가 전문을 보내지 않은 것이고, 있으면 보낸 것이다.
    // 화면이 안 뜬다는 문의가 왔을 때 책임 소재를 이 한 줄로 가른다.
    //
    // 두 가지는 뺀다.
    //   CONNECT — 캣포스는 전문 하나 보낼 때마다 새로 접속하면서 매번 보낸다.
    //             남기면 기록의 절반이 인사치레로 찬다. 연결이 살아있다는 것은
    //             뒤따르는 실제 요청 줄이 이미 증명한다.
    //   장바구니 — 도착 사실만으로는 "그래서 화면이 어떻게 됐나" 에 답하지 못한다.
    //             main.ts 가 처리 결과까지 담은 [장바구니] 한 줄로 대신 남긴다.
    //             두 줄로 나누면 서로 다른 줄이 번갈아 찍혀 반복 접기가 풀린다.
    if (!SILENT_CAT_COMMANDS.has(msg.command)) {
      log.status(`[캣포스] ${catCommandLabel(msg.command)} 보냄`);
    }

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
    // 팜포인트 전문이 실제로 도착한 첫 순간. 여기까지 왔다는 것은 시리얼 연결뿐 아니라
    // 전문 형식(마커·플래그)까지 맞았다는 뜻이라, 연동 성립 시점으로 한 번만 남긴다.
    if (!trmLinkConfirmed) {
      trmLinkConfirmed = true;
      log.status("[단말기] 팜포인트 전문 도착 — 통신 확인됨");
    }

    if (catSessionActive) {
      log.debug(`[SocketGateway] CAT 세션 활성 — 단말기 전문 무시 (${toHexMasked(frame)})`);
      return; // CAT 세션 활성 중에는 단말기 신호 차단 (Android 동일)
    }

    const parsed = TerminalCodec.parse(frame);
    if (!parsed) {
      console.warn(`[SocketGateway] TRM 파싱 실패 — ${toHexMasked(frame)}`);
      return;
    }
    // ACK 자동 회신 (Android SocketManager 동일)
    const ackBytes = TerminalCodec.ack();
    ser?.send(ackBytes).catch((e) => console.error("[SocketGateway] ACK send fail", e));

    // 005(바코드 표시)는 길이 필드가 BCD 바이너리라 fields(EUC-KR 디코딩)로 읽을 수 없다.
    // 원본 바이트에서 직접 파싱한 구조체를 실어 보낸다.
    if (parsed.cmd === C.TERMINAL_COMMAND_005) {
      const barcode = TerminalCodec.parseBarcodeDisplay(frame);
      if (!barcode) {
        console.warn(`[SocketGateway] 005 파싱 실패 — ${toHexMasked(frame)}`);
        return;
      }
      log.info(
        `[SocketGateway] <= 005 바코드표시 수신 — 종류=${barcode.kindRaw}(${barcode.kind}) ` +
        `timeout=${barcode.timeoutSec}초 문구="${barcode.text}" 데이터=${barcode.dataLength}바이트`,
      );
      bus.emit(SocketEvent.TerminalBarcodeDisplay, { barcode });
      return;
    }

    log.status(`[단말기] ${terminalCommandLabel(parsed.cmd)} 보냄`);
    // 필드는 커맨드마다 구성이 달라 키 기반으로 가릴 수 없다. 값 패턴으로 번호만 가린다.
    log.info(`[SocketGateway] 결제단말기 필드 — ${maskPiiText(JSON.stringify(parsed.fields))}`);

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

    // ⚠️ SDK 호출이 성공도 실패도 하지 않고 멈추는 사례가 있다(시리얼 open 에서 관측).
    //    그 상태로 await 하면 아래 '채널 기동' 줄까지 영영 도달하지 못해,
    //    로그만 보면 앱이 조용히 죽은 것처럼 보이고 원인을 짚을 수 없다.
    //    무응답도 결과의 하나로 보고 넘어간다.
    const withWatchdog = (p: Promise<void>, label: string): Promise<void> =>
      Promise.race([
        p,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} 10초 무응답 — SDK 가 응답하지 않음`)), 10_000),
        ),
      ]);

    // allSettled 는 실패를 삼키므로, 어느 채널이 못 떴는지 반드시 로그로 남긴다.
    const [wsRes, serRes] = await Promise.allSettled([
      withWatchdog(ws.start(),  "웹소켓 기동"),
      withWatchdog(ser.start(), "시리얼 기동"),
    ]);
    if (wsRes.status  === "rejected") console.error(`[연동] ❌ 캣포스 연결 준비 실패 — 포트 ${SocketConfig.port} 를 열지 못했습니다. 캣포스가 접속할 수 없습니다.`, wsRes.reason);
    if (serRes.status === "rejected") console.error("[연동] ❌ 결제단말기 연결 준비 실패 — 시리얼 포트를 열지 못했습니다. 적립·사용 요청을 받을 수 없습니다.", serRes.reason);
    // 두 채널 기동 결과를 한 줄로 모아둔다. 여러 줄에 흩어진 로그를 훑지 않아도
    // 어느 쪽이 못 떴는지 바로 보이게 하기 위함.
    const wsOk  = wsRes.status  === "fulfilled";
    const serOk = serRes.status === "fulfilled";
    // 여기서 "대기 중" 은 아직 아무도 안 붙었다는 뜻이다. 붙으면 각자 "연결됨" 으로 바뀐다.
    setLinkStatus("캣포스",    wsOk  ? "연결 대기 중" : "준비 실패");
    setLinkStatus("결제단말기", serOk ? "연결 대기 중" : "준비 실패");
    log.status(
      `[팜포인트] ${wsOk && serOk ? "받을 준비 완료" : "❌ 받을 준비 실패"} — ` +
      `캣포스 ${wsOk ? `대기(포트 ${SocketConfig.port})` : "포트 열기 실패"} · ` +
      `단말기 ${serOk ? "대기" : "시리얼 열기 실패"}`,
    );
    if (!wsOk || !serOk) {
      reportLinkFailure(
        `연동 준비 실패 — 캣포스 ${wsOk ? "정상" : "실패"} / 결제단말기 ${serOk ? "정상" : "실패"}`,
        [wsRes, serRes].filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason),
      );
    }
  }

  async function stop(): Promise<void> {
    van = null;
    trmLinkConfirmed = false;
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

  /**
   * 캣포스가 이 회신을 받아야 다음으로 넘어가는지.
   *
   * 적립에는 결과 응답이 아예 없다(회신하는 코드 자체가 없다). 캣포스가 기다리지
   * 않으므로 여기 해당하지 않는다. 취소 통보(FAIL)는 못 보내도 캣포스가 자체
   * 타임아웃으로 푼다. 아래 다섯은 다르다 — 못 받으면 캣포스가 계속 기다린다.
   */
  function isAwaitedReply(cmd: string | undefined): boolean {
    switch (cmd) {
      case C.CATPOS_PHONE_INPUT_ACK:              // 번호 조회 결과
      case C.CATPOS_CUSTOMER_REGISTER_ACK:        // 회원 조회 결과
      case C.CATPOS_USE_POINT_ACK:                // 포인트 사용 결과
      case C.CATPOS_USE_POINT_WITH_CUSTOMER_ACK:  // 포인트 사용 결과(회원 지정)
      case C.CATPOS_MARKETING_CONSENT_ACK:        // 마케팅 동의 결과
        return true;
      default:
        return false;
    }
  }

  function sendCAT(text: string): Promise<void> {
    const cmd = CatposCodec.parse(text)?.command;

    const onSendFailure = (reason: unknown): void => {
      const label = cmd ? catCommandLabel(cmd) : "형식 오류";
      // 팜포인트는 회신을 만들어 보내려 했고, 받을 쪽이 없어서 실패했다.
      // 소관을 적어두지 않으면 "팜포인트가 응답을 안 줬다" 로 읽힌다.
      log.status(`[팜포인트] ❌ ${label} 회신 못 보냄 — 캣포스 연결이 없습니다 · 소관: 캣포스`);
      // 캣포스가 기다리는 회신이 날아가면 계산대가 멈춘다. 이건 올려야 한다.
      if (isAwaitedReply(cmd)) {
        reportLinkFailure(
          `고객 화면은 끝났는데 캣포스가 결과를 못 받았습니다 — ${label}. 캣포스가 계속 기다립니다`,
          reason,
        );
      }
    };

    if (!ws) {
      onSendFailure("웹소켓 미기동");
      return Promise.resolve();
    }
    // 요청은 받았는데 응답을 못 보낸 경우를 가르기 위해 커맨드만 남긴다.
    // CONNECT_ACK 은 CONNECT 와 짝을 이루는 인사치레라 뺀다.
    if (cmd !== C.CATPOS_CONNECT_ACK) {
      log.status(`[팜포인트] ${cmd ? catCommandLabel(cmd) : "형식 오류"} 회신함 → 캣포스`);
    }
    return ws.send(text).catch(onSendFailure);
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
    log.info(`[SocketGateway] => ${label} ${toHexMasked(bytes)}`);
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
