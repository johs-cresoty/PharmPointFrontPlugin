/**
 * 고객 가격표시기 카트 데이터 타입.
 * CATPOS ↔ 팜포인트 프로토콜 (catpos-cart-display-spec.md §3-1) 필드와 1:1 매칭.
 */

export type CartItem = {
  /** 상품명 */
  name:      string;
  /** 단가(원) — 데이터로는 수신하나 화면에는 표시하지 않음(토스 정책 3열 유지). */
  unitPrice: number;
  /** 수량 */
  quantity:  number;
  /** 라인 합계(원) = unitPrice × quantity */
  amount:    number;
};

export type CartData = {
  items:             CartItem[];
  /** 조제금액(원) */
  dispenseAmount:    number;
  /** 일반금액(원) */
  subtotal:          number;
  /** 추가금액(원) */
  extraAmount:       number;
  /** 할인금액(원) — 할인은 음수 */
  discountAmount:    number;
  /** 적립 예상 포인트(P) — 정보성, 합계 미포함 */
  expectedEarnPoint: number;
  /** 합계(원) — POS 가 계산한 최종 청구액이 기준값 */
  total:             number;
  /** 맨 앞이 최근 스캔 상품인지. CAT 단말기 007 만 true (단말기가 최신순으로 보낸다). 캣포스는 없음(맨 뒤가 최신). */
  newestFirst?:      boolean;
};

/**
 * 가격표시기에 띄울 내용이 있는지.
 *   - 품목이 있으면 띄운다.
 *   - CAT 단말기 007(newestFirst = true)은 품목 없이 조제 · 추가 · 할인 금액만 입력해도 띄운다.
 *     품목 0개에 금액도 모두 0이면 빈 장바구니다(008 과 같음). — cat-cart-display-spec.md
 *   - 캣포스는 품목이 없으면 빈 장바구니다(모든 상품 삭제 등).
 */
export function hasCartToShow(cart: CartData): boolean {
  if (cart.items.length > 0) return true;
  if (cart.newestFirst !== true) return false;
  return [cart.dispenseAmount, cart.subtotal, cart.extraAmount, cart.discountAmount, cart.expectedEarnPoint, cart.total]
    .some((v) => v !== 0);
}

// ─── 파싱 유틸 (수신 raw JSON → CartData) ───

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function toItem(raw: unknown): CartItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    name:      String(r.name ?? ""),
    unitPrice: toNum(r.unitPrice),
    quantity:  toNum(r.quantity),
    amount:    toNum(r.amount),
  };
}

/** CATPOS CART_UPDATE 의 data → CartData. 필드 누락은 0/빈값으로 보정. */
export function parseCartData(raw: Record<string, unknown> | undefined | null): CartData {
  const d = raw ?? {};
  const itemsRaw = Array.isArray(d.items) ? d.items : [];
  return {
    items:             itemsRaw.map(toItem),
    dispenseAmount:    toNum(d.dispenseAmount),
    subtotal:          toNum(d.subtotal),
    extraAmount:       toNum(d.extraAmount),
    discountAmount:    toNum(d.discountAmount),
    expectedEarnPoint: toNum(d.expectedEarnPoint),
    total:             toNum(d.total),
  };
}
