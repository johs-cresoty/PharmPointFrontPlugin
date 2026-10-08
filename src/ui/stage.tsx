/**
 * 새 디자인 화면을 띄우는 무대.
 *
 * Figma 는 네이버 단말 해상도 534×854 로 그려져 있다. 토스 단말은 400×640 으로
 * 비율(5:8)이 같아, 534×854 크기 그대로 그린 화면을 통째로 줄여 맞춘다.
 * 그래서 화면 코드는 Figma 수치(px)를 그대로 쓰고, 두 플러그인이 같은 값을 공유한다.
 * (토스 실측: 쓸 수 있는 화면 400×640 · 밀도 2배 · 상태바 없음)
 *
 * 무대는 #app 위에 덮어 그린다(#app 은 비어 있다). 한 번에 한 화면만 띄운다.
 * 팝업은 각 화면이 무대 안에 함께 그린다.
 */
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import "./ui.css";

/** Figma 프레임 크기 (네이버 단말 CSS 해상도). */
const DESIGN_W = 534;
const DESIGN_H = 854;

const STAGE_ID = "pp-stage";

let root: Root | null = null;

function stageScale(): number {
  return Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
}

function ensureStage(): HTMLElement {
  let el = document.getElementById(STAGE_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = STAGE_ID;
  el.className = "pp-stage";
  el.style.cssText =
    "position:fixed;left:0;top:0;z-index:1000;overflow:hidden;background:#fff;" +
    `width:${DESIGN_W}px;height:${DESIGN_H}px;transform-origin:0 0;transform:scale(${stageScale()});`;
  document.body.appendChild(el);
  return el;
}

// ── 화면 전환 가림막 ──────────────────────────────
//
// 화면이 바뀔 때는 앞 화면을 내리고(hideScreen) 다음 화면이 저장소 · 서버 값을 읽은 뒤
// 그린다(showScreen). 그 사이 무대가 비어 아래의 토스 기본 화면이 잠깐 비쳤다
// (대기화면 → 적립 번호 입력에서 눈에 띄었다).
// 그래서 내릴 때 앞 화면을 그대로 본뜬 정지 사본을 잠깐 덮어 둔다. 사본은 그림일 뿐이라
// 눌리지 않고 타이머도 돌지 않는다. 다음 화면이 그려지면 걷고, 끝내 안 오면 시간이 지나 걷는다.

const COVER_ID = "pp-stage-cover";
/** 다음 화면이 이 안에 안 오면 가림막을 걷는다. 그 화면은 무대를 쓰지 않는 것이다. */
const COVER_MAX_MS = 1500;
let coverTimer: ReturnType<typeof setTimeout> | null = null;

function putCover(stage: HTMLElement): void {
  dropScreenCover();
  const cover = stage.cloneNode(true) as HTMLElement;
  cover.id = COVER_ID;
  cover.style.pointerEvents = "none";
  cover.setAttribute("aria-hidden", "true");
  document.body.appendChild(cover);
  coverTimer = setTimeout(dropScreenCover, COVER_MAX_MS);
}

/** 가림막을 바로 걷는다. 무대를 쓰지 않는 화면(바코드 표시 등)은 진입하자마자 부른다. */
export function dropScreenCover(): void {
  if (coverTimer) { clearTimeout(coverTimer); coverTimer = null; }
  document.getElementById(COVER_ID)?.remove();
}

/** 새 화면을 띄운다. 이미 떠 있는 화면은 바뀐다. */
export function showScreen(node: ReactNode): void {
  const el = ensureStage();
  if (!root) {
    root = createRoot(el);
    // 다른 화면으로 넘어가면(캣포스 전문으로 가격표시가 뜨는 경우 등) 무대를 내린다.
    // 무대는 라우터 밖에 있어 라우트 정리(onCleanup)만으로는 남을 수 있다.
    window.addEventListener("hashchange", hideScreen, { once: true });
  }
  root.render(node);
  // 새 화면이 실제로 그려진 다음 프레임에 가림막을 걷는다(그 전에 걷으면 한 프레임 비친다).
  if (document.getElementById(COVER_ID)) {
    requestAnimationFrame(() => requestAnimationFrame(dropScreenCover));
  }
}

/** 새 화면을 내린다. 다음 화면이 그려질 때까지 앞 화면 사본이 덮여 있다. */
export function hideScreen(): void {
  window.removeEventListener("hashchange", hideScreen);
  const el = document.getElementById(STAGE_ID);
  if (root && el) putCover(el);
  root?.unmount();
  root = null;
  el?.remove();
}
