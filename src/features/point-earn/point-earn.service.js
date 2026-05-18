/**
 * PointEarnService — 포인트 적립 orchestration.
 *
 * Android: PhoneNumberInputViewModel.proceedEarnPoint
 *   1) estimatePoint 로 적립 예상치 + SLE_SEQ 발급
 *   2) 사용자 확인 후 commitEarn → upsertCustomerPoint
 *      - sleSeq 보유 → BySleSeq (재시도 소진 후 fallback 포함)
 *      - 복합결제      → ByMultiplePayment
 *      - 단건결제      → BySinglePayment
 *
 * 의존: PointTransactionService
 */
window.PointEarnService = (function () {

  /**
   * 적립 예상 조회.
   * @param {{
   *   trnDate: string, trnTime: string, appNum: string, trnGubn: string,
   *   payAmount: number,
   *   payments?: Array<{appNum, trnGubn, trnDate, trnTime, trnAmt}>
   * }} txData
   * @returns {Promise<{success, data?: {sleSeq, pointAmount}, retried?, error?}>}
   */
  async function estimate(txData) {
    if (txData.payments && txData.payments.length >= 2) {
      return PointTransactionService.estimatePoint({
        payments: txData.payments,
      });
    }
    return PointTransactionService.estimatePoint({
      trnDate: txData.trnDate,
      trnGubn: txData.trnGubn,
      trnAmt:  txData.payAmount,
      appNum:  txData.appNum,
    });
  }

  /**
   * 적립 확정 — 입력 조건에 따라 3 가지 전략 자동 선택.
   *
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   sleSeq?: string,                         // 있으면 BySleSeq
   *   transactionGubn?: string,
   *   transactionTime?: string,
   *   transactionAmount?: string|number,
   *   approvalNumber?: string,
   *   payments?: Array<{trnGubn, trnDate, trnTime, appNum, trnAmt}>,
   * }} cmd
   */
  async function commit(cmd) {
    if (cmd.sleSeq) {
      return PointTransactionService.commitBySleSeq({
        customerPhone:   cmd.customerPhone,
        transactionDate: cmd.transactionDate,
        sleSeq:          cmd.sleSeq,
      });
    }
    if (cmd.payments && cmd.payments.length >= 2) {
      return PointTransactionService.commitByMultiplePayment({
        customerPhone:     cmd.customerPhone,
        transactionDate:   cmd.transactionDate,
        transactionAmount: cmd.transactionAmount,
        payments:          cmd.payments,
      });
    }
    return PointTransactionService.commitBySinglePayment({
      customerPhone:     cmd.customerPhone,
      transactionDate:   cmd.transactionDate,
      transactionGubn:   cmd.transactionGubn,
      transactionTime:   cmd.transactionTime,
      transactionAmount: cmd.transactionAmount,
      approvalNumber:    cmd.approvalNumber,
    });
  }

  /**
   * estimate → commit fallback 흐름.
   * sleSeq 로 commit 실패 시 결제 정보 기반 strategy 로 자동 재시도.
   */
  async function commitWithFallback(cmd) {
    if (!cmd.sleSeq) return commit(cmd);

    const first = await commit(cmd);
    if (first.success) return first;

    // sleSeq 만료/거부 → 결제 정보 기반 재시도 (Android 동일)
    return commit({ ...cmd, sleSeq: '' });
  }

  return { estimate, commit, commitWithFallback };
})();
