/**
 * TokenStorage — 팜포인트 인증 토큰 보관 (메모리 전용).
 *
 * 저장 항목:
 *   - token         : Bearer 토큰 (API 호출 헤더에 사용)
 *   - refreshToken  : 토큰 만료 시 재발급용
 *
 * ⚠️ localStorage 에 두지 않는다.
 *    단말기는 여러 사람이 쓰는 공용 기기이고, localStorage 값은 앱을 닫아도 남아
 *    기기에 접근할 수 있으면 토큰을 그대로 꺼낼 수 있다.
 *    메모리에만 두면 앱 종료와 함께 사라지고, 다음 실행 때 enroll 로 다시 받는다.
 *    (재발급 비용은 앱 실행당 1회뿐이라 실사용에 영향이 없다)
 */
const LEGACY_KEYS = ["pharmpoint_token", "pharmpoint_refresh_token"];

let accessToken  = "";
let refreshToken = "";

// 이전 버전이 localStorage 에 남긴 토큰 제거 — 업데이트만 하고 끝나면 예전 값이 계속 남는다.
for (const key of LEGACY_KEYS) {
  try {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      console.log(`[TokenStorage] 이전 버전이 저장한 ${key} 제거`);
    }
  } catch { /* 접근 불가 환경이면 무시 */ }
}

export const TokenStorage = {
  getToken(): string {
    return accessToken;
  },
  getRefreshToken(): string {
    return refreshToken;
  },
  save(token: string, refresh: string): void {
    if (token)   accessToken  = token;
    if (refresh) refreshToken = refresh;
  },
  clear(): void {
    accessToken  = "";
    refreshToken = "";
  },
};
