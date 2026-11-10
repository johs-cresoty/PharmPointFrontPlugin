/**
 * 단말기 007(장바구니) — CAT 단말기가 시리얼로 보내는 가격표시기 전문의 페이지 해석 · 조립.
 * 명세: cat-cart-display-spec.md (루트)
 *
 * 필드 번호는 terminal-codec.parse 의 fields 기준이다 (fields[0] = CMD 자리, 명세 No 와 1 차이).
 *   [1] 장바구니 번호(4자리)  [2] 페이지 번호  [3] 전체 페이지 수
 *   [4] 조제금액  [5] 일반금액  [6] 추가금액  [7] 할인금액  [8] 적립예상포인트  [9] 합계
 *   [10] 이 페이지의 품목 수
 *   [11~] 품목 수만큼 (상품명, 단가, 수량, 금액) 반복
 *
 * 1,024바이트를 넘는 장바구니는 여러 페이지로 나뉘어 온다. 같은 장바구니의 페이지가
 * 모두 모였을 때만 화면에 넘긴다. 시간으로 기다리지 않는다 — 다른 장바구니의 페이지가
 * 오면 모으던 장바구니를 버리고 새것을 모은다(명세: 다음 007 이 화면을 바로잡는다).
 */
import type { CartData, CartItem } from "./cart-types";

type CartAmounts = Omit<CartData, "items">;

export type TerminalCartPage = {
  cartNo:     string;
  page:       number;
  totalPages: number;
  amounts:    CartAmounts;
  items:      CartItem[];
};

export type CartPageParseResult =
  | { ok: true;  page: TerminalCartPage }
  | { ok: false; reason: string };

const HEADER_FIELDS = 11; // fields[0](CMD 자리) ~ fields[10](품목 수)
const ITEM_FIELDS   = 4;
// 한 프레임이 1,024바이트 이하라 품목 하나에 최소 8바이트(FS 4 + 값 4)를 잡아도 한 페이지 130개를 넘지 않는다.
// 페이지 수는 그보다 훨씬 작다. 깨진 값으로 끝없이 기다리는 일만 막는 상한.
const MAX_PAGES     = 99;

const CART_NO = /^\d{4}$/;
const COUNT   = /^\d{1,4}$/;      // 페이지 번호 · 페이지 수 · 품목 수
const INT     = /^-?\d{1,12}$/;   // 금액 · 포인트 · 수량 (할인은 음수)

