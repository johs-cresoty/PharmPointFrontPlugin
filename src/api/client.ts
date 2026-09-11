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
import { maskPhone } from "../utils/pii-mask";

export { POS_COMMON } from "./config";

// ── 로그 본문 가공 ─────────────────────────────────
//
// 요청·응답 본문을 그대로 찍으면 고객 전화번호·이름과 인증 토큰이 콘솔에 남는다.
// 토스 운영 가이드가 수집 대상에서 제외하라고 명시한 항목이라 마스킹해서 남긴다.
// 진단은 계속 가능해야 하므로 필드를 지우지 않고 값만 가린다.

/**
 * 뒤 4자리만 남길 키(전화번호). 어느 고객인지 구분은 되면서 번호는 복원할 수 없다.
 */
const PHONE_KEYS = new Set(["CST_HP", "customerPhone", "phone"]);

/**
 * 값을 통째로 가릴 키(이름·인증정보).
 * 이름에 뒤 4자리 규칙을 쓰면 "홍길동" 같은 짧은 이름이 그대로 남는다.
 */
const REDACT_KEYS = new Set([
  "CST_NAME", "customerName",
  "token", "refreshToken", "accessToken", "password",
]);

/** 본문 로그 상한 — 긴 목록 응답이 콘솔을 덮는 것을 막는다. */
const LOG_MAX = 800;

function truncate(s: string): string {
  return s.length > LOG_MAX ? `${s.slice(0, LOG_MAX)}…(${s.length}B)` : s;
}

function safeBody(value: unknown): string {
  if (value === undefined || value === null) return "";

  // axios 가 문자열로 직렬화한 본문은 한 번 파싱해야 키 기반 마스킹이 먹는다.
  let target = value;
  if (typeof value === "string") {
    try { target = JSON.parse(value); }
    catch { return truncate(value); } // JSON 이 아니면 평문 그대로
  }

  let s: string;
  try {
    s = JSON.stringify(target, (key, val) => {
      if (typeof val !== "string") return val;
      if (REDACT_KEYS.has(key)) return "***";
      if (PHONE_KEYS.has(key))  return maskPhone(val);
      return val;
    });
  } catch {
    s = String(target);
  }
  return s ? truncate(s) : "";
}

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
  // 요청 로그 — 진단용 (URL / params / body). 개인정보·인증정보는 safeBody 가 가린다.
  const method = (config.method ?? "get").toUpperCase();
  const url    = `${config.baseURL ?? ""}${config.url ?? ""}`;
  const params = config.params ? ` params=${safeBody(config.params)}` : "";
  const body   = config.data   ? ` body=${safeBody(config.data)}`     : "";
  console.log(`[HTTP] → ${method} ${url}${params}${body}`);
  return config;
});

// ── 응답 인터셉터: 401 자동 재발급 + 응답 로그 ─────
apiClient.interceptors.response.use(
  (res) => {
    const method = (res.config.method ?? "get").toUpperCase();
    const url    = `${res.config.baseURL ?? ""}${res.config.url ?? ""}`;
    console.log(`[HTTP] ← ${res.status} ${method} ${url} body=${safeBody(res.data)}`);
    return res;
  },
  async (error: AxiosError) => {
    if (error.response) {
      const method = (error.response.config.method ?? "get").toUpperCase();
      const url    = `${error.response.config.baseURL ?? ""}${error.response.config.url ?? ""}`;
      console.warn(`[HTTP] ← ${error.response.status} ${method} ${url} body=${safeBody(error.response.data)}`);
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
