/**
 * StorageKeys — 로컬 저장소 키 모음.
 *
 * PharmPoint Android ConfigKey (DataStore Preferences key) 대응.
 * 명명 규칙: settings_<feature>_<name> (snake_case)
 */
export const StorageKeys = {
  MIN_POINT:              "settings_min_point",
  IS_MIN_POINT_ENABLED:   "settings_is_min_point_enabled",
  RESULT_TIMEOUT_SECONDS: "settings_result_timeout_seconds",
  INACTIVITY_TIMEOUT_SECONDS: "settings_inactivity_timeout_seconds",
  /** 대기화면 배경 테마 (0~4 = 테마 A~E, src/ui/main-themes) */
  IDLE_THEME_INDEX:       "settings_idle_theme_index",
  /** 가격표시 테마 "LIGHT" | "DARK" */
  PRICE_DISPLAY_THEME:    "settings_price_display_theme",
} as const;

export const StorageDefaults = {
  MIN_POINT:              1000,
  IS_MIN_POINT_ENABLED:   true,
  RESULT_TIMEOUT_SECONDS: 5,
  INACTIVITY_TIMEOUT_SECONDS: 30,
  IDLE_THEME_INDEX:       0,
  PRICE_DISPLAY_THEME:    "LIGHT",
} as const;
