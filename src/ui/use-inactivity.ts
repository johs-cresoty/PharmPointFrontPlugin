/**
 * 새 디자인 화면 안의 무입력 타이머.
 *
 * sec 초 동안 reset 이 없으면 마지막 5초는 warnLeft 로 남은 초를 알려 주고
 * ("대기화면으로 이동합니다" 팝업용), 0 이 되면 onTimeout. paused 동안은 멈춘다.
 * 화면 어디든 누를 때 reset 을 부르면 처음부터 다시 센다.
 *
 * Template API 화면 위에서 쓰는 타이머는 features/inactivity/inactivity-timeout 이다.
 */
import { useEffect, useRef, useState } from "react";

const WARN_SECONDS = 5;

export function useInactivity(
  sec: number,
  paused: boolean,
  onTimeout: () => void,
): { warnLeft: number | null; reset: () => void } {
  const [tick, setTick] = useState(0);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const off = paused || sec <= 0;

  useEffect(() => {
    setWarnLeft(null);
    if (off) return;
    const warn = Math.min(WARN_SECONDS, sec);
    let countdown: ReturnType<typeof setInterval> | undefined;
    const pre = setTimeout(() => {
      let r = warn;
      setWarnLeft(r);
      countdown = setInterval(() => {
        r -= 1;
        if (r <= 0) {
          clearInterval(countdown);
          setWarnLeft(null);
          onTimeoutRef.current();
        } else {
          setWarnLeft(r);
        }
      }, 1000);
    }, (sec - warn) * 1000);
    return () => {
      clearTimeout(pre);
      if (countdown) clearInterval(countdown);
    };
  }, [tick, off, sec]);

  return { warnLeft, reset: () => setTick((n) => n + 1) };
}
