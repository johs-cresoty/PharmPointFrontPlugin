import { useRef, useState } from "react";

/**
 * 저장 흐름 — 저장 중 중복 클릭을 막고, 성공하면 "저장되었습니다" 를 잠깐 보인다.
 * 저장한 값을 기준값으로 삼아, 다시 바꾸기 전까지 [저장] 이 눌리지 않게 한다.
 */
export function useSaveFlow<T>(initial: T, save: (v: T) => void | Promise<void>) {
  const [saved, setSaved] = useState(initial);
  const [savedToast, setSavedToast] = useState(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (v: T) => {
    if (saving.current) return;
    saving.current = true;
    try {
      await save(v);
      setSaved(v);
      setSavedToast(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSavedToast(false), 1500);
    } catch (e) {
      console.error("[Settings] 저장 실패:", e);
    } finally {
      saving.current = false;
    }
  };

  return { saved, savedToast, save: run };
}
