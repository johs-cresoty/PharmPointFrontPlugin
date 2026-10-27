import type { ReactNode } from "react";
import Keypad from "./Keypad";

// 휴대폰 번호 입력 화면 (조회 · 적립 · 사용 · 마케팅 동의 · 처리 중 · 등록된 회원 없음).
//
// 디자인: Figma「커넥트_고객화면_디자인」 20261027_수정본 04-1 ~ 04-4, 05-1, 동의 flow.
// 모든 번호 입력 화면이 아래쪽 동의 영역(모두 동의 · [필수] 개인정보 · [선택] 마케팅)을 쓴다.
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/PhoneInputView.tsx 를 함께 고친다.
//
// 수치는 534×854 기준 px 그대로다. 토스 400×640 에는 무대(stage.tsx)가 줄여 맞춘다.
// 위쪽(제목 · 입력란 · 키패드)은 위에서, 아래쪽(동의 · 확인)은 아래에서 잡아
// 화면 높이가 조금 달라도 확인 버튼이 잘리지 않게 한다.
//
// 이 컴포넌트는 그리기만 한다. 입력값 · 서버 호출 · 회신은 부르는 쪽이 맡는다.

export type PhoneInputHeader =
  /** 제목 한 줄 — 조회 · 마케팅 동의 ("휴대폰 번호를 입력하세요"). */
  | { kind: "title"; text: string }
  /** 결제금액 — 적립 · 사용. estimatePoint 가 1 이상이면 적립예상 배지를 붙인다. */
  | { kind: "pay"; amount: number; estimatePoint?: number | null };

export type PhoneInputViewProps = {
  header: PhoneInputHeader;
  /** 숫자만, 최대 11자리. */
  phone: string;
  /** 입력란 아래 빨간 안내 (예: "등록된 회원이 없습니다"). 있으면 입력란도 오류 모양. */
  notice?: string | null;
  onDigit: (d: string) => void;
  onDelete: () => void;
  onDeleteAll: () => void;
  /** 동의 영역. 체크 상태와 약관 상세 열기는 부르는 쪽이 맡는다. */
  consent: ConsentState;
  canConfirm: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** 팝업 · 약관 상세 등 화면 위에 덮는 것. */
  children?: ReactNode;
};

export type ConsentState = {
  /** [필수] 개인정보 수집 및 동의. */
  required: boolean;
  /** [선택] 마케팅 수신 동의. */
  marketing: boolean;
  onToggleAll: () => void;
  onToggleRequired: () => void;
  onToggleMarketing: () => void;
  /** 항목 오른쪽 ">" — 약관 상세. */
  onOpenDetail: (kind: "privacy" | "marketing") => void;
};

/** 입력란 세그먼트 가운데 x (Figma phone_number_field 안 좌표). */
const SEGMENT_CENTERS = [71, 187.01, 303.02];
const DASH_LEFTS = [125, 241.01];

export default function PhoneInputView(p: PhoneInputViewProps) {
  const digits = p.phone.replace(/\D/g, "");
  const segments = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)];
  const hasError = !!p.notice;

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

      {/* 제목 · 결제금액 — y=69 */}
      <div className="absolute left-0 right-0 top-[69px] flex flex-col items-center gap-[12px]">
        <p className="whitespace-nowrap text-center text-[32px] font-medium leading-[1.35] text-ui-text">
          {p.header.kind === "title" ? p.header.text : `${p.header.amount.toLocaleString()}원 결제`}
        </p>
        {hasError ? (
          <div className="flex items-center gap-[4px]">
            <img src="/icon_notice.svg" alt="" width={27} height={27} className="size-[27px]" />
            <span className="whitespace-nowrap text-center text-[18px] font-semibold leading-[1.5] tracking-[-0.54px] text-ui-error">
              {p.notice}
            </span>
          </div>
        ) : (
          p.header.kind === "pay" &&
          (p.header.estimatePoint ?? 0) > 0 && (
            <div className="flex items-center gap-[4px]">
              {/* Figma point 아이콘 — 27px 틀 안에 23px 원 + 흰 "P" */}
              <span className="relative size-[27px] shrink-0 overflow-hidden">
                <img
                  src="/icon_point_circle.svg"
                  alt=""
                  width={23}
                  height={23}
                  className="absolute left-[calc(50%+0.5px)] top-1/2 size-[23px] -translate-x-1/2 -translate-y-1/2"
                />
                <span className="absolute left-[calc(50%+1px)] top-[calc(50%-10.5px)] -translate-x-1/2 whitespace-nowrap text-center text-[16px] font-black leading-[1.35] text-white">
                  P
                </span>
              </span>
              <span className="whitespace-nowrap text-center text-[18px] font-semibold leading-[1.5] tracking-[-0.54px] text-ui-primary">
                {(p.header.estimatePoint ?? 0).toLocaleString()}P 적립예상
              </span>
            </div>
          )
        )}
      </div>

      {/* 휴대폰 번호 — y=169, 374×66. 오류면 빨간 바탕 · 테두리(안쪽 1.5) */}
      <div
        className={`absolute left-1/2 top-[169px] h-[66px] w-[374px] -translate-x-1/2 overflow-hidden rounded-[12px] ${
          hasError ? "bg-ui-error-surface shadow-[inset_0_0_0_1.5px_#F87C4F]" : "bg-ui-surface-blue"
        }`}
      >
        {segments.map((s, i) => (
          <span
            key={i}
            className="absolute top-[13px] w-[72px] -translate-x-1/2 text-center text-[26px] font-medium leading-[normal] text-ui-text"
            style={{ left: SEGMENT_CENTERS[i] }}
          >
            {s}
          </span>
        ))}
        {DASH_LEFTS.map((x) => (
          <span key={x} className="absolute top-[31.33px] h-[1.335px] w-[8.01px] bg-ui-text" style={{ left: x }} />
        ))}
      </div>

      {/* 키패드 — y=285 */}
      <Keypad onDigit={p.onDigit} onDelete={p.onDelete} onDeleteAll={p.onDeleteAll} />

      {/* 동의 영역 — y=641, 486×92 (아래에서 121) */}
      <ConsentArea {...p.consent} />

      {/* 확인 — 486×75, 아래 여백 33. 조건이 안 되면 Disabled 색. 처리 중이면 돌아가는 아이콘 */}
      <button
        type="button"
        onClick={() => p.canConfirm && !p.loading && p.onConfirm()}
        className={`absolute bottom-[33px] left-1/2 flex h-[75px] w-[486px] -translate-x-1/2 items-center justify-center rounded-[16px] text-[26px] font-bold leading-[1.4] text-white ${
          p.canConfirm || p.loading ? "bg-ui-primary" : "bg-ui-disabled"
        }`}
      >
        {p.loading ? (
          <img
            role="status"
            aria-label="처리 중"
            src="/icon_loading.svg"
            alt=""
            width={35}
            height={35}
            className="size-[35px] animate-spin"
          />
        ) : (
          "확인"
        )}
      </button>

      {p.children}
    </div>
  );
}

