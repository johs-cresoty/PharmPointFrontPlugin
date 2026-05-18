/**
 * PointSettingsService — 포인트 적립/사용 설정 조회
 *
 * Android: CatposCloudApi.getPointSaveSetting / getPointAmountSetting
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointSettingsService = (function () {

  const DEFAULT_MIN_AMOUNT = 20000;

  /**
   * 포인트 적립 사용 여부 조회 (PNT_GUBN != 'NON' 이면 적립 활성)
   * GET /api/point/settings
   * @returns {Promise<{success: boolean, isSave?: boolean, error?: string}>}
   */
  async function getPointSaveSetting() {
    const json = await PharmHttpClient.get('/api/point/settings', {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000') {
      const pntGubn = json.DATA?.INFO?.[0]?.PNT_GUBN ?? '';
      return { success: true, isSave: pntGubn !== 'NON' };
    }
    return { success: false, error: json.MSG || '적립 설정 조회 실패' };
  }

  /**
   * 포인트 사용 최소 금액 조회 (INFO 중 최소 BASE_AMT)
   * GET /api/point/payment-settings
   * @returns {Promise<{success: boolean, minAmount?: number, error?: string}>}
   */
  async function getPointAmountSetting() {
    const json = await PharmHttpClient.get('/api/point/payment-settings', {
      TAXNO:      ApiConfig.taxNo,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000') {
      const amounts = (json.DATA?.INFO ?? [])
        .map(it => parseInt(it.BASE_AMT, 10))
        .filter(n => Number.isFinite(n));
      const minAmount = amounts.length ? Math.min(...amounts) : DEFAULT_MIN_AMOUNT;
      return { success: true, minAmount };
    }
    return { success: false, error: json.MSG || '사용 설정 조회 실패' };
  }

  return { getPointSaveSetting, getPointAmountSetting };
})();