/** 007 의 fields → 페이지 1장. 명세와 다르면 이유를 돌려준다(그 프레임은 쓰지 않는다). */
export function parseCartPage(fields: readonly string[]): CartPageParseResult {
  if (fields.length < HEADER_FIELDS) {
    return { ok: false, reason: `필드 수 부족(${fields.length - 1}개, 최소 ${HEADER_FIELDS - 1}개)` };
  }

  const cartNo = fields[1];
  if (!CART_NO.test(cartNo)) return { ok: false, reason: `장바구니 번호가 4자리 숫자가 아님("${cartNo}")` };

  if (!COUNT.test(fields[2]) || !COUNT.test(fields[3])) {
    return { ok: false, reason: `페이지 번호 · 전체 페이지 수가 숫자가 아님("${fields[2]}" / "${fields[3]}")` };
  }
  const page       = Number(fields[2]);
  const totalPages = Number(fields[3]);
  if (totalPages < 1 || totalPages > MAX_PAGES || page < 1 || page > totalPages) {
    return { ok: false, reason: `페이지 번호 범위 오류(${page}/${totalPages})` };
  }

  const amountRaw = fields.slice(4, 10);
  const badAmount = amountRaw.findIndex((v) => !INT.test(v));
  if (badAmount >= 0) {
    return { ok: false, reason: `금액 필드(No ${badAmount + 5})가 정수가 아님("${amountRaw[badAmount]}")` };
  }
  const [dispenseAmount, subtotal, extraAmount, discountAmount, expectedEarnPoint, total] = amountRaw.map(Number);

  if (!COUNT.test(fields[10])) return { ok: false, reason: `품목 수가 숫자가 아님("${fields[10]}")` };
  const itemCount = Number(fields[10]);
  // 마지막 필드 뒤에 FS 를 붙이거나 품목 필드가 빠지면 여기서 걸린다.
  const expected = HEADER_FIELDS + itemCount * ITEM_FIELDS;
  if (fields.length !== expected) {
    return {
      ok: false,
      reason: `필드 수가 품목 수와 맞지 않음(품목 ${itemCount}개 → 필드 ${expected - 1}개여야 하는데 ${fields.length - 1}개)`,
    };
  }

  const items: CartItem[] = [];
  for (let i = 0; i < itemCount; i++) {
    const base = HEADER_FIELDS + i * ITEM_FIELDS;
    const [name, unitPrice, quantity, amount] = fields.slice(base, base + ITEM_FIELDS);
    if (!INT.test(unitPrice) || !INT.test(quantity) || !INT.test(amount)) {
      return { ok: false, reason: `품목 ${i + 1}의 단가 · 수량 · 금액이 정수가 아님` };
    }
    items.push({ name, unitPrice: Number(unitPrice), quantity: Number(quantity), amount: Number(amount) });
  }

  return {
    ok: true,
    page: {
      cartNo, page, totalPages, items,
      amounts: { dispenseAmount, subtotal, extraAmount, discountAmount, expectedEarnPoint, total },
    },
  };
}

export type CartAssembleResult = {
  /** 모든 페이지가 모였으면 화면에 넘길 장바구니, 아니면 null. */
  cart:       CartData | null;
  cartNo:     string;
  received:   number;
  totalPages: number;
  /** 다 모이지 못하고 버린 이전 장바구니 설명 (없으면 null). */
  dropped:    string | null;
};

function sameAmounts(a: CartAmounts, b: CartAmounts): boolean {
  return a.dispenseAmount === b.dispenseAmount && a.subtotal === b.subtotal
    && a.extraAmount === b.extraAmount && a.discountAmount === b.discountAmount
    && a.expectedEarnPoint === b.expectedEarnPoint && a.total === b.total;
}

/** 페이지를 장바구니 단위로 모은다. 상태만 보고 판단하며 타이머는 쓰지 않는다. */
export function createCartAssembler() {
  let cartNo:     string | null = null;
  let totalPages  = 0;
  let amounts:    CartAmounts | null = null;
  let pages       = new Map<number, CartItem[]>();

  function reset(): void {
    cartNo = null;
    totalPages = 0;
    amounts = null;
    pages = new Map();
  }

  function add(p: TerminalCartPage): CartAssembleResult {
    let dropped: string | null = null;

    // 번호 · 페이지 수 · 금액 중 하나라도 다르면 다른 장바구니다(명세: 모든 페이지에 같은 값).
    const sameCart = cartNo === p.cartNo && totalPages === p.totalPages
      && amounts !== null && sameAmounts(amounts, p.amounts);
    if (!sameCart) {
      if (cartNo !== null && pages.size > 0) {
        dropped = `장바구니 ${cartNo}(${pages.size}/${totalPages}페이지만 도착)`;
      }
      cartNo     = p.cartNo;
      totalPages = p.totalPages;
      amounts    = p.amounts;
      pages      = new Map();
    }
    pages.set(p.page, p.items);

    const received = pages.size;
    if (received < p.totalPages) {
      return { cart: null, cartNo: p.cartNo, received, totalPages: p.totalPages, dropped };
    }

    const items: CartItem[] = [];
    for (let i = 1; i <= p.totalPages; i++) items.push(...(pages.get(i) ?? []));
    const cart: CartData = { ...p.amounts, items };
    reset();
    return { cart, cartNo: p.cartNo, received, totalPages: p.totalPages, dropped };
  }

  return { add, reset };
}
