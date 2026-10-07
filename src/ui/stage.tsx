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

/** 새 화면을 내린다. */
export function hideScreen(): void {
  window.removeEventListener("hashchange", hideScreen);
  root?.unmount();
  root = null;
  document.getElementById(STAGE_ID)?.remove();
}
