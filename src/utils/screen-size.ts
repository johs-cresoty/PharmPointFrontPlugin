/**
 * 단말의 실제 화면 크기를 진단 기록에 남긴다.
 *
 * 토스·네이버 화면을 한 디자인으로 맞추기 위해 잰다. global.css 는 400×640 으로
 * 고정해 두었지만, 단말에서 실제로 쓸 수 있는 크기인지는 확인된 적이 없었다.
 * (상태바 등이 자리를 차지하면 640 보다 작다)
 */
import { log } from "./log";

function screenSizeLine(): string {
  const dpr = window.devicePixelRatio || 1;
  return (
    `쓸 수 있는 화면 ${window.innerWidth}×${window.innerHeight} · 밀도 ${dpr}배 ` +
    `(물리 ${Math.round(window.innerWidth * dpr)}×${Math.round(window.innerHeight * dpr)}) · ` +
    `기기 전체 ${screen.width}×${screen.height}`
  );
}

/** 지금 화면 크기를 한 줄 남긴다. */
export function logScreenSize(): void {
  log.status(`[팜포인트] 화면 크기 — ${screenSizeLine()}`);
}

/**
 * 기동 시 한 번 남기고, 크기가 바뀌면 다시 남긴다.
 * 기동 직후 크기가 아직 자리 잡지 않았을 수 있어서다. 같은 값은 다시 남기지 않는다.
 */
export function watchScreenSize(): void {
  let last = "";
  const write = (): void => {
    const line = screenSizeLine();
    if (line === last) return;
    last = line;
    log.status(`[팜포인트] 화면 크기 — ${line}`);
  };
  write();
  window.addEventListener("resize", write);
}
