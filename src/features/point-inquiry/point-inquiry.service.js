/**
 * PointInquiryService — 고객 조회 / 포인트 잔액 조회
 *
 * Android: CatposCloudApi.getCustomer, CatposCloudApi.getPointBalance
 * 의존: PharmHttpClient, ApiConfig
 */
window.PointInquiryService = (function () {

  /**
   * 고객 존재 여부 확인 및 포인트 조회
   * GET /api/terminals/customers
   * @param {string} phone - 11자리 전화번호
   * @returns {Promise<{success: boolean, customer?: object, error?: string}>}
   */
  async function getCustomer(phone) {
    const json = await PharmHttpClient.get('/api/terminals/customers', {
      TAXNO:      ApiConfig.taxNo,
      CST_HP:     phone,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
    });

    if (json.CODE === '0000' && json.DATA?.LIST?.length > 0) {
      const dto = json.DATA.LIST[0];
      return {
        success: true,
        customer: {
          customerCode:  dto.CST_CODE ?? '',
          customerName:  dto.CST_NAME ?? '',
          customerPhone: dto.CST_HP   ?? '',
          pointBalance:  parseInt(dto.PNT_AMT, 10) || 0,
        },
      };
    }
    return { success: false, error: '등록된 회원이 아닙니다.' };
  }

  /**
   * 포인트 잔액 상세 조회
   * GET /api/terminals/customers/code
   * @param {string} phone - 11자리 전화번호
   * @returns {Promise<{success: boolean, customer?: object, error?: string}>}
   */
  async function getPointBalance(phone) {
    const json = await PharmHttpClient.get('/api/terminals/customers/code', {
      TAXNO:      ApiConfig.taxNo,
      CST_HP:     phone,
      CMPTR_NAME: ApiConfig.cmptrName,
      POS_VER:    ApiConfig.posVer,
      POS_GUBN:   ApiConfig.posGubn,
    });

    if (json.CODE === '0000' && json.DATA?.INFO?.length > 0) {
      const dto = json.DATA.INFO[0];
      return {
        success: true,
        customer: {
          customerCode:   dto.CST_CODE  ?? '',
          customerName:   dto.CST_NAME  ?? '',
          customerPhone:  dto.CST_HP    ?? '',
          customerGender: dto.CST_GNDR  ?? '',
          customerBirth:  dto.CST_BRTH  ?? '',
          pointBalance:   parseInt(dto.PNT_BLC, 10) || 0,
        },
      };
    }
    return { success: false, error: json.MSG || '등록된 회원이 없습니다.' };
  }

  return { getCustomer, getPointBalance };
})();
