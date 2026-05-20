/* ===== src\shared\utils\crypt.js ===== */
/**
 * CresotyCrypt JS 포팅 (XOR + 날짜키 방식)
 *
 * 원본: app/src/main/java/com/cresoty/catpospoint/remote/crypt/CresotyCrypt.kt
 *
 * 키 생성 규칙: "crecat" + 오늘 일자(dd, 2자리)
 *   예) 5월 15일 → "crecat15"
 *   주의: 키가 날마다 바뀌므로 오늘 암호화한 값을 내일 복호화하면 깨짐.
 *
 * 출력 포맷:
 *   "{XORed-decimal-concat}^{length-per-decimal}"
 *   예) 원본 "abc" → "2166^121" (각 바이트 XOR 결과를 10진수 문자열로 이어붙임)
 */
window.CresotyCrypt = (function () {
  function getDefaultKey() {
    const day = String(new Date().getDate()).padStart(2, '0');
    return 'crecat' + day;
  }

  // 문자열 → UTF-8 바이트 배열
  function toUtf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  // UTF-8 바이트 배열 → 문자열
  function fromUtf8Bytes(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * 평문 문자열 암호화
   * @param {string|number|null|undefined} plain
   * @returns {string} "cypher^lengths" 형식. 입력이 null/빈문자열이면 ""
   */
  function getEncode(plain) {
    if (plain == null) return '';
    const plainText = String(plain);
    if (plainText.length === 0) return '';

    const key = getDefaultKey();
    const textBytes = toUtf8Bytes(plainText);
    const keyBytes = toUtf8Bytes(key);

    let cypherText = '';
    let cypherTextLength = '';
    let j = 0;

    for (let i = 0; i < textBytes.length; i++) {
      const tmpStr = String(textBytes[i] ^ keyBytes[j]);
      cypherText += tmpStr;
      cypherTextLength += tmpStr.length;

      j++;
      if (j === keyBytes.length) j = 0;
    }

    return cypherText + '^' + cypherTextLength;
  }

  /**
   * 암호문 복호화 (Kotlin 원본의 hex 우회 로직을 동등한 직접 변환으로 단순화)
   * @param {string} cypherText
   * @returns {string} 평문
   */
  function getDecode(cypherText) {
    if (!cypherText) return '';

    const key = getDefaultKey();
    const delimiterPos = cypherText.indexOf('^');
    if (delimiterPos <= 0) return '';

    const splitText = cypherText.substring(0, delimiterPos);
    const splitKey = cypherText.substring(delimiterPos + 1);
    const numChunks = splitKey.length;

    const keyBytes = toUtf8Bytes(key);
    const bytes = new Uint8Array(numChunks);

    let pos = 0;
    for (let i = 0; i < numChunks; i++) {
      const size = parseInt(splitKey.charAt(i), 10);
      const decimal = parseInt(splitText.substring(pos, pos + size), 10);
      bytes[i] = decimal ^ keyBytes[i % keyBytes.length];
      pos += size;
    }

    return fromUtf8Bytes(bytes);
  }

  return {
    getDefaultKey,
    getEncode,
    getDecode,
  };
})();


/* ===== src\shared\constants\api-config.js ===== */
window.ApiConfig = (function () {
  const BASE_URL_DEV  = 'http://dev.catpos.co.kr';
  const BASE_URL_PROD = 'http://catpos.co.kr:13922';
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);

  return Object.freeze({
    baseUrl:   isDev ? BASE_URL_DEV : BASE_URL_PROD,
    cmptrName: 'TossFront_Plugin',
    posVer:    '1.0.0',
    posGubn:   'CP',
    taxNo:     '2018182695',
  });
})();


/* ===== src\shared\constants\storage-keys.js ===== */
window.StorageKeys = Object.freeze({
  BAUD_RATE:            'settings_baud_rate',
  SHOW_STORE_NAME:      'settings_show_store_name',
  MIN_POINT:            'settings_min_point',
  IS_MIN_POINT_ENABLED: 'settings_is_min_point_enabled',
});

window.StorageDefaults = Object.freeze({
  MIN_POINT:            1000,
  IS_MIN_POINT_ENABLED: true,
});


/* ===== src\shared\http\http-client.js ===== */
/**
 * PharmHttpClient — 암호화 인터셉터가 적용된 HTTP 클라이언트
 *
 * Android CryptoInterceptor 동일 로직:
 *   - GET: 모든 쿼리 파라미터 값 CresotyCrypt 암호화
 *   - POST: 본문 JSON 의 모든 문자열 값(중첩 객체/배열 포함) CresotyCrypt 암호화
 *   - 응답: ^ 를 포함한 문자열 값 자동 복호화
 *
 * 의존: CresotyCrypt (shared/utils/crypt.js), ApiConfig (shared/constants/api-config.js)
 */
window.PharmHttpClient = (function () {
  function encryptParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = CresotyCrypt.getEncode(String(value));
    }
    return result;
  }

  function encryptJson(data) {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(encryptJson);
    if (typeof data === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === null || v === undefined) continue;
        out[k] = encryptJson(v);
      }
      return out;
    }
    if (typeof data === 'string') return CresotyCrypt.getEncode(data);
    return data;
  }

  function decryptJson(data) {
    if (Array.isArray(data)) return data.map(decryptJson);
    if (data !== null && typeof data === 'object') {
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, decryptJson(v)])
      );
    }
    if (typeof data === 'string' && data.includes('^')) {
      try { return CresotyCrypt.getDecode(data); } catch { return data; }
    }
    return data;
  }

  async function get(path, params = {}) {
    const url = new URL(`${ApiConfig.baseUrl}${path}`);
    for (const [key, value] of Object.entries(encryptParams(params))) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decryptJson(await response.json());
  }

  async function post(path, body = {}) {
    const url = `${ApiConfig.baseUrl}${path}`;
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body:    JSON.stringify(encryptJson(body)),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decryptJson(await response.json());
  }

  return { get, post }; 
})();


/* ===== src\shared\socket\protocol\socket-constants.js ===== */
/**
 * SocketConstants — 소켓 프로토콜 상수
 *
 * 두 가지 채널 전문:
 *   1) Terminal(TRM)  : EUC-KR 바이너리 + STX/ETX/LRC  (시리얼 포트)
 *   2) CATPOS  (CAT)  : JSON {"command":"...","data":{...}}  (웹소켓)
 */
window.SocketConstants = Object.freeze({

  // ── 단말기(TRM) 명령 ─────────────────────────────
  TERMINAL_COMMAND_001: '001',  // TRM → PAD : 포인트 적립
  TERMINAL_COMMAND_002: '002',  // TRM → PAD : 포인트 적립(복합 결제)
  TERMINAL_COMMAND_003: '003',  // TRM → PAD : [요청] 포인트 사용
  TERMINAL_COMMAND_004: '004',  // TRM ← PAD : [응답] 포인트 사용
  TERMINAL_COMMAND_010: '010',  // PAD → TRM : 취소

  // ── 캣포스(CAT) 수신 명령 (PC → PAD) ───────────
  CATPOS_CONNECT:                   'CONNECT',
  CATPOS_PHONE_INPUT_REQ:           'PHONE_INPUT_REQ',
  CATPOS_CUSTOMER_REGISTER_REQ:     'CUSTOMER_REGISTER_REQ',
  CATPOS_CANCEL:                    'CANCEL',
  CATPOS_EARN_SINGLE_REQ:           'EARN_SINGLE_REQ',
  CATPOS_EARN_MULTI_REQ:            'EARN_MULTI_REQ',
  CATPOS_USE_POINT_REQ:             'USE_POINT_REQ',
  CATPOS_USE_POINT_WITH_CUSTOMER_REQ: 'USE_POINT_WITH_CUSTOMER_REQ',
  CATPOS_SESSION_START:             'SESSION_START',
  CATPOS_SESSION_END:               'SESSION_END',

  // ── 캣포스(CAT) 송신 명령 (PAD → PC) ───────────
  CATPOS_CONNECT_ACK:               'CONNECT_ACK',
  CATPOS_PHONE_INPUT_ACK:           'PHONE_INPUT_ACK',
  CATPOS_CUSTOMER_REGISTER_ACK:     'CUSTOMER_REGISTER_ACK',
  CATPOS_USE_POINT_ACK:             'USE_POINT_ACK',
  CATPOS_USE_POINT_WITH_CUSTOMER_ACK: 'USE_POINT_WITH_CUSTOMER_ACK',
  CATPOS_FAIL:                      'FAIL',

  // ── 단말기 전문 ASCII 제어문자 ───────────────────
  TERMINAL_FLAG: 'TRM',
  COMM_STX: 0x02,
  COMM_ETX: 0x03,
  COMM_FS:  0x1C,
  COMM_ACK: 0x06,
  COMM_NAK: 0x15,

  KOR_CHARSET: 'euc-kr',
});


