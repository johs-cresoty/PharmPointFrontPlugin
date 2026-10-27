import { useEffect, useRef, useState } from "react";

// 결과 화면 (조회 · 적립 완료 · 사용 완료 · 포인트 부족 · 마케팅 동의 완료).
//
// 디자인: Figma「커넥트_고객화면_디자인」 08-1 ~ 08-5.
// 네이버 플러그인(PharmPointFrontPlugin-Naver src/pages/Result.tsx)과 같은 화면이다.
// 수치는 534×854 기준 px 그대로이고, 토스 400×640 에는 무대(stage.tsx)가 줄여 맞춘다.
//
// 이 컴포넌트는 그리기만 한다. 어디로 돌아갈지·무엇을 회신할지는 부르는 쪽이 onDone 으로 정한다.

export type ResultMode = "LOOKUP" | "EARN" | "USE" | "USE_UNAVAILABLE" | "MARKETING_DONE";

export type ResultScreenProps = {
  mode: ResultMode;
  customerName?: string;
  /** 배지에 보이는 포인트 — 조회·적립은 보유, 사용·부족은 남은 포인트. */
  balancePoint?: number;
  earnPoint?: number;
  usePoint?: number;
  /** 포인트 부족 화면의 최소 사용 포인트 안내. 0 이하면 안내 줄을 그리지 않는다. */
  minPoint?: number;
  /** 자동 닫힘까지 초. 0 이하면 카운트다운 없이 [확인] 으로만 닫는다. */
  seconds: number;
  /** [확인] 또는 자동 닫힘. 한 번만 불린다. */
  onDone: () => void;
};

/**
 * 결과 아이콘.
 *
 * Figma 는 150px 틀 안에 원본 이미지(1024px)를 더 크게 깔고 틀 밖을 잘라 쓴다.
 * 아이콘마다 깔린 크기와 위치가 달라 그 값을 그대로 옮긴다 (Figma img_icon 컴포넌트).
 */
const ICON_BY_MODE: Record<ResultMode, { src: string; left: number; top: number; width: number; height: number }> = {
  LOOKUP:          { src: "/result_lookup.png",    left: -53.5, top: -53,   width: 256, height: 256 },
  EARN:            { src: "/result_earn.png",      left: -42.5, top: -42,   width: 234, height: 234 },
  USE:             { src: "/result_use.png",       left: -64.5, top: -53,   width: 270, height: 262 },
  USE_UNAVAILABLE: { src: "/result_shortage.png",  left: -53.4, top: -51.5, width: 256, height: 256 },
  MARKETING_DONE:  { src: "/result_marketing.png", left: -53.1, top: -52.6, width: 256, height: 256 },
};

export default function ResultScreen(props: ResultScreenProps) {
  const { mode, seconds } = props;
  const [remaining, setRemaining] = useState(seconds);

  // [확인] 과 자동 닫힘이 겹쳐도 한 번만 돌아가게 한다.
  const doneRef = useRef(false);
  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    if (seconds <= 0) return;
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          finish();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const icon = ICON_BY_MODE[mode];
  const isMarketing = mode === "MARKETING_DONE";
  const isUnavailable = mode === "USE_UNAVAILABLE";
  // 마케팅 완료는 고객명 자리에 인사말. 고객명이 없을 때도(캣포스 007 등) 줄 높이는 남겨
  // 아래 배지가 디자인 위치에서 움직이지 않게 한다.
  const nameLine = isMarketing ? "감사합니다" : props.customerName ? `${props.customerName} 님` : "";
  const showMinPointNotice = isUnavailable && (props.minPoint ?? 0) > 0;

  return (
    <div className="flex h-full flex-col items-center bg-white font-display">
      {/* 제목 — Figma y=186 */}
      <p className="mt-[186px] whitespace-nowrap text-center text-[35px] font-semibold leading-[1.35] tracking-[-0.35px] text-ui-primary">
        {getTitle(props)}
      </p>

      {/* 결과 아이콘 — Figma y=253, 150×150 */}
      <div className="relative mt-[19.75px] size-[150px] shrink-0 overflow-hidden">
        <img
          src={icon.src}
          alt=""
          draggable={false}
          className="absolute max-w-none object-cover"
          style={{ left: icon.left, top: icon.top, width: icon.width, height: icon.height }}
        />
      </div>

      {/* 고객명 (마케팅 완료는 인사말) — Figma y=404 */}
      <p className="mt-px h-[30.8px] whitespace-nowrap text-center text-[22px] font-normal leading-[1.4] text-ui-text">
        {nameLine}
      </p>

      {/* 보유 포인트 배지 — Figma y=459, 높이 65. 포인트 부족은 회색. 마케팅 완료는 없음. */}
      {!isMarketing && (
        <div
          className={`mt-[24.2px] flex h-[65px] items-center justify-center gap-[12px] whitespace-nowrap rounded-[40px] border-[1.5px] border-solid px-[24px] ${
            isUnavailable ? "border-ui-disabled text-ui-text-sub" : "border-ui-border text-ui-primary"
          }`}
        >
          <span className="text-[20px] font-normal">보유 포인트</span>
          <span className="text-[22px] font-bold">{(props.balancePoint ?? 0).toLocaleString()} P</span>
        </div>
      )}

      {/* 최소 사용 포인트 안내 — 포인트 부족일 때만. Figma y=536 */}
      {showMinPointNotice && (
        <div className="mt-[12px] flex items-center gap-[3px]">
          {/* Figma bytesize:info — 28px 틀 안 14.29% 안쪽에 선 두께만큼 넓힌 아이콘 */}
          <span className="relative size-[28px] shrink-0 overflow-hidden">
            <span className="absolute inset-[14.29%]">
              <span className="absolute inset-[-4.25%]">
                <img src="/icon_info.svg" alt="" className="block size-full max-w-none" />
              </span>
            </span>
          </span>
          <span className="whitespace-nowrap text-center text-[20px] font-normal leading-[1.4] text-ui-text-sub">
            최소 {(props.minPoint ?? 0).toLocaleString()}P부터 사용 가능합니다.
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* 자동 닫힘 카운트다운 — Figma y=696, 확인 버튼 위 12.7px */}
      {seconds > 0 && (
        <p className="whitespace-nowrap text-center text-[18px] font-normal leading-[1.35] text-ui-text-sub">
          {remaining}초 후 창 자동 닫힘
        </p>
      )}

      {/* 확인 — Figma confirm_btn 486×75, 아래 여백 46 */}
      <button
        type="button"
        onClick={finish}
        className="mb-[46px] mt-[12.7px] flex h-[75px] w-[486px] shrink-0 items-center justify-center rounded-[16px] bg-ui-primary text-[26px] font-bold leading-[1.4] text-white"
      >
        확인
      </button>
    </div>
  );
}

function getTitle(p: ResultScreenProps): string {
  switch (p.mode) {
    case "LOOKUP":
      return "포인트 조회";
    case "EARN":
      // 적립 포인트를 못 구한 경우 "0P 적립완료" 대신 포인트를 생략한다.
      return (p.earnPoint ?? 0) > 0 ? `${p.earnPoint!.toLocaleString()}P 적립완료` : "적립완료";
    case "USE":
      return `${(p.usePoint ?? 0).toLocaleString()}P 사용완료`;
    case "USE_UNAVAILABLE":
      return "포인트 부족";
    case "MARKETING_DONE":
      return "입력 완료";
  }
}
