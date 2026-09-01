/**
 * SerialTransport — Toss Front SDK Serial API 래퍼 (리더기 모드 라우터).
 *
 * 한 시리얼 스트림에 두 종류 전문이 섞여 들어온다:
 *   1) 팜포인트(TRM) 전문 — 우리가 처리 (적립/사용). STX + "XX" + 4자리 ASCII 길이 + "TRM" ...
 *   2) 그 외(KIS 등 결제) 전문 — VAN 모듈로 중계. STX + CmdID(0x31/0x9C…) ...
 *
 * 라우팅 원칙 (토스 SDK VAN 가이드):
 *   - TRM 시그니처(STX + "XX" + 숫자4)로 시작하는 완성 프레임 → onFrame (우리 처리, VAN 미전송)
 *   - TRM 이 아닌 구간(KIS 등)          → onVanForward (바이트·순서 보존 그대로 VAN 중계)
 *
 * chunk 경계가 전문 경계와 달라도 안전하도록 버퍼 기반으로 라우팅한다.
 *   - TRM 선두(STX / STX+X)가 chunk 끝에 걸리면 그 꼬리는 '보류'해 다음 chunk 와 합쳐 재판단
 *     (TRM 선두를 KIS 로 오전송하지 않기 위함)
 *   - 미완성 잔여가 오래 남으면(수신 타임아웃) KIS 잔여로 간주해 VAN 으로 흘려보냄
 */
import { SocketConfig as cfg } from "../socket-config";
import { SocketConstants as C } from "../protocol/socket-constants";

// 버퍼 상한 — TRM 시그니처를 못 찾고 과다 누적되는 상황 방어.
const MAX_BUFFER_BYTES = 4096;
const RECV_TIMEOUT_MS  = 3000;

const XX = 0x58; // 'X'

export type SerialTransportHandlers = {
  /** 팜포인트(TRM) 완성 프레임 — 우리가 처리. */
  onFrame: (bytes: Uint8Array) => void;
  /** TRM 이 아닌 원본 바이트(KIS 등) — VAN 모듈로 중계. 순서/바이트 보존. */
  onVanForward?: (bytes: Uint8Array) => void;
  onError?: (e: unknown) => void;
};

export type SerialTransport = {
  start(): Promise<void>;
  stop():  Promise<void>;
  send(bytes: Uint8Array | number[]): Promise<void>;
};

