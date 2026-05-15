window.ApiConfig = (function () {
  const BASE_URL_DEV  = 'http://dev.catpos.co.kr';
  const BASE_URL_PROD = 'http://catpos.co.kr:13922';
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);

  return Object.freeze({
    baseUrl:   isDev ? BASE_URL_DEV : BASE_URL_PROD,
    cmptrName: 'TossFront_Plugin',
    posVer:    '1.0.0',
    taxNo:     '2018182695',
  });
})();