/* ===== src\shared\socket\socket-events.js ===== */
/**
 * SocketEvent — 소켓에서 파싱된 도메인 이벤트 타입 (Android SocketEvent 미러)
 *
 * 사용:
 *   socketGateway.on(SocketEvent.TerminalEarnPointSingle, ({ fields }) => { ... });
 *   socketGateway.on(SocketEvent.CatRequestNum, () => { ... });
 */
window.SocketEvent = Object.freeze({

  // ── 단말기(TRM) 전문 ─────────────────────────
  TerminalEarnPointSingle:  'TERMINAL_EARN_POINT_SINGLE',   // 001
  TerminalEarnPointComplex: 'TERMINAL_EARN_POINT_COMPLEX',  // 002
  TerminalUsePoint:         'TERMINAL_USE_POINT',           // 003

  // ── 캣포스(CAT) 전문 ─────────────────────────
  CatConnect:               'CAT_CONNECT',                   // 000
  CatRequestNum:            'CAT_REQUEST_NUM',               // 001
  CatRequestCustomer:       'CAT_REQUEST_CUSTOMER',          // 002
  CatDisconnect:            'CAT_DISCONNECT',                // 003
  CatEarnPointSingle:       'CAT_EARN_POINT_SINGLE',         // 004
  CatEarnPointComplex:      'CAT_EARN_POINT_COMPLEX',        // 005
  CatUsePointNoCustomer:    'CAT_USE_POINT_NO_CUSTOMER',     // 006
  CatUsePointWithCustomer:  'CAT_USE_POINT_WITH_CUSTOMER',   // 007
});


/* ===== src\shared\socket\protocol\catpos-codec.js ===== */
/**
 * CatposCodec — CATPOS(PC) JSON 전문 인코더/디코더
 *
 * Android: CatposParser  +  SocketResponseRepositoryImpl.sendCATXxx
 *
 * 수신 포맷: {"command":"<CMD>","data":{...}}
 * 송신 포맷: {"command":"<CMD_ACK>","data":{...}}
 *
 * 의존: SocketConstants
 */
window.CatposCodec = (function () {

  const C = SocketConstants;

  /**
   * 수신 텍스트 → { command, data } 또는 null.
   * @param {string} text
   */
  function parse(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      const msg = JSON.parse(trimmed);
      if (!msg || typeof msg.command !== 'string') return null;
      return {
        command: msg.command,
        data:    msg.data && typeof msg.data === 'object' ? msg.data : {},
      };
    } catch {
      return null;
    }
  }

  function makeJson(command, data) {
    return JSON.stringify({ command, data: data || {} });
  }

  // ── 송신 헬퍼 (PAD → PC) ───────────────────────

  /** CONNECT_ACK */
  function ok() {
    return makeJson(C.CATPOS_CONNECT_ACK, {});
  }

  /** PHONE_INPUT_ACK : { phone } */
  function ackPhoneNumber(phone) {
    return makeJson(C.CATPOS_PHONE_INPUT_ACK, { phone });
  }

  /** CUSTOMER_REGISTER_ACK : { phone, customerCode } */
  function ackCustomerInfo(phone, customerCode) {
    return makeJson(C.CATPOS_CUSTOMER_REGISTER_ACK, { phone, customerCode });
  }

  /** FAIL : { message: "다음에하기" } */
  function fail() {
    return makeJson(C.CATPOS_FAIL, { message: '다음에하기' });
  }

  /** USE_POINT_ACK : { customerCode, balance, usePoint } */
  function ackUsePointResult(customerCode, balance, usePoint) {
    return makeJson(C.CATPOS_USE_POINT_ACK, { customerCode, balance, usePoint });
  }

  /** USE_POINT_WITH_CUSTOMER_ACK : { usePoint } */
  function ackUsePointWithCustomer(usePoint) {
    return makeJson(C.CATPOS_USE_POINT_WITH_CUSTOMER_ACK, { usePoint });
  }

  return {
    parse,
    ok, fail,
    ackPhoneNumber, ackCustomerInfo,
    ackUsePointResult, ackUsePointWithCustomer,
  };
})();


/* ===== src\shared\socket\protocol\terminal-codec.js ===== */
/**
 * TerminalCodec — 단말기(TRM) 바이너리 전문 인코더/디코더
 *
 * Android: PharmpayTelegram.makeXxx + SocketManager.findCommand + splitTelegram
 *
 * 전문 구조 (PAD → TRM 송신):
 *   STX  XX  4-digit-len  PAD  cmd(3)  FS  payload(FS-separated)  ETX  LRC
 *
 * 전문 구조 (TRM → PAD 수신):
 *   STX  XX  4-digit-len  TRM  cmd(3)  ...payload...  ETX  LRC
 *
 * LRC: data[1..len-1] XOR 누적 | 0x20
 *
 * Korean 문자열은 EUC-KR 로 인/디코딩한다.
 * (전화번호/금액 등 ASCII 만 사용하는 필드는 UTF-8 과 동일하지만, 한글 메시지 호환을 위해 명시.)
 *
 * 의존: SocketConstants
 */
