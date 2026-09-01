/**
 * PriceDisplay 뷰 — 고객 가격표시기 화면.
 *
 * 토스 SDK `renderOrderResultPage` UI 를 자체 HTML/CSS 로 카피한 표시 전용 화면.
 * (토스에서 자체 구현 허용을 받아 진행 — catpos-cart-display-spec.md 참고)
 *
 * 차이점(토스 원본 대비):
 *   - CTA 버튼 없음 (표시 전용)
 *   - 합계 라벨 "합계" ("결제 금액" 아님)
 *   - 나머지 정책(상품행 3열·하이라이트 없음·blue/red 색상)은 원본 그대로
 *
 * 렌더 방식:
 *   - 라우터로 진입하면 sessionStorage 의 최신 스냅샷을 그림.
 *   - 이후 CART_UPDATE 수신 시 main 이 updatePriceDisplay(cart) 를 호출해 실시간 갱신.
 */
import { navigate, onCleanup } from "../router";
import type { CartData } from "../pos/cart-types";

const STYLE_ID     = "pharm-price-display-style";
const CONTAINER_ID = "pharm-price-display-container";

/** 현재 스냅샷을 세션에 보관하는 키. 라우터 진입 시 초기 렌더용. */
export const PRICE_DISPLAY_CTX_KEY = "pharm_price_display_ctx";

// ─── 스타일 (토스 renderOrderResultPage 참고) ───

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  // 사이즈 정책 — 레퍼런스 이미지 비율에 맞춰 조정.
  //  · 400×640 body(index.html 은 실장비 1280×800 로 스케일) 기준.
  //  · items-card 와 summary-card 의 좌우 padding 을 동일(28px)하게 맞춰 우측 정렬 통일.
  //  · 그리드 컬럼 폭 고정 → 상품명 길이에 무관하게 수량/금액 X 좌표 유지.
  //  · 합계 위 border-top 은 레퍼런스에 없어 제거.
  s.textContent = `
    body.pharm-price-display-active { background:#f5f5f5; margin:0; }
    #${CONTAINER_ID} {
      width:100%; height:100%;
      display:flex; flex-direction:column;
      background:#f5f5f5;
      font-family:"Toss Product Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color:#191f28;
      box-sizing:border-box;
      overflow:hidden;
    }
    /* 상품 목록 영역 — 흰 배경. 상단 여백은 레퍼런스와 유사하게 넉넉히. */
    #${CONTAINER_ID} .items-card {
      background:#fff;
      padding:32px 28px 20px;
      flex:1 1 auto;
      overflow-y:auto;
      min-height:0;
      /* 스크롤바 숨김 — 표시 전용 화면이라 손가락 스크롤 없이 draw() 가 자동으로
         하단으로 스크롤하므로 스크롤바 자체가 시각적 노이즈. Toss 디자인 톤과도 일치. */
      scrollbar-width:none;              /* Firefox */
      -ms-overflow-style:none;           /* IE/legacy Edge */
    }
    #${CONTAINER_ID} .items-card::-webkit-scrollbar { display:none; }  /* Chrome/Safari/webview */
    #${CONTAINER_ID} .items-empty {
      display:flex; align-items:center; justify-content:center;
      height:100%;
      color:#8b95a1; font-size:15px;
    }
    /* 상품행 — 3열 그리드로 X 좌표 고정.
       레퍼런스: 이름(굵게) · 수량(얇게, 회색) · 금액(중간굵기, 검정, 우측정렬). */
    #${CONTAINER_ID} .item-row {
      display:grid;
      grid-template-columns: 1fr 44px 96px;
      gap:16px; align-items:baseline;
      padding:10px 0;
    }
    #${CONTAINER_ID} .item-name {
      font-size:17px; font-weight:600; color:#191f28;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    #${CONTAINER_ID} .item-qty  { font-size:17px; font-weight:400; color:#8b95a1; text-align:center; }
    #${CONTAINER_ID} .item-amt  { font-size:17px; font-weight:500; text-align:right; color:#191f28; }

    /* 요약 영역 — 회색 배경(#f5f5f5, 컨테이너 배경 그대로 노출).
       좌우 padding 은 items-card 와 동일(28px)해서 우측 값 라인이 상품 금액과 정확히 정렬됨. */
    #${CONTAINER_ID} .summary-card {
      margin:0;
      padding:20px 28px 24px;
      flex-shrink:0;
    }
    #${CONTAINER_ID} .summary-row {
      display:flex; justify-content:space-between; align-items:baseline;
      padding:7px 0;
      font-size:15px;
    }
    #${CONTAINER_ID} .summary-row .label { color:#191f28; font-weight:400; }
    #${CONTAINER_ID} .summary-row .value { font-weight:600; color:#191f28; }
    #${CONTAINER_ID} .summary-row.theme-blue .value { color:#3182f6; }
    #${CONTAINER_ID} .summary-row.theme-red  .value { color:#f04452; }

    /* 합계 — 라벨은 살짝 크게(중간굵기), 값은 훨씬 크고 굵게. 구분선 없음(레퍼런스대로). */
    #${CONTAINER_ID} .summary-total {
      display:flex; justify-content:space-between; align-items:baseline;
      margin-top:10px; padding-top:6px;
    }
    #${CONTAINER_ID} .summary-total .label { font-size:17px; font-weight:500; color:#191f28; }
    #${CONTAINER_ID} .summary-total .value { font-size:28px; font-weight:700; color:#191f28; }
  `;
  document.head.appendChild(s);
}

function hideAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  document.body.classList.add("pharm-price-display-active");
}

function restoreAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "";
  document.body.classList.remove("pharm-price-display-active");
}

// 컨테이너는 #app 옆(같은 body 하위)에 삽입하고 body(400×640) 스타일을 상속받도록
// width/height 를 body 와 동일한 400×640 로 명시한다.
// (전에는 position:fixed inset:0 이라 실장비 뷰포트 전체를 잡아 body 밖으로 넘쳤음.)
function mountContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (el) { el.style.display = ""; return el; }
  el = document.createElement("div");
  el.id = CONTAINER_ID;
  el.style.width  = "400px";
  el.style.height = "640px";
  document.body.appendChild(el);
  return el;
}

function removeContainer(): void {
  document.getElementById(CONTAINER_ID)?.remove();
}

// ─── 렌더 ─────────────────────────────

const won = (n: number): string => `${(n || 0).toLocaleString("ko-KR")}원`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

function itemsHtml(cart: CartData): string {
  // 빈 카트는 이 화면에 도달하지 않는다(대기화면으로 복귀). 방어용 폴백만 남긴다.
  if (!cart.items.length) return "";
  // 토스 원본 상품행은 금액에 "원" 단위를 붙이지 않는다 (요약·합계에는 붙임).
  return cart.items.map((it) => `
    <div class="item-row">
      <div class="item-name">${escapeHtml(it.name)}</div>
      <div class="item-qty">${it.quantity}</div>
      <div class="item-amt">${(it.amount || 0).toLocaleString("ko-KR")}</div>
    </div>
  `).join("");
}

/** summary.items — 라벨+값+테마. 적립예상은 0P 일 때 숨김(정보성이라 없어도 무해). */
function summaryRows(cart: CartData): string {
  const rows: Array<{ label: string; value: string; theme: "blue" | "red" }> = [
    { label: "조제금액", value: won(cart.dispenseAmount), theme: "blue" },
    { label: "일반금액", value: won(cart.subtotal),       theme: "blue" },
    { label: "추가금액", value: won(cart.extraAmount),    theme: "blue" },
    { label: "할인금액", value: won(cart.discountAmount), theme: "red"  },
  ];
  if ((cart.expectedEarnPoint || 0) > 0) {
    rows.push({
      label: "적립예상",
      value: `${cart.expectedEarnPoint.toLocaleString("ko-KR")}P`,
      theme: "blue",
    });
  }
  return rows.map((r) => `
    <div class="summary-row theme-${r.theme}">
      <span class="label">${r.label}</span>
      <span class="value">${escapeHtml(r.value)}</span>
    </div>
  `).join("");
}

function draw(container: HTMLElement, cart: CartData): void {
  container.innerHTML = `
    <div class="items-card">${itemsHtml(cart)}</div>
    <div class="summary-card">
      ${summaryRows(cart)}
      <div class="summary-total">
        <span class="label">합계</span>
        <span class="value">${won(cart.total)}</span>
      </div>
    </div>
  `;
  // 신규 상품 스캔 시 최신 항목이 항상 보이도록 상품 목록 영역을 하단으로 자동 스크롤.
  // (표시 전용 화면이라 고객이 직접 스크롤할 수 없기 때문에 필수.)
  const itemsCard = container.querySelector<HTMLElement>(".items-card");
  if (itemsCard) itemsCard.scrollTop = itemsCard.scrollHeight;
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
  const el = document.getElementById(CONTAINER_ID);
  if (!el) return;
  draw(el, cart);
}

// ─── 진입점 ─────────────────────────────

export function renderPriceDisplay(): void {
  const cart = loadCart();
  // 카트 스냅샷이 없거나 상품이 비어 있으면 가격표시기에 진입하지 않고 대기화면 유지.
  // (POS 명세상 CART_UPDATE 는 items 가 있을 때만 오지만, 라우터 직접 진입/새로고침 등의 경로도 방어.)
  if (!cart || cart.items.length === 0) {
    clearCart();
    navigate("/");
    return;
  }

  ensureStyles();
  hideAppShell();
  const el = mountContainer();
  draw(el, cart);

  onCleanup(() => {
    removeContainer();
    restoreAppShell();
  });
}
