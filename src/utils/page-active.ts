/**
 * 이 화면이 지금 앞에 떠 있는지.
 *
 * 플러그인 설정 화면으로 이동하거나 결제 앱이 위를 덮으면 이 웹뷰는 뒤로 물러난다.
 * 그때 웹소켓은 닫히고 시리얼 수신도 멈춘다 — 고장이 아니라 화면을 벗어나서다.
 *
 * 그 구분 없이 끊김을 기록하면 "캣포스 연결 끊김" 같은 줄이 남고, 2분 감시에 걸려
 * 장애로 보고된다. 실제로 그런 오탐이 Sentry 에 올라왔다. 정상 동작을 장애로
 * 올리기 시작하면 정작 봐야 할 장애가 묻힌다.
 *
 * 그래서 끊김을 남기기 전에 이 값을 먼저 확인한다.
 */

let active = typeof document === "undefined" || document.visibilityState !== "hidden";

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    active = document.visibilityState !== "hidden";
  });
}
if (typeof window !== "undefined") {
  // 페이지가 내려가는 중이면 이후 끊김은 전부 화면 이탈에 따른 것이다.
  window.addEventListener("pagehide", () => { active = false; });
  window.addEventListener("beforeunload", () => { active = false; });
}

/** 화면이 앞에 떠 있으면 true. 뒤로 물러났거나 내려가는 중이면 false. */
export function isPageActive(): boolean {
  return active;
}
