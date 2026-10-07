/**
 * Settings 뷰 — 환경설정 화면.
 *
 * 들어오는 길은 두 가지다.
 *   - 고객 화면: 대기화면 매장명 2초 길게 누르기 → 관리자 비밀번호(서버 대조) → #/settings.
 *     [나가기] 는 대기화면으로. 비밀번호를 거치지 않고 주소로 들어오면 대기화면으로 돌려보낸다.
 *   - 토스 관리자 '플러그인 설정'(settings.html): 토스 쪽 인증을 거친다. [나가기] 는 뒤로가기.
 *
 * 화면은 네이버와 같은 SettingsShell · Setting*View (Figma 09-3 · 09-5 · 09-6 · 09-7, src/ui/settings).
 *   - 포인트설정 : 최소 포인트 사용 여부 · 최소 사용 포인트
 *   - 테마설정   : 대기화면 배경 테마(A~E, 미리보기) · 가격표시 테마(라이트/다크)
 *   - 화면대기   : 완료 화면 자동 꺼짐 · 입력 화면 미동작 자동 꺼짐
 * 값은 단말 저장소(sdk.storage)에 둔다. 고객 화면은 대기화면으로 돌아올 때 다시 읽는다.
 *
 * Figma 에 없는 예전 항목(Toss SN · 매장명 표시 · 시리얼 통신 속도 · 진단 보내기)은 뺐다.
 * 매장명은 이제 대기화면에 늘 보인다(길게 눌러 관리자로 들어가는 자리).
 */
import {
  getIdleThemeIndex,
  getInactivityTimeoutSeconds,
  getMinPoint,
  getPriceDisplayTheme,
  getResultTimeoutSeconds,
  isMinPointEnabled,
  setIdleThemeIndex,
  setInactivityTimeoutSeconds,
  setMinPointConfig,
  setPriceDisplayTheme,
  setResultTimeoutSeconds,
} from "../features/app-config/app-config.service";
import { navigate, onCleanup } from "../router";
import { isAdminUnlocked, isSettingsPageEntry } from "../features/admin/admin-session";
import SettingsShell from "../ui/settings/SettingsShell";
import SettingPointView from "../ui/settings/SettingPointView";
import SettingScreenTimeoutView from "../ui/settings/SettingScreenTimeoutView";
import SettingThemeView from "../ui/settings/SettingThemeView";
import { hideScreen, showScreen } from "../ui/stage";

async function loadStoreName(): Promise<string | null> {
  try {
    const m = await sdk.app.getMerchant();
    return m?.name || null;
  } catch {
    return null;
  }
}

export async function renderSettings(): Promise<void> {
  const pageEntry = isSettingsPageEntry();
  if (!pageEntry && !isAdminUnlocked()) {
    navigate("/");
    return;
  }
  onCleanup(() => { hideScreen(); });

  const [enabled, minPoint, autoClose, inactive, themeIndex, priceTheme, storeName] = await Promise.all([
    isMinPointEnabled(),
    getMinPoint(),
    getResultTimeoutSeconds(),
    getInactivityTimeoutSeconds(),
    getIdleThemeIndex(),
    getPriceDisplayTheme(),
    loadStoreName(),
  ]);

  showScreen(
    <SettingsShell
      point={
        <SettingPointView
          initial={{ enabled, minPoint }}
          onSave={(v) => setMinPointConfig(v.enabled, v.minPoint)}
        />
      }
      theme={
        <SettingThemeView
          initial={{ themeIndex, priceTheme }}
          storeName={storeName}
          onSave={async (v) => {
            await setIdleThemeIndex(v.themeIndex);
            await setPriceDisplayTheme(v.priceTheme);
          }}
        />
      }
      timeout={
        <SettingScreenTimeoutView
          initial={{ autoClose, inactive }}
          onSave={async (v) => {
            await setResultTimeoutSeconds(v.autoClose);
            await setInactivityTimeoutSeconds(v.inactive);
          }}
        />
      }
      onExit={() => (pageEntry ? history.back() : navigate("/"))}
    />,
  );
}
