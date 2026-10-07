/**
 * PriceDisplay 뷰 — 고객 가격표시기 화면.
 *
 * 화면은 네이버와 같은 PriceDisplayView (Figma 02-1 라이트 · 02-2 다크, src/ui).
 * 라이트/다크는 환경설정 > 테마설정의 가격표시 테마(sdk.storage)를 따른다.
 * (예전에는 토스 SDK renderOrderResultPage 를 본뜬 자체 HTML 화면이었다)
 *
 * 렌더 방식:
 *   - 라우터로 진입하면 sessionStorage 의 최신 스냅샷을 그림.
 *   - 이후 CART_UPDATE 수신 시 main 이 updatePriceDisplay(cart) 를 호출해 실시간 갱신.
 */
import { navigate, onCleanup } from "../router";
import type { CartData } from "../pos/cart-types";
import { getPriceDisplayTheme, type PriceDisplayTheme } from "../features/app-config/app-config.service";
import PriceDisplayView from "../ui/PriceDisplayView";
import { hideScreen, showScreen } from "../ui/stage";

/** 현재 스냅샷을 세션에 보관하는 키. 라우터 진입 시 초기 렌더용. */
export const PRICE_DISPLAY_CTX_KEY = "pharm_price_display_ctx";

// 가격표시기가 떠 있는 동안의 상태. 떠 있지 않으면 active=false (갱신 요청은 무시).
let active = false;
let theme: PriceDisplayTheme = "LIGHT";
let current: CartData | null = null;

function draw(): void {
  if (!active || !current) return;
  showScreen(<PriceDisplayView data={current} dark={theme === "DARK"} />);
}

/**
 * 가격표시 테마를 다시 읽어 둔다. 대기화면이 설정을 다시 읽을 때 같이 부른다(home.syncIdleConfig).
 * 미리 읽어 두면 가격표시기를 띄울 때 기다리지 않고 바로 맞는 테마로 그린다.
 */
export async function refreshPriceDisplayTheme(): Promise<void> {
  theme = await getPriceDisplayTheme();
  draw();
}

// ─── 세션 저장소 ─────────────────────────

function loadCart(): CartData | null {
  try {
    const raw = sessionStorage.getItem(PRICE_DISPLAY_CTX_KEY);
    return raw ? (JSON.parse(raw) as CartData) : null;
  } catch { return null; }
}

/** 최신 스냅샷 저장 (라우터 진입 시 초기 렌더용). main 의 onCartUpdate 에서 호출. */
export function saveCart(cart: CartData): void {
  try { sessionStorage.setItem(PRICE_DISPLAY_CTX_KEY, JSON.stringify(cart)); }
  catch (e) { console.warn("[PriceDisplay] sessionStorage 저장 실패", e); }
}

export function clearCart(): void {
  try { sessionStorage.removeItem(PRICE_DISPLAY_CTX_KEY); } catch { /* noop */ }
}

/** 이미 진입한 상태라면 화면을 실시간 갱신한다. 페이지 없으면 no-op. */
export function updatePriceDisplay(cart: CartData): void {
  if (!active) return;
  current = cart;
  draw();
}

// ─── 진입점 ─────────────────────────────

export async function renderPriceDisplay(): Promise<void> {
  const cart = loadCart();
  // 카트 스냅샷이 없거나 상품이 비어 있으면 가격표시기에 진입하지 않고 대기화면 유지.
  // (POS 명세상 CART_UPDATE 는 items 가 있을 때만 오지만, 라우터 직접 진입/새로고침 등의 경로도 방어.)
  if (!cart || cart.items.length === 0) {
    clearCart();
    navigate("/");
    return;
  }

  active = true;
  current = cart;
  onCleanup(() => {
    active = false;
    current = null;
    hideScreen();
  });

  // 대기화면 등 앞 화면을 먼저 내리고 바로 그린다. (앞 화면이 걸어 둔 "주소가 바뀌면 내리기" 를
  // 지워야, 이번 주소 변경 때 새로 띄운 가격표시기가 같이 내려가지 않는다)
  // 테마는 미리 읽어 둔 값으로 그리고, 다시 읽어 바뀌었으면 고쳐 그린다.
  hideScreen();
  draw();
  await refreshPriceDisplayTheme();
}
