/**
 * 토스 관리자 '팜포인트 → 플러그인 설정'(settings.html) 다녀옴 알림.
 *
 * 그 페이지에 들어가기만 하면 대기화면 쪽 단말기 연결이 끊기고, 대기화면으로 돌아와도
 * 다시 붙지 않았다. 토스가 그 페이지를 띄우는 방식은 두 가지 중 하나로 보인다.
 *   A. 같은 웹뷰에서 페이지가 바뀐다 — 대기화면이 내려가며 연결을 정리하고, 돌아올 때는
 *      새로 뜨지 않고 이전 상태 그대로 되살아난다(pageshow). main.ts 가 되살아날 때 다시 시작한다.
 *   B. 별도 웹뷰로 뜬다 — 대기화면은 살아 있는데 시리얼 수신만 떨어진다. 대기화면에는
 *      아무 신호도 오지 않으므로, 설정 페이지가 열림 · 닫힘을 공용 저장소에 적어 알린다.
 *      다른 페이지가 localStorage 를 바꾸면 대기화면에 storage 이벤트가 온다.
 */
const KEY = "pharmpoint_settings_visit";

export type SettingsVisitPhase = "open" | "close";

/** 설정 페이지에서 부른다. */
export function markSettingsVisit(phase: SettingsVisitPhase): void {
  try { localStorage.setItem(KEY, JSON.stringify({ phase, at: Date.now() })); }
  catch { /* 저장이 막힌 환경이면 알림만 포기한다 */ }
}

/** 대기화면에서 부른다. 다른 페이지(설정)가 남긴 열림 · 닫힘을 받는다. */
export function onSettingsVisit(fn: (phase: SettingsVisitPhase) => void): void {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const v = JSON.parse(e.newValue) as { phase?: string };
      if (v.phase === "open" || v.phase === "close") fn(v.phase);
    } catch { /* 형식이 다르면 무시 */ }
  });
}
