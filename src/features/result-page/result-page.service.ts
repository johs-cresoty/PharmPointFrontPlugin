/**
 * ResultPageService — sdk.template.renderResultPage 호출 헬퍼.
 *
 * PharmPoint Android presentation/result/ResultContract.State 대응.
 *
 * 문구 포맷 (디자인 명세):
 *   적립 완료   : "<earnPoint>P 적립완료" / "<customer 님, ><balancePoint>P 있어요"
 *   사용 완료   : "<usePoint>P 사용완료"  / "<customer 님, ><remainingPoint>P 남았어요"
 *   포인트 부족 : "포인트 부족"            / "최소 <minPoint>P부터 사용 가능합니다."
 *   조회 성공   : "<pointBalance>P 보유"  / "<customerName> 님"
 *   조회 실패   : "등록된 회원이 없습니다." / "전화번호를 다시 확인해주세요"
 */
import { getResultTimeoutMs } from "../app-config/app-config.service";

const DEFAULT_TIMEOUT_MS = 5000;

export type ResultButton = {
  label:         string;
  closeOnClick?: boolean;
  onClick:       () => void;
};

function fmtPoint(n: number | string): string {
  const num = typeof n === "number" ? n : parseInt(n, 10) || 0;
  return num.toLocaleString("ko-KR");
}

async function resolveTimerMs(timerMs?: number): Promise<number> {
  if (Number.isFinite(timerMs)) return timerMs as number;
  try { return await getResultTimeoutMs(); }
  catch (e) {
    console.warn("[ResultPage] timeout 조회 실패, 기본값 사용", e);
    return DEFAULT_TIMEOUT_MS;
  }
}

type RenderArgs = {
  type:         "text" | "image";
  status?:      "success" | "error";
  title?:       string;
  description?: string;
  text?:        string;
  onTimeout?:   () => void;
  timerMs?:     number;
  buttons?:     ResultButton[];
};

async function render(args: RenderArgs): Promise<void> {
  const params = {
    type:       args.type,
    title:      args.title,
    description: args.description,
    onTimeout:  args.onTimeout ?? (() => {}),
    timerMs:    await resolveTimerMs(args.timerMs),
    localeCode: "ko",
  } as Record<string, unknown>;
  if (args.type === "image") params.status = args.status ?? "success";
  if (args.type === "text")  params.text   = args.text ?? "";
  if (args.buttons && args.buttons.length) params.buttons = args.buttons;
  sdk.template.renderResultPage(params as never);
}

function customerPrefix(customerName?: string): string {
  return customerName ? `${customerName} 님, ` : "";
}

// ─── 공개 API ─────────────────────────────────

/** 단순 완료 안내 (마케팅 동의 입력 완료 등) — 성공 아이콘 + "입력 완료 / 감사합니다". */
export function showMarketingConsentDone(args: {
  onTimeout?: () => void; timerMs?: number;
}): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "입력 완료",
    description: "감사합니다",
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}

export function showEarnSuccess(args: {
  earnPoint: number; storeName: string; balancePoint: number;
  customerName?: string; onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       `${fmtPoint(args.earnPoint)}P 적립 완료`,
    description: `${customerPrefix(args.customerName)}${fmtPoint(args.balancePoint)}P 있어요`,
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showUseSuccess(args: {
  usePoint: number; storeName: string; remainingPoint: number;
  customerName?: string; onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       `${fmtPoint(args.usePoint)}P 사용완료`,
    description: `${customerPrefix(args.customerName)}${fmtPoint(args.remainingPoint)}P 남았어요`,
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showInsufficientPoint(args: {
  storeName: string; minPoint: number; balancePoint: number;
  onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "image", status: "error",
    title:       "포인트 부족",
    description: `최소 ${fmtPoint(args.minPoint)}P부터 사용 가능합니다.\n보유 포인트 ${fmtPoint(args.balancePoint)}P`,
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showLookupResult(args: {
  storeName: string; balancePoint: number;
  onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "text",
    text:        `보유 포인트 ${fmtPoint(args.balancePoint)}P`,
    title:       args.storeName,
    description: "현재 보유하고 있는 포인트입니다.",
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showLookupSuccess(args: {
  customerName?: string; pointBalance: number;
  onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       `${fmtPoint(args.pointBalance)}P 보유`,
    description: `${args.customerName ?? ""} 님`,
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showLookupFail(args: {
  error?: string;
  onTimeout?: () => void; timerMs?: number; buttons?: ResultButton[];
}): Promise<void> {
  return render({
    type: "image", status: "error",
    title:       args.error || "등록된 회원이 없습니다.",
    description: "전화번호를 다시 확인해주세요",
    onTimeout: args.onTimeout, timerMs: args.timerMs, buttons: args.buttons,
  });
}

export function showMinPointSaved(args: { minPoint: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `최소 사용 포인트 ${fmtPoint(args.minPoint)}P`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}

export function showTimeoutSaved(args: { seconds: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `화면 대기 시간 ${args.seconds}초`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}

export function showInactivityTimeoutSaved(args: { seconds: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `미동작 시 대기 시간 ${args.seconds}초`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}
