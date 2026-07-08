/**
 * ApiConfig — Toss SDK 로부터 매장/단말기 식별 정보를 읽어 팜포인트 API 호출에 필요한 값을 제공.
 *
 * 읽는 값 3종:
 *   - sdk.app.getSerialNumber()        → serialNumber           (프론트 단말기 식별)
 *   - sdk.app.getMerchant().id         → merchantId             (Toss 매장 식별)
 *   - sdk.app.getMerchant().businessNumber → businessNumber(=TAXNO) (약국 사업자번호)
 *
 * baseUrl: http://dev-app-api.catpos.co.kr (신규 인증 서버)
 */
window.ApiConfig = (function () {
  const BASE_URL = 'https://dev-app-api.catpos.co.kr';

  let _serialNumber  = '';
  let _merchantId    = '';
  let _businessNumber = '';
  let _initPromise = null;

  /**
   * Toss SDK 가 문자열 또는 { serialNumber } 형태의 객체를 반환할 가능성이 있어
   * 방어적으로 실제 문자열만 추출.
   */
  function extractSerial(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      // 가능성 있는 필드명들 순서대로 시도
      return String(v.serialNumber ?? v.serial ?? v.id ?? v.value ?? '');
    }
    return String(v);
  }

  const CACHE_KEY = 'pharmpoint_sdk_cache';

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  }

  function ensureInit() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      // 페이지 전환 시 재초기화 방지: sessionStorage 캐시 우선 사용
      const cached = readCache();
      if (cached && cached.businessNumber) {
        _serialNumber   = cached.serialNumber   || '';
        _merchantId     = cached.merchantId     || '';
        _businessNumber = cached.businessNumber || '';
        return;
      }
      try {
        const [serial, merchant] = await Promise.all([
          sdk.app.getSerialNumber(),
          sdk.app.getMerchant(),
        ]);
        _serialNumber   = extractSerial(serial);
        _merchantId     = String(merchant?.id ?? '');
        _businessNumber = String(merchant?.businessNumber ?? '');

        console.log('[ApiConfig] Toss SDK 값 로드 완료');
        console.log('  - serialNumber (raw):', JSON.stringify(serial));
        console.log('  - serialNumber:',    _serialNumber);
        console.log('  - merchantId:',      _merchantId);
        console.log('  - businessNumber:',  _businessNumber);

        if (!_serialNumber) {
          console.warn('[ApiConfig] ⚠️ serialNumber 를 추출하지 못했습니다. raw 값 확인 필요');
        }
        if (!_businessNumber || _businessNumber === '0000000000') {
          console.warn('[ApiConfig] ⚠️ businessNumber 가 비어있거나 기본값입니다!');
        }

        writeCache({
          serialNumber:   _serialNumber,
          merchantId:     _merchantId,
          businessNumber: _businessNumber,
        });
      } catch (e) {
        console.error('[ApiConfig] ❌ Toss SDK 읽기 실패:', e);
      }
    })();
    return _initPromise;
  }

  return Object.freeze({
    get baseUrl()        { return BASE_URL; },
    cmptrName: 'TossFront_Plugin',
    posVer:    '1.0.0',
    posGubn:   'CP',

    // Toss SDK 값 3종
    get serialNumber()   { return _serialNumber; },
    get merchantId()     { return _merchantId; },
    get businessNumber() { return _businessNumber; },

    // TAXNO 는 businessNumber 와 동일 (호환용 alias)
    get taxNo()          { return _businessNumber; },

    ensureInit,
  });
})();