window.TerminalCodec = (function () {

  const C = SocketConstants;

  const eucDecoder = new TextDecoder(C.KOR_CHARSET);

  /** EUC-KR 인코더는 표준이 아니므로 ASCII 폴백 (현재 사용 필드는 모두 ASCII). */
  function encodeKor(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      bytes[i] = c > 0xff ? 0x3f /* '?' */ : c;
    }
    return bytes;
  }

  function decodeKor(bytes) {
    return eucDecoder.decode(bytes);
  }

  function isDigit(byte) {
    return byte >= 0x30 && byte <= 0x39;
  }

  function lrc(data, length) {
    let acc = 0;
    for (let i = 1; i < length; i++) acc ^= data[i];
    return (acc | 0x20) & 0xff;
  }

  // ── 송신 전문 빌더 ────────────────────────────────

  function buildHeader(cmd) {
    // STX  X  X  P  A  D  cmd[0] cmd[1] cmd[2]
    return [
      C.COMM_STX,
      0x58, 0x58,           // 'X', 'X'
      0x50, 0x41, 0x44,     // 'P', 'A', 'D'
      cmd.charCodeAt(0), cmd.charCodeAt(1), cmd.charCodeAt(2),
    ];
  }

  function finalize(buff) {
    // 길이 헤더 = 전체 + 4(자기 자신) 자리에 인덱스 3 부터 삽입
    const totalLen = buff.length + 4;
    const lenStr = String(totalLen).padStart(4, '0');
    const lenBytes = [
      lenStr.charCodeAt(0), lenStr.charCodeAt(1),
      lenStr.charCodeAt(2), lenStr.charCodeAt(3),
    ];
    buff.splice(3, 0, ...lenBytes);

    const out = Uint8Array.from(buff);
    const tail = lrc(out, out.length);
    const withLrc = new Uint8Array(out.length + 1);
    withLrc.set(out, 0);
    withLrc[out.length] = tail;
    return withLrc;
  }

  /** 004 응답 — 포인트 사용 결과 (phone | balance | delta) */
  function makeUsePoint(phone, balance, delta) {
    const buff = buildHeader(C.TERMINAL_COMMAND_004);
    buff.push(C.COMM_FS);
    buff.push(...encodeKor(String(phone)));
    buff.push(C.COMM_FS);
    buff.push(...encodeKor(String(balance)));
    buff.push(C.COMM_FS);
    buff.push(...encodeKor(String(delta)));
    buff.push(C.COMM_ETX);
    return finalize(buff);
  }

  /** 010 — 진행중 취소 (INIT) */
  function makeInit() {
    const buff = buildHeader(C.TERMINAL_COMMAND_010);
    buff.push(C.COMM_FS);
    buff.push(...encodeKor('INIT'));
    buff.push(C.COMM_ETX);
    return finalize(buff);
  }

  /** ACK (수신 확인) */
  function ack() {
    return Uint8Array.of(C.COMM_ACK, C.COMM_ACK, C.COMM_ACK);
  }

  // ── 수신 전문 파서 ────────────────────────────────

  /**
   * 단말기 수신 바이트 → { cmd, fields, raw } 또는 null.
   * Android SocketManager.findCommand 동일 로직.
   */
  function parse(bytes) {
    if (!bytes || bytes.length < 5) return null;
    if (bytes[0] !== C.COMM_STX) return null;

    // 4 자리 길이 헤더 위치 탐색
    let pos = 0;
    while (pos + 3 < bytes.length) {
      let n = 0;
      const end = Math.min(pos + 5, bytes.length);
      for (let i = pos; i < end; i++) {
        if (!isDigit(bytes[i])) break;
        n++;
      }
      if (n === 4) break;
      pos++;
    }
    if (pos + 7 >= bytes.length) return null;

    const pktLenStr = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
    const pktLen = parseInt(pktLenStr, 10);
    if (!Number.isFinite(pktLen) || pktLen <= 0 || pktLen > bytes.length) return null;
    if (bytes[pktLen - 1] !== C.COMM_ETX) return null;

    const trmFlag = decodeKor(bytes.slice(pos + 4, pos + 7));
    if (trmFlag !== C.TERMINAL_FLAG) return null;

    const cmd = decodeKor(bytes.slice(pos + 7, pos + 10));

    // payload = cmd 직후 ~ ETX 직전, FS 로 분할
    const payload = bytes.slice(pos + 10, pktLen - 1);
    const fields = splitByFs(payload).map(decodeKor);

    return { cmd, fields, raw: bytes };
  }

  function splitByFs(bytes) {
    const parts = [];
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === C.COMM_FS) {
        parts.push(bytes.slice(start, i));
        start = i + 1;
      }
    }
    if (start < bytes.length) parts.push(bytes.slice(start));
    return parts;
  }

  return {
    // sender
    makeUsePoint, makeInit, ack,
    // receiver
    parse,
    // utilities (외부 노출용)
    encodeKor, decodeKor, lrc,
  };
})();


/* ===== src\shared\socket\socket-config.js ===== */
/**
 * SocketConfig — 소켓 통신 런타임 설정.
 *
 *  port       : WebSocket 서버 리스닝 포트 (PharmPoint Android = 52391)
 *  baudRate   : 시리얼 포트 통신 속도
 *  wsJsonWrap : false → JSON 전문을 원문 그대로 송수신 (JSON 프로토콜 사용)
 */
window.SocketConfig = (function () {

  return Object.freeze({
    port:       52391,
    wsPath:     '/',
    wsServerId: 'pharm-pad',
    wsJsonWrap: false,
    baudRate:   9600,
  });
})();


/* ===== src\shared\socket\transport\websocket-transport.js ===== */
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


/* ===== src\shared\socket\transport\serial-transport.js ===== */
/**
 * SerialTransport — Toss 플러그인 SDK 의 Serial API 래퍼.
 *
 * 역할: 단말기(TRM) 바이너리 전문 송수신.
 *   - sdk.serial.open    → 시리얼 포트 오픈
 *   - sdk.serial.listen  → 수신 Uint8Array 누적/프레이밍 후 onFrame 콜백
 *   - sdk.serial.write   → Uint8Array 전송
 *
 * 프레이밍: STX(02) 부터 ETX(03)+LRC(1byte) 까지를 1 프레임으로 절단.
 *   완성 못 한 잔여 바이트는 다음 chunk 와 합쳐 재시도.
 *
 * docs.tossplace.com → /reference/plugin-sdk/front/serial.html
 *
 * 의존: SocketConfig, SocketConstants, sdk (Toss Front SDK)
 */
