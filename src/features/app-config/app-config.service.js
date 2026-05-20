/**
 * AppConfigService — sdk.storage 기반 환경설정 read/write 래퍼.
 *
 * Android: ConfigRepositoryImpl (DataStore Preferences)
 *
 * 책임:
 *   - 키별 기본값 적용
 *   - 타입 변환 (string ↔ number/boolean)
 *   - minPoint > 0 일 때 isMinPointEnabled 자동 동기화
 *
 * 의존: sdk.storage, StorageKeys, StorageDefaults
 */
window.AppConfigService = (function () {

  async function readString(key, fallback) {
    try {
      const item = await sdk.storage.get({ key });
      return item?.value ?? fallback;
    } catch (e) {
      console.warn('[AppConfig] read fail', key, e);
      return fallback;
    }
  }

  async function writeString(key, value) {
    try {
      await sdk.storage.set({ key, value: String(value) });
    } catch (e) {
      console.error('[AppConfig] write fail', key, e);
    }
  }

  // ── 최소 사용 포인트 ─────────────────────────────

  /** @returns {Promise<number>} (저장 없음 → StorageDefaults.MIN_POINT) */
  async function getMinPoint() {
    const raw = await readString(StorageKeys.MIN_POINT, null);
    if (raw === null || raw === undefined || raw === '') return StorageDefaults.MIN_POINT;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : StorageDefaults.MIN_POINT;
  }

  /** @returns {Promise<boolean>} (저장 없음 → StorageDefaults.IS_MIN_POINT_ENABLED) */
  async function isMinPointEnabled() {
    const raw = await readString(StorageKeys.IS_MIN_POINT_ENABLED, null);
    if (raw === null || raw === undefined || raw === '') return StorageDefaults.IS_MIN_POINT_ENABLED;
    return raw === 'true';
  }

  /**
   * minPoint 저장. 0 → IS_MIN_POINT_ENABLED=false, >0 → true 로 자동 동기화.
   * @param {number} minPoint
   */
  async function setMinPoint(minPoint) {
    const n = Math.max(0, parseInt(minPoint, 10) || 0);
    await writeString(StorageKeys.MIN_POINT, n);
    await writeString(StorageKeys.IS_MIN_POINT_ENABLED, n > 0);
    return { minPoint: n, isMinPointEnabled: n > 0 };
  }

  /** 일괄 조회 — AppSession.setConfig 에 전달용. */
  async function getPointUseConfig() {
    const [minPoint, enabled] = await Promise.all([getMinPoint(), isMinPointEnabled()]);
    return { minPoint, isMinPointEnabled: enabled };
  }

  // ── 결과 화면 대기 시간 ─────────────────────────────
  // SDK ResultPage 가 timerMs 를 [3, 10] 초로 clamp 함 (cdn.tossplace.com TIMER_MIN/MAX_SECONDS).

  const TIMEOUT_MIN_SECONDS = 3;
  const TIMEOUT_MAX_SECONDS = 10;

  /** @returns {Promise<number>} 3~10 초 (저장 없음 → StorageDefaults.RESULT_TIMEOUT_SECONDS) */
  async function getResultTimeoutSeconds() {
    const raw = await readString(StorageKeys.RESULT_TIMEOUT_SECONDS, null);
    if (raw === null || raw === undefined || raw === '') return StorageDefaults.RESULT_TIMEOUT_SECONDS;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return StorageDefaults.RESULT_TIMEOUT_SECONDS;
    return Math.min(Math.max(n, TIMEOUT_MIN_SECONDS), TIMEOUT_MAX_SECONDS);
  }

  /** @returns {Promise<number>} ms 단위 */
  async function getResultTimeoutMs() {
    return (await getResultTimeoutSeconds()) * 1000;
  }

  /**
   * 결과 화면 대기 시간 저장.
   * @param {number} seconds — 3~10 사이로 clamp 됨
   * @returns {Promise<number>} 실제 저장된 초
   */
  async function setResultTimeoutSeconds(seconds) {
    const parsed = parseInt(seconds, 10);
    const base = Number.isFinite(parsed) ? parsed : StorageDefaults.RESULT_TIMEOUT_SECONDS;
    const n = Math.min(Math.max(base, TIMEOUT_MIN_SECONDS), TIMEOUT_MAX_SECONDS);
    await writeString(StorageKeys.RESULT_TIMEOUT_SECONDS, n);
    return n;
  }

  return {
    getMinPoint,
    isMinPointEnabled,
    setMinPoint,
    getPointUseConfig,
    getResultTimeoutSeconds,
    getResultTimeoutMs,
    setResultTimeoutSeconds,
  };
})();
