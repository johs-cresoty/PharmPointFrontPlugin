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
});

window.StorageDefaults = Object.freeze({
  MIN_POINT:            1000,   // Android ConfigRepository.MINIMUM_POINT 기본값과 동일
  IS_MIN_POINT_ENABLED: true,   // Android ConfigRepository.IS_MIN_POINT_ENABLED 기본값과 동일
});
