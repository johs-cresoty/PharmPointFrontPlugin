/**
 * 무동작 타임아웃 — 입력 화면에서 사용자 액션이 없으면 대기화면으로 이동.
 *
 * 네이버 커넥트/네이티브 앱의 InactivityTimeoutWatcher 대응. 토스는 자체 UI 를 못 써서
 * SDK 템플릿 타이머 API(sdk.template.startTimer)를 사용한다.
 *   - duration 초 카운트다운 → 남은 시간이 warnAt 이 되면 SDK 내장 경고 팝업
 *     (계속 사용 / 지금 끝내기) 표시 → 0 도달 시 onTimeout 호출.
 *   - 화면 아무 곳이나 터치하면 리셋 — 단, "경고 팝업 뜨기 전 구간"에서만.
 *     경고 팝업 구간(마지막 warnAt 초)은 SDK '계속 사용' 버튼이 연장을 담당하므로 개입하지 않는다.
 *     (SDK 오버레이는 DOM id 가 없어 팝업 탭만 골라 제외할 수 없어, 경과시간으로 구분한다.)
 *   - startTimer 는 동시에 1개만 허용 → 화면 이탈 시 반드시 반환된 stop 을 호출할 것.
 */

const DEFAULT_DURATION = 30;
const DEFAULT_WARN_AT = 5;
const DEFAULT_TITLE = "대기화면으로 이동됩니다";

export type InactivityTimeoutOptions = {
  onTimeout: () => void;
  title?: string;
  duration?: number;
  warnAt?: number;
};

/**
 * 무동작 타이머 시작. 반환된 함수를 화면 이탈(cleanup) 시 반드시 호출해 정리해야 한다.
 */
export function startInactivityTimeout(opts: InactivityTimeoutOptions): () => void {
  const title = opts.title ?? DEFAULT_TITLE;
  const duration = opts.duration ?? DEFAULT_DURATION;
  const warnAt = opts.warnAt ?? DEFAULT_WARN_AT;
  const preWarnMs = Math.max(0, (duration - warnAt) * 1000);

  let stopSdkTimer: (() => void) | null = null;
  let startedAt = 0;
  let disposed = false;

  const begin = (): void => {
    startedAt = performance.now();
    try {
      stopSdkTimer = sdk.template.startTimer({
        title,
        duration,
        warnAt,
        onTimeout: () => {
          // SDK 가 만료/'지금 끝내기' 시 호출. 리스너 정리 후 실제 콜백 실행.
          dispose();
          opts.onTimeout();
        },
      });
    } catch (e) {
      // 이미 실행 중인 타이머가 있으면 throw — 크래시 대신 이 화면에선 타이머 비활성.
      console.warn("[inactivity] startTimer 실패:", e);
      stopSdkTimer = null;
    }
  };

  // 화면 터치 시 리셋 — 경고 팝업이 뜨기 전 구간에서만.
  const onPointerDown = (): void => {
    if (disposed) return;
    if (performance.now() - startedAt >= preWarnMs) return; // 경고 구간 → SDK 가 담당
    stopSdkTimer?.();
    begin();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("pointerdown", onPointerDown, true);
    stopSdkTimer?.();
    stopSdkTimer = null;
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  begin();

  return dispose;
}
