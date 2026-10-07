/**
 * plugin-settings API — 관리자 비밀번호 서버 대조 (네이버 플러그인과 같은 API).
 *
 *   POST /api/v1/plugin/settings/verify-password
 *   요청 { businessRegistrationNumber, platform: "TOSS", password(숫자 4자리) }
 *   platform 으로 서버가 대조할 비밀번호를 고른다 (네이버 · 토스 비밀번호가 다르다).
 *   응답 { CODE: "0000", DATA: { verified: boolean } } — 불일치도 CODE 0000 + verified:false
 *
 * 비밀번호를 클라이언트로 내려받지 않고 입력값만 보내 일치 여부를 받는다.
 * 요청 로그의 password 는 client.ts 가 가린다.
 */
import { apiClient } from "./client";
import { currentBusinessNumber } from "./config";
import type { ApiEnvelope } from "./types";

const VERIFY_ENDPOINT = "/api/v1/plugin/settings/verify-password";

/** @returns 일치 여부. 응답 CODE 가 "0000" 이 아니면 throw (진입 차단). */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { data } = await apiClient.post<ApiEnvelope<{ verified: boolean }>>(VERIFY_ENDPOINT, {
    businessRegistrationNumber: currentBusinessNumber(),
    platform: "TOSS",
    password,
  });
  if (data.CODE !== "0000" || !data.DATA) {
    throw new Error(`verifyAdminPassword failed: ${data.CODE} ${data.MSG}`);
  }
  return data.DATA.verified === true;
}
