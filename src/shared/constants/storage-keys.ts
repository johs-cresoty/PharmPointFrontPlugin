/**
 * StorageKeys — 로컬 저장소 키 모음.
 *
 * PharmPoint Android ConfigKey (DataStore Preferences key) 대응.
 * 명명 규칙: settings_<feature>_<name> (snake_case)
 */
export const StorageKeys = {
  BAUD_RATE:              "settings_baud_rate",
  SHOW_STORE_NAME:        "settings_show_store_name",
  MIN_POINT:              "settings_min_point",
  IS_MIN_POINT_ENABLED:   "settings_is_min_point_enabled",
  RESULT_TIMEOUT_SECONDS: "settings_result_timeout_seconds",
  INACTIVITY_TIMEOUT_SECONDS: "settings_inactivity_timeout_seconds",
} as const;

export const StorageDefaults = {
  MIN_POINT:              1000,
  IS_MIN_POINT_ENABLED:   true,
  RESULT_TIMEOUT_SECONDS: 5,
  INACTIVITY_TIMEOUT_SECONDS: 30,
} as const;
