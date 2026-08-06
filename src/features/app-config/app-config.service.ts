/**
 * AppConfigService — sdk.storage 기반 환경설정 read/write 래퍼.
 *
 * PharmPoint Android ConfigRepositoryImpl (DataStore Preferences) 대응.
 *
 * 책임:
 *   - 키별 기본값 적용
 *   - 타입 변환 (string ↔ number/boolean)
 *   - minPoint > 0 일 때 isMinPointEnabled 자동 동기화
 */
import { StorageKeys, StorageDefaults } from "../../shared/constants/storage-keys";

async function readString(key: string, fallback: string | null): Promise<string | null> {
  try {
    const item = await sdk.storage.get({ key });
    return item?.value ?? fallback;
  } catch (e) {
    console.warn("[AppConfig] read fail", key, e);
    return fallback;
  }
}

async function writeString(key: string, value: string | number | boolean): Promise<void> {
  try {
    await sdk.storage.set({ key, value: String(value) });
  } catch (e) {
    console.error("[AppConfig] write fail", key, e);
  }
}

// ── 최소 사용 포인트 ───────────────────────────

export async function getMinPoint(): Promise<number> {
  const raw = await readString(StorageKeys.MIN_POINT, null);
  if (raw === null || raw === "") return StorageDefaults.MIN_POINT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : StorageDefaults.MIN_POINT;
}

export async function isMinPointEnabled(): Promise<boolean> {
  const raw = await readString(StorageKeys.IS_MIN_POINT_ENABLED, null);
  if (raw === null || raw === "") return StorageDefaults.IS_MIN_POINT_ENABLED;
  return raw === "true";
}

/** minPoint 저장. 0 → IS_MIN_POINT_ENABLED=false, >0 → true 로 자동 동기화. */
export async function setMinPoint(minPoint: number): Promise<{ minPoint: number; isMinPointEnabled: boolean }> {
  const n = Math.max(0, parseInt(String(minPoint), 10) || 0);
  await writeString(StorageKeys.MIN_POINT, n);
  await writeString(StorageKeys.IS_MIN_POINT_ENABLED, n > 0);
  return { minPoint: n, isMinPointEnabled: n > 0 };
}

/** 일괄 조회 — AppSession.setConfig 전달용. */
export async function getPointUseConfig(): Promise<{ minPoint: number; isMinPointEnabled: boolean }> {
  const [minPoint, enabled] = await Promise.all([getMinPoint(), isMinPointEnabled()]);
  return { minPoint, isMinPointEnabled: enabled };
}

// ── 대기 화면 매장명 표시 ────────────────────

export async function getShowStoreName(): Promise<boolean> {
  const raw = await readString(StorageKeys.SHOW_STORE_NAME, null);
  return raw === null || raw === "" ? true : raw === "true";
}

// ── 결과 화면 대기 시간 ──────────────────────
// SDK ResultPage 가 timerMs 를 [3, 10] 초로 clamp 함.

const TIMEOUT_MIN_SECONDS = 3;
const TIMEOUT_MAX_SECONDS = 10;

export async function getResultTimeoutSeconds(): Promise<number> {
  const raw = await readString(StorageKeys.RESULT_TIMEOUT_SECONDS, null);
  if (raw === null || raw === "") return StorageDefaults.RESULT_TIMEOUT_SECONDS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return StorageDefaults.RESULT_TIMEOUT_SECONDS;
  return Math.min(Math.max(n, TIMEOUT_MIN_SECONDS), TIMEOUT_MAX_SECONDS);
}

export async function getResultTimeoutMs(): Promise<number> {
  return (await getResultTimeoutSeconds()) * 1000;
}

export async function setResultTimeoutSeconds(seconds: number): Promise<number> {
  const parsed = parseInt(String(seconds), 10);
  const base = Number.isFinite(parsed) ? parsed : StorageDefaults.RESULT_TIMEOUT_SECONDS;
  const n = Math.min(Math.max(base, TIMEOUT_MIN_SECONDS), TIMEOUT_MAX_SECONDS);
  await writeString(StorageKeys.RESULT_TIMEOUT_SECONDS, n);
  return n;
}

// ── 미동작 시 대기 시간 ──────────────────────
// 입력 화면에서 사용자 액션이 없을 때 대기화면으로 이동하기까지의 시간(무동작 타임아웃 duration).
// 결과 화면 타임아웃과 달리 SDK clamp 가 없어 설정값을 그대로 쓴다. (선택지 10~30초)

export async function getInactivityTimeoutSeconds(): Promise<number> {
  const raw = await readString(StorageKeys.INACTIVITY_TIMEOUT_SECONDS, null);
  if (raw === null || raw === "") return StorageDefaults.INACTIVITY_TIMEOUT_SECONDS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : StorageDefaults.INACTIVITY_TIMEOUT_SECONDS;
}

export async function setInactivityTimeoutSeconds(seconds: number): Promise<number> {
  const parsed = parseInt(String(seconds), 10);
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : StorageDefaults.INACTIVITY_TIMEOUT_SECONDS;
  await writeString(StorageKeys.INACTIVITY_TIMEOUT_SECONDS, n);
  return n;
}
