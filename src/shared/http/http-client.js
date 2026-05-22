/**
 * PharmHttpClient — 암호화 인터셉터가 적용된 HTTP 클라이언트
 *
 * Android CryptoInterceptor 동일 로직:
 *   - GET: 모든 쿼리 파라미터 값 CresotyCrypt 암호화
 *   - POST: 본문 JSON 의 모든 문자열 값(중첩 객체/배열 포함) CresotyCrypt 암호화
 *   - 응답: ^ 를 포함한 문자열 값 자동 복호화
 *
 * 의존: CresotyCrypt (shared/utils/crypt.js), ApiConfig (shared/constants/api-config.js)
 */
window.PharmHttpClient = (function () {
  function encryptParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = CresotyCrypt.getEncode(String(value));
    }
    return result;
  }

  function encryptJson(data) {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(encryptJson);
    if (typeof data === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === null || v === undefined) continue;
        out[k] = encryptJson(v);
      }
      return out;
    }
    if (typeof data === 'string') return CresotyCrypt.getEncode(data);
    return data;
  }

  function decryptJson(data) {
    if (Array.isArray(data)) return data.map(decryptJson);
    if (data !== null && typeof data === 'object') {
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, decryptJson(v)])
      );
    }
    if (typeof data === 'string' && data.includes('^')) {
      try { return CresotyCrypt.getDecode(data); } catch { return data; }
    }
    return data;
  }

  async function get(path, params = {}) {
    await ApiConfig.ensureInit();
    const url = new URL(`${ApiConfig.baseUrl}${path}`);
    for (const [key, value] of Object.entries(encryptParams(params))) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decryptJson(await response.json());
  }

  async function post(path, body = {}) {
    await ApiConfig.ensureInit();
    const url = `${ApiConfig.baseUrl}${path}`;
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body:    JSON.stringify(encryptJson(body)),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decryptJson(await response.json());
  }

  return { get, post }; 
})();
