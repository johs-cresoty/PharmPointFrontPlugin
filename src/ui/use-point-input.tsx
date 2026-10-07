/**
 * 사용 포인트 입력 화면을 새 디자인으로 띄운다 (Template API renderInputPage 대체).
 *
 * 화면은 네이버와 같은 UsePointView (Figma 06-1 · 06-2). 여기서는 입력값 · 상한 ·
 * 빠른 입력(+100 · +1000 · 전액) · 무입력 타이머를 관리한다. 동작은 네이버 UseInput 과 같다.
 *   - 입력은 최대 7자리, 사용 가능 상한(maxPoint)을 넘으면 상한으로 맞춘다.
 *   - [확인] 은 minUse 이상일 때만 눌린다.
 *   - "보유" 는 입력한 만큼 뺀 값 (Figma 06-2).
 *   - 최소 사용 포인트 설정을 쓰면 확인 위에 "포인트는 최소 OOP부터 사용 가능합니다."
 *
 * 회신 · 결과 화면 이동은 부르는 쪽(onSubmit)이 맡는다.
 */
import { useState } from "react";
import UsePointView from "./UsePointView";
import { InactivityPopup, PointUnavailablePopup } from "./Popups";
import { showScreen } from "./stage";
import { useInactivity } from "./use-inactivity";

export type UsePointInputOptions = {
  payAmount: number;
  /** 보유 포인트. */
  balance: number;
  /** 사용 가능 상한 = min(보유, 결제금액). */
  maxPoint: number;
  /** 사용 가능 하한 (최소 사용 포인트 설정이 꺼져 있으면 1). */
  minUse: number;
  /** 최소 사용 포인트 안내 문구에 쓸 값. 설정이 꺼져 있으면 0 (문구 안 보임). */
  minPoint: number;
  /** 무입력 대기 시간(초). 마지막 5초는 "대기화면으로 이동합니다" 팝업. 0 이하면 끈다. */
  inactivitySec: number;
  onSubmit: (usePoint: number) => Promise<void> | void;
  /** X 버튼. */
  onClose: () => void;
  /** 무입력으로 시간이 다 됨. */
  onTimeout: () => void;
  /** 진입하자마자 띄울 "포인트를 사용할 수 없어요" 팝업 (결제금액 < 최소 사용 포인트). */
  pointUnavailable?: { payAmount: number; minPoint: number; onConfirm: () => void };
};

const MAX_INPUT_LENGTH = 7;

let screenSeq = 0;

export function showUsePointInput(opts: UsePointInputOptions): void {
  showScreen(<UsePointInputScreen key={++screenSeq} {...opts} />);
}

function UsePointInputScreen(o: UsePointInputOptions) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unavailable, setUnavailable] = useState(o.pointUnavailable ?? null);

  const usePoint = Number(input) || 0;
  const canConfirm = usePoint >= o.minUse && usePoint <= o.maxPoint && !submitting;

  const onDigit = (d: string) => {
    if (input.length >= MAX_INPUT_LENGTH) return;
    const next = input + d;
    const raw = Number(next) || 0;
    setInput(raw > o.maxPoint ? String(o.maxPoint) : next);
  };
  const onAdd = (n: number) => {
    const next = Math.min(usePoint + n, o.maxPoint);
    setInput(next > 0 ? String(next) : "");
  };

  const submit = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await o.onSubmit(usePoint);
    } catch (e) {
      console.error("[UsePointInput] 처리 실패:", e);
      setSubmitting(false);
    }
  };

  // 무입력 타이머 — 화면 어디를 눌러도 처음부터. 처리 중 · 팝업 중에는 멈춘다.
  const { warnLeft, activity, reset } = useInactivity(o.inactivitySec, submitting || !!unavailable, o.onTimeout);

  return (
    <div className="h-full w-full" onPointerDown={activity}>
      <UsePointView
        payAmount={o.payAmount}
        usePoint={usePoint}
        balance={o.balance - usePoint}
        minPoint={o.minPoint}
        onDigit={onDigit}
        onDelete={() => setInput((p) => p.slice(0, -1))}
        onDeleteAll={() => setInput("")}
        onAdd={onAdd}
        onAll={() => setInput(o.maxPoint > 0 ? String(o.maxPoint) : "")}
        canConfirm={canConfirm}
        onConfirm={submit}
        onClose={o.onClose}
      >
        {unavailable && (
          <PointUnavailablePopup
            payAmount={unavailable.payAmount}
            minPoint={unavailable.minPoint}
            onConfirm={() => {
              setUnavailable(null);
              unavailable.onConfirm();
            }}
          />
        )}
        {warnLeft !== null && <InactivityPopup remaining={warnLeft} onContinue={reset} />}
      </UsePointView>
    </div>
  );
}
