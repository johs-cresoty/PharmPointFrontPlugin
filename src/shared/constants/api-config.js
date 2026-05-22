window.ApiConfig = (function () {
  const BASE_URL_DEV  = 'http://dev.catpos.co.kr';
  const BASE_URL_PROD = 'http://catpos.co.kr:13922';
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);

  let _taxNo       = '';
  let _initPromise = null;

  function ensureInit() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      try {
        const merchant = await sdk.app.getMerchant();
        _taxNo = merchant?.businessNumber ?? '';
        console.log('[ApiConfig] getMerchant 성공:', { businessNumber: _taxNo, merchant });

        // 값이 없으면 경고
        if (!_taxNo || _taxNo === '0000000000') {
          console.warn('[ApiConfig] 경고: businessNumber 가 없거나 기본값입니다.', { merchant });
        }
      } catch (e) {
        console.error('[ApiConfig] getMerchant 실패:', e);
        _taxNo = '';
      }
    })();
    return _initPromise;
  }

  return Object.freeze({
    get baseUrl()  { return isDev ? BASE_URL_DEV : BASE_URL_PROD; },
    cmptrName: 'TossFront_Plugin',
    posVer:    '1.0.0',
    posGubn:   'CP',
    get taxNo()    { return _taxNo; },
    ensureInit,
  });
})();
