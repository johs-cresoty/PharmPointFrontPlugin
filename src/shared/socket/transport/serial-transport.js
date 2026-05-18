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
