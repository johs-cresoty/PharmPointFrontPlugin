/**
 * PharmHttpClient — 팜포인트 API 호출용 HTTP 클라이언트.
 *
 * 이전 CresotyCrypt 암호화 로직 완전 제거. 대신 Bearer 토큰 인증 사용.
 *
 * 동작:
 *   - 모든 요청에 Authorization: Bearer {token} 헤더 자동 주입
 *   - 401 응답 시 AuthService.refresh 로 토큰 재발급 후 원래 요청 자동 재시도
 *   - refresh 도 실패하면 enroll fallback (AuthService 내부 처리)
 *
 * 의존: ApiConfig, TokenStorage, AuthService
 */
window.PharmHttpClient = (function () {
  function buildAuthHeader() {
    const token = TokenStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function sendRequest(method, url, body) {
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      ...buildAuthHeader(),
    };
    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    // 요청 로깅 — 서버 응답이 "필수값 없음" 등일 때 어떤 값이 실제로 나갔는지 확인용
    console.log('[HTTP] →', method, url, body !== undefined ? JSON.stringify(body) : '(no body)');
    const response = await fetch(url, init);
    console.log('[HTTP] ←', response.status, method, url);
    return response;
  }

  /**
   * 401 감지 시 재발급 후 1회 재시도.
   */
  async function requestWithAuth(method, url, body) {
    let response = await sendRequest(method, url, body);
    if (response.status === 401) {
      console.log('[PharmHttpClient] 401 감지, 토큰 재발급 시도');
      try {
        await AuthService.refresh();
      } catch (e) {
        console.warn('[PharmHttpClient] refresh 실패, enroll fallback:', e.message);
        await AuthService.enroll();
      }
      response = await sendRequest(method, url, body);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${method} ${url}`);
    }
    const json = await response.json();
    // 응답 body 로그 — 서버가 status 200 + CODE!='0000' 로 실패를 표시하는 경우 원인 파악용
    console.log('[HTTP] body', method, url, JSON.stringify(json));
    return json;
  }

  /**
   * 토큰이 없으면 최초 발급(enroll or refresh) 을 수행. 첫 호출 시 1회만 발생.
   */
  async function ensureAuth() {
    if (TokenStorage.getToken()) return;
    await AuthService.ensureToken();
  }

  async function get(path, params = {}) {
    await ApiConfig.ensureInit();
    await ensureAuth();
    const url = new URL(`${ApiConfig.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return requestWithAuth('GET', url.toString(), undefined);
  }

  async function post(path, body = {}) {
    await ApiConfig.ensureInit();
    await ensureAuth();
    const url = `${ApiConfig.baseUrl}${path}`;
    return requestWithAuth('POST', url, body);
  }

  return { get, post };
})();
