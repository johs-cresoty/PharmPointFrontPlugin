/**
 * TokenStorage — 팜포인트 인증 토큰 저장/조회 (localStorage 기반).
 *
 * 저장 항목:
 *   - token         : Bearer 토큰 (API 호출 시 Authorization 헤더)
 *   - refreshToken  : 토큰 만료 시 재발급용
 */
window.TokenStorage = (function () {
  const KEY_TOKEN         = 'pharmpoint_token';
  const KEY_REFRESH_TOKEN = 'pharmpoint_refresh_token';

  function getToken() {
    return localStorage.getItem(KEY_TOKEN) || '';
  }

  function getRefreshToken() {
    return localStorage.getItem(KEY_REFRESH_TOKEN) || '';
  }

  function save(token, refreshToken) {
    if (token)        localStorage.setItem(KEY_TOKEN, token);
    if (refreshToken) localStorage.setItem(KEY_REFRESH_TOKEN, refreshToken);
  }

  function clear() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_REFRESH_TOKEN);
  }

  return { getToken, getRefreshToken, save, clear };
})();
