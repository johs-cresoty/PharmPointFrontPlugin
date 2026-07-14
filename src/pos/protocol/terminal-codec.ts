/**
 * TerminalCodec — 단말기(TRM) 바이너리 전문 인코더/디코더.
 *
 * PharmPoint Android PharmpayTelegram + SocketManager.findCommand 미러.
 *
 * 전문 구조 (PAD → TRM):
 *   STX  XX  4-digit-len  PAD  cmd(3)  FS  payload(FS-separated)  ETX  LRC
 * 전문 구조 (TRM → PAD):
 *   STX  XX  4-digit-len  TRM  cmd(3)  ...payload...  ETX  LRC
 *
 * LRC: data[1..len-1] XOR 누적 | 0x20
 * 인코딩: EUC-KR (필드가 ASCII 만이면 UTF-8 과 결과 동일)
 */
import { SocketConstants as C } from "./socket-constants";

export type TerminalMessage = {
  cmd:    string;
  fields: string[];
  raw:    Uint8Array;
};

const eucDecoder = new TextDecoder(C.KOR_CHARSET);

/**
 * EUC-KR 인코더는 표준이 아니므로 ASCII 폴백.
 * 현재 사용 필드 (전화번호·금액·승인번호 등) 는 모두 ASCII 범위라 문제 없음.
 */
export function encodeKor(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes[i] = c > 0xff ? 0x3f /* '?' */ : c;
  }
  return bytes;
}

export function decodeKor(bytes: Uint8Array): string {
  return eucDecoder.decode(bytes);
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

export function lrc(data: Uint8Array, length: number): number {
  let acc = 0;
  for (let i = 1; i < length; i++) acc ^= data[i];
  return (acc | 0x20) & 0xff;
}

// ── 송신 전문 빌더 ────────────────────────────────

function buildHeader(cmd: string): number[] {
  // STX  X  X  P  A  D  cmd[0] cmd[1] cmd[2]
  return [
    C.COMM_STX,
    0x58, 0x58,           // 'X', 'X'
    0x50, 0x41, 0x44,     // 'P', 'A', 'D'
    cmd.charCodeAt(0), cmd.charCodeAt(1), cmd.charCodeAt(2),
  ];
}

function finalize(buff: number[]): Uint8Array {
  // 길이 헤더 = 전체 + 4(자기 자신), 인덱스 3 부터 삽입.
  const totalLen = buff.length + 4;
  const lenStr = String(totalLen).padStart(4, "0");
  buff.splice(3, 0,
    lenStr.charCodeAt(0), lenStr.charCodeAt(1),
    lenStr.charCodeAt(2), lenStr.charCodeAt(3),
  );

  const out = Uint8Array.from(buff);
  const tail = lrc(out, out.length);
  const withLrc = new Uint8Array(out.length + 1);
  withLrc.set(out, 0);
  withLrc[out.length] = tail;
  return withLrc;
}

/** 004 응답 — 포인트 사용 결과 (phone | balance | delta) */
export function makeUsePoint(phone: string, balance: string, delta: string): Uint8Array {
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
export function makeInit(): Uint8Array {
  const buff = buildHeader(C.TERMINAL_COMMAND_010);
  buff.push(C.COMM_FS);
  buff.push(...encodeKor("INIT"));
  buff.push(C.COMM_ETX);
  return finalize(buff);
}

/** ACK (수신 확인) */
export function ack(): Uint8Array {
  return Uint8Array.of(C.COMM_ACK, C.COMM_ACK, C.COMM_ACK);
}

// ── 수신 전문 파서 ────────────────────────────────

/**
 * 단말기 수신 바이트 → TerminalMessage 또는 null.
 * PharmPoint Android SocketManager.findCommand 동일 로직.
 */
export function parse(bytes: Uint8Array): TerminalMessage | null {
  if (!bytes || bytes.length < 5) return null;
  if (bytes[0] !== C.COMM_STX) return null;

  // 4자리 길이 헤더 위치 탐색
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

  const pktLenStr = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
  const pktLen = parseInt(pktLenStr, 10);
  if (!Number.isFinite(pktLen) || pktLen <= 0 || pktLen > bytes.length) return null;
  if (bytes[pktLen - 1] !== C.COMM_ETX) return null;

  const trmFlag = decodeKor(bytes.slice(pos + 4, pos + 7));
  if (trmFlag !== C.TERMINAL_FLAG) return null;

  const cmd = decodeKor(bytes.slice(pos + 7, pos + 10));

  // payload = cmd 직후 ~ ETX 직전, FS 로 분할.
  const payload = bytes.slice(pos + 10, pktLen - 1);
  const fields = splitByFs(payload).map(decodeKor);

  return { cmd, fields, raw: bytes };
}

function splitByFs(bytes: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = [];
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
