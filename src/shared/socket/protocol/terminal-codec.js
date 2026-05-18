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
