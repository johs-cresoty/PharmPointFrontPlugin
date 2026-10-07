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
  const ctx = readContext();
  const goHome = (): void => { navigate(ctx?.onTimeoutHref ?? "/"); };

  if (!ctx) { goHome(); return; }

  const d: ResultCtxData = ctx.data;

  switch (ctx.type) {
    case "earn":
      void showResult({
        mode:         "EARN",
        earnPoint:    num(d.earnPoint),
        balancePoint: num(d.balancePoint),
        customerName: str(d.customerName) || undefined,
        onDone: goHome,
      });
      return;

    case "use":
      void showResult({
        mode:         "USE",
        usePoint:     num(d.usePoint),
        balancePoint: num(d.remainingPoint),
        customerName: str(d.customerName) || undefined,
        onDone: goHome,
      });
      return;

    case "insufficient":
      // 최소 포인트 안내는 최소 포인트 설정이 켜져 있을 때만 보인다.
      // (예전 컨텍스트에 값이 없으면 안내를 보이던 기존 동작을 유지)
      void showResult({
        mode:         "USE_UNAVAILABLE",
        balancePoint: num(d.balancePoint),
        minPoint:     d.isMinPointEnabled === false ? 0 : num(d.minPoint),
        onDone: goHome,
      });
      return;

    case "lookup":
      renderLookup(d, goHome);
      return;

    default:
      console.warn("[Result] 알 수 없는 type:", ctx.type);
      goHome();
  }
}

/** 조회 성공만 온다 — 실패(미가입 · 오류)는 번호 입력 화면이 그 자리에서 알린다. */
function renderLookup(d: ResultCtxData, goHome: () => void): void {
  const customer = (d.customer ?? {}) as { customerName?: string; pointBalance?: number };
  void showResult({
    mode:         "LOOKUP",
    customerName: customer.customerName,
    balancePoint: num(customer.pointBalance),
    onDone: goHome,
  });
}
