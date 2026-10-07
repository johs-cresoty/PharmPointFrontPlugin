/**
 * 대기화면을 새 디자인으로 띄운다 (Template API renderIdlePage 대체).
 *
 * 화면은 네이버와 같은 IdleView (Figma 01-1 ~ 01-5).
 * 배경 테마는 환경설정 > 테마설정에서 고른 것 (테마 A~E, src/ui/main-themes).
 *
 * 매장명을 2초 길게 누르면 관리자 비밀번호 팝업(Figma 09-1, AdminPasswordView) →
 * 서버 대조 통과 시 onAdminEnter (환경설정). 네이버 Idle 과 같은 동작이다.
 * 오른쪽 위 구석을 4번 연달아 탭하면 토스 단말 설정 화면(sdk.app.openSetting)을 연다.
 * 구석 영역은 보이지 않는다. 탭 사이가 1초 넘게 벌어지면 처음부터 다시 센다.
 */
import { useRef, useState } from "react";
import { verifyAdminPassword } from "../api/plugin-settings";
import AdminPasswordView from "./AdminPasswordView";
import IdleView from "./IdleView";
import { themeAt } from "./main-themes";
import { showScreen } from "./stage";

/** 매장명 길게 누르기 — 이 시간 동안 누르고 있으면 관리자 팝업. */
const ADMIN_LONG_PRESS_MS = 2000;
/** 오른쪽 위 탭 — 이 횟수만큼 연달아 탭하면 토스 설정. */
const SETTINGS_TAP_COUNT = 4;
/** 탭 사이 간격이 이보다 길면 다시 센다. */
const SETTINGS_TAP_GAP_MS = 1000;
/** 오른쪽 위 탭 영역 크기 (534×854 기준 px). */
const SETTINGS_TAP_AREA = 120;

export type IdleOptions = {
  /** 대기화면 배경 테마 번호 (0 = 테마A). */
  themeIndex: number;
  /** 매장명 (토스 매장 정보). 아직 못 읽었으면 null. */
  storeName: string | null;
  onLookup: () => void;
  /** 관리자 팝업이 열리고 닫힐 때. 열려 있는 동안은 대기 상태가 아니다(가격표시기로 바뀌지 않게). */
  onAdminOpenChange: (open: boolean) => void;
  /** 비밀번호 대조 통과 — 환경설정으로 간다. */
  onAdminEnter: () => void;
  /** 오른쪽 위 4번 탭 — 토스 단말 설정 화면을 연다. */
  onOpenDeviceSettings: () => void;
};

export function showIdle(opts: IdleOptions): void {
  showScreen(<IdleScreen {...opts} />);
}

function IdleScreen(o: IdleOptions) {
  const theme = themeAt(o.themeIndex);
  const [showAdmin, setShowAdmin] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openAdmin = (open: boolean) => {
    setShowAdmin(open);
    o.onAdminOpenChange(open);
  };
  const startPress = () => {
    if (showAdmin) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => openAdmin(true), ADMIN_LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  // 오른쪽 위 연속 탭
  const taps = useRef({ count: 0, last: 0 });
  const onCornerTap = () => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last > SETTINGS_TAP_GAP_MS ? 1 : t.count + 1;
    t.last = now;
    if (t.count >= SETTINGS_TAP_COUNT) {
      t.count = 0;
      o.onOpenDeviceSettings();
    }
  };

  return (
    <IdleView
      image={theme.image}
      objectPosition={theme.objectPosition}
      storeNameGap={theme.storeNameGap}
      storeName={o.storeName}
      onLookup={o.onLookup}
      storeNameProps={{
        onPointerDown: startPress,
        onPointerUp: cancelPress,
        onPointerLeave: cancelPress,
        onPointerCancel: cancelPress,
      }}
    >
      {/* 오른쪽 위 구석 — 보이지 않는 탭 영역 */}
      <button
        type="button"
        aria-label="토스 설정"
        onClick={onCornerTap}
        className="absolute right-0 top-0"
        style={{ width: SETTINGS_TAP_AREA, height: SETTINGS_TAP_AREA }}
      />
      {showAdmin && (
        <AdminPasswordView
          verify={verifyAdminPassword}
          onClose={() => openAdmin(false)}
          onSuccess={() => {
            setShowAdmin(false);
            o.onAdminEnter();
          }}
        />
      )}
    </IdleView>
  );
}