window.SerialTransport = (function () {

  const cfg = SocketConfig;
  const C   = SocketConstants;

  /**
   * @param {{ onFrame: (bytes: Uint8Array) => void, onError?: (e: any) => void }} handlers
   */
  function create({ onFrame, onError } = {}) {

    const state = {
      opened:     false,
      buffer:     new Uint8Array(0),
      unlisten:   null,
    };

    function appendBuffer(chunk) {
      const merged = new Uint8Array(state.buffer.length + chunk.length);
      merged.set(state.buffer, 0);
      merged.set(chunk, state.buffer.length);
      state.buffer = merged;
    }

    function tryExtractFrames() {
      while (state.buffer.length > 0) {

        // 1) STX 동기화
        const stxIdx = state.buffer.indexOf(C.COMM_STX);
        if (stxIdx < 0) {
          // STX 없으면 단일 제어 바이트 (ACK/NAK 등) 가능 - 무시하고 버퍼 비움
          state.buffer = new Uint8Array(0);
          return;
        }
        if (stxIdx > 0) state.buffer = state.buffer.slice(stxIdx);

        // 2) 길이 헤더 (STX 다음 ~ 4 자리 ASCII digit 위치)
        if (state.buffer.length < 8) return; // STX + XX + len(4) 최소 7
        // findCommand 와 동일 정책: STX 부터 0~k 까지 skip 후 4 digit 길이 헤더
        let pos = 0;
        let found = -1;
        const max = Math.min(state.buffer.length - 4, 8);
        for (; pos <= max; pos++) {
          let n = 0;
          for (let i = pos; i < pos + 4; i++) {
            const b = state.buffer[i];
            if (b < 0x30 || b > 0x39) break;
            n++;
          }
          if (n === 4) { found = pos; break; }
        }
        if (found < 0) return; // 더 받아야 함

        const lenStr = String.fromCharCode(
          state.buffer[found],     state.buffer[found + 1],
          state.buffer[found + 2], state.buffer[found + 3],
        );
        const pktLen = parseInt(lenStr, 10);
        if (!Number.isFinite(pktLen) || pktLen <= 0 || pktLen > 64 * 1024) {
          // 손상 → STX 1바이트 버리고 재동기화
          state.buffer = state.buffer.slice(1);
          continue;
        }

        // 3) ETX + LRC 까지 길이 = pktLen + 1
        const frameLen = pktLen + 1;
        if (state.buffer.length < frameLen) return; // 미완성

        const frame = state.buffer.slice(0, frameLen);
        state.buffer = state.buffer.slice(frameLen);

        if (frame[pktLen - 1] !== C.COMM_ETX) {
          // ETX 위치 어긋남 → 재동기화 (STX 다음으로)
          continue;
        }

        try {
          onFrame && onFrame(frame);
        } catch (e) {
          onError && onError(e);
        }
      }
    }

    async function start() {
      if (state.opened) return;
      await sdk.serial.open({ baudRate: cfg.baudRate });
      state.opened = true;

      state.unlisten = sdk.serial.listen((params) => {
        const chunk = params?.data;
        if (!chunk || chunk.length === 0) return;
        try {
          appendBuffer(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
          tryExtractFrames();
        } catch (e) {
          onError && onError(e);
        }
      });
    }

    async function stop() {
      if (!state.opened) return;
      try { state.unlisten && state.unlisten(); } catch { /* noop */ }
      state.unlisten = null;
      try { await sdk.serial.close(); } finally {
        state.opened = false;
        state.buffer = new Uint8Array(0);
      }
    }

    async function send(bytes) {
      if (!state.opened) {
        console.warn('[SerialTransport] not opened');
        return;
      }
      const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
      await sdk.serial.write({ data: u8 });
    }

    return { start, stop, send };
  }

  return { create };
})();


/* ===== src\shared\socket\socket-gateway.js ===== */
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


/* ===== src\features\transaction-parser\transaction-parser.service.js ===== */
/**
 * TransactionParserService — 소켓 raw 필드 → 구조화된 TransactionData 변환.
 *
 * Android: com.cresoty.catpospoint.domain.parser.TransactionDataParser
 *
 * TransactionData 형태:
 * {
 *   trnDate:   string,   // yyyyMMdd
 *   trnTime:   string,   // HHmmss
 *   appNum:    string,   // 승인번호 (복합결제 시 첫 번째 건)
 *   trnGubn:   string,   // 거래구분 ("P" → "M" 정규화)
 *   payAmount: number,   // 총 결제 금액
 *   payments?: Array<PaymentDetail>  // 복합결제 시 2건
 * }
 *
 * PaymentDetail 형태:
 * {
 *   appNum:  string,
 *   trnGubn: string,
 *   trnDate: string,
 *   trnTime: string,
 *   trnAmt:  string,
 * }
 *
 * TERMINAL 전문 포맷 (단일):
 *   list[1]=dateTime(14), list[2]=appNum, list[3]=method,
 *   list[5]=otc, list[6]=vat
 *
 * TERMINAL 전문 포맷 (복합):
 *   list[1]=dateTime(14), list[2]=appNum1, list[3]=method1,
 *   list[5]=otc1, list[6]=vat1,
 *   list[7]=appNum2, list[8]=method2,
 *   list[10]=otc2, list[11]=vat2
 *
 * TERMINAL 003 (사용 요청):
 *   list[3]=otc, list[4]=vat (payAmount 만 의미 있음)
 *
 * CAT 전문 포맷 (단일):
 *   fields[0]=dateTime(14), [1]=appNum, [2]=method, [3]=amount
 *
 * CAT 전문 포맷 (복합):
 *   fields[0]=dateTime(14),
 *   [1]=appNum1, [2]=method1, [3]=amount1,
 *   [4]=appNum2, [5]=method2, [6]=amount2
 *
 * CAT 006 (사용 요청):
 *   fields[0]=dateTime(14), fields[1]=amount
 */
window.TransactionParserService = (function () {

  const at = (arr, idx, fallback = '') => {
    const v = arr?.[idx];
    return (v === undefined || v === null) ? fallback : String(v);
  };

  const toInt = (s, fallback = 0) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeGubn = (g) => (g === 'P' ? 'M' : g);

  function makePayment({ appNum, gubn, date, time, amount }) {
    return {
      appNum:  appNum,
      trnGubn: normalizeGubn(gubn),
      trnDate: date,
      trnTime: time,
      trnAmt:  String(amount),
    };
  }

  // ── TERMINAL ─────────────────────────────────────────

  function parseTerminalSingle(data) {
    const dateTime = at(data, 1);
    const otc = toInt(at(data, 5, '0'));
    const vat = toInt(at(data, 6, '0'));
    return {
      trnDate:   dateTime.slice(0, 8),
      trnTime:   dateTime.slice(8),
      appNum:    at(data, 2),
      trnGubn:   normalizeGubn(at(data, 3, 'M')),
      payAmount: otc + vat,
    };
  }

  function parseTerminalComplex(data) {
    const dateTime = at(data, 1);
    const date = dateTime.slice(0, 8);
    const time = dateTime.slice(8);
    const otc1 = toInt(at(data, 5,  '0'));
    const vat1 = toInt(at(data, 6,  '0'));
    const otc2 = toInt(at(data, 10, '0'));
    const vat2 = toInt(at(data, 11, '0'));
    const first  = makePayment({
      appNum: at(data, 2), gubn: at(data, 3, 'M'),
      date, time, amount: otc1 + vat1,
    });
    const second = makePayment({
      appNum: at(data, 7), gubn: at(data, 8, 'M'),
      date, time, amount: otc2 + vat2,
    });
    return {
      trnDate:   date,
      trnTime:   time,
      appNum:    first.appNum,
      trnGubn:   first.trnGubn,
      payAmount: otc1 + vat1 + otc2 + vat2,
      payments:  [first, second],
    };
  }

  function parseTerminalUsePoint(data) {
    const otc = toInt(at(data, 3, '0'));
    const vat = toInt(at(data, 4, '0'));
    return {
      trnDate:   '',
      trnTime:   '',
      appNum:    '',
      trnGubn:   '',
      payAmount: otc + vat,
    };
  }

  // ── CAT ──────────────────────────────────────────────
  // data 는 CatposCodec.parse() 결과의 data 객체

  function parseCatSingle(data) {
    const date = String(data?.trnDate ?? '');
    return {
      trnDate:   date,
      trnTime:   '',
      appNum:    String(data?.appNum ?? ''),
      trnGubn:   normalizeGubn(String(data?.method ?? 'M')),
      payAmount: toInt(String(data?.amount ?? '0')),
    };
  }

  function parseCatComplex(data) {
    const date = String(data?.trnDate ?? '');
    const payments = Array.isArray(data?.payments) ? data.payments : [];
    const p0 = payments[0] || {};
    const p1 = payments[1] || {};
    const amount0 = toInt(String(p0.amount ?? '0'));
    const amount1 = toInt(String(p1.amount ?? '0'));
    const first  = makePayment({ appNum: String(p0.appNum ?? ''), gubn: String(p0.method ?? 'M'), date, time: '', amount: amount0 });
    const second = makePayment({ appNum: String(p1.appNum ?? ''), gubn: String(p1.method ?? 'M'), date, time: '', amount: amount1 });
    return {
      trnDate:   date,
      trnTime:   '',
      appNum:    first.appNum,
      trnGubn:   first.trnGubn,
      payAmount: amount0 + amount1,
      payments:  [first, second],
    };
  }

  function parseCatUsePoint(data) {
    return {
      trnDate:   String(data?.trnDate ?? ''),
      trnTime:   '',
      appNum:    '',
      trnGubn:   '',
      payAmount: toInt(String(data?.payAmount ?? '0')),
    };
  }

  return {
    parseTerminalSingle,
    parseTerminalComplex,
    parseTerminalUsePoint,
    parseCatSingle,
    parseCatComplex,
    parseCatUsePoint,
  };
})();


/* ===== src\features\point-inquiry\point-inquiry.service.js ===== */
/**
 * PointInquiryService — 고객 조회 / 포인트 잔액 조회
 *
 * Android: CatposCloudApi.getCustomer, CatposCloudApi.getPointBalance
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointInquiryService = (function () {

  /**
   * 고객 존재 여부 확인 및 포인트 조회
   * GET /api/terminals/customers
   * @param {string} phone - 11자리 전화번호
   * @returns {Promise<{success: boolean, customer?: object, error?: string}>}
   */
  async function getCustomer(phone) {
    const json = await PharmHttpClient.get('/api/terminals/customers', {
      TAXNO:      ApiConfig.taxNo,
      CST_HP:     phone,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
    });

    if (json.CODE === '0000' && json.DATA?.LIST?.length > 0) {
      const dto = json.DATA.LIST[0];
      return {
        success: true,
        customer: {
          customerCode:  dto.CST_CODE ?? '',
          customerName:  dto.CST_NAME ?? '',
          customerPhone: dto.CST_HP   ?? '',
          pointBalance:  parseInt(dto.PNT_AMT, 10) || 0,
        },
      };
    }
    return { success: false, error: '등록된 회원이 아닙니다.' };
  }

  /**
   * 포인트 잔액 상세 조회
   * GET /api/terminals/customers/code
   * @param {string} phone - 11자리 전화번호
   * @returns {Promise<{success: boolean, customer?: object, error?: string}>}
   */
  async function getPointBalance(phone) {
    const json = await PharmHttpClient.get('/api/terminals/customers/code', {
      TAXNO:      ApiConfig.taxNo,
      CST_HP:     phone,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000' && json.DATA?.INFO?.length > 0) {
      const dto = json.DATA.INFO[0];
      return {
        success: true,
        customer: {
          customerCode:   dto.CST_CODE  ?? '',
          customerName:   dto.CST_NAME  ?? '',
          customerPhone:  dto.CST_HP    ?? '',
          customerGender: dto.CST_GNDR  ?? '',
          customerBirth:  dto.CST_BRTH  ?? '',
          pointBalance:   parseInt(dto.PNT_BLC, 10) || 0,
        },
      };
    }
    return { success: false, error: json.MSG || '등록된 회원이 없습니다.' };
  }

  return { getCustomer, getPointBalance };
})();


