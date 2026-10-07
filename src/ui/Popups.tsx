import type { ReactNode } from "react";

// 안내 · 오류 팝업.
//
// 디자인: Figma「커넥트_고객화면_디자인」 05-2 네 장 (popup01 ~ popup04).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/Popups.tsx 를 함께 고친다.
//
// 팝업은 덮고 있는 화면(534×854) 안에서 absolute 로 그린다 — 토스는 그 화면이 통째로
// 줄어든 무대 안에 있어서, 화면 기준으로 그려야 함께 줄어든다.
// 네 팝업 모두 위쪽이 y=190 에서 시작한다(Figma 좌표).

function PopupFrame({ topPad = 20, children }: { topPad?: number; children: ReactNode }) {
  return (
    // 바깥을 눌러도 닫히지 않는다 — 버튼으로만 닫는다.
    <div className="absolute inset-0 z-50 bg-black/50 font-display" onClick={(e) => e.stopPropagation()}>
      <div
        className="absolute left-1/2 top-[190px] flex w-[486px] -translate-x-1/2 flex-col items-center gap-[40px] overflow-hidden rounded-[22px] bg-white px-[23px] pb-[30px]"
        style={{ paddingTop: topPad }}
      >
        {children}
      </div>
    </div>
  );
}

/** 아이콘 + 두 줄 제목. */
function PopupHead({ icon, lines }: { icon?: ReactNode; lines: [string, string] }) {
  return (
    <div className="flex flex-col items-center gap-[4px]">
      {icon}
      <p className="whitespace-nowrap text-center text-[28px] font-medium leading-[1.35] tracking-[-0.28px] text-ui-text">
        {lines[0]}
        <br />
        {lines[1]}
      </p>
    </div>
  );
}

function PopupButton({ kind, onClick, children }: { kind: "primary" | "close"; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[75px] w-full items-center justify-center rounded-[16px] text-[26px] font-bold leading-[1.4] ${
        kind === "primary" ? "bg-ui-primary text-white" : "bg-ui-surface-blue text-ui-text-sub"
      }`}
    >
      {children}
    </button>
  );
}

const ALERT_ICON = <img src="/icon_popup_alert.svg" alt="" width={42} height={42} className="size-[42px]" />;

/** popup01 — 네트워크에 연결할 수 없어요. [다시 시도] [닫기] */
export function NetworkErrorPopup({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <PopupFrame>
      <PopupHead
        icon={<img src="/icon_wifi_off.svg" alt="" width={42} height={42} className="size-[42px]" />}
        lines={["네트워크에", "연결할 수 없어요"]}
      />
      <div className="flex w-full flex-col gap-[12px]">
        <PopupButton kind="primary" onClick={onRetry}>다시 시도</PopupButton>
        <PopupButton kind="close" onClick={onClose}>닫기</PopupButton>
      </div>
    </PopupFrame>
  );
}

/** popup02 — 일시적인 서버 오류가 발생했어요. [닫기] */
export function ServerErrorPopup({ onClose }: { onClose: () => void }) {
  return (
    <PopupFrame>
      <PopupHead icon={ALERT_ICON} lines={["일시적인 서버 오류가", "발생했어요"]} />
      <div className="flex w-full flex-col gap-[12px]">
        <PopupButton kind="close" onClick={onClose}>닫기</PopupButton>
      </div>
    </PopupFrame>
  );
}

/** popup03 — 포인트를 사용할 수 없어요 (결제 금액 < 최소 사용 포인트). [확인] */
export function PointUnavailablePopup({
  payAmount,
  minPoint,
  onConfirm,
}: {
  payAmount: number;
  minPoint: number;
  onConfirm: () => void;
}) {
  return (
    <PopupFrame>
      <div className="flex w-full flex-col items-center gap-[68px]">
        <PopupHead icon={ALERT_ICON} lines={["포인트를", "사용할 수 없어요"]} />
        {/* 금액 두 줄 — 높이 80, 안쪽 좌우 30 */}
        <div className="flex h-[80px] w-full flex-col justify-center gap-[15px] px-[30px] text-[20px] leading-[1.35] tracking-[-0.2px]">
          <div className="flex items-center justify-between whitespace-nowrap">
            <span className="font-medium text-ui-text-sub">이번 결제 금액</span>
            <span className="font-semibold text-ui-text">{payAmount.toLocaleString()}원</span>
          </div>
          <div className="flex items-center justify-between whitespace-nowrap">
            <span className="font-medium text-ui-text-sub">최소 사용 포인트</span>
            <span className="font-semibold text-ui-error">{minPoint.toLocaleString()}P</span>
          </div>
        </div>
      </div>
      <PopupButton kind="primary" onClick={onConfirm}>확인</PopupButton>
    </PopupFrame>
  );
}

/** popup04 — 대기화면으로 이동합니다 + 남은 초. [계속 사용할게요] */
export function InactivityPopup({ remaining, onContinue }: { remaining: number; onContinue: () => void }) {
  return (
    <PopupFrame topPad={66}>
      <div className="flex flex-col items-center gap-[10px] text-center font-medium">
        <p className="whitespace-nowrap text-[28px] leading-[1.35] tracking-[-0.28px] text-ui-text">
          대기화면으로
          <br />
          이동합니다
        </p>
        <p className="text-[60px] leading-[1.2] tracking-[-0.6px] text-ui-primary">{remaining}</p>
      </div>
      <PopupButton kind="primary" onClick={onContinue}>계속 사용할게요</PopupButton>
    </PopupFrame>
  );
}
