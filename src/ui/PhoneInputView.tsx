import type { ReactNode } from "react";
import Keypad from "./Keypad";

// 휴대폰 번호 입력 화면 (조회 · 적립 · 사용 · 마케팅 동의 · 처리 중 · 등록된 회원 없음).
//
// 디자인: Figma「커넥트_고객화면_디자인」 04-1 ~ 04-7, 05-1.
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
  /** 개인정보 제공 동의 줄. 마케팅 동의처럼 동의를 따로 받는 화면은 넘기지 않는다. */
  agreement?: { checked: boolean; onToggle: () => void; onOpenDetail: () => void };
  canConfirm: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** 팝업 · 약관 상세 등 화면 위에 덮는 것. */
  children?: ReactNode;
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

      {/* 제목 · 결제금액 — y=72 */}
      <div className="absolute left-0 right-0 top-[72px] flex flex-col items-center gap-[12px]">
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

      {/* 휴대폰 번호 — y=182, 374×66. 오류면 빨간 바탕 · 테두리(안쪽 1.5) */}
      <div
        className={`absolute left-1/2 top-[182px] h-[66px] w-[374px] -translate-x-1/2 overflow-hidden rounded-[12px] ${
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

      {/* 키패드 — y=308 */}
      <Keypad onDigit={p.onDigit} onDelete={p.onDelete} onDeleteAll={p.onDeleteAll} />

      {/* 개인정보 제공 동의 — y=682 (아래에서 144) */}
      {p.agreement && (
        <div className="absolute bottom-[144px] left-0 right-0 flex items-center justify-center gap-[5px]">
          <button type="button" onClick={p.agreement.onToggle} className="flex items-center gap-[5px]">
            <img
              src={p.agreement.checked ? "/icon_check_on.svg" : "/icon_check_off.svg"}
              alt=""
              width={28}
              height={28}
              className="size-[28px]"
            />
            <span className="whitespace-nowrap text-center text-[18px] font-normal leading-[1.4] text-ui-text-sub">
              [필수] 개인정보 제공 동의합니다
            </span>
          </button>
          <button
            type="button"
            onClick={p.agreement.onOpenDetail}
            aria-label="개인정보 수집·이용 동의 자세히 보기"
            className="-ml-[5px] size-[28px]"
          >
            <img src="/icon_arrow_right.svg" alt="" width={28} height={28} className="size-[28px]" />
          </button>
        </div>
      )}

      {/* 확인 — 486×75, 아래 여백 46. 조건이 안 되면 Disabled 색. 처리 중이면 돌아가는 아이콘 */}
      <button
        type="button"
        onClick={() => p.canConfirm && !p.loading && p.onConfirm()}
        className={`absolute bottom-[46px] left-1/2 flex h-[75px] w-[486px] -translate-x-1/2 items-center justify-center rounded-[16px] text-[26px] font-bold leading-[1.4] text-white ${
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
