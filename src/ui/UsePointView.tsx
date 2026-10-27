import type { ReactNode } from "react";
import Keypad from "./Keypad";

// 사용 포인트 입력 화면.
//
// 디자인: Figma「커넥트_고객화면_디자인」 06-1 (입력 전) · 06-2 (입력 후).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/UsePointView.tsx 를 함께 고친다.
//
// 수치는 534×854 기준 px 그대로다. 토스 400×640 에는 무대(stage.tsx)가 줄여 맞춘다.
// 이 컴포넌트는 그리기만 한다. 입력값 · 상한 · 회신은 부르는 쪽이 맡는다.

export type UsePointViewProps = {
  payAmount: number;
  /** 입력한 사용 포인트. 0 이면 "사용하실 포인트는 얼마인가요?" */
  usePoint: number;
  /** "보유" 옆 숫자. Figma 06-2 처럼 입력한 만큼 뺀 값을 넘긴다. */
  balance: number;
  onDigit: (d: string) => void;
  onDelete: () => void;
  onDeleteAll: () => void;
  /** 최소 사용 포인트. 1 이상이면 확인 위에 안내 문구를 보인다 (설정이 꺼져 있으면 0). */
  minPoint?: number;
  onAdd: (n: number) => void;
  onAll: () => void;
  canConfirm: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** 팝업 등 화면 위에 덮는 것. */
  children?: ReactNode;
};

export default function UsePointView(p: UsePointViewProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white font-display">
      {/* 닫기 — 오른쪽 위 24 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={p.onClose}
        className="absolute right-[24px] top-[24px] size-[45px]"
      >
        <img src="/icon_close.svg" alt="" width={45} height={45} className="size-[45px]" />
      </button>

      {/* 결제금액 — y=72 */}
      <p className="absolute left-0 right-0 top-[72px] whitespace-nowrap text-center text-[32px] font-medium leading-[1.35] text-ui-text">
        {p.payAmount.toLocaleString()}원 결제
      </p>

      {/* 입력 전: 질문 (y=138, 30 Text Sub) · 입력 후: 사용 포인트 (y=133, 40 Bold Primary) */}
      {p.usePoint < 1 ? (
        <p className="absolute left-0 right-0 top-[138px] whitespace-nowrap text-center text-[30px] font-normal leading-[1.35] text-ui-text-sub">
          사용하실 포인트는 얼마인가요?
        </p>
      ) : (
        <p className="absolute left-0 right-0 top-[133px] whitespace-nowrap text-center text-[40px] font-bold leading-[1.35] text-ui-primary">
          {p.usePoint.toLocaleString()}P
        </p>
      )}

      {/* 보유 — y=204 */}
      <div className="absolute left-[calc(50%+0.5px)] top-[204px] flex -translate-x-1/2 items-center gap-[4px] whitespace-nowrap text-center text-[18px]">
        <span className="font-normal leading-[normal] text-ui-text-sub">보유</span>
        <span className="font-semibold leading-[1.5] tracking-[-0.54px] text-ui-text">{p.balance.toLocaleString()}P</span>
      </div>

      {/* 빠른 입력 — y=243, 150×36 세 개 간격 10 */}
      <div className="absolute left-1/2 top-[243px] flex -translate-x-1/2 items-center gap-[10px]">
        <QuickChip onClick={() => p.onAdd(100)}>+ 100</QuickChip>
        <QuickChip onClick={() => p.onAdd(1000)}>+ 1000</QuickChip>
        <QuickChip onClick={p.onAll}>전액</QuickChip>
      </div>

      {/* 키패드 — y=308 */}
      <Keypad onDigit={p.onDigit} onDelete={p.onDelete} onDeleteAll={p.onDeleteAll} />

      {/* 최소 사용 포인트 안내 — y=682, 18 Text. 최소 사용 포인트 설정을 쓸 때만 */}
      {(p.minPoint ?? 0) > 0 && (
        <p className="absolute left-0 right-0 top-[682px] whitespace-nowrap text-center text-[18px] font-normal leading-[1.4] text-ui-text">
          포인트는 최소 {(p.minPoint ?? 0).toLocaleString()}P부터 사용 가능합니다.
        </p>
      )}

      {/* 확인 — 486×75, 아래 여백 46. 조건이 안 되면 Disabled 색 */}
      <button
        type="button"
        onClick={() => p.canConfirm && p.onConfirm()}
        className={`absolute bottom-[46px] left-1/2 flex h-[75px] w-[486px] -translate-x-1/2 items-center justify-center rounded-[16px] text-[26px] font-bold leading-[1.4] text-white ${
          p.canConfirm ? "bg-ui-primary" : "bg-ui-disabled"
        }`}
      >
        확인
      </button>

      {p.children}
    </div>
  );
}

/** Figma "전액사용" 칩 — 150×36, Surface 바탕, 18 Text Sub. */
function QuickChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[36px] w-[150px] items-center justify-center rounded-[28px] bg-ui-surface active:brightness-95"
    >
      <span className="whitespace-nowrap text-center text-[18px] font-normal leading-[normal] text-ui-text-sub">
        {children}
      </span>
    </button>
  );
}
