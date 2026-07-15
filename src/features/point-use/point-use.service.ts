/**
 * PointUseService — 포인트 사용 orchestration.
 *
 * PharmPoint Android UsePointViewModel.submitUsePoint 대응.
 *
 * 핵심: 사용은 별도 API 호출 없이 socket 응답만 송신 (Android 동일).
 * source 별 응답 채널:
 *   TERMINAL          → 004 프레임 (sendTerminalUsePoint)
 *   CAT               → WS USE_POINT_ACK (sendCATUsePointResult)
 *   CAT_WITH_CUSTOMER → WS USE_POINT_WITH_CUSTOMER_ACK
 *   MANUAL            → 응답 없음 (PAD 내부 UI 전용)
 */
import { SocketGateway } from "../../pos/socket-gateway";
import { getPointBalance, type InquiryResult } from "../point-inquiry/point-inquiry.service";

export const PointUseSource = {
  TERMINAL:          "TERMINAL",
  CAT:               "CAT",
  CAT_WITH_CUSTOMER: "CAT_WITH_CUSTOMER",
  MANUAL:            "MANUAL",
} as const;

export type PointUseSourceType = typeof PointUseSource[keyof typeof PointUseSource];

// ─── 유효성 검증 ─────────────────────────────

export type ValidateInput = {
  usePoint:  number;
  balance:   number;
  payAmount: number;
  minPoint?: number;
  isMinPointEnabled?: boolean;
};

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateUseAmount(input: ValidateInput): ValidateResult {
  const { usePoint, balance, payAmount, minPoint = 0, isMinPointEnabled = false } = input;
  if (!Number.isFinite(usePoint) || usePoint <= 0) {
    return { ok: false, reason: "사용 포인트를 입력해주세요." };
  }
  if (usePoint > balance) {
    return { ok: false, reason: "보유 포인트가 부족합니다." };
  }
  if (Number.isFinite(payAmount) && payAmount > 0 && usePoint > payAmount) {
    return { ok: false, reason: "결제 금액보다 많이 사용할 수 없습니다." };
  }
  if (isMinPointEnabled && minPoint > 0 && usePoint < minPoint) {
    return { ok: false, reason: `최소 ${minPoint}P 부터 사용 가능합니다.` };
  }
  return { ok: true };
}

// ─── 사용 결과 송신 ─────────────────────────

export type RelayUseInput = {
  source:       PointUseSourceType;
  phone?:       string;
  customerCode?: string;
  balance:      number;   // 사용 전 잔액
  usePoint:     number;
};

export async function relayUseResult(input: RelayUseInput): Promise<void> {
  const { source, phone, customerCode, balance, usePoint } = input;
  const balanceStr  = String(balance);
  const usePointStr = String(usePoint);

  switch (source) {
    case PointUseSource.TERMINAL:
      await SocketGateway.sendTerminalUsePoint(phone ?? "", balanceStr, usePointStr);
      return;
    case PointUseSource.CAT:
      await SocketGateway.sendCATUsePointResult(customerCode ?? "", balanceStr, usePointStr);
      return;
    case PointUseSource.CAT_WITH_CUSTOMER:
      await SocketGateway.sendCATUsePointWithCustomerResult(usePointStr);
      return;
    case PointUseSource.MANUAL:
    default:
      return;
  }
}

// ─── 사용 취소 ───────────────────────────

/**
 * FAIL 응답의 message 필드 매핑 상수.
 * 상황별로 이 상수를 사용하거나, 서버 에러 메시지 등 임의 문자열 전달 가능.
 */
export const CancelMessage = {
  back:         "입력을 취소하였습니다.",
  insufficient: "포인트가 부족합니다",
  default:      "다음에하기",
} as const;

/**
 * 사용 취소 — source 채널별 실패 응답.
 *   TERMINAL          → 010 INIT
 *   CAT / CAT_WITH_CUSTOMER → FAIL(message)
 *
 * message 미지정 시 기본값 "다음에하기".
 * 서버 에러 등에서는 error 메시지를 그대로 전달.
 */
export async function cancelUse({
  source,
  message = CancelMessage.default,
}: { source: PointUseSourceType; message?: string }): Promise<void> {
  if (source === PointUseSource.TERMINAL) {
    await SocketGateway.sendTerminalInit();
    return;
  }
  if (source === PointUseSource.CAT || source === PointUseSource.CAT_WITH_CUSTOMER) {
    await SocketGateway.sendCATFail(message);
    return;
  }
}

// ─── 기타 유틸 ───────────────────────────

export function lookupForUse(phone: string): Promise<InquiryResult> {
  return getPointBalance(phone);
}

export function remainingPoint(balance: number, usePoint: number): number {
  return Math.max(0, (balance || 0) - (usePoint || 0));
}
