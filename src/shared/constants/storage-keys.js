/**
 * StorageKeys — sdk.storage 키 모음.
 *
 * Android: ConfigKey (DataStore Preferences key)
 *
 * 키 명명 규칙: settings_<feature>_<name>  (snake_case)
 */
window.StorageKeys = Object.freeze({
  BAUD_RATE:            'settings_baud_rate',
  SHOW_STORE_NAME:      'settings_show_store_name',

  // 포인트 사용 — 최소 사용 포인트 (단위: P)
  MIN_POINT:            'settings_min_point',
  // 최소 사용 포인트 활성 여부 ("true" / "false") — MIN_POINT > 0 시 자동 true
  IS_MIN_POINT_ENABLED: 'settings_is_min_point_enabled',

  // renderResultPage 자동 종료 시간 (초 단위, SDK 가 3~10 으로 clamp)
  RESULT_TIMEOUT_SECONDS: 'settings_result_timeout_seconds',
});

window.StorageDefaults = Object.freeze({
  MIN_POINT:            1000,   // Android ConfigRepository.MINIMUM_POINT 기본값과 동일
  IS_MIN_POINT_ENABLED: true,   // Android ConfigRepository.IS_MIN_POINT_ENABLED 기본값과 동일
  RESULT_TIMEOUT_SECONDS: 5,    // 기존 ResultPageService.DEFAULT_TIMEOUT_MS=5000 과 동일
});
