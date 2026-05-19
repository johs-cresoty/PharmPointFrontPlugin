/**
 * SocketGateway — WebSocket(PC) + Serial(Terminal) 통합 디스패처.
 *
 * Android: SocketEventRepositoryImpl + SocketResponseRepositoryImpl
 *
 * 책임:
 *   1) 두 채널 transport 를 start/stop 관리
 *   2) 수신 전문 파싱 → SocketEvent 로 디스패치 (pub/sub)
 *   3) CAT 세션 (777/444) 동안 단말기 신호 차단
 *   4) 단말기 전문 수신 시 ACK 자동 회신
 *   5) 외부에 응답 송신 API 제공 (sendCATXxx, sendTerminalUsePoint, sendTerminalInit)
 *
 * 의존: WebSocketTransport, SerialTransport,
 *      TerminalCodec, CatposCodec, SocketConstants, SocketEvent
 */
window.SocketGateway = (function () {

  const C = SocketConstants;

  function createEmitter() {
    const listeners = new Map(); // event → Set<fn>
    function on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    }
    function emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); } catch (e) { console.error('[SocketGateway] listener error', e); }
      }
    }
    return { on, emit };
  }

  function create() {
    const bus = createEmitter();
    let catSessionActive = false;
    let ws  = null;
    let ser = null;

    // ── CATPOS JSON 수신 처리 ──────────────────────
    function onCatText(text) {
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

    function mapCatCommandToEvent(cmd) {
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

    // ── Terminal 바이너리 프레임 수신 처리 ───────────
    function onSerialFrame(frame) {
      // CAT 세션 활성 중에는 단말기 신호 차단 (Android 동일)
      if (catSessionActive) return;

      const parsed = TerminalCodec.parse(frame);
      if (!parsed) return;

      // ACK 자동 회신 (Android SocketManager 동일)
      ser && ser.send(TerminalCodec.ack()).catch(e => console.error('[SocketGateway] ACK send fail', e));

      const event = mapTerminalCommandToEvent(parsed.cmd);
      if (!event) return;
      bus.emit(event, { fields: parsed.fields, raw: parsed.raw });
    }

    function mapTerminalCommandToEvent(cmd) {
      switch (cmd) {
        case C.TERMINAL_COMMAND_001: return SocketEvent.TerminalEarnPointSingle;
        case C.TERMINAL_COMMAND_002: return SocketEvent.TerminalEarnPointComplex;
        case C.TERMINAL_COMMAND_003: return SocketEvent.TerminalUsePoint;
        default: return null;
      }
    }

    // ── 외부 API ────────────────────────────────────

    async function start() {
      ws = WebSocketTransport.create({
        onText:  onCatText,
        onError: (e) => console.error('[SocketGateway] websocket error', e),
      });
      ser = SerialTransport.create({
        onFrame: onSerialFrame,
        onError: (e) => console.error('[SocketGateway] serial error', e),
      });
      await Promise.allSettled([ws.start(), ser.start()]);
    }

    async function stop() {
      await Promise.allSettled([
        ws ? ws.stop() : Promise.resolve(),
        ser ? ser.stop() : Promise.resolve(),
      ]);
      ws = null;
      ser = null;
    }

    function on(event, fn) {
      return bus.on(event, fn);
    }

    // ── CATPOS(PC) 응답 송신 ────────────────────────

    function sendCAT(text) {
      if (!ws) return Promise.resolve();
      return ws.send(text);
    }

    function sendCATPhoneNumber(phone) {
      return sendCAT(CatposCodec.ackPhoneNumber(phone));
    }
    function sendCATCustomerInfo(phone, customerCode) {
      return sendCAT(CatposCodec.ackCustomerInfo(phone, customerCode));
    }
    function sendCATFail() {
      return sendCAT(CatposCodec.fail());
    }
    function sendCATOk() {
      return sendCAT(CatposCodec.ok());
    }
    function sendCATUsePointResult(customerCode, balance, usePoint) {
      return sendCAT(CatposCodec.ackUsePointResult(customerCode, balance, usePoint));
    }
    function sendCATUsePointWithCustomerResult(usePoint) {
      return sendCAT(CatposCodec.ackUsePointWithCustomer(usePoint));
    }

    // ── 단말기(TRM) 응답 송신 ───────────────────────

    function sendTerminal(bytes) {
      if (!ser) return Promise.resolve();
      return ser.send(bytes);
    }

    /** 004 — 포인트 사용 결과 */
    function sendTerminalUsePoint(phone, balance, delta) {
      return sendTerminal(TerminalCodec.makeUsePoint(phone, balance, delta));
    }

    /** 010 — 진행중 취소 (INIT) */
    function sendTerminalInit() {
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
  const instance = create();
  return instance;
})();