/**
 * Figma consent_area_C — 왼쪽 [모두 동의](120) | 오른쪽 [필수] · [선택] 두 줄.
 * 체크 상자와 문구는 눌러서 체크하고, 오른쪽 ">"(52 폭)만 약관 상세를 연다.
 */
function ConsentArea(c: ConsentState) {
  const all = c.required && c.marketing;
  return (
    <div className="absolute bottom-[121px] left-1/2 flex h-[92px] w-[486px] -translate-x-1/2 overflow-hidden rounded-[20px] border border-ui-border bg-white">
      <button
        type="button"
        onClick={c.onToggleAll}
        aria-pressed={all}
        className="flex h-full w-[120px] shrink-0 flex-col items-center justify-center gap-[8px] border-r border-ui-border"
      >
        {/* 32px 원, 체크 19.69 */}
        <span
          className={`flex size-[32px] items-center justify-center rounded-[16px] ${
            all ? "bg-ui-primary" : "border-[2.462px] border-ui-icon-gray"
          }`}
        >
          <img
            src={all ? "/icon_consent_all_on.svg" : "/icon_consent_all_off.svg"}
            alt=""
            width={19.6923}
            height={19.6923}
            className="max-w-none"
          />
        </span>
        <span className="whitespace-nowrap text-[18px] font-medium leading-[25px] text-ui-text">모두 동의</span>
      </button>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ConsentItem
          badge="필수"
          label="개인정보 수집 및 동의"
          checked={c.required}
          onToggle={c.onToggleRequired}
          onOpenDetail={() => c.onOpenDetail("privacy")}
          divider
        />
        <ConsentItem
          badge="선택"
          label="마케팅 수신 동의"
          checked={c.marketing}
          onToggle={c.onToggleMarketing}
          onOpenDetail={() => c.onOpenDetail("marketing")}
        />
      </div>
    </div>
  );
}

function ConsentItem(i: {
  badge: "필수" | "선택";
  label: string;
  checked: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  divider?: boolean;
}) {
  return (
    // Figma 높이 45.5(구분선 포함) · 44.5
    <div className={`flex w-full items-center ${i.divider ? "h-[45.5px] shrink-0 border-b border-ui-border" : "min-h-0 flex-1"}`}>
      <button
        type="button"
        onClick={i.onToggle}
        aria-pressed={i.checked}
        className="flex h-full min-w-0 flex-1 items-center gap-[12px] pl-[18px]"
      >
        {/* 26px 원, 체크 16 */}
        <span
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-[13px] ${
            i.checked ? "bg-ui-primary" : "border-2 border-ui-icon-gray"
          }`}
        >
          <img
            src={i.checked ? "/icon_consent_item_on.svg" : "/icon_consent_item_off.svg"}
            alt=""
            width={16}
            height={16}
            className="max-w-none"
          />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-[8px] overflow-hidden">
          {/* 배지 46×26 — 선택 배지 테두리는 안쪽 1px (높이를 늘리지 않게 그림자로 그린다) */}
          <span
            className={`shrink-0 rounded-full px-[10px] py-[3px] text-[14px] font-medium leading-[20px] ${
              i.badge === "필수"
                ? "bg-ui-surface-blue text-ui-primary"
                : "bg-white text-ui-text-sub shadow-[inset_0_0_0_1px_#CDE7FF]"
            }`}
          >
            {i.badge}
          </span>
          <span className="whitespace-nowrap text-[18px] font-normal leading-[25px] text-ui-text">{i.label}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={i.onOpenDetail}
        aria-label={`${i.label} 자세히 보기`}
        className="flex h-full w-[52px] shrink-0 items-center justify-center"
      >
        <img src="/icon_chevron_right.svg" alt="" width={24} height={24} className="size-[24px]" />
      </button>
    </div>
  );
}
