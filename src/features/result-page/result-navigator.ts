/**
 * ResultNavigator — 결과 화면 라우팅 캡슐화.
 *
 * 각 flow (earn / use / lookup 등) 는 결과 데이터를 sessionStorage 에 세팅한 뒤
 * "/result" 로 라우터 이동. Result 뷰가 이 컨텍스트를 읽어 SDK 결과 페이지를 렌더.
 *
 * ResultPageService 는 Result 뷰 안에서만 사용된다 (SDK 호출 계층).
 * flow 는 반드시 ResultNavigator 를 통해 결과 화면을 표시.
 */
import { navigate } from "../../router";

const CTX_KEY      = "pharm_result_ctx";
const RESULT_PATH  = "/result";
const DEFAULT_HOME = "/";

export type ResultCtxData = Record<string, unknown>;

export type ResultCtx = {
  type: "earn" | "use" | "insufficient" | "lookup";
  data: ResultCtxData;
  onTimeoutHref: string;
};

function commit(ctx: ResultCtx): void {
  try { sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx)); }
  catch (e) { console.warn("[ResultNavigator] sessionStorage 저장 실패", e); }
  navigate(RESULT_PATH);
}

// ── 공개 API ────────────────────────────────

export function goEarnSuccess(args: {
  earnPoint: number; storeName: string; balancePoint: number;
  customerName?: string; onTimeoutHref?: string;
}): void {
  commit({
    type: "earn",
    data: { earnPoint: args.earnPoint, storeName: args.storeName, balancePoint: args.balancePoint, customerName: args.customerName },
    onTimeoutHref: args.onTimeoutHref ?? DEFAULT_HOME,
  });
}

export function goUseSuccess(args: {
  usePoint: number; storeName: string; remainingPoint: number;
  customerName?: string; onTimeoutHref?: string;
}): void {
  commit({
    type: "use",
    data: { usePoint: args.usePoint, storeName: args.storeName, remainingPoint: args.remainingPoint, customerName: args.customerName },
    onTimeoutHref: args.onTimeoutHref ?? DEFAULT_HOME,
  });
}

export function goInsufficient(args: {
  storeName: string; minPoint: number; balancePoint: number; onTimeoutHref?: string;
}): void {
  commit({
    type: "insufficient",
    data: { storeName: args.storeName, minPoint: args.minPoint, balancePoint: args.balancePoint },
    onTimeoutHref: args.onTimeoutHref ?? DEFAULT_HOME,
  });
}

export function goLookupSuccess(args: {
  phone: string; customer: { customerName?: string; pointBalance?: number }; onTimeoutHref?: string;
}): void {
  commit({
    type: "lookup",
    data: { phone: args.phone, customer: args.customer, success: true },
    onTimeoutHref: args.onTimeoutHref ?? DEFAULT_HOME,
  });
}

export function goLookupFail(args: {
  phone: string; error?: string; onTimeoutHref?: string;
}): void {
  commit({
    type: "lookup",
    data: { phone: args.phone, success: false, error: args.error || "등록된 회원이 없습니다." },
    onTimeoutHref: args.onTimeoutHref ?? DEFAULT_HOME,
  });
}

/**
 * Result 뷰 진입 시 저장된 컨텍스트 소비 + 제거.
 * 없으면 null.
 */
export function readContext(): ResultCtx | null {
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    sessionStorage.removeItem(CTX_KEY);
    return raw ? (JSON.parse(raw) as ResultCtx) : null;
  } catch (e) {
    console.warn("[ResultNavigator] readContext parse 실패:", e);
    return null;
  }
}
