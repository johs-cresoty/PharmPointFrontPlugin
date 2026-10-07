/**
 * 새 디자인 화면을 띄우는 무대.
 *
 * Figma 는 네이버 단말 해상도 534×854 로 그려져 있다. 토스 단말은 400×640 으로
 * 비율(5:8)이 같아, 534×854 크기 그대로 그린 화면을 통째로 줄여 맞춘다.
 * 그래서 화면 코드는 Figma 수치(px)를 그대로 쓰고, 두 플러그인이 같은 값을 공유한다.
 * (토스 실측: 쓸 수 있는 화면 400×640 · 밀도 2배 · 상태바 없음)
 *
 * 무대는 Template API 화면(#app) 위에 덮어 그린다. 한 번에 한 화면만 띄운다.
 *
 * 무대와 별도로 "덮개"(showOverlay)가 있다. 바탕이 투명해 아래 화면(무대든 Template API 든)이
 * 그대로 보이고, 그 위에 팝업만 얹는다 — 무입력 경고 팝업처럼 어느 화면에서나 뜨는 것용.
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

function ensureLayer(id: string, zIndex: number, background: string): HTMLElement {
  let el = document.getElementById(id);
  if (el) return el;

  el = document.createElement("div");
  el.id = id;
  el.className = "pp-stage";
  el.style.cssText =
    `position:fixed;left:0;top:0;z-index:${zIndex};overflow:hidden;background:${background};` +
    `width:${DESIGN_W}px;height:${DESIGN_H}px;transform-origin:0 0;transform:scale(${stageScale()});`;
  document.body.appendChild(el);
  return el;
}

function ensureStage(): HTMLElement {
  return ensureLayer(STAGE_ID, 1000, "#fff");
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
}

/** 새 화면을 내린다. 아래의 Template API 화면이 다시 보인다. */
export function hideScreen(): void {
  window.removeEventListener("hashchange", hideScreen);
  root?.unmount();
  root = null;
  document.getElementById(STAGE_ID)?.remove();
}

// ─── 덮개 — 어느 화면 위에나 팝업만 얹는다 ─────────

const OVERLAY_ID = "pp-overlay";
let overlayRoot: Root | null = null;

/** 팝업을 얹는다. 바탕은 투명하고, 팝업이 스스로 어둡게 깐 부분만 터치를 막는다. */
export function showOverlay(node: ReactNode): void {
  const el = ensureLayer(OVERLAY_ID, 1001, "transparent");
  if (!overlayRoot) overlayRoot = createRoot(el);
  overlayRoot.render(node);
}

export function hideOverlay(): void {
  overlayRoot?.unmount();
  overlayRoot = null;
  document.getElementById(OVERLAY_ID)?.remove();
}
