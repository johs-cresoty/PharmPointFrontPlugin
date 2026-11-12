import { useEffect, useRef } from "react";

// 가격표시기(결제 상품 표시) 화면 — 라이트(Figma 02-1) · 다크(02-2).
//
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/PriceDisplayView.tsx 를 함께 고친다.
// 이 컴포넌트는 그리기만 한다. 데이터(캣포스 · POS 카트)와 테마 설정은 부르는 쪽이 넘긴다.
//
// 크기는 534×854 기준 px 그대로다(토스 400×640 은 무대가 줄여 맞춘다).
// 색은 tailwind.config.js 의 display-* (Figma 변수) 를 쓴다. 폰트는 Noto Sans KR(font-display).
//
// 다크모드는 배치·글자 크기가 라이트와 같고 색만 다르다.
//   - 바탕 Primary(#0D152A) · 위쪽 글자 흰색 · 카드/캡슐 바탕 sub01_dark_mode(rgba(205,231,255,0.2))
//   - 합계 아이콘 흰색. 흰 시트(구매 상품)는 두 모드가 같다.

import {
  focusIndex, isNoItemsLayout, productCount, visibleItems,
  type PriceDisplayData,
} from "./price-display-model";

// 데이터 형식과 표시 규칙(품목 수 · 강조 위치 · 품목없음 판단)은 price-display-model.ts 에 있다.
export type { PriceDisplayData, PriceDisplayItem } from "./price-display-model";

const won = (n: number): string => `${n.toLocaleString()}원`;

