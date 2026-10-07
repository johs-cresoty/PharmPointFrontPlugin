/**
 * 무동작 타임아웃 — 입력 화면에서 사용자 액션이 없으면 대기화면으로 이동.
 *
 * 네이버 InactivityTimeoutWatcher 와 같은 동작 · 같은 팝업(Figma 05-2 popup04
 * "대기화면으로 이동합니다" + 남은 초 + [계속 사용할게요])을 쓴다.
 * 예전에는 SDK 템플릿 타이머(sdk.template.startTimer)의 내장 팝업을 썼다.
 *
 *   - duration 초 동안 화면 터치가 없으면, 마지막 warnAt 초 동안 팝업을 띄우고 0 이 되면 onTimeout.
 *   - 화면 어디든 터치하면 처음부터 다시 센다.
 *   - 팝업이 떠 있는 동안은 [계속 사용할게요] 로만 닫힌다. 다른 곳을 눌러도 닫히지 않는다.
 *     (손가락이 닿는 순간 팝업을 닫으면, 손을 뗄 때 생기는 클릭이 팝업 뒤 화면에 들어가 같이 눌린다.
 *      팝업의 어두운 바탕이 뒤 화면을 덮어, 팝업이 떠 있는 동안 뒤 화면은 눌리지 않는다)
 *   - 팝업은 덮개(showOverlay)에 그려 Template API 화면 · 새 화면 어디 위에나 뜬다.
 *   - 화면 이탈 시 반환된 stop 을 반드시 호출할 것.
 *
 * 번호 입력 화면(src/ui/phone-input)은 같은 팝업을 화면 안에서 직접 관리하므로 이걸 쓰지 않는다.
 */
import { InactivityPopup } from "../../ui/Popups";
import { hideOverlay, showOverlay } from "../../ui/stage";

const DEFAULT_DURATION = 30;
const DEFAULT_WARN_AT = 5;

export type InactivityTimeoutOptions = {
  onTimeout: () => void;
  duration?: number;
  warnAt?: number;
};

/**
 * 무동작 타이머 시작. 반환된 함수를 화면 이탈(cleanup) 시 반드시 호출해 정리해야 한다.
 */
export function startInactivityTimeout(opts: InactivityTimeoutOptions): () => void {
  const duration = opts.duration ?? DEFAULT_DURATION;
  const warnAt = Math.min(opts.warnAt ?? DEFAULT_WARN_AT, duration);
  const preWarnMs = Math.max(0, (duration - warnAt) * 1000);

  let preTimer: ReturnType<typeof setTimeout> | undefined;
  let countdown: ReturnType<typeof setInterval> | undefined;
  let warning = false;
  let disposed = false;

  const clearTimers = (): void => {
    if (preTimer) clearTimeout(preTimer);
    if (countdown) clearInterval(countdown);
    preTimer = undefined;
    countdown = undefined;
  };

  const closePopup = (): void => {
    if (!warning) return;
    warning = false;
    hideOverlay();
  };

  const begin = (): void => {
    clearTimers();
    closePopup();
    preTimer = setTimeout(() => {
      let left = warnAt;
      warning = true;
      showOverlay(<InactivityPopup remaining={left} onContinue={begin} />);
      countdown = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          dispose();
          opts.onTimeout();
        } else {
          showOverlay(<InactivityPopup remaining={left} onContinue={begin} />);
        }
      }, 1000);
    }, preWarnMs);
  };

  // 화면 터치 시 처음부터. 경고 팝업이 떠 있을 때는 무시 — [계속 사용할게요] 클릭(begin)으로만 닫는다.
  const onPointerDown = (): void => {
    if (!disposed && !warning) begin();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("pointerdown", onPointerDown, true);
    clearTimers();
    closePopup();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  begin();

  return dispose;
}
