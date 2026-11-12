// 가격표시기 화면(PriceDisplayView)의 데이터 · 표시 규칙.
//
// 화면 컴포넌트 파일에는 컴포넌트만 둔다(개발 중 빠른 새로고침 규칙). 표시 규칙은 화면과
// 진단 기록(describeCartDisplay)이 함께 쓰므로 이 파일에 모은다.
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/price-display-model.ts 를 함께 고친다.

export type PriceDisplayItem = { name: string; unitPrice: number; quantity: number; amount: number };

export type PriceDisplayData = {
  items: PriceDisplayItem[];
  /** 조제금액(원) */
  dispenseAmount: number;
  /** 일반금액(원) */
  subtotal: number;
  /** 추가금액(원) */
  extraAmount: number;
  /** 할인금액(원) — 할인은 음수 */
  discountAmount: number;
  /** 적립 예상 포인트(P). 0 이면 캡슐을 숨긴다 */
  expectedEarnPoint: number;
  /** 합계(원) */
  total: number;
  /**
   * 품목 순서. true 면 맨 앞이 최근 스캔 상품이다(CAT 단말기 007 — 단말기가 최신순으로 보낸다).
   * 없거나 false 면 맨 뒤가 최근 스캔 상품이다(캣포스 CART_UPDATE).
   * 어느 쪽이든 받은 순서 그대로 그리고, 최근 상품을 강조하고 그 자리로 스크롤한다.
   * CAT 단말기에서 조제의약품을 불러오면 '조제의약품' 품목이 맨 앞에 고정되어 온다.
   * 그 뒤에 다른 상품이 있으면 조제의약품 대신 바로 아래 품목(최근 스캔 상품)을 강조한다.
   */
  newestFirst?: boolean;
};

/** CAT 단말기가 조제의약품을 불러오면 맨 앞에 고정해 보내는 품목의 상품명. */
const DISPENSE_ITEM_NAME = "조제의약품";

const isDispenseItem = (item: PriceDisplayItem): boolean => item.name.trim() === DISPENSE_ITEM_NAME;

/** 캣포스가 조제 금액을 한 줄로 묶어 보내는 품목의 상품명에 들어가는 말 (예: '조제합산()'). */
const CATPOS_DISPENSE_SUM_KEYWORD = "조제합산";

/** 품목 수에서 빼는 조제 줄 — CAT '조제의약품' · 캣포스 '조제합산…'. */
const isDispenseLine = (item: PriceDisplayItem): boolean =>
  isDispenseItem(item) || item.name.includes(CATPOS_DISPENSE_SUM_KEYWORD);

/** '구매 상품(n품목)' 의 n — 상품 줄 수. 수량은 더하지 않고, 조제 줄은 세지 않는다. */
export function productCount(items: readonly PriceDisplayItem[]): number {
  return items.filter((item) => !isDispenseLine(item)).length;
}

/** 캣포스가 추가금액을 품목 줄로 보낼 때 상품명에 들어가는 말. 금액 카드(추가금액)에 이미 보이므로 목록에서는 뺀다. */
const CATPOS_EXTRA_AMOUNT_KEYWORD = "추가금액";

/** 목록에 그릴 품목 — 캣포스(newestFirst 아님)는 '추가금액' 줄을 뺀다. CAT 단말기는 받은 그대로. */
export function visibleItems(items: readonly PriceDisplayItem[], newestFirst: boolean): readonly PriceDisplayItem[] {
  if (newestFirst) return items;
  return items.filter((item) => !item.name.includes(CATPOS_EXTRA_AMOUNT_KEYWORD));
}

/** 강조할 품목 위치 — 최근 스캔 상품. */
export function focusIndex(items: readonly PriceDisplayItem[], newestFirst: boolean): number {
  if (!newestFirst) return items.length - 1;
  // 맨 앞의 조제의약품은 고정 행이라, 그 밑에 상품이 있으면 그 상품이 최신이다.
  if (items.length > 1 && isDispenseItem(items[0])) return 1;
  return 0;
}

/**
 * 품목 없이 금액만 있는 장바구니인지 (Figma Type_D_품목없음 · Type_D_품목없음_다크모드).
 * 그릴 품목이 없고 합계가 0이 아니면, 금액 요약을 세로 4줄로 크게 보이고 구매 상품 시트는 제목만 둔다.
 */
export function isNoItemsLayout(items: readonly PriceDisplayItem[], total: number): boolean {
  return items.length === 0 && total !== 0;
}

/**
 * 진단 기록용 한 줄 — 이 장바구니를 화면이 어떻게 그리는지. 화면과 같은 함수로 계산한다.
 * "품목 수가 이상하다 · 강조가 엉뚱하다 · 품목없음 화면이 안 뜬다" 문의를 기록만으로 가르기 위함.
 * 상품명은 싣지 않는다(줄 수 · 위치 · 화면 형태만).
 *   예) 받은 4줄 · 표시 3줄(추가금액 1줄 숨김) · 2품목(조제 줄 1) · 강조 3번째 · 일반 화면
 */
export function describeCartDisplay(data: PriceDisplayData): string {
  const newestFirst = data.newestFirst === true;
  const items       = visibleItems(data.items, newestFirst);
  const hidden      = data.items.length - items.length;
  const dispense    = items.filter(isDispenseLine).length;
  return [
    `받은 ${data.items.length}줄`,
    `표시 ${items.length}줄${hidden > 0 ? `(추가금액 ${hidden}줄 숨김)` : ""}`,
    `${productCount(items)}품목${dispense > 0 ? `(조제 줄 ${dispense})` : ""}`,
    items.length > 0 ? `강조 ${focusIndex(items, newestFirst) + 1}번째` : "강조 없음",
    isNoItemsLayout(items, data.total) ? "품목없음 화면" : "일반 화면",
  ].join(" · ");
}
