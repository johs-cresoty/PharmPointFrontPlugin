import type { ReactNode } from "react";

// 마케팅 약관 동의 화면 — 필수 1(개인정보 수집 및 동의) + 선택 1(마케팅 수신 동의).
//
// 디자인: Figma「커넥트_고객화면_디자인」 07-1(체크 전) · 07-2(전체 동의).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/MarketingAgreementView.tsx 를 함께 고친다.
//
// 그리기만 한다. 체크 상태 · 회신은 부르는 쪽이 맡는다.

export type MarketingAgreementViewProps = {
  required: boolean;
  marketing: boolean;
  onToggleAll: () => void;
  onToggleRequired: () => void;
  onToggleMarketing: () => void;
  onOpenDetail: (kind: "privacy" | "marketing") => void;
  onConfirm: () => void;
  onClose: () => void;
  /** 약관 상세 · 팝업 등 화면 위에 덮는 것. */
  children?: ReactNode;
};

export default function MarketingAgreementView(p: MarketingAgreementViewProps) {
  const all = p.required && p.marketing;
  return (
    <div className="relative h-full w-full overflow-hidden bg-white font-display">
      <button
        type="button"
        aria-label="닫기"
        onClick={p.onClose}
        className="absolute right-[24px] top-[24px] size-[45px]"
      >
        <img src="/icon_close.svg" alt="" width={45} height={45} className="size-[45px]" />
      </button>

      {/* 제목 — y=72 */}
      <p className="absolute left-0 right-0 top-[72px] whitespace-nowrap text-center text-[32px] font-medium leading-[1.35] text-ui-text">
        약관에 동의해 주세요
      </p>

      {/* 모두 동의하기 — y=165 */}
      <button type="button" onClick={p.onToggleAll} className="absolute left-[24px] top-[165px] flex items-center gap-[8px]">
        <CheckBox checked={all} />
        <span className="whitespace-nowrap text-[22px] font-semibold leading-[1.35] tracking-[-0.22px] text-ui-text">
          모두 동의하기
        </span>
      </button>

      {/* 구분선 — y=225 */}
      <img
        src="/line_divider.svg"
        alt=""
        width={486}
        height={2}
        className="absolute left-[24px] top-[223px] h-[2px] w-[486px] max-w-none"
      />

      {/* 개별 동의 — y=247 · 301 */}
      <AgreeRow
        top={247}
        checked={p.required}
        label="[필수] 개인정보 수집 및 동의"
        onToggle={p.onToggleRequired}
        onOpenDetail={() => p.onOpenDetail("privacy")}
      />
      <AgreeRow
        top={301}
        checked={p.marketing}
        label="[선택] 마케팅 수신 동의"
        onToggle={p.onToggleMarketing}
        onOpenDetail={() => p.onOpenDetail("marketing")}
      />

      {/* 확인 — 필수 동의 전에는 Disabled */}
      <button
        type="button"
        onClick={() => p.required && p.onConfirm()}
        className={`absolute bottom-[46px] left-1/2 flex h-[75px] w-[486px] -translate-x-1/2 items-center justify-center rounded-[16px] text-[26px] font-bold leading-[1.4] text-white ${
          p.required ? "bg-ui-primary" : "bg-ui-disabled"
        }`}
      >
        확인
      </button>

      {p.children}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <img
      src={checked ? "/icon_check_lg_on.svg" : "/icon_check_lg_off.svg"}
      alt=""
      width={38}
      height={38}
      className="size-[38px] shrink-0"
    />
  );
}

/** 체크 + 문구(누르면 체크) + 오른쪽 끝 ">"(누르면 상세). 행 폭 486. */
function AgreeRow({
  top,
  checked,
  label,
  onToggle,
  onOpenDetail,
}: {
  top: number;
  checked: boolean;
  label: string;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <div className="absolute left-[24px] flex w-[486px] items-center gap-[8px]" style={{ top }}>
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-[8px]">
        <CheckBox checked={checked} />
        <span className="whitespace-nowrap text-center text-[18px] font-normal leading-[1.4] text-ui-text-sub">{label}</span>
      </button>
      <button
        type="button"
        aria-label={`${label} 자세히 보기`}
        onClick={onOpenDetail}
        className="size-[28px] shrink-0"
      >
        <img src="/icon_arrow_right.svg" alt="" width={28} height={28} className="size-[28px]" />
      </button>
    </div>
  );
}
