/**
 * 관리자 진입 권한 — 고객 화면 안에서 여는 환경설정(#/settings)의 가드.
 *
 * 대기화면 매장명 2초 길게 누르기 → 비밀번호 서버 대조 통과 시에만 unlock.
 * 대기화면으로 돌아오면 lock. 주소(#/settings)로 직접 들어오면 대기화면으로 돌려보낸다.
 * 네이버 pos/admin-session 과 같은 역할이다.
 *
 * 토스 관리자 '플러그인 설정'(settings.html)으로 여는 경우는 토스 쪽 인증을 거치므로 가드하지 않는다.
 */
let unlocked = false;

export function unlockAdmin(): void { unlocked = true; }
export function lockAdmin(): void { unlocked = false; }
export function isAdminUnlocked(): boolean { return unlocked; }

/** 토스 관리자 '플러그인 설정' 페이지(settings.html)로 열렸는지. */
export function isSettingsPageEntry(): boolean {
  return location.pathname.endsWith("/settings.html");
}
