/**
 * 대기화면을 새 디자인으로 띄운다 (Template API renderIdlePage 대체).
 *
 * 화면은 네이버와 같은 IdleView (Figma 01-1 ~ 01-5).
 * 토스에는 아직 테마 설정이 없어 테마A(기본, Figma 01-1)로 고정한다.
 */
import IdleView from "./IdleView";
import { showScreen } from "./stage";

/** 테마A(기본) — 네이버 MAIN_THEMES[0] 과 같은 이미지 · 배치. */
const THEME_A = { image: "/main_1.png", objectPosition: "center", storeNameGap: 25.4 };

export type IdleOptions = {
  /** 매장명. 비우면 표시하지 않는다 (설정 "매장명 표시" 가 꺼져 있을 때). */
  storeName: string | null;
  onLookup: () => void;
};

export function showIdle(opts: IdleOptions): void {
  showScreen(
    <IdleView
      image={THEME_A.image}
      objectPosition={THEME_A.objectPosition}
      storeNameGap={THEME_A.storeNameGap}
      storeName={opts.storeName}
      onLookup={opts.onLookup}
    />,
  );
}
