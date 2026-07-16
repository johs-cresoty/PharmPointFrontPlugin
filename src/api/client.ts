/**
 * PharmPoint 백엔드 (dev-app-api.catpos.co.kr) 공통 axios 인스턴스.
 *
 * - 모든 요청에 Authorization: Bearer {token} 자동 주입
 * - 401 응답 시 refresh 시도 → 실패 시 enroll → 원래 요청 자동 재시도
 * - dev 는 vite proxy 로 CORS 우회 (vite.config.ts)
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { AXIOS_BASE_URL, ensureInit } from "./config";
import { enroll, ensureToken, refresh } from "./auth-service";
import { TokenStorage } from "./token-storage";

export { POS_COMMON } from "./config";

export const apiClient = axios.create({
  baseURL: AXIOS_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

type RetryableConfig = InternalAxiosRequestConfig & { _retryAfterAuth?: boolean };

// ── 요청 인터셉터: SDK 초기화 대기 + Bearer 헤더 주입 + 로그 ─────
apiClient.interceptors.request.use(async (config) => {
  await ensureInit();
  let token = TokenStorage.getToken();
  if (!token) {
    try { token = await ensureToken(); }
    catch (e) {
      console.warn("[apiClient] ensureToken 실패, 요청 진행:", (e as Error).message);
    }
  }
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  // 요청 로그 — 진단용 (URL / params / body)
  const method = (config.method ?? "get").toUpperCase();
  const url    = `${config.baseURL ?? ""}${config.url ?? ""}`;
  const params = config.params ? ` params=${JSON.stringify(config.params)}` : "";
  const body   = config.data   ? ` body=${JSON.stringify(config.data)}`     : "";
  console.log(`[HTTP] → ${method} ${url}${params}${body}`);
  return config;
});

// ── 응답 인터셉터: 401 자동 재발급 + 응답 로그 ─────
apiClient.interceptors.response.use(
  (res) => {
    const method = (res.config.method ?? "get").toUpperCase();
    const url    = `${res.config.baseURL ?? ""}${res.config.url ?? ""}`;
    console.log(`[HTTP] ← ${res.status} ${method} ${url} body=${JSON.stringify(res.data)}`);
    return res;
  },
  async (error: AxiosError) => {
    if (error.response) {
      const method = (error.response.config.method ?? "get").toUpperCase();
      const url    = `${error.response.config.baseURL ?? ""}${error.response.config.url ?? ""}`;
      console.warn(`[HTTP] ← ${error.response.status} ${method} ${url} body=${JSON.stringify(error.response.data)}`);
    } else {
      console.warn(`[HTTP] ← NETWORK ERROR msg=${error.message} code=${error.code}`);
    }
    const original = error.config as RetryableConfig | undefined;
    if (!original) throw error;

    if (error.response?.status !== 401 || original._retryAfterAuth) {
      throw error;
    }

    original._retryAfterAuth = true;
    console.log("[apiClient] 401 감지, 토큰 재발급 시도");
    try {
      await refresh();
    } catch (e) {
      console.warn("[apiClient] refresh 실패, enroll fallback:", (e as Error).message);
      try { await enroll(); }
      catch (e2) {
        console.error("[apiClient] enroll 도 실패:", (e2 as Error).message);
        throw error;
      }
    }

    const token = TokenStorage.getToken();
    if (token) original.headers.set("Authorization", `Bearer ${token}`);
    return apiClient(original);
  },
);