/* ===== src\features\point-settings\point-settings.service.js ===== */
/**
 * PointSettingsService — 포인트 적립/사용 설정 조회
 *
 * Android: CatposCloudApi.getPointSaveSetting / getPointAmountSetting
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointSettingsService = (function () {

  const DEFAULT_MIN_AMOUNT = 20000;

  /**
   * 포인트 적립 사용 여부 조회 (PNT_GUBN != 'NON' 이면 적립 활성)
   * GET /api/point/settings
   * @returns {Promise<{success: boolean, isSave?: boolean, error?: string}>}
   */
  async function getPointSaveSetting() {
    const json = await PharmHttpClient.get('/api/point/settings', {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000') {
      const pntGubn = json.DATA?.INFO?.[0]?.PNT_GUBN ?? '';
      return { success: true, isSave: pntGubn !== 'NON' };
    }
    return { success: false, error: json.MSG || '적립 설정 조회 실패' };
  }

  /**
   * 포인트 사용 최소 금액 조회 (INFO 중 최소 BASE_AMT)
   * GET /api/point/payment-settings
   * @returns {Promise<{success: boolean, minAmount?: number, error?: string}>}
   */
  async function getPointAmountSetting() {
    const json = await PharmHttpClient.get('/api/point/payment-settings', {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000') {
      const amounts = (json.DATA?.INFO ?? [])
        .map(it => parseInt(it.BASE_AMT, 10))
        .filter(n => Number.isFinite(n));
      const minAmount = amounts.length ? Math.min(...amounts) : DEFAULT_MIN_AMOUNT;
      return { success: true, minAmount };
    }
    return { success: false, error: json.MSG || '사용 설정 조회 실패' };
  }

  return { getPointSaveSetting, getPointAmountSetting };
})();


/* ===== src\features\point-transaction\point-transaction.service.js ===== */
/**
 * PointTransactionService — 포인트 적립 예상 + 적립/사용 확정 (upsert)
 *
 * Android: CatposCloudApi.estimatePoint, CatposCloudApi.upsertCustomerPoint
 *
 * estimatePoint 재시도 정책: CODE 8888 / 9303 → 최대 3회 시도 (1s, 2s 백오프).
 *   소진 시 graceful 진행 (success: true, data: null) — Android EstimatePointRetryableException 동일.
 *
 * upsertCustomerPoint 호출 형태 3 가지:
 *   1) BySleSeq         — 적립 예상으로 받은 SLE_SEQ 로 확정
 *   2) BySinglePayment  — 단건 결제 정보로 확정
 *   3) ByMultiplePayment — 복합 결제 (2건) 정보로 확정
 *
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointTransactionService = (function () {

  const RETRYABLE_CODES = new Set(['8888', '9303']);
  const RETRY_DELAYS_MS = [1000, 2000];
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  function baseBody({ customerPhone, transactionDate }) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      CST_HP:     customerPhone,
      TRN_DATE:   transactionDate,
    };
  }

  function paymentDetailDto(p) {
    return {
      TRN_GUBN: p.trnGubn,
      TRN_DATE: p.trnDate,
      TRN_TIME: p.trnTime,
      APP_NUM:  p.appNum,
      TRN_AMT:  String(p.trnAmt),
    };
  }

  async function callUpsert(body) {
    const json = await PharmHttpClient.post('/api/terminals/customers/code', body);
    if (json.CODE === '0000') {
      const dto = json.DATA?.INFO?.[0];
      return {
        success: true,
        data: {
          sleSeq:        dto?.SLE_SEQ   ?? '',
          customerCode:  dto?.CST_CODE  ?? '',
          customerPhone: dto?.CST_HP    ?? '',
          customerName:  dto?.CST_NAME  ?? '',
          pointAmount:   dto?.PNT_AMT   ?? '0',
          pointBalance:  dto?.PNT_BLC   ?? '0',
        },
      };
    }
    return { success: false, error: json.MSG || 'upsertCustomerPoint failed' };
  }

  /**
   * SLE_SEQ 로 확정 (적립 예상 단계에서 발급받은 시퀀스 사용)
   * @param {{customerPhone: string, transactionDate: string, sleSeq: string}} cmd
   */
  async function commitBySleSeq(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      SLE_SEQ: cmd.sleSeq,
    });
  }

  /**
   * 단건 결제 정보로 확정
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   transactionGubn: string,
   *   transactionTime: string,
   *   transactionAmount: string|number,
   *   approvalNumber: string
   * }} cmd
   */
  async function commitBySinglePayment(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      TRN_GUBN: cmd.transactionGubn,
      TRN_TIME: cmd.transactionTime,
      TRN_AMT:  String(cmd.transactionAmount),
      APP_NUM:  cmd.approvalNumber,
    });
  }

  /**
   * 복합 결제 (2건) 정보로 확정
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   transactionAmount: string|number,
   *   payments: Array<{
   *     trnGubn: string, trnDate: string, trnTime: string,
   *     appNum: string, trnAmt: string|number
   *   }>
   * }} cmd
   */
  async function commitByMultiplePayment(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      TRN_AMT: String(cmd.transactionAmount),
      ADD:     cmd.payments.map(paymentDetailDto),
    });
  }

  /**
   * 포인트 예상 적립 계산
   * POST /api/point/estimate
   *
   * 단건: trnDate, trnGubn, trnAmt, appNum 전달
   * 복합: payments 배열 전달 (ADD 필드)
   *
   * @param {{
   *   trnDate?: string,
   *   trnGubn?: string,
   *   trnAmt?: string|number,
   *   appNum?: string,
   *   payments?: Array<{trnGubn, trnDate, trnTime, appNum, trnAmt}>
   * }} cmd
   */
  async function estimatePoint(cmd) {
    const body = {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      ...(cmd.trnDate   && { TRN_DATE: cmd.trnDate }),
      ...(cmd.trnGubn   && { TRN_GUBN: cmd.trnGubn }),
      ...(cmd.trnAmt    && { TRN_AMT:  String(cmd.trnAmt) }),
      ...(cmd.appNum    && { APP_NUM:  cmd.appNum }),
      ...(cmd.payments  && { ADD:      cmd.payments.map(paymentDetailDto) }),
    };

    let lastCode = '-9999';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const json = await PharmHttpClient.post('/api/point/estimate', body);
      const code = json.CODE ?? '-9999';
      if (code === '0000') {
        const dto = json.DATA?.INFO?.[0];
        return {
          success: true,
          data: {
            sleSeq:      dto?.SLE_SEQ ?? '',
            pointAmount: dto?.PNT_AMT ?? '0',
            raw:         json.DATA,
          },
        };
      }
      if (!RETRYABLE_CODES.has(code)) {
        return { success: false, error: json.MSG || `estimatePoint failed: ${code}` };
      }
      lastCode = code;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    // 재시도 소진 → graceful pass (Android Success(null) 동일)
    return { success: true, data: null, retried: true, lastCode };
  }

  return { estimatePoint, commitBySleSeq, commitBySinglePayment, commitByMultiplePayment };
})();


