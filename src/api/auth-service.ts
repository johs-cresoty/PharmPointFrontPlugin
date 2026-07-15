/**
 * AuthService — 팜포인트 인증 API 호출 (enroll / token 재발급).
 *
 * 엔드포인트:
 *   POST /api/v1/point/auth/enroll — 최초 기기 등록.  body { businessRegistrationNumber, serialNumber }
 *   POST /api/v1/point/auth/token  — refreshToken 으로 재발급. 위 필드 + refreshToken
 *
 * apiClient 를 거치지 않고 raw axios 로 호출 (인터셉터 재발급 로직과 무한 루프 방지).
 */
import axios, { type AxiosError } from "axios";
import { API_BASE_URL, ensureInit, readAuthContext } from "./config";
import { TokenStorage } from "./token-storage";

const ENROLL_PATH  = "/api/v1/point/auth/enroll";
const REFRESH_PATH = "/api/v1/point/auth/token";

type AuthResponse = {
  token?:        string;
  refreshToken?: string;
};

/** raw axios 호출용 로그 헬퍼 — apiClient 인터셉터를 안 거치므로 여기서 직접 남긴다. */
async function postWithLog<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  console.log(`[HTTP] → POST ${url} body=${JSON.stringify(body)}`);
  try {
    const res = await axios.post<T>(url, body, {
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
    console.log(`[HTTP] ← ${res.status} POST ${url} body=${JSON.stringify(res.data)}`);
    return res.data;
  } catch (err) {
    const ax = err as AxiosError;
    if (ax.response) {
      console.log(`[HTTP] ← ${ax.response.status} POST ${url} body=${JSON.stringify(ax.response.data)}`);
    }
    throw err;
  }
}

/**
 * 최초 기기 등록. SDK 값으로 호출. 성공 시 토큰 저장 후 반환.
 */
export async function enroll(): Promise<string> {
  await ensureInit();
  const ctx = readAuthContext();
  const data = await postWithLog<AuthResponse>(ENROLL_PATH, ctx);
  const token        = data.token        ?? "";
  const refreshToken = data.refreshToken ?? "";
  if (!token || !refreshToken) {
    throw new Error("AuthService.enroll: token/refreshToken 응답 누락");
  }
  TokenStorage.save(token, refreshToken);
  console.log("[AuthService] enroll 성공, 토큰 저장 완료");
  return token;
}

/**
 * refreshToken 으로 access token 재발급. 실패 시 호출부에서 enroll fallback.
 */
export async function refresh(): Promise<string> {
  await ensureInit();
  const refreshToken = TokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error("AuthService.refresh: refreshToken 없음");
  }
  const ctx = readAuthContext();
  const data = await postWithLog<AuthResponse>(REFRESH_PATH, { ...ctx, refreshToken });
  const newToken        = data.token        ?? "";
  const newRefreshToken = data.refreshToken ?? "";
  if (!newToken || !newRefreshToken) {
    throw new Error("AuthService.refresh: token/refreshToken 응답 누락");
  }
  TokenStorage.save(newToken, newRefreshToken);
  console.log("[AuthService] refresh 성공, 토큰 갱신 완료");
  return newToken;
}

/**
 * 사용 가능한 토큰 확보.
 *   1) refreshToken 있으면 refresh 시도
 *   2) 실패하거나 refreshToken 없으면 enroll
 */
export async function ensureToken(): Promise<string> {
  const rt = TokenStorage.getRefreshToken();
  if (rt) {
    try { return await refresh(); }
    catch (e) {
      console.warn("[AuthService] refresh 실패, enroll 재시도:", (e as Error).message);
      TokenStorage.clear();
    }
  }
  return await enroll();
}
