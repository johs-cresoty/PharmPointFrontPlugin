/**
 * Result 페이지 뷰 — sessionStorage 에서 컨텍스트 읽어 결과 화면 표시.
 *
 * type 분기 → 적립/사용/부족/조회.
 *
 * 적립 · 사용 · 포인트 부족 · 조회 성공은 새 디자인(React, src/ui/ResultScreen)으로 그린다.
 * 결제금액<최소포인트는 결과 화면 대신 입력 화면 위 팝업으로 알린다.
 * 조회 실패(등록된 회원 없음)는 번호 입력 화면 안 안내로 옮겨 여기서 뺐다.
 * 자동 종료 후 이동 경로는 ResultCtx.onTimeoutHref (라우터 path).
 */
import { readContext, type ResultCtxData } from "../features/result-page/result-navigator";
import { navigate } from "../router";
import { showResult } from "../ui/show-result";

const num = (v: unknown, fallback = 0): number =>
  Number.isFinite(v) ? (v as number) : parseInt(String(v ?? ""), 10) || fallback;

const str = (v: unknown): string => String(v ?? "");

export function renderResult(): void {
  const app = document.getElementById("app");
  const ctx = readContext();
  const goHome   = (): void => { if (app) app.style.opacity = "1"; navigate(ctx?.onTimeoutHref ?? "/"); };

  if (!ctx) { goHome(); return; }

  // 이전 입력 화면 → 결과 화면 전환 시, 결과 렌더가 storage(타임아웃 설정)를 await 하는 사이
  // 브라우저가 이전 화면의 리플로우(오버레이 패딩 제거로 키패드가 커짐)를 한 번 그려 화면이 튄다.
  // 렌더가 끝날 때까지 #app 을 숨겼다가(opacity 0) 완료 후 페이드인해 리플로우를 감춘다.
  if (app) { app.style.transition = "none"; app.style.opacity = "0"; }
  // reveal 은 결과 렌더 완료 후(비동기 await 다음) 호출되므로 opacity:0 이 이미 커밋된 상태 →
  // rAF 없이 바로 1 로 두면 자연스럽게 페이드인된다. (rAF 는 비표시 웹뷰에서 지연될 수 있어 배제)
  const reveal = (): void => {
    if (!app) return;
    app.style.transition = "opacity 0.2s ease-in";
    app.style.opacity    = "1";
  };

  const d: ResultCtxData = ctx.data;

  switch (ctx.type) {
    case "earn":
      void showResult({
        mode:         "EARN",
        earnPoint:    num(d.earnPoint),
        balancePoint: num(d.balancePoint),
        customerName: str(d.customerName) || undefined,
        onDone: goHome,
      }).finally(reveal);
      return;

    case "use":
      void showResult({
        mode:         "USE",
        usePoint:     num(d.usePoint),
        balancePoint: num(d.remainingPoint),
        customerName: str(d.customerName) || undefined,
        onDone: goHome,
      }).finally(reveal);
      return;

    case "insufficient":
      // 최소 포인트 안내는 최소 포인트 설정이 켜져 있을 때만 보인다.
      // (예전 컨텍스트에 값이 없으면 안내를 보이던 기존 동작을 유지)
      void showResult({
        mode:         "USE_UNAVAILABLE",
        balancePoint: num(d.balancePoint),
        minPoint:     d.isMinPointEnabled === false ? 0 : num(d.minPoint),
        onDone: goHome,
      }).finally(reveal);
      return;

    case "lookup":
      renderLookup(d, goHome, reveal);
      return;

    default:
      console.warn("[Result] 알 수 없는 type:", ctx.type);
      reveal();
      goHome();
  }
}

/** 조회 성공만 온다 — 실패(미가입 · 오류)는 번호 입력 화면이 그 자리에서 알린다. */
function renderLookup(d: ResultCtxData, goHome: () => void, reveal: () => void): void {
  const customer = (d.customer ?? {}) as { customerName?: string; pointBalance?: number };
  void showResult({
    mode:         "LOOKUP",
    customerName: customer.customerName,
    balancePoint: num(customer.pointBalance),
    onDone: goHome,
  }).finally(reveal);
}