/* ===== src\features\point-estimate\point-estimate.service.js ===== */
/**
 * PointEstimateService — 포인트 적립 예상치 조회
 *
 * Android: CatposCloudApi.estimatePoint
 *
 * 재시도 정책: CODE 8888 / 9303 → 최대 3회 시도 (1s, 2s 백오프).
 *   재시도 소진 시 graceful 진행 (success: true, data: null).
 *
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointEstimateService = (function () {

  const RETRYABLE_CODES = new Set(['8888', '9303']);
  const RETRY_DELAYS_MS = [1000, 2000];

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function buildSingleBody({ trnDate, trnGubn, trnAmt, appNum }) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      TRN_DATE:   trnDate,
      TRN_GUBN:   trnGubn,
      TRN_AMT:    String(trnAmt),
      APP_NUM:    appNum,
    };
  }

  function buildComplexBody(payments) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      ADD: payments.map(p => ({
        TRN_GUBN: p.trnGubn,
        TRN_DATE: p.trnDate,
        TRN_TIME: p.trnTime,
        APP_NUM:  p.appNum,
        TRN_AMT:  String(p.trnAmt),
      })),
    };
  }

  async function callOnce(body) {
    return PharmHttpClient.post('/api/point/estimate', body);
  }

  async function callWithRetry(body) {
    let lastCode = '-9999';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const json = await callOnce(body);
      const code = json.CODE ?? '-9999';
      if (code === '0000') {
        const dto = json.DATA?.INFO?.[0];
        return {
          success: true,
          data: {
            sleSeq:      dto?.SLE_SEQ      ?? '',
            pointAmount: dto?.PNT_AMT      ?? '',
          },
        };
      }
      if (!RETRYABLE_CODES.has(code)) {
        return { success: false, error: json.MSG || `estimatePoint failed: ${code}` };
      }
      lastCode = code;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    // 재시도 소진 → graceful pass (Android 동일 동작)
    return { success: true, data: null, retried: true, lastCode };
  }

  /**
   * 단건 결제 적립 예상
   * @param {{trnDate: string, trnGubn: string, trnAmt: string|number, appNum: string}} cmd
   */
  async function estimateSingle(cmd) {
    return callWithRetry(buildSingleBody(cmd));
  }

  /**
   * 복합 결제 적립 예상
   * @param {Array<{trnGubn: string, trnDate: string, trnTime: string, appNum: string, trnAmt: string|number}>} payments
   */
  async function estimateComplex(payments) {
    return callWithRetry(buildComplexBody(payments));
  }

  return { estimateSingle, estimateComplex };
})();


/* ===== src\features\point-earn\point-earn.service.js ===== */
/**
 * PointEarnService — 포인트 적립 orchestration.
 *
 * Android: PhoneNumberInputViewModel.proceedEarnPoint
 *   1) estimatePoint 로 적립 예상치 + SLE_SEQ 발급
 *   2) 사용자 확인 후 commitEarn → upsertCustomerPoint
 *      - sleSeq 보유 → BySleSeq (재시도 소진 후 fallback 포함)
 *      - 복합결제      → ByMultiplePayment
 *      - 단건결제      → BySinglePayment
 *
 * 의존: PointTransactionService
 */
window.PointEarnService = (function () {

  /**
   * 적립 예상 조회.
   * @param {{
   *   trnDate: string, trnTime: string, appNum: string, trnGubn: string,
   *   payAmount: number,
   *   payments?: Array<{appNum, trnGubn, trnDate, trnTime, trnAmt}>
   * }} txData
   * @returns {Promise<{success, data?: {sleSeq, pointAmount}, retried?, error?}>}
   */
  async function estimate(txData) {
    if (txData.payments && txData.payments.length >= 2) {
      return PointTransactionService.estimatePoint({
        payments: txData.payments,
      });
    }
    return PointTransactionService.estimatePoint({
      trnDate: txData.trnDate,
      trnGubn: txData.trnGubn,
      trnAmt:  txData.payAmount,
      appNum:  txData.appNum,
    });
  }

  /**
   * 적립 확정 — 입력 조건에 따라 3 가지 전략 자동 선택.
   *
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   sleSeq?: string,                         // 있으면 BySleSeq
   *   transactionGubn?: string,
   *   transactionTime?: string,
   *   transactionAmount?: string|number,
   *   approvalNumber?: string,
   *   payments?: Array<{trnGubn, trnDate, trnTime, appNum, trnAmt}>,
   * }} cmd
   */
  async function commit(cmd) {
    if (cmd.sleSeq) {
      return PointTransactionService.commitBySleSeq({
        customerPhone:   cmd.customerPhone,
        transactionDate: cmd.transactionDate,
        sleSeq:          cmd.sleSeq,
      });
    }
    if (cmd.payments && cmd.payments.length >= 2) {
      return PointTransactionService.commitByMultiplePayment({
        customerPhone:     cmd.customerPhone,
        transactionDate:   cmd.transactionDate,
        transactionAmount: cmd.transactionAmount,
        payments:          cmd.payments,
      });
    }
    return PointTransactionService.commitBySinglePayment({
      customerPhone:     cmd.customerPhone,
      transactionDate:   cmd.transactionDate,
      transactionGubn:   cmd.transactionGubn,
      transactionTime:   cmd.transactionTime,
      transactionAmount: cmd.transactionAmount,
      approvalNumber:    cmd.approvalNumber,
    });
  }

  /**
   * estimate → commit fallback 흐름.
   * sleSeq 로 commit 실패 시 결제 정보 기반 strategy 로 자동 재시도.
   */
  async function commitWithFallback(cmd) {
    if (!cmd.sleSeq) return commit(cmd);

    const first = await commit(cmd);
    if (first.success) return first;

    // sleSeq 만료/거부 → 결제 정보 기반 재시도 (Android 동일)
    return commit({ ...cmd, sleSeq: '' });
  }

  return { estimate, commit, commitWithFallback };
})();


/* ===== src\features\point-use\point-use.service.js ===== */
/**
 * PointUseService — 포인트 사용 orchestration.
 *
 * Android: UsePointViewModel.submitUsePoint
 *
 * 핵심:
 *   - 사용은 별도 API 호출 없이 socket 응답만 송신 (Android 동일)
 *   - source 에 따라 응답 채널 결정:
 *       TERMINAL           → SerialPort 004 (sendTerminalUsePoint)
 *       CAT                → WebSocket ackUsePointResult
 *       CAT_WITH_CUSTOMER  → WebSocket ackUsePointWithCustomer
 *       MANUAL             → 응답 없음 (PAD 내부 UI 전용)
 *
 * 의존: PointInquiryService, SocketGateway, PointUseSource
 */