export default function PriceDisplayView({ data, dark }: { data: PriceDisplayData; dark: boolean }) {
  // 최근 스캔 상품(강조 행)이 항상 보이도록 상품 목록을 자동 스크롤한다.
  //   캣포스(맨 뒤가 최신) → 맨 아래로, CAT 단말기(맨 앞이 최신) → 맨 위로.
  //   (조제의약품 고정 행 + 바로 아래 최신 상품도 맨 위에서 함께 보인다.)
  // 카트가 바뀔 때마다 새 data 로 리렌더되므로 상품 배열 참조를 의존성에 둔다.
  const newestFirst = data.newestFirst === true;
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = newestFirst ? 0 : el.scrollHeight;
  }, [data.items, newestFirst]);
  // 품목 수 · 강조 · 목록 모두 화면에 그리는 품목 기준이다(캣포스 '추가금액' 줄 제외).
  const items = visibleItems(data.items, newestFirst);
  const newestIndex = focusIndex(items, newestFirst);
  const noItems = isNoItemsLayout(items, data.total);

  return (
    <div
      className={`flex h-full w-full flex-col font-display ${
        dark ? "bg-display-primary text-white" : "bg-display-background text-display-primary"
      }`}
    >
      {/* 합계 라벨 · 적립예상 캡슐.
          두 요소의 세로 중심이 같다(Figma y=36). 캡슐 높이 30px 에 맞춰 줄 높이를
          고정해 두어, 적립예상이 0P 라 캡슐이 사라져도 '합계' 위치가 흔들리지 않게 한다. */}
      <div className="px-[24px] pt-[21px]">
        <div className="flex h-[30px] items-center justify-between">
          <div className="flex items-center gap-[4px]">
            <img src={dark ? "/icon_wallet_dark.svg" : "/icon_wallet.svg"} alt="" width={18} height={18} className="size-[18px]" />
            <span className="text-[17px] font-medium leading-[1.3]">합계</span>
          </div>
          {data.expectedEarnPoint > 0 && <EarnPill point={data.expectedEarnPoint} dark={dark} />}
        </div>
      </div>

      {/* 합계 금액 — 화면 가운데 정렬 (Figma 좌표상 중앙) */}
      <p className="mt-[22px] h-[81px] text-center text-[62px] font-bold leading-[1.3]">
        {won(data.total)}
      </p>

      {noItems ? (
        <>
          {/* 품목 없음 — 금액 요약 세로 4줄(일반 · 조제는 카드, 추가 · 할인은 배경 없음). */}
          <div className="mt-[31px] flex flex-col gap-[15px] px-[24px]">
            <AmountRowLarge label="일반금액" value={data.subtotal} card dark={dark} />
            <AmountRowLarge label="조제금액" value={data.dispenseAmount} card dark={dark} />
            <AmountRowLarge label="추가금액" value={data.extraAmount} card={false} dark={dark} />
            <AmountRowLarge label="할인금액" value={data.discountAmount} card={false} dark={dark} />
          </div>

          {/* 구매 상품 — 화면 맨 아래 72px 시트에 제목만. 글자색은 모드와 무관하게 Primary. */}
          <div className="mt-auto h-[72px] shrink-0 rounded-t-[24px] bg-white text-display-primary">
            <PurchaseTitle count={productCount(items)} />
          </div>
        </>
      ) : (
        <>
          {/* 금액 요약 2×2. 윗줄은 카드, 아랫줄은 배경 없이 표시한다. */}
          <div className="mt-[31px] grid grid-cols-2 gap-x-[12px] gap-y-[5px] px-[24px]">
            <AmountCard label="일반금액" value={data.subtotal} dark={dark} />
            <AmountCard label="조제금액" value={data.dispenseAmount} dark={dark} />
            <AmountPlain label="추가금액" value={data.extraAmount} />
            <AmountPlain label="할인금액" value={data.discountAmount} />
          </div>

          {/* 구매 상품 — 흰 시트가 화면 아래 끝까지. 글자색은 모드와 무관하게 Primary. */}
          <div className="mt-[27px] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[24px] bg-white text-display-primary">
            <PurchaseTitle count={productCount(items)} />

            {/* 상품 목록 (많으면 스크롤).
                스크롤바는 숨긴다. 디자인에 없고, 고객 화면이라 손님이 직접 스크롤하지 않는다.
                카트가 바뀔 때마다 최근 상품 쪽으로 자동 스크롤하는데, 그때마다 막대가 번쩍이는 것도 막는다. */}
            <div
              ref={listRef}
              className="mx-[24px] mb-[46px] mt-[21px] flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {items.map((it, i) => (
                <ProductRow
                  key={i}
                  name={it.name}
                  unitPrice={it.unitPrice}
                  quantity={it.quantity}
                  amount={it.amount}
                  highlight={i === newestIndex} // 최근 스캔 상품 강조
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 구매 상품 시트 제목 — 카트 아이콘 + '구매 상품(n품목)'. */
function PurchaseTitle({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[4px] px-[24px] pt-[26px]">
      <img src="/icon_cart.svg" alt="" width={18} height={18} className="size-[18px]" />
      {/* Figma: 한 글자 덩어리 '구매 상품(6품목)' — 괄호 앞 · 숫자 뒤에 공백 없음 */}
      <span className="text-[16px] font-medium leading-[1.3]">구매 상품({count}품목)</span>
    </div>
  );
}

/** 품목 없음 화면의 금액 한 줄 — 라벨 20px · 금액 30px. card 면 배경 카드. */
function AmountRowLarge({ label, value, card, dark }: { label: string; value: number; card: boolean; dark: boolean }) {
  const bg = card ? (dark ? "bg-display-sub01-dark" : "bg-display-sub01") : "";
  return (
    <div className={`flex items-center justify-between rounded-[12px] px-[10px] py-[12px] leading-[1.4] ${bg}`}>
      <span className="text-[20px] font-medium">{label}</span>
      <span className="text-right text-[30px] font-bold">{won(value)}</span>
    </div>
  );
}

/** 적립예상 캡슐. */
function EarnPill({ point, dark }: { point: number; dark: boolean }) {
  return (
    <span className={`rounded-[20px] ${dark ? "bg-display-sub01-dark" : "bg-display-sub01"} px-[10px] py-[5px] text-[14px] font-bold leading-[1.4]`}>
      적립예상 {point.toLocaleString()}P
    </span>
  );
}

/** 금액 요약 윗줄 — 배경 카드. 값이 아랫줄보다 크다(20px). */
function AmountCard({ label, value, dark }: { label: string; value: number; dark: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-[12px] p-[10px] leading-[1.4] ${
        dark ? "bg-display-sub01-dark" : "bg-display-sub01"
      }`}
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span className="text-[20px] font-bold">{won(value)}</span>
    </div>
  );
}

/** 금액 요약 아랫줄 — 배경 없음. 라벨과 값이 같은 크기(15px). */
function AmountPlain({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] p-[10px] text-[15px] leading-[1.4]">
      <span className="font-medium">{label}</span>
      <span className="font-bold">{won(value)}</span>
    </div>
  );
}

function ProductRow({
  name,
  unitPrice,
  quantity,
  amount,
  highlight,
}: {
  name: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  highlight: boolean;
}) {
  return (
    <div
      className={`shrink-0 rounded-[12px] p-[10px] ${highlight ? "bg-display-secondary" : ""}`}
    >
      <div className="flex items-center justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          {/* Figma 는 상품명 상자를 19px 로 두고 글자(줄높이 21.6px)가 그 밖으로 살짝
              넘치게 그렸다. 행 높이를 맞추려면 상자는 19px 이어야 하는데, 말줄임을 위해
              상자 자체에 overflow:hidden 을 걸면 받침·하강부가 잘린다. 그래서 19px 는
              바깥 상자가 맡고, 말줄임은 안쪽 문단이 맡는다. */}
          <div className="h-[19px]">
            <p className="w-[250px] truncate text-[18px] font-semibold leading-[1.2]">{name}</p>
          </div>
          <p className="text-[12px] font-normal leading-[1.3]">
            {unitPrice.toLocaleString()} × {quantity.toLocaleString()}
          </p>
        </div>
        <p className="shrink-0 text-right text-[18px] font-black leading-[1.3]">{won(amount)}</p>
      </div>
    </div>
  );
}