// 바이트 로그용 — hex / 가독 텍스트 변환 (게이트웨이 브릿지 로그에서 재사용).
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
export function toReadable(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

/**
 * SDK 호출이 응답하지 않고 멈추는 경우가 있어(실단말 sdk.serial.open 무응답 관측),
 * 정리 경로에서는 반드시 시간 제한을 걸어 다음 단계로 넘어간다.
 */
function withTimeout(p: Promise<unknown>, ms: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[serial] ⚠️ ${label} ${ms}ms 초과 — 응답 없음(건너뜀)`);
      resolve();
    }, ms);
  });
  // 먼저 끝난 쪽으로 진행하고, 남은 타이머는 반드시 해제한다(뒤늦은 오탐 경고 방지).
  return Promise.race([Promise.resolve(p).then(() => undefined), guard])
    .finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * TRM 프레임 시그니처(STX + "XX" + 숫자4) 위치를 찾는다.
 *   index    : 시그니처(또는 그 접두)의 시작 STX 위치. 없으면 -1.
 *   complete : 시그니처 7바이트(STX+XX+숫자4)를 버퍼가 다 담고 있으면 true,
 *              chunk 끝에 걸려 접두만 매칭되면 false(→ 더 받아야 판단).
 */
function findTrmSignature(buf: Uint8Array): { index: number; complete: boolean } {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== C.COMM_STX) continue;
    // STX 다음: XX XX d d d d (총 6바이트) 검사
    let matched = true;
    let complete = true;
    for (let k = 0; k < 6; k++) {
      const pos = i + 1 + k;
      if (pos >= buf.length) { complete = false; break; } // 접두만 매칭 — 더 받아야 판단
      const b = buf[pos];
      const ok = k < 2 ? b === XX : isDigit(b);
      if (!ok) { matched = false; break; }
    }
    if (!matched) continue;      // 이 STX 는 TRM 시작 아님(=KIS 데이터 속 0x02) → 다음 후보
    return { index: i, complete };
  }
  return { index: -1, complete: false };
}

export function createSerialTransport({ onFrame, onVanForward, onError }: SerialTransportHandlers): SerialTransport {

  const state = {
    opened:    false,
    // open 을 '시도했는지'. open 이 멈춰 opened 가 false 인 채로도 close 를 태우기 위함.
    attempted: false,
    buffer:    new Uint8Array(0),
    unlisten:  null as (() => void) | null,
    idleTimer: null as ReturnType<typeof setTimeout> | null,
    onUnload:  null as (() => void) | null,
  };

  function appendBuffer(chunk: Uint8Array): void {
    const merged = new Uint8Array(state.buffer.length + chunk.length);
    merged.set(state.buffer, 0);
    merged.set(chunk, state.buffer.length);
    state.buffer = merged;
  }

  function forwardVan(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    // TRM 으로 인식되지 않아 VAN 으로 넘기는 구간. 팜포인트 전문이 여기로 새면
    // 게이트웨이까지 못 가므로, 어디로 빠졌는지 반드시 보이게 남긴다.
    console.log(`[serial] -> VAN 중계 (${bytes.length} bytes) ${toHex(bytes)}`);
    try { onVanForward?.(bytes); }
    catch (e) { onError?.(e); }
  }

  // 수신 타임아웃 — 미완성 잔여가 오래 남으면 KIS 잔여로 간주해 VAN 으로 흘려보낸다.
  function scheduleIdleReset(): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null;
      if (state.buffer.length > 0) {
        console.warn(`[serial] 수신 타임아웃 — 잔여 (${state.buffer.length} bytes) VAN 중계`);
        forwardVan(state.buffer);
        state.buffer = new Uint8Array(0);
      }
    }, RECV_TIMEOUT_MS);
  }

  // 버퍼를 스캔하며 TRM 프레임은 onFrame, 나머지(KIS)는 onVanForward 로 라우팅.
  function processBuffer(): void {
    while (state.buffer.length > 0) {
      const buf = state.buffer;

      // 0) 버퍼 상한 초과 — TRM 시그니처 못 찾고 과다 누적 → 마지막 STX 이전은 KIS 로 흘려보냄
      if (buf.length > MAX_BUFFER_BYTES) {
        const lastStx = buf.lastIndexOf(C.COMM_STX);
        if (lastStx > 0) { forwardVan(buf.slice(0, lastStx)); state.buffer = buf.slice(lastStx); continue; }
        forwardVan(buf); state.buffer = new Uint8Array(0); return;
      }

      // 1) TRM 시그니처 탐색
      const sig = findTrmSignature(buf);

      if (sig.index < 0) {
        // TRM 후보 전혀 없음 → 전부 KIS(VAN). 버퍼 비움.
        forwardVan(buf);
        state.buffer = new Uint8Array(0);
        return;
      }

      if (sig.index > 0) {
        // 시그니처 앞부분 = KIS → VAN, 시그니처 위치로 정렬
        forwardVan(buf.slice(0, sig.index));
        state.buffer = buf.slice(sig.index);
        continue;
      }

      // buf[0] = TRM 시그니처 시작
      if (!sig.complete) return; // 시그니처가 chunk 끝에 걸림 → 더 받기(선두 보류)

      // 2) 길이 파싱 [3..6]
      const pktLen = parseInt(
        String.fromCharCode(buf[3], buf[4], buf[5], buf[6]), 10,
      );
      if (!Number.isFinite(pktLen) || pktLen < 11 || pktLen > MAX_BUFFER_BYTES) {
        // 비정상 길이 → 오탐. 이 STX 1바이트를 KIS 로 흘리고 재동기화.
        forwardVan(buf.slice(0, 1));
        state.buffer = buf.slice(1);
        continue;
      }

      // 3) ETX + LRC 까지 = pktLen + 1
      const frameLen = pktLen + 1;
      if (buf.length < frameLen) return; // 프레임 미완 → 더 받기

      if (buf[pktLen - 1] !== C.COMM_ETX) {
        // ETX 위치 어긋남 → 오탐. 1바이트 흘리고 재동기화.
        forwardVan(buf.slice(0, 1));
        state.buffer = buf.slice(1);
        continue;
      }

      const frame = buf.slice(0, frameLen);
      state.buffer = buf.slice(frameLen);
      try { onFrame(frame); }
      catch (e) { onError?.(e); }
    }
  }

  /**
   * 페이지 종료 시 포트 반납. 종료 중이라 await 를 걸 수 없으므로 요청만 던진다.
   * (토스 공식 멀티패드 예제와 동일한 방식. WebView 는 beforeunload 가 안 뜨는 경우가 있어 pagehide 도 함께 건다.)
   */
  function registerUnloadClose(): void {
    if (typeof window === "undefined" || state.onUnload) return;
    state.onUnload = () => {
      try { state.unlisten?.(); } catch { /* noop */ }
      try { void sdk.serial.close(); } catch { /* noop */ }
    };
    window.addEventListener("beforeunload", state.onUnload);
    window.addEventListener("pagehide",     state.onUnload);
  }

  function unregisterUnloadClose(): void {
    if (typeof window === "undefined" || !state.onUnload) return;
    window.removeEventListener("beforeunload", state.onUnload);
    window.removeEventListener("pagehide",     state.onUnload);
    state.onUnload = null;
  }

  async function start(): Promise<void> {
    if (state.opened) return;

    // open 이 멈춘 채 페이지가 내려가면 close 가 호출되지 않아 포트가 네이티브에 남는다.
    // 그 상태에서 다음 실행의 open 이 무응답이 되므로, 종료 훅을 open 보다 '먼저' 걸어둔다.
    registerUnloadClose();

    // 이전 인스턴스가 물고 있을 수 있는 포트를 선행 회수. close 자체가 멈출 수 있어 시간 제한을 건다.
    state.attempted = true;
    try {
      await withTimeout(sdk.serial.close(), 2000, "선행 close");
      console.log("[serial] 선행 close 처리 — 잔여 포트 회수 시도 완료");
    } catch (e) {
      console.log("[serial] 선행 close 생략(열린 포트 없음)", e);
    }

    // intercept: true — 수신 전문을 플러그인이 먼저 가로채 팜포인트(TRM)/KIS 로 분기하기 위한 설정.
    // (토스 리더기 모드 필수 파라미터. 이게 없으면 아무 수신도 못 함.)
    //
    // ⚠️ open 을 await 하지 않는다 — 토스 공식 멀티패드 예제와 동일한 방식.
    //    실단말에서 open 의 Promise 가 해소되지 않는 사례가 있어(resolve/reject 둘 다 없음),
    //    await 하면 아래 listen 등록 줄까지 도달하지 못해 수신이 영영 불가능해진다.
    //    포트 자체는 열려 있을 수 있으므로 응답을 기다리지 말고 리스너부터 건다.
    console.log(`[serial] open 시도 — baudRate=${cfg.baudRate}, intercept=true, sdk.serial=${typeof sdk.serial}`);
    const openWatchdog = setTimeout(() => {
      console.warn("[serial] ⚠️ open 5초 무응답 — 응답을 기다리지 않고 리스너로 수신 시도 중");
    }, 5000);
    try {
      // 결과는 로그로만 관찰한다(진행을 막지 않음). 동기 throw 도 잡는다.
      Promise.resolve(sdk.serial.open({ baudRate: cfg.baudRate, intercept: true }))
        .then(() => {
          clearTimeout(openWatchdog);
          console.log(`[serial] open OK — baudRate=${cfg.baudRate}, intercept=true`);
        })
        .catch((e) => {
          clearTimeout(openWatchdog);
          console.error(`[serial] ❌ open 실패 — baudRate=${cfg.baudRate}, intercept=true`, e);
        });
    } catch (e) {
      clearTimeout(openWatchdog);
      console.error("[serial] ❌ open 호출 예외", e);
    }

    // open 응답과 무관하게 즉시 리스너 등록 (예제 방식).
    state.opened = true;
    state.unlisten = sdk.serial.listen((params) => {
      const chunk = params?.data;
      if (!chunk || chunk.length === 0) return;
      const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      // 시리얼로 들어온 원본 chunk — TRM/KIS 판별 전 단계. 단말기가 보낸 건 전부 여기 찍힌다.
      // 길이는 hex 와 헷갈리지 않게 괄호로 분리한다 ("5B" 를 0x5B 로 오독하는 것 방지).
      console.log(`[serial] <= RX (${u8.length} bytes) ${toHex(u8)}`);
      try {
        appendBuffer(u8);
        processBuffer(); // TRM → onFrame, KIS → onVanForward
        // 미완성 잔여(TRM 선두 보류분 등)가 있으면 수신 타임아웃 예약, 없으면 해제.
        if (state.buffer.length > 0) scheduleIdleReset();
        else if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
      } catch (e) {
        onError?.(e);
      }
    });
    console.log("[serial] listen 등록 완료");
  }

  async function stop(): Promise<void> {
    // opened 가 아니어도 '열기를 시도했다면' 반드시 close 를 태운다.
    // (open 무응답 시 opened 가 false 로 남아, 예전에는 close 가 아예 호출되지 않았다 → 포트 누수)
    if (!state.opened && !state.attempted) return;
    if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
    unregisterUnloadClose();
    try { state.unlisten?.(); } catch { /* noop */ }
    state.unlisten = null;
    try {
      await withTimeout(sdk.serial.close(), 2000, "close");
      console.log("[serial] close 완료 — 포트 반납");
    } catch (e) {
      console.warn("[serial] close 실패", e);
    } finally {
      state.opened    = false;
      state.attempted = false;
      state.buffer    = new Uint8Array(0);
    }
  }

  async function send(bytes: Uint8Array | number[]): Promise<void> {
    const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    if (!state.opened) {
      console.warn(`[serial] ⚠️ TX 취소 — 포트 미오픈. 폐기 (${u8.length} bytes) ${toHex(u8)}`);
      return;
    }
    try {
      await sdk.serial.write({ data: u8 });
    } catch (e) {
      console.error(`[serial] ❌ TX 실패 (${u8.length} bytes) ${toHex(u8)}`, e);
      throw e;
    }
  }

  return { start, stop, send };
}