window.PointUseSource = Object.freeze({
  TERMINAL:          'TERMINAL',
  CAT:               'CAT',
  CAT_WITH_CUSTOMER: 'CAT_WITH_CUSTOMER',
  MANUAL:            'MANUAL',
});

window.PointUseService = (function () {

  /**
   * 사용 화면 진입 시 고객 조회 (잔액 포함).
   * @param {string} phone
   * @returns {Promise<{success, customer?, error?}>}
   */
  async function lookupForUse(phone) {
    return PointInquiryService.getPointBalance(phone);
  }

  /**
   * 입력 사용 포인트 유효성 검증.
   * @param {{
   *   usePoint: number,
   *   balance: number,
   *   payAmount: number,
   *   minPoint?: number,           // 최소 사용 포인트 (e.g. 1000)
   *   isMinPointEnabled?: boolean, // 환경설정에서 활성화 여부
   * }} input
   * @returns {{ok: true} | {ok: false, reason: string}}
   */
  function validateUseAmount({ usePoint, balance, payAmount, minPoint = 0, isMinPointEnabled = false }) {
    if (!Number.isFinite(usePoint) || usePoint <= 0) {
      return { ok: false, reason: '사용 포인트를 입력해주세요.' };
    }
    if (usePoint > balance) {
      return { ok: false, reason: '보유 포인트가 부족합니다.' };
    }
    if (Number.isFinite(payAmount) && payAmount > 0 && usePoint > payAmount) {
      return { ok: false, reason: '결제 금액보다 많이 사용할 수 없습니다.' };
    }
    if (isMinPointEnabled && minPoint > 0 && usePoint < minPoint) {
      return { ok: false, reason: `최소 ${minPoint}P 부터 사용 가능합니다.` };
    }
    return { ok: true };
  }

  /**
   * 사용 결과를 source 에 맞는 채널로 송신.
   *
   * @param {{
   *   source: 'TERMINAL'|'CAT'|'CAT_WITH_CUSTOMER'|'MANUAL',
   *   phone?: string,
   *   customerCode?: string,
   *   balance: number,        // 사용 전 잔액
   *   usePoint: number,
   * }} input
   * @returns {Promise<void>}
   */
  async function relayUseResult({ source, phone, customerCode, balance, usePoint }) {
    const balanceStr  = String(balance);
    const usePointStr = String(usePoint);

    switch (source) {
      case PointUseSource.TERMINAL:
        return SocketGateway.sendTerminalUsePoint(phone || '', balanceStr, usePointStr);

      case PointUseSource.CAT:
        return SocketGateway.sendCATUsePointResult(customerCode || '', balanceStr, usePointStr);

      case PointUseSource.CAT_WITH_CUSTOMER:
        return SocketGateway.sendCATUsePointWithCustomerResult(usePointStr);

      case PointUseSource.MANUAL:
      default:
        return;
    }
  }

  /**
   * 사용 취소 — 진행 중 단말기 세션 초기화 + CAT 실패 응답.
   * @param {{ source: string }} input
   */
  async function cancelUse({ source }) {
    if (source === PointUseSource.TERMINAL) {
      return SocketGateway.sendTerminalInit();
    }
    if (source === PointUseSource.CAT || source === PointUseSource.CAT_WITH_CUSTOMER) {
      return SocketGateway.sendCATFail();
    }
  }

  /**
   * source 별 잔여 포인트 계산.
   */
  function remainingPoint(balance, usePoint) {
    return Math.max(0, (balance || 0) - (usePoint || 0));
  }

  return {
    lookupForUse,
    validateUseAmount,
    relayUseResult,
    cancelUse,
    remainingPoint,
  };
})();


/* ===== src\features\result-page\result-page.service.js ===== */
/**
 * ResultPageService — sdk.template.renderResultPage 호출 헬퍼.
 *
 * Android: presentation/result/ResultContract.State
 *
 * 4가지 케이스:
 *   - showEarnSuccess(earnPoint, storeName, balancePoint, timeout?)
 *   - showUseSuccess(usePoint, storeName, remainingPoint, timeout?)
 *   - showInsufficientPoint(storeName, minPoint, balancePoint, timeout?)
 *   - showLookupResult(storeName, balancePoint, timeout?)
 *
 * 문구 포맷 (디자인 명세):
 *   적립 완료    : "<earnPoint>P 적립완료" / "<storeName> 약국 포인트가 적립되었습니다." / "<balancePoint>P"
 *   사용 완료    : "<usePoint>P 사용완료"  / "<storeName> 약국 포인트가 사용되었습니다." / "<remainingPoint>P"
 *   포인트 부족  : "포인트 부족"            / "<storeName> 최소 <minPoint>P부터 사용 가능합니다." / "<balancePoint>P"
 *   조회 결과    : "<storeName>"           / "현재 보유하고 있는 포인트입니다." / "보유 포인트 <balancePoint>P"
 *
 * 의존: sdk (Toss Front SDK)
 */
