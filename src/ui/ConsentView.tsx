import type { ReactNode } from "react";
import { canAgree, isAllChecked, type ConsentChecks, type ConsentKey } from "./consent-terms";

// 약관 동의 화면 — 만 14세 확인 · 필수 1 · 선택 3 을 받는다.
//
// 디자인: Figma「커넥트_고객화면_디자인」 동의 개편 플로우 07-2 (디자인 메모 반영안_네이버, node 369:1293).
//   체크 해제 상자는 07-1 (node 369:1217) 의 회색 상자.
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/ConsentView.tsx 를 함께 고친다.
//
// 수치는 534×854 기준 px 그대로다. 항목 영역(y 88 ~ 750)은 매장명이 길어 줄이 늘어도
// 버튼을 가리지 않게 그 안에서만 세로로 스크롤한다.
//
// 항목은 제목 줄과 그 아래 내용 어디를 눌러도 체크·해제된다. [전문 보기 ›] 만 약관 전문을 연다.
// Figma 의 오른쪽 위 X 는 [동의 안함] 과 같은 동작이라 두지 않는다.
//
// 이 컴포넌트는 그리기만 한다. 체크 상태 · 이동 · 회신은 부르는 쪽이 맡는다.

export type ConsentViewProps = {
  /** 제목 아래 안내 (흐름마다 다르다). */
  subtitle: string;
  /** "○○약국" 자리에 들어갈 매장명. */
  storeName: string;
  checks: ConsentChecks;
  onToggleAll: () => void;
  onToggle: (key: keyof ConsentChecks) => void;
  /** 항목의 [전문 보기 ›]. */
  onOpenTerms: (key: ConsentKey) => void;
  onAgree: () => void;
  /** [동의 안함]. 같은 일을 하는 X 버튼은 두지 않는다. */
  onDecline: () => void;
  /** 약관 전문 · 팝업 등 화면 위에 덮는 것. */
  children?: ReactNode;
};

/** 본문 조각 — 문자열은 보통 글씨, { b } 는 굵고 진한 글씨. */
type Part = string | { b: string };

type Item = {
  key: ConsentKey;
  required: boolean;
  title: string;
  /** 줄마다 하나. */
  lines: Part[][];
  /** 줄 사이 간격 (크레소티 항목만 3). */
  gap?: boolean;
};

function items(store: string): Item[] {
  return [
    {
      key: "privacy",
      required: true,
      title: "약국 서비스 개인정보 수집·이용 동의",
      lines: [
        [`처리자: ${store} / 항목: 휴대전화번호, 포인트 내역`],
        ["목적: 포인트 등록·적립·사용·조회"],
        [{ b: "보유: 회원 탈퇴 시 또는 최종 거래일로부터 5년 중 먼저 도래하는 때" }],
        [{ b: "동의하지 않으면 포인트가 적립되지 않습니다." }],
      ],
    },
    {
      key: "medication",
      required: false,
      title: "복약안내 문자 받기 (개인정보 수집·이용 포함)",
      lines: [
        [`처리자: ${store} / 항목: 휴대전화번호 / 내용: 복약안내 문자(팜페이 확인 링크) · 광고 아님`],
        [{ b: "보유: 철회·복약안내 서비스 종료·목적 달성 중 먼저 도래하는 때" }, ` / 발송: ${store} (대행 크레소티)`],
      ],
    },
    {
      key: "pharmacyAd",
      required: false,
      title: "광고성 정보 수신 동의 — 혜택 안내 문자 (개인정보 이용 포함)",
      lines: [
        [`처리자: ${store} / 항목: 휴대전화번호 / 내용: 할인·쿠폰 이벤트·포인트 안내`],
        [
          { b: "보유: 철회·포인트 탈퇴·해당 광고 서비스 종료·목적 달성 중 먼저 도래하는 때" },
          ` / 발송: ${store} (대행 크레소티) / `,
          { b: "언제든 수신거부 가능" },
        ],
      ],
    },
    {
      key: "cresotyAd",
      required: false,
      title: "광고성 정보 수신 동의 — 제휴 혜택 문자 (개인정보 수집·이용 포함)",
      gap: true,
      lines: [
        [
          "크레소티(포인트 운영사)가 별도로 번호를 받아 제휴사 혜택·이벤트, 보험 등 제휴상품 프로모션을 문자로 안내합니다. 보험 가입이나 제휴사 정보 제공은 별도 동의 후에만 진행합니다.",
        ],
        [
          "처리자: 크레소티 / 항목: 휴대전화번호 / ",
          { b: "보유: 철회·크레소티 해당 마케팅 서비스 종료·목적 달성 중 먼저 도래하는 때" },
          " (2년마다 수신 의사 확인) / ",
          { b: "언제든 수신거부 가능" },
        ],
      ],
    },
  ];
}

export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <img
      src={checked ? "/icon_check_sm_on.svg" : "/icon_check_sm_off.svg"}
      alt=""
      width={24}
      height={24}
      className="size-[24px] shrink-0"
    />
  );
}

