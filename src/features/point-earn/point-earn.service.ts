/**
 * PointEarnService — 포인트 적립 orchestration.
 *
 * PharmPoint Android PhoneNumberInputViewModel.proceedEarnPoint 대응.
 *   1) estimate 로 SLE_SEQ 발급
 *   2) commit(BySleSeq | BySinglePayment | ByMultiplePayment)
 *   3) sleSeq 실패 시 결제정보 fallback
 */
import { SocketGateway } from "../../pos/socket-gateway";
import {
  estimatePoint,
  commitBySleSeq,
  commitBySinglePayment,
  commitByMultiplePayment,
  type EstimateResult,
  type UpsertResult,
  type PaymentDetail,
} from "../point-transaction/point-transaction.service";
import { CancelMessage, PointUseSource, type PointUseSourceType } from "../point-use/point-use.service";

export type TransactionData = {
  trnDate:    string;
  trnTime:    string;
  appNum:     string;
  trnGubn:    string;
  payAmount:  number;
  payments?:  PaymentDetail[];
};

/** 적립 예상 조회 — payments 유무로 단건/복합 자동 분기. */
export function estimate(txData: TransactionData): Promise<EstimateResult> {
  if (txData.payments && txData.payments.length >= 2) {
    return estimatePoint({ payments: txData.payments });
  }
  return estimatePoint({
    trnDate: txData.trnDate,
    trnGubn: txData.trnGubn,
    trnAmt:  txData.payAmount,
    appNum:  txData.appNum,
  });
}

export type CommitCommand = {
  customerPhone:     string;
  transactionDate:   string;
  sleSeq?:           string;
  transactionGubn?:  string;
  transactionTime?:  string;
  transactionAmount?: string | number;
  approvalNumber?:   string;
  payments?:         PaymentDetail[];
};

/** 적립 확정 — 입력 조건에 따라 3가지 전략 자동 선택. */
export async function commit(cmd: CommitCommand): Promise<UpsertResult> {
  if (cmd.sleSeq) {
    return commitBySleSeq({
      customerPhone:   cmd.customerPhone,
      transactionDate: cmd.transactionDate,
      sleSeq:          cmd.sleSeq,
    });
  }
  if (cmd.payments && cmd.payments.length >= 2) {
    return commitByMultiplePayment({
      customerPhone:     cmd.customerPhone,
      transactionDate:   cmd.transactionDate,
      transactionAmount: cmd.transactionAmount ?? 0,
      payments:          cmd.payments,
    });
  }
  return commitBySinglePayment({
    customerPhone:     cmd.customerPhone,
    transactionDate:   cmd.transactionDate,
    transactionGubn:   cmd.transactionGubn ?? "",
    transactionTime:   cmd.transactionTime ?? "",
    transactionAmount: cmd.transactionAmount ?? 0,
    approvalNumber:    cmd.approvalNumber ?? "",
  });
}

/**
 * estimate → commit fallback 흐름.
 * sleSeq 로 commit 실패 시 결제 정보 기반 strategy 로 자동 재시도 (Android 동일).
 */
export async function commitWithFallback(cmd: CommitCommand): Promise<UpsertResult> {
  if (!cmd.sleSeq) return commit(cmd);

  const first = await commit(cmd);
  if (first.success) return first;

  return commit({ ...cmd, sleSeq: "" });
}

/**
 * 적립 취소 — source 채널별 실패 응답.
 *   TERMINAL          → 010 INIT
 *   CAT / CAT_WITH_CUSTOMER → FAIL(message)
 *
 * message 미지정 시 기본값 "다음에하기".
 * 서버 에러 등에서는 error 메시지를 그대로 전달.
 */
export async function cancelEarn({
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
