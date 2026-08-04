/**
 * Result 페이지 뷰 — sessionStorage 에서 컨텍스트 읽어 SDK 결과 화면 표시.
 *
 * type 분기 → 적립/사용/부족/조회.
 * 자동 종료 후 이동 경로는 ResultCtx.onTimeoutHref (라우터 path).
 */
import { readContext, type ResultCtxData } from "../features/result-page/result-navigator";
import {
  showEarnSuccess,
  showUseSuccess,
  showInsufficientPoint,
  showLookupSuccess,
  showLookupFail,
  type ResultButton,
} from "../features/result-page/result-page.service";
import { navigate } from "../router";

const num = (v: unknown, fallback = 0): number =>
  Number.isFinite(v) ? (v as number) : parseInt(String(v ?? ""), 10) || fallback;

const str = (v: unknown): string => String(v ?? "");

export function renderResult(): void {
  const app = document.getElementById("app");
  const ctx = readContext();
  const goHome   = (): void => { if (app) app.style.opacity = "1"; navigate(ctx?.onTimeoutHref ?? "/"); };
  const goSearch = (): void => { navigate("/member-search"); };

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

  const homeButton: ResultButton = { label: "처음으로", closeOnClick: true, onClick: goHome };
  const d: ResultCtxData = ctx.data;

  switch (ctx.type) {
    case "earn":
      void showEarnSuccess({
        earnPoint:    num(d.earnPoint),
        storeName:    str(d.storeName),
        balancePoint: num(d.balancePoint),
        customerName: str(d.customerName) || undefined,
        onTimeout: goHome, buttons: [homeButton],
      }).finally(reveal);
      return;

    case "use":
      void showUseSuccess({
        usePoint:       num(d.usePoint),
        storeName:      str(d.storeName),
        remainingPoint: num(d.remainingPoint),
        customerName:   str(d.customerName) || undefined,
        onTimeout: goHome, buttons: [homeButton],
      }).finally(reveal);
      return;

    case "insufficient":
      void showInsufficientPoint({
        storeName:    str(d.storeName),
        minPoint:     num(d.minPoint),
        balancePoint: num(d.balancePoint),
        onTimeout: goHome, buttons: [homeButton],
      }).finally(reveal);
      return;

    case "lookup":
      renderLookup(d, homeButton, goHome, goSearch, reveal);
      return;

    default:
      console.warn("[Result] 알 수 없는 type:", ctx.type);
      reveal();
      goHome();
  }
}

function renderLookup(
  d: ResultCtxData,
  homeButton: ResultButton,
  goHome: () => void,
  goSearch: () => void,
  reveal: () => void,
): void {
  if (d.success === true && d.customer) {
    const customer = d.customer as { customerName?: string; pointBalance?: number };
    void showLookupSuccess({
      customerName: customer.customerName,
      pointBalance: num(customer.pointBalance),
      onTimeout: goHome, buttons: [homeButton],
    }).finally(reveal);
    return;
  }
  void showLookupFail({
    error: str(d.error) || undefined,
    onTimeout: goHome,
    buttons: [
      { label: "다시 입력", closeOnClick: true, onClick: goSearch },
      homeButton,
    ],
  }).finally(reveal);
}