export default function ConsentView(p: ConsentViewProps) {
  const all = isAllChecked(p.checks);
  const agreeOn = canAgree(p.checks);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white font-display">
      {/* 제목 — y=22. Figma 의 X 는 [동의 안함] 과 같은 동작이라 두지 않는다. */}
      <p className="absolute left-1/2 top-[22px] -translate-x-1/2 whitespace-nowrap text-center text-[22px] font-semibold leading-[1.35] text-ui-text">
        약관에 동의해 주세요
      </p>

      {/* 안내 — y=61 */}
      <p className="absolute left-[24px] top-[61px] w-[486px] text-[14px] font-normal leading-[19px] text-ui-text-sub">
        {p.subtitle}
      </p>

      {/* 항목 — y=88 부터 버튼 영역(750) 위까지 */}
      <div className="absolute bottom-[104px] left-[24px] top-[88px] w-[486px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 전체 동의 */}
        <button
          type="button"
          role="checkbox"
          aria-checked={all}
          onClick={p.onToggleAll}
          className="flex w-full items-start gap-[10px] rounded-[12px] border-[1.5px] border-solid border-ui-border bg-white px-[14px] py-[10px] text-left"
        >
          <CheckBox checked={all} />
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-[16px] font-semibold leading-[25px] text-ui-text">전체 동의</span>
            <span className="text-[13px] font-normal leading-[17px] text-ui-text-sub">
              만 14세 확인, 필수 1개, 선택 3개 항목에 한 번에 동의합니다. 선택 항목은 개별 해제할 수 있습니다.
            </span>
          </span>
        </button>

        {/* 만 14세 */}
        <div className="border-b border-solid border-ui-surface-blue pb-[8px] pt-[12px]">
          <button
            type="button"
            role="checkbox"
            aria-checked={p.checks.age14}
            onClick={() => p.onToggle("age14")}
            className="flex w-full items-center gap-[8px] text-left"
          >
            <CheckBox checked={p.checks.age14} />
            <span className="whitespace-nowrap text-[16px] font-semibold leading-[22px] text-ui-text">만 14세 이상입니다.</span>
            <span className="min-w-0 flex-1 text-[13px] font-normal leading-[22px] text-ui-text-sub">
              만 14세 미만은 직원에게 문의해 주세요.
            </span>
          </button>
        </div>

        {items(p.storeName).map((it) => (
          <ConsentItem
            key={it.key}
            item={it}
            checked={p.checks[it.key]}
            onToggle={() => p.onToggle(it.key)}
            onOpenTerms={() => p.onOpenTerms(it.key)}
          />
        ))}

        <p className="pb-[4px] pt-[6px] text-[13px] font-normal leading-[17px] text-ui-text-sub">
          선택 항목은 동의하지 않아도 포인트는 그대로 이용할 수 있습니다.
        </p>
      </div>

      {/* 버튼 영역 — y=750, 위 1px 선 */}
      <div className="absolute bottom-0 left-0 h-[104px] w-full border-t border-solid border-ui-surface-blue bg-white">
        <button
          type="button"
          onClick={p.onDecline}
          className="absolute left-[24px] top-[11px] flex h-[59px] w-[159px] items-center justify-center rounded-[16px] border-[1.5px] border-solid border-ui-border bg-white text-[20px] font-bold leading-[1.4] text-ui-primary"
        >
          동의 안함
        </button>
        <button
          type="button"
          onClick={() => agreeOn && p.onAgree()}
          aria-disabled={!agreeOn}
          className={`absolute left-[193px] top-[11px] flex h-[59px] w-[317px] items-center justify-center rounded-[16px] text-[20px] font-bold leading-[1.4] text-white ${
            agreeOn ? "bg-ui-primary" : "bg-ui-disabled"
          }`}
        >
          동의
        </button>
      </div>

      {p.children}
    </div>
  );
}

function ConsentItem({
  item,
  checked,
  onToggle,
  onOpenTerms,
}: {
  item: Item;
  checked: boolean;
  onToggle: () => void;
  onOpenTerms: () => void;
}) {
  return (
    <div className="flex flex-col gap-[3px] border-b border-solid border-ui-surface-blue py-[8px]">
      <div className="flex w-full items-start gap-[6px]">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-[6px] text-left"
        >
          <CheckBox checked={checked} />
          <span className="shrink-0 pt-[2px]">
            <span
              className={`block rounded-[6px] px-[9px] py-px text-[12px] font-bold leading-[normal] ${
                item.required ? "bg-ui-surface-blue text-ui-primary" : "bg-ui-surface text-ui-text-sub"
              }`}
            >
              {item.required ? "필수" : "선택"}
            </span>
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-semibold leading-[22px] text-ui-text">{item.title}</span>
        </button>
        <button
          type="button"
          onClick={onOpenTerms}
          className="shrink-0 whitespace-nowrap rounded-[8px] bg-ui-surface-blue py-[6px] pl-[10px] pr-[8px] text-[13px] font-medium leading-[normal] text-ui-primary"
        >
          전문 보기 ›
        </button>
      </div>

      {/* 내용 — 눌러도 체크·해제된다 (제목 줄과 같은 동작) */}
      <div
        onClick={onToggle}
        aria-hidden="true"
        className={`flex cursor-pointer flex-col pl-[30px] ${item.gap ? "gap-[3px]" : ""}`}
      >
        {item.lines.map((line, i) => (
          <p key={i} className="text-[13px] font-normal leading-[17px] text-ui-text-sub">
            {line.map((part, j) =>
              typeof part === "string" ? (
                <span key={j}>{part}</span>
              ) : (
                <span key={j} className="font-semibold text-ui-text">
                  {part.b}
                </span>
              ),
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
