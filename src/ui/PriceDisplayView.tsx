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
};

const won = (n: number): string => `${n.toLocaleString()}원`;

export default function PriceDisplayView({ data, dark }: { data: PriceDisplayData; dark: boolean }) {
  // 최근 스캔 상품(강조 행)이 항상 보이도록 상품 목록 컨테이너를 하단으로 자동 스크롤.
  // 카트가 바뀔 때마다 새 data 로 리렌더되므로 상품 배열 참조를 의존성에 둔다.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data.items]);

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

      {/* 금액 요약 2×2. 윗줄은 카드, 아랫줄은 배경 없이 표시한다. */}
      <div className="mt-[31px] grid grid-cols-2 gap-x-[12px] gap-y-[5px] px-[24px]">
        <AmountCard label="일반금액" value={data.subtotal} dark={dark} />
        <AmountCard label="조제금액" value={data.dispenseAmount} dark={dark} />
        <AmountPlain label="추가금액" value={data.extraAmount} />
        <AmountPlain label="할인금액" value={data.discountAmount} />
      </div>

      {/* 구매 상품 — 흰 시트가 화면 아래 끝까지. 글자색은 모드와 무관하게 Primary. */}
      <div className="mt-[27px] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[24px] bg-white text-display-primary">
        <div className="flex items-center gap-[4px] px-[24px] pt-[26px]">
          <img src="/icon_cart.svg" alt="" width={18} height={18} className="size-[18px]" />
          <span className="text-[16px] font-medium leading-[1.3]">구매 상품</span>
        </div>

        {/* 상품 목록 (많으면 스크롤).
            스크롤바는 숨긴다. 디자인에 없고, 고객 화면이라 손님이 직접 스크롤하지 않는다.
            CART_UPDATE 마다 맨 아래로 자동 스크롤하는데, 그때마다 막대가 번쩍이는 것도 막는다. */}
        <div
          ref={listRef}
          className="mx-[24px] mb-[46px] mt-[21px] flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {data.items.map((it, i) => (
            <ProductRow
              key={i}
              name={it.name}
              unitPrice={it.unitPrice}
              quantity={it.quantity}
              amount={it.amount}
              highlight={i === data.items.length - 1} // 최근 스캔 상품 강조
            />
          ))}
        </div>
      </div>
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
