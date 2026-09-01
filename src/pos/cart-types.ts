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
};

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
