/**
 * PointUseService — 포인트 사용 orchestration.
 *
 * Android: UsePointViewModel.submitUsePoint
 *
 * 핵심:
 *   - 사용은 별도 API 호출 없이 socket 응답만 송신 (Android 동일)
 *   - source 에 따라 응답 채널 결정:
 *       TERMINAL           → SerialPort 004 (sendTerminalUsePoint)
 *       CAT                → WebSocket ackUsePointResult
 *       CAT_WITH_CUSTOMER  → WebSocket ackUsePointWithCustomer
 *       MANUAL             → 응답 없음 (PAD 내부 UI 전용)
 *
 * 의존: PointInquiryService, SocketGateway, PointUseSource
 */
window.PointUseSource = Object.freeze({
  TERMINAL:          'TERMINAL',
  CAT:               'CAT',
  CAT_WITH_CUSTOMER: 'CAT_WITH_CUSTOMER',
  MANUAL:            'MANUAL',
});

window.PointUseService = (function () {

  /**
   * 사용 화면 진입 시 고객 조회 (잔액 포함).
   * @param {string} phone
   * @returns {Promise<{success, customer?, error?}>}
   */
  async function lookupForUse(phone) {
    return PointInquiryService.getPointBalance(phone);
  }

  /**
   * 입력 사용 포인트 유효성 검증.
   * @param {{
   *   usePoint: number,
   *   balance: number,
   *   payAmount: number,
   *   minPoint?: number,           // 최소 사용 포인트 (e.g. 1000)
   *   isMinPointEnabled?: boolean, // 환경설정에서 활성화 여부
   * }} input
   * @returns {{ok: true} | {ok: false, reason: string}}
   */
  function validateUseAmount({ usePoint, balance, payAmount, minPoint = 0, isMinPointEnabled = false }) {
    if (!Number.isFinite(usePoint) || usePoint <= 0) {
      return { ok: false, reason: '사용 포인트를 입력해주세요.' };
    }
    if (usePoint > balance) {
      return { ok: false, reason: '보유 포인트가 부족합니다.' };
    }
    if (Number.isFinite(payAmount) && payAmount > 0 && usePoint > payAmount) {
      return { ok: false, reason: '결제 금액보다 많이 사용할 수 없습니다.' };
    }
    if (isMinPointEnabled && minPoint > 0 && usePoint < minPoint) {
      return { ok: false, reason: `최소 ${minPoint}P 부터 사용 가능합니다.` };
    }
    return { ok: true };
  }

  /**
   * 사용 결과를 source 에 맞는 채널로 송신.
   *
   * @param {{
   *   source: 'TERMINAL'|'CAT'|'CAT_WITH_CUSTOMER'|'MANUAL',
   *   phone?: string,
   *   customerCode?: string,
   *   balance: number,        // 사용 전 잔액
   *   usePoint: number,
   * }} input
   * @returns {Promise<void>}
   */
  async function relayUseResult({ source, phone, customerCode, balance, usePoint }) {
    const balanceStr  = String(balance);
    const usePointStr = String(usePoint);

    switch (source) {
      case PointUseSource.TERMINAL:
        return SocketGateway.sendTerminalUsePoint(phone || '', balanceStr, usePointStr);

      case PointUseSource.CAT:
        return SocketGateway.sendCATUsePointResult(customerCode || '', balanceStr, usePointStr);

      case PointUseSource.CAT_WITH_CUSTOMER:
        return SocketGateway.sendCATUsePointWithCustomerResult(usePointStr);

      case PointUseSource.MANUAL:
      default:
        return;
    }
  }

  /**
   * 사용 취소 — 진행 중 단말기 세션 초기화 + CAT 실패 응답.
   * @param {{ source: string }} input
   */
  async function cancelUse({ source }) {
    if (source === PointUseSource.TERMINAL) {
      return SocketGateway.sendTerminalInit();
    }
    if (source === PointUseSource.CAT || source === PointUseSource.CAT_WITH_CUSTOMER) {
      return SocketGateway.sendCATFail();
    }
  }

  /**
   * source 별 잔여 포인트 계산.
   */
  function remainingPoint(balance, usePoint) {
    return Math.max(0, (balance || 0) - (usePoint || 0));
  }

  return {
    lookupForUse,
    validateUseAmount,
    relayUseResult,
    cancelUse,
    remainingPoint,
  };
})();
