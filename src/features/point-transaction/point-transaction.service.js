/**
 * PointTransactionService — 포인트 적립 예상 + 적립/사용 확정 (upsert)
 *
 * Android: CatposCloudApi.estimatePoint, CatposCloudApi.upsertCustomerPoint
 *
 * estimatePoint 재시도 정책: CODE 8888 / 9303 → 최대 3회 시도 (1s, 2s 백오프).
 *   소진 시 graceful 진행 (success: true, data: null) — Android EstimatePointRetryableException 동일.
 *
 * upsertCustomerPoint 호출 형태 3 가지:
 *   1) BySleSeq         — 적립 예상으로 받은 SLE_SEQ 로 확정
 *   2) BySinglePayment  — 단건 결제 정보로 확정
 *   3) ByMultiplePayment — 복합 결제 (2건) 정보로 확정
 *
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointTransactionService = (function () {

  const RETRYABLE_CODES = new Set(['8888', '9303']);
  const RETRY_DELAYS_MS = [1000, 2000];
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  function baseBody({ customerPhone, transactionDate }) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      CST_HP:     customerPhone,
      TRN_DATE:   transactionDate,
    };
  }

  function paymentDetailDto(p) {
    return {
      TRN_GUBN: p.trnGubn,
      TRN_DATE: p.trnDate,
      TRN_TIME: p.trnTime,
      APP_NUM:  p.appNum,
      TRN_AMT:  String(p.trnAmt),
    };
  }

  async function callUpsert(body) {
    const json = await PharmHttpClient.post('/api/terminals/customers/code', body);
    if (json.CODE === '0000') {
      const dto = json.DATA?.INFO?.[0];
      return {
        success: true,
        data: {
          sleSeq:        dto?.SLE_SEQ   ?? '',
          customerCode:  dto?.CST_CODE  ?? '',
          customerPhone: dto?.CST_HP    ?? '',
          customerName:  dto?.CST_NAME  ?? '',
          pointAmount:   dto?.PNT_AMT   ?? '0',
          pointBalance:  dto?.PNT_BLC   ?? '0',
        },
      };
    }
    return { success: false, error: json.MSG || 'upsertCustomerPoint failed' };
  }

  /**
   * SLE_SEQ 로 확정 (적립 예상 단계에서 발급받은 시퀀스 사용)
   * @param {{customerPhone: string, transactionDate: string, sleSeq: string}} cmd
   */
  async function commitBySleSeq(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      SLE_SEQ: cmd.sleSeq,
    });
  }

  /**
   * 단건 결제 정보로 확정
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   transactionGubn: string,
   *   transactionTime: string,
   *   transactionAmount: string|number,
   *   approvalNumber: string
   * }} cmd
   */
  async function commitBySinglePayment(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      TRN_GUBN: cmd.transactionGubn,
      TRN_TIME: cmd.transactionTime,
      TRN_AMT:  String(cmd.transactionAmount),
      APP_NUM:  cmd.approvalNumber,
    });
  }

  /**
   * 복합 결제 (2건) 정보로 확정
   * @param {{
   *   customerPhone: string,
   *   transactionDate: string,
   *   transactionAmount: string|number,
   *   payments: Array<{
   *     trnGubn: string, trnDate: string, trnTime: string,
   *     appNum: string, trnAmt: string|number
   *   }>
   * }} cmd
   */
  async function commitByMultiplePayment(cmd) {
    return callUpsert({
      ...baseBody(cmd),
      TRN_AMT: String(cmd.transactionAmount),
      ADD:     cmd.payments.map(paymentDetailDto),
    });
  }

  /**
   * 포인트 예상 적립 계산
   * POST /api/point/estimate
   *
   * 단건: trnDate, trnGubn, trnAmt, appNum 전달
   * 복합: payments 배열 전달 (ADD 필드)
   *
   * @param {{
   *   trnDate?: string,
   *   trnGubn?: string,
   *   trnAmt?: string|number,
   *   appNum?: string,
   *   payments?: Array<{trnGubn, trnDate, trnTime, appNum, trnAmt}>
   * }} cmd
   */
  async function estimatePoint(cmd) {
    const body = {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      ...(cmd.trnDate   && { TRN_DATE: cmd.trnDate }),
      ...(cmd.trnGubn   && { TRN_GUBN: cmd.trnGubn }),
      ...(cmd.trnAmt    && { TRN_AMT:  String(cmd.trnAmt) }),
      ...(cmd.appNum    && { APP_NUM:  cmd.appNum }),
      ...(cmd.payments  && { ADD:      cmd.payments.map(paymentDetailDto) }),
    };

    let lastCode = '-9999';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const json = await PharmHttpClient.post('/api/point/estimate', body);
      const code = json.CODE ?? '-9999';
      if (code === '0000') {
        const dto = json.DATA?.INFO?.[0];
        return {
          success: true,
          data: {
            sleSeq:      dto?.SLE_SEQ ?? '',
            pointAmount: dto?.PNT_AMT ?? '0',
            raw:         json.DATA,
          },
        };
      }
      if (!RETRYABLE_CODES.has(code)) {
        return { success: false, error: json.MSG || `estimatePoint failed: ${code}` };
      }
      lastCode = code;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    // 재시도 소진 → graceful pass (Android Success(null) 동일)
    return { success: true, data: null, retried: true, lastCode };
  }

  return { estimatePoint, commitBySleSeq, commitBySinglePayment, commitByMultiplePayment };
})();
