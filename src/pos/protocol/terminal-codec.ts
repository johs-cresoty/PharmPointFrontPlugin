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

/** 006 — 바코드 표시 응답 (결과코드 4자리, 성공 "0000") */
export function makeBarcodeDisplayAck(code = "0000"): Uint8Array {
  const buff = buildHeader(C.TERMINAL_COMMAND_006);
  buff.push(C.COMM_FS);
  buff.push(...encodeKor(code));
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
/** 봉투 검증 + 위치 정보. parse / parseBarcodeDisplay 공용. */
type FrameLocation = {
  pos:    number; // 길이 헤더 시작 오프셋 (= STX + "XX" 다음)
  pktLen: number; // 길이 헤더 값 (STX~ETX 바이트 수, LRC 제외)
  cmd:    string; // 커맨드 3자리
};

function locateFrame(bytes: Uint8Array): FrameLocation | null {
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
  return { pos, pktLen, cmd };
}

export function parse(bytes: Uint8Array): TerminalMessage | null {
  const loc = locateFrame(bytes);
  if (!loc) return null;

  // payload = cmd 직후 ~ ETX 직전, FS 로 분할.
  const payload = bytes.slice(loc.pos + 10, loc.pktLen - 1);
  const fields = splitByFs(payload).map(decodeKor);

  return { cmd: loc.cmd, fields, raw: bytes };
}

// ── 005 바코드 표시 요청 ──────────────────────────
//
// 필드부:  FS 종류(1) FS timeout(2) FS 문구(가변, EUC-KR) FS 길이(2, BCD) 데이터(길이)
//
// ⚠️ 이 전문만 parse() 의 fields 를 쓸 수 없다.
//    fields 는 payload 를 FS 로 자른 뒤 전부 EUC-KR 디코딩하는데,
//    길이 필드는 BCD 바이너리라 디코딩되면 값이 뭉개진다
//    (예: 0x81 은 EUC-KR 선행바이트라 뒤 바이트까지 삼킨다).
//    따라서 원본 바이트에서 오프셋 기반으로 직접 읽는다.

export type BarcodeDisplayData = {
  kind:       "1D" | "2D";  // 종류 "1" → 1차원 / "2" → 2차원(QR)
  kindRaw:    string;       // 원본 종류 문자 (미정의 값 진단용)
  timeoutSec: number;       // 00~99. 0 이면 무한 대기(자동 종료 없음)
  text:       string;       // 문구 (EUC-KR 디코딩 결과)
  dataLength: number;       // BCD 길이 필드 값 (바이트)
  data:       string;       // 바코드 데이터 (길이만큼 잘라 사용)
};

/** 2바이트 packed BCD → 십진수. 0x03 0x45 → 345 */
function bcdToInt(hi: number, lo: number): number {
  return ((hi >> 4) & 0xf) * 1000 + (hi & 0xf) * 100 + ((lo >> 4) & 0xf) * 10 + (lo & 0xf);
}

/** BCD 유효성 — 각 4비트가 0~9 여야 한다. */
function isValidBcd(b: number): boolean {
  return ((b >> 4) & 0xf) <= 9 && (b & 0xf) <= 9;
}

/** 바이트 → latin1 문자열. ASCII 구간은 그대로 왕복된다(바코드 데이터용). */
function decodeAscii(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function parseBarcodeDisplay(bytes: Uint8Array): BarcodeDisplayData | null {
  const loc = locateFrame(bytes);
  if (!loc || loc.cmd !== C.TERMINAL_COMMAND_005) return null;

  const end = loc.pktLen - 1; // ETX 위치
  let p = loc.pos + 10;       // cmd 직후

  const eatFs = (label: string): boolean => {
    if (p >= end || bytes[p] !== C.COMM_FS) {
      console.warn(`[TerminalCodec] 005 파싱 실패 — ${label} 앞 FS 없음 (offset=${p})`);
      return false;
    }
    p += 1;
    return true;
  };

  // 종류(1)
  if (!eatFs("바코드종류")) return null;
  if (p + 1 > end) return null;
  const kindRaw = String.fromCharCode(bytes[p]);
  p += 1;

  // timeout(2)
  if (!eatFs("timeout")) return null;
  if (p + 2 > end) return null;
  const timeoutRaw = String.fromCharCode(bytes[p], bytes[p + 1]);
  p += 2;

  // 문구(가변) — 다음 FS 까지. EUC-KR 한글은 0x1C 를 포함하지 않아 FS 스캔이 안전하다.
  if (!eatFs("문구")) return null;
  let textEnd = p;
  while (textEnd < end && bytes[textEnd] !== C.COMM_FS) textEnd += 1;
  const text = decodeKor(bytes.slice(p, textEnd));
  p = textEnd;

  // 길이(2, BCD) + 데이터
  if (!eatFs("바코드데이터")) return null;
  if (p + 2 > end) {
    console.warn("[TerminalCodec] 005 파싱 실패 — 길이 필드 부족");
    return null;
  }
  const lenHi = bytes[p];
  const lenLo = bytes[p + 1];
  if (!isValidBcd(lenHi) || !isValidBcd(lenLo)) {
    console.warn(
      `[TerminalCodec] 005 길이 필드가 유효한 BCD 가 아님 — ` +
      `0x${lenHi.toString(16).padStart(2, "0")} 0x${lenLo.toString(16).padStart(2, "0")}`,
    );
    return null;
  }
  const dataLength = bcdToInt(lenHi, lenLo);
  p += 2;

  // 명세: "길이에 345바이트라고 되어 있으면 데이터를 345바이트까지 잘라서 사용"
  const available = end - p;
  if (dataLength > available) {
    console.warn(
      `[TerminalCodec] 005 길이(${dataLength}) > 실제 남은 바이트(${available}) — 남은 만큼만 사용`,
    );
  }
  const take = Math.min(dataLength, Math.max(0, available));
  const dataBytes = bytes.slice(p, p + take);
  const data = decodeAscii(dataBytes);

  const nonAscii = dataBytes.some((b) => b > 0x7f);
  if (nonAscii) {
    console.warn("[TerminalCodec] 005 바코드 데이터에 비-ASCII 바이트 포함 — 인코딩 확인 필요");
  }

  const timeoutSec = parseInt(timeoutRaw, 10);
  return {
    kind:       kindRaw === "1" ? "1D" : "2D",
    kindRaw,
    timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : 0,
    text,
    dataLength,
    data,
  };
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
