/**
 * 새 디자인 화면 안의 무입력 타이머.
 *
 * sec 초 동안 reset 이 없으면 마지막 5초는 warnLeft 로 남은 초를 알려 주고
 * ("대기화면으로 이동합니다" 팝업용), 0 이 되면 onTimeout. paused 동안은 멈춘다.
 * 화면을 누를 때 activity 를, [계속 사용할게요] 클릭에 reset 을 건다.
 *
 * 경고 팝업이 떠 있는 동안 activity 는 아무것도 하지 않는다 — 팝업은 [계속 사용할게요] 로만 닫힌다.
 * 손가락이 닿는 순간(pointerdown) 팝업을 닫으면, 손을 뗄 때 생기는 클릭이 팝업 뒤 화면에 들어가
 * 키패드 · 버튼이 같이 눌린다.
 */
import { useEffect, useRef, useState } from "react";

const WARN_SECONDS = 5;

export function useInactivity(
  sec: number,
  paused: boolean,
  onTimeout: () => void,
): { warnLeft: number | null; activity: () => void; reset: () => void } {
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

  const reset = () => setTick((n) => n + 1);
  const activity = () => {
    if (warnLeft === null) reset();
  };
  return { warnLeft, activity, reset };
}
