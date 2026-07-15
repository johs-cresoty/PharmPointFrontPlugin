/**
 * TokenStorage — 팜포인트 인증 토큰 저장/조회 (localStorage 기반).
 *
 * 저장 항목:
 *   - token         : Bearer 토큰 (API 호출 헤더에 사용)
 *   - refreshToken  : 토큰 만료 시 재발급용
 */
const KEY_TOKEN         = "pharmpoint_token";
const KEY_REFRESH_TOKEN = "pharmpoint_refresh_token";

export const TokenStorage = {
  getToken(): string {
    try { return localStorage.getItem(KEY_TOKEN) ?? ""; }
    catch { return ""; }
  },
  getRefreshToken(): string {
    try { return localStorage.getItem(KEY_REFRESH_TOKEN) ?? ""; }
    catch { return ""; }
  },
  save(token: string, refreshToken: string): void {
    try {
      if (token)        localStorage.setItem(KEY_TOKEN, token);
      if (refreshToken) localStorage.setItem(KEY_REFRESH_TOKEN, refreshToken);
    } catch (e) {
      console.warn("[TokenStorage] save 실패:", e);
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_REFRESH_TOKEN);
    } catch (e) {
      console.warn("[TokenStorage] clear 실패:", e);
    }
  },
};
