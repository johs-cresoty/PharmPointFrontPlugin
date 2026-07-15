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
  const ctx = readContext();
  const goHome   = (): void => { navigate(ctx?.onTimeoutHref ?? "/"); };
  const goSearch = (): void => { navigate("/member-search"); };

  if (!ctx) { goHome(); return; }

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
      });
      return;

    case "use":
      void showUseSuccess({
        usePoint:       num(d.usePoint),
        storeName:      str(d.storeName),
        remainingPoint: num(d.remainingPoint),
        customerName:   str(d.customerName) || undefined,
        onTimeout: goHome, buttons: [homeButton],
      });
      return;

    case "insufficient":
      void showInsufficientPoint({
        storeName:    str(d.storeName),
        minPoint:     num(d.minPoint),
        balancePoint: num(d.balancePoint),
        onTimeout: goHome, buttons: [homeButton],
      });
      return;

    case "lookup":
      renderLookup(d, homeButton, goHome, goSearch);
      return;

    default:
      console.warn("[Result] 알 수 없는 type:", ctx.type);
      goHome();
  }
}

function renderLookup(
  d: ResultCtxData,
  homeButton: ResultButton,
  goHome: () => void,
  goSearch: () => void,
): void {
  if (d.success === true && d.customer) {
    const customer = d.customer as { customerName?: string; pointBalance?: number };
    void showLookupSuccess({
      customerName: customer.customerName,
      pointBalance: num(customer.pointBalance),
      onTimeout: goHome, buttons: [homeButton],
    });
    return;
  }
  void showLookupFail({
    error: str(d.error) || undefined,
    onTimeout: goHome,
    buttons: [
      { label: "다시 입력", closeOnClick: true, onClick: goSearch },
      homeButton,
    ],
  });
}