window.ResultPageService = (function () {

  const DEFAULT_TIMEOUT_MS = 5000;

  function fmtPoint(n) {
    const num = Number.isFinite(n) ? n : parseInt(n, 10) || 0;
    return num.toLocaleString('ko-KR');
  }

  function render({ type = 'text', status, title, description, text, onTimeout, timerMs, buttons }) {
    const params = {
      type,
      title,
      description,
      onTimeout: onTimeout || (() => {}),
      timerMs: Number.isFinite(timerMs) ? timerMs : DEFAULT_TIMEOUT_MS,
      localeCode: 'ko',
    };
    if (type === 'image') params.status = status || 'success';
    if (type === 'text')  params.text   = text || '';
    if (buttons && buttons.length) params.buttons = buttons;
    return sdk.template.renderResultPage(params);
  }

  /**
   * 적립 완료.
   * @param {{earnPoint:number, storeName:string, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showEarnSuccess({ earnPoint, storeName, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `${fmtPoint(balancePoint)}P`,
      title:       `${fmtPoint(earnPoint)}P 적립완료`,
      description: `${storeName} 약국 포인트가 적립되었습니다.`,
      onTimeout, timerMs,
    });
  }

  /**
   * 사용 완료.
   * @param {{usePoint:number, storeName:string, remainingPoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showUseSuccess({ usePoint, storeName, remainingPoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `${fmtPoint(remainingPoint)}P`,
      title:       `${fmtPoint(usePoint)}P 사용완료`,
      description: `${storeName} 약국 포인트가 사용되었습니다.`,
      onTimeout, timerMs,
    });
  }

  /**
   * 포인트 부족. (image:error 타입은 text 필드 미지원 → 잔액은 description 에 포함)
   * @param {{storeName:string, minPoint:number, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showInsufficientPoint({ storeName, minPoint, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'image',
      status:      'error',
      title:       '포인트 부족',
      description: `${storeName} 최소 ${fmtPoint(minPoint)}P부터 사용 가능합니다.\n보유 포인트 ${fmtPoint(balancePoint)}P`,
      onTimeout, timerMs,
    });
  }

  /**
   * 조회 결과.
   * @param {{storeName:string, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showLookupResult({ storeName, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `보유 포인트 ${fmtPoint(balancePoint)}P`,
      title:       storeName,
      description: '현재 보유하고 있는 포인트입니다.',
      onTimeout, timerMs,
    });
  }

  function showMinPointSaved({ minPoint, onTimeout, timerMs }) {
    return render({
      type:        'image',
      status:      'success',
      title:       '설정 완료',
      description: `최소 사용 포인트 ${fmtPoint(minPoint)}P`,
      onTimeout, timerMs,
    });
  }

  return {
    showEarnSuccess,
    showUseSuccess,
    showInsufficientPoint,
    showLookupResult,
    showMinPointSaved,
  };
})();


/* ===== src\features\app-session\app-session.service.js ===== */
/**
 * AppSession — 소켓 이벤트 → 화면 라우팅 결정.
 *
 * Android: AppViewModel.handleSocketEvent
 *
 * 역할:
 *   1. SocketGateway 의 이벤트를 구독해서 TransactionParser 로 파싱
 *   2. 화면 진입에 필요한 args 를 만들어서 상위 라우터 콜백에 전달
 *   3. 설정 (isSave, minPoint 등) 을 참조해서 적립 트리거 여부 필터링
 *
 * UI 통합 방식:
 *   AppSession.start({
 *     onNavigateToSavePoint:  (args) => { ... },  // 적립 요청
 *     onNavigateToLookup:     (args) => { ... },  // 사용 요청 (조회 단계)
 *     onNavigateToUsePoint:   (args) => { ... },  // 사용 직접 화면 (CAT_WITH_CUSTOMER)
 *     onNavigateToCatRequest: (args) => { ... },  // 캣포스 단순 조회 요청
 *     onCatDisconnect:        () => { ... },
 *   });
 *
 * 의존: SocketGateway, SocketEvent, TransactionParserService, PointSettingsService
 */
window.AppSession = (function () {

  let started = false;
  let unsubscribes = [];

  /** 현재 적립 활성화 상태 (PointSettingsService 결과 캐시). 미설정 시 true 로 가정. */
  let isSaveEnabled = true;
  /** 최소 사용 포인트 활성화 설정 (use point 화면 진입 시 전달용). */
  let minPoint = 0;
  let isMinPointEnabled = false;

  function setConfig({ isSave, minPoint: minP, isMinPointEnabled: minEn } = {}) {
    if (typeof isSave === 'boolean') isSaveEnabled = isSave;
    if (Number.isFinite(minP))       minPoint = minP;
    if (typeof minEn === 'boolean')  isMinPointEnabled = minEn;
  }

  async function refreshConfig() {
    try {
      const save = await PointSettingsService.getPointSaveSetting();
      if (save.success) isSaveEnabled = save.isSave;
    } catch (e) { console.warn('[AppSession] getPointSaveSetting fail', e); }
  }

  function start(handlers = {}) {
    if (started) return;
    started = true;

    const E = SocketEvent;
    const reg = (event, fn) => unsubscribes.push(SocketGateway.on(event, fn));

    // ── TERMINAL ────────────────────────────────────

    reg(E.TerminalEarnPointSingle, ({ fields }) => {
      // isAfterUse(data[7]="1"): 사용(003) 후 적립(001) 전문 → 무시
      const isAfterUse = (fields?.[7] ?? '0') === '1';
      const otc = parseInt(fields?.[5] ?? '0', 10) || 0;
      if (isAfterUse || !isSaveEnabled || otc === 0) return;

      const td = TransactionParserService.parseTerminalSingle(fields);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.TERMINAL,
        paymentType: 'SINGLE',
        transactionData: td,
      });
    });

    reg(E.TerminalEarnPointComplex, ({ fields }) => {
      const isAfterUse = (fields?.[7] ?? '0') === '1';
      const otc = parseInt(fields?.[5] ?? '0', 10) || 0;
      if (isAfterUse || !isSaveEnabled || otc === 0) return;

      const td = TransactionParserService.parseTerminalComplex(fields);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.TERMINAL,
        paymentType: 'MULTIPLE',
        transactionData: td,
      });
    });

    reg(E.TerminalUsePoint, ({ fields }) => {
      const td = TransactionParserService.parseTerminalUsePoint(fields);
      handlers.onNavigateToLookup?.({
        source:          PointUseSource.TERMINAL,
        transactionData: td,
      });
    });

    // ── CAT ─────────────────────────────────────────

    reg(E.CatConnect, () => {
      // Android AppViewModel.sendCatConnectAck: "OK|\r\n" 송신
      SocketGateway.sendCATOk();
    });

    reg(E.CatRequestNum, () => {
      handlers.onNavigateToCatRequest?.({ mode: 'CAT_REQUEST_NUM' });
    });

    reg(E.CatRequestCustomer, () => {
      handlers.onNavigateToCatRequest?.({ mode: 'CAT_REQUEST_CUSTOMER' });
    });

    reg(E.CatDisconnect, () => {
      handlers.onCatDisconnect?.();
    });

    reg(E.CatEarnPointSingle, ({ data }) => {
      const td = TransactionParserService.parseCatSingle(data);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.CAT,
        paymentType: 'SINGLE',
        transactionData: td,
      });
    });

    reg(E.CatEarnPointComplex, ({ data }) => {
      const td = TransactionParserService.parseCatComplex(data);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.CAT,
        paymentType: 'MULTIPLE',
        transactionData: td,
      });
    });

    reg(E.CatUsePointNoCustomer, ({ data }) => {
      const td = TransactionParserService.parseCatUsePoint(data);
      handlers.onNavigateToLookup?.({
        source:          PointUseSource.CAT,
        transactionData: td,
      });
    });

    reg(E.CatUsePointWithCustomer, ({ data }) => {
      const balance   = parseInt(data?.balance   ?? '0', 10) || 0;
      const payAmount = parseInt(data?.payAmount  ?? '0', 10) || 0;
      handlers.onNavigateToUsePoint?.({
        source:    PointUseSource.CAT_WITH_CUSTOMER,
        balance,
        payAmount,
        minPoint,
        isMinPointEnabled,
      });
    });

    SocketGateway.start().catch(e => console.error('[AppSession] socket start fail', e));
    refreshConfig();
  }

  async function stop() {
    if (!started) return;
    unsubscribes.forEach(off => { try { off(); } catch (_) {} });
    unsubscribes = [];
    started = false;
    await SocketGateway.stop();
  }

  return { start, stop, setConfig, refreshConfig };
})();


/* ===== src\features\app-config\app-config.service.js ===== */
window.AppConfigService = (function () {

  async function readString(key, fallback) {
    try {
      const item = await sdk.storage.get({ key });
      return item?.value ?? fallback;
    } catch (e) {
      console.warn('[AppConfig] read fail', key, e);
      return fallback;
    }
  }

  async function writeString(key, value) {
    try {
      await sdk.storage.set({ key, value: String(value) });
    } catch (e) {
      console.error('[AppConfig] write fail', key, e);
    }
  }

  async function getMinPoint() {
    const raw = await readString(StorageKeys.MIN_POINT, null);
    if (raw === null || raw === undefined || raw === '') return StorageDefaults.MIN_POINT;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : StorageDefaults.MIN_POINT;
  }

  async function isMinPointEnabled() {
    const raw = await readString(StorageKeys.IS_MIN_POINT_ENABLED, null);
    if (raw === null || raw === undefined || raw === '') return StorageDefaults.IS_MIN_POINT_ENABLED;
    return raw === 'true';
  }

  async function setMinPoint(minPoint) {
    const n = Math.max(0, parseInt(minPoint, 10) || 0);
    await writeString(StorageKeys.MIN_POINT, n);
    await writeString(StorageKeys.IS_MIN_POINT_ENABLED, n > 0);
    return { minPoint: n, isMinPointEnabled: n > 0 };
  }

  async function getPointUseConfig() {
    const [minPoint, enabled] = await Promise.all([getMinPoint(), isMinPointEnabled()]);
    return { minPoint, isMinPointEnabled: enabled };
  }

  return { getMinPoint, isMinPointEnabled, setMinPoint, getPointUseConfig };
})();
