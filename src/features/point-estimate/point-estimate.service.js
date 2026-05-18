/**
 * PointEstimateService — 포인트 적립 예상치 조회
 *
 * Android: CatposCloudApi.estimatePoint
 *
 * 재시도 정책: CODE 8888 / 9303 → 최대 3회 시도 (1s, 2s 백오프).
 *   재시도 소진 시 graceful 진행 (success: true, data: null).
 *
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointEstimateService = (function () {

  const RETRYABLE_CODES = new Set(['8888', '9303']);
  const RETRY_DELAYS_MS = [1000, 2000];

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function buildSingleBody({ trnDate, trnGubn, trnAmt, appNum }) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      TRN_DATE:   trnDate,
      TRN_GUBN:   trnGubn,
      TRN_AMT:    String(trnAmt),
      APP_NUM:    appNum,
    };
  }

  function buildComplexBody(payments) {
    return {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      ADD: payments.map(p => ({
        TRN_GUBN: p.trnGubn,
        TRN_DATE: p.trnDate,
        TRN_TIME: p.trnTime,
        APP_NUM:  p.appNum,
        TRN_AMT:  String(p.trnAmt),
      })),
    };
  }

  async function callOnce(body) {
    return PharmHttpClient.post('/api/point/estimate', body);
  }

  async function callWithRetry(body) {
    let lastCode = '-9999';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const json = await callOnce(body);
      const code = json.CODE ?? '-9999';
      if (code === '0000') {
        const dto = json.DATA?.INFO?.[0];
        return {
          success: true,
          data: {
            sleSeq:      dto?.SLE_SEQ      ?? '',
            pointAmount: dto?.PNT_AMT      ?? '',
          },
        };
      }
      if (!RETRYABLE_CODES.has(code)) {
        return { success: false, error: json.MSG || `estimatePoint failed: ${code}` };
      }
      lastCode = code;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    // 재시도 소진 → graceful pass (Android 동일 동작)
    return { success: true, data: null, retried: true, lastCode };
  }

  /**
   * 단건 결제 적립 예상
   * @param {{trnDate: string, trnGubn: string, trnAmt: string|number, appNum: string}} cmd
   */
  async function estimateSingle(cmd) {
    return callWithRetry(buildSingleBody(cmd));
  }

  /**
   * 복합 결제 적립 예상
   * @param {Array<{trnGubn: string, trnDate: string, trnTime: string, appNum: string, trnAmt: string|number}>} payments
   */
  async function estimateComplex(payments) {
    return callWithRetry(buildComplexBody(payments));
  }

  return { estimateSingle, estimateComplex };
})();
