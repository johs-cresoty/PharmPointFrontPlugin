import type { ReactNode } from "react";

// 안내 · 오류 팝업.
//
// 디자인: Figma「커넥트_고객화면_디자인」 05-2 네 장 (popup01 ~ popup04).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/Popups.tsx 를 함께 고친다.
//
// 팝업은 덮고 있는 화면(534×854) 안에서 absolute 로 그린다 — 토스는 그 화면이 통째로
// 줄어든 무대 안에 있어서, 화면 기준으로 그려야 함께 줄어든다.
// 네 팝업 모두 화면 세로 가운데에 놓인다(Figma).

function PopupFrame({ topPad = 20, children }: { topPad?: number; children: ReactNode }) {
  return (
    // 바깥을 눌러도 닫히지 않는다 — 버튼으로만 닫는다.
    <div className="absolute inset-0 z-50 bg-black/50 font-display" onClick={(e) => e.stopPropagation()}>
      <div
        className="absolute left-1/2 top-1/2 flex w-[486px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[40px] overflow-hidden rounded-[22px] bg-white px-[23px] pb-[30px]"
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

/** Figma popup_btn — 440×75, Primary 바탕 흰 글자. */
function PopupButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[75px] w-full items-center justify-center rounded-[16px] bg-ui-primary text-[26px] font-bold leading-[1.4] text-white"
    >
      {children}
    </button>
  );
}

// 팝업 아이콘은 파일(/icon_*.svg)이 아니라 코드 안에 넣어 둔다.
// 이미지는 처음 화면에 나올 때 받아오는데, 오류 팝업은 네트워크가 끊긴 뒤에야 처음 나와서
// 그때 받으러 가면 실패해 아이콘이 비어 보인다. 코드에 넣어 두면 화면 코드와 함께 이미 받아져 있다.
const svgData = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const WIFI_OFF_SVG = svgData("<svg preserveAspectRatio=\"none\" overflow=\"visible\" style=\"display: block;\" width=\"42\" height=\"42\" viewBox=\"0 0 42 42\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g id=\"popup_icon\"><path id=\"Vector\" d=\"M28.3468 21.0549C27.3441 19.9796 26.1163 19.1389 24.7511 18.5929M32 17.649C30.4959 16.036 28.6543 14.775 26.6066 13.956C24.5589 13.1369 22.3556 12.7801 20.1541 12.9109M16.4772 24.8592C17.2422 24.0382 18.2144 23.4386 19.2915 23.1236C20.3685 22.8085 21.5105 22.7896 22.5974 23.0688M13.738 21.0549C14.9221 19.7844 16.417 18.8445 18.0753 18.3282M10.0848 17.6477C11.2064 16.4455 12.5182 15.4361 13.9677 14.66M11.5705 11.6361L29.227 29.2926M21.043 30.3639C20.7119 30.3639 20.3943 30.2323 20.1602 29.9982C19.926 29.764 19.7945 29.4465 19.7945 29.1154C19.7945 28.7842 19.926 28.4667 20.1602 28.2325C20.3943 27.9984 20.7119 27.8668 21.043 27.8668C21.3742 27.8668 21.6917 27.9984 21.9259 28.2325C22.16 28.4667 22.2915 28.7842 22.2915 29.1154C22.2915 29.4465 22.16 29.764 21.9259 29.9982C21.6917 30.2323 21.3742 30.3639 21.043 30.3639Z\" stroke=\"#F8552C\" stroke-width=\"2.49703\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g></svg>");
const ALERT_SVG = svgData("<svg preserveAspectRatio=\"none\" overflow=\"visible\" style=\"display: block;\" width=\"42\" height=\"42\" viewBox=\"0 0 42 42\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g id=\"popup_icon\"><path id=\"Vector\" d=\"M13.2284 29.1965C12.1141 28.1454 11.2253 26.8879 10.6138 25.4977C10.0024 24.1074 9.68057 22.6121 9.6671 21.099C9.65364 19.586 9.94883 18.0854 10.5354 16.685C11.1221 15.2845 11.9883 14.0122 13.0838 12.9423C14.1792 11.8723 15.4818 11.0262 16.9156 10.4532C18.3494 9.88025 19.8856 9.59193 21.4347 9.60508C22.9838 9.61823 24.5147 9.93258 25.9381 10.5298C27.3615 11.127 28.6488 11.9951 29.725 13.0835C31.8502 15.2327 33.0261 18.1112 32.9996 21.099C32.973 24.0868 31.746 26.9449 29.5829 29.0577C27.4198 31.1705 24.4937 32.369 21.4347 32.3949C18.3757 32.4209 15.4287 31.2723 13.2284 29.1965ZM20.31 15.4424V22.2796H22.6434V15.4424H20.31ZM20.31 24.5586V26.8377H22.6434V24.5586H20.31Z\" fill=\"#F8552C\"/></g></svg>");

const ALERT_ICON = <img src={ALERT_SVG} alt="" width={42} height={42} className="size-[42px]" />;

/**
 * popup01 — 네트워크에 연결할 수 없어요. [닫기]
 * [다시 시도] 는 Figma 에서 뺐다. 플러그인(웹 화면)은 단말 와이파이를 다시 연결할 수 없고,
 * 연결이 돌아오면 고객이 [확인] 을 다시 누르면 된다.
 */
export function NetworkErrorPopup({ onClose }: { onClose: () => void }) {
  return (
    <PopupFrame>
      <PopupHead
        icon={<img src={WIFI_OFF_SVG} alt="" width={42} height={42} className="size-[42px]" />}
        lines={["네트워크에", "연결할 수 없어요"]}
      />
      <div className="flex w-full flex-col gap-[12px]">
        <PopupButton onClick={onClose}>닫기</PopupButton>
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
        <PopupButton onClick={onClose}>닫기</PopupButton>
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
      <PopupButton onClick={onConfirm}>확인</PopupButton>
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
      <PopupButton onClick={onContinue}>계속 사용할게요</PopupButton>
    </PopupFrame>
  );
}
