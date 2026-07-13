/**
 * AuthService — 팜포인트 인증 API 호출 (enroll / token 갱신).
 *
 * 엔드포인트:
 *   - POST /api/v1/point/auth/enroll  : 최초 기기 등록. body { businessRegistrationNumber, serialNumber }
 *   - POST /api/v1/point/auth/token   : refreshToken 으로 재발급. body { businessRegistrationNumber, serialNumber, refreshToken }
 *
 * 응답: { token, refreshToken } → TokenStorage 에 저장.
 *
 * 의존: ApiConfig, TokenStorage
 */
window.AuthService = (function () {
  const ENROLL_PATH  = '/api/v1/point/auth/enroll';
  const REFRESH_PATH = '/api/v1/point/auth/token';

  async function postJson(path, body) {
    const url = `${ApiConfig.baseUrl}${path}`;
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body:    JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`AuthService ${path} failed: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * 최초 기기 등록. { businessRegistrationNumber, serialNumber } 로 호출.
   * 성공 시 token / refreshToken 저장 후 token 반환.
   */
  async function enroll() {
    await ApiConfig.ensureInit();
    const data = await postJson(ENROLL_PATH, {
      businessRegistrationNumber: ApiConfig.businessNumber,
      serialNumber:               ApiConfig.serialNumber,
    });
    const token        = data.token        ?? '';
    const refreshToken = data.refreshToken ?? '';
    if (!token || !refreshToken) {
      throw new Error('AuthService.enroll: token/refreshToken 응답 누락');
    }
    TokenStorage.save(token, refreshToken);
    console.log('[AuthService] enroll 성공, 토큰 저장 완료');
    return token;
  }

  /**
   * refreshToken 으로 access token 재발급. 성공 시 저장값 교체 후 새 token 반환.
   * refreshToken 이 없거나 서버가 거부하면 throw → 호출부에서 enroll 로 fallback.
   */
  async function refresh() {
    await ApiConfig.ensureInit();
    const refreshToken = TokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error('AuthService.refresh: refreshToken 없음');
    }
    const data = await postJson(REFRESH_PATH, {
      businessRegistrationNumber: ApiConfig.businessNumber,
      serialNumber:               ApiConfig.serialNumber,
      refreshToken,
    });
    const newToken        = data.token        ?? '';
    const newRefreshToken = data.refreshToken ?? '';
    if (!newToken || !newRefreshToken) {
      throw new Error('AuthService.refresh: token/refreshToken 응답 누락');
    }
    TokenStorage.save(newToken, newRefreshToken);
    console.log('[AuthService] refresh 성공, 토큰 갱신 완료');
    return newToken;
  }

  /**
   * 사용 가능한 토큰 확보:
   *   1) refreshToken 있으면 refresh 시도
   *   2) 실패하거나 refreshToken 없으면 enroll
   *
   * 앱 초기화 시 호출.
   */
  async function ensureToken() {
    const refreshToken = TokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        return await refresh();
      } catch (e) {
        console.warn('[AuthService] refresh 실패, enroll 재시도:', e.message);
        TokenStorage.clear();
      }
    }
    return await enroll();
  }

  return { enroll, refresh, ensureToken };
})();
