/**
 * 휴대폰 번호 입력 화면을 새 디자인으로 띄운다 (Template API renderInputPage + 오버레이 대체).
 *
 * 화면은 네이버와 같은 PhoneInputView · Popups 를 쓴다. 여기서는 토스 흐름에 맞춰
 * 입력값 · 처리 중 · 결과별 안내(등록된 회원 없음 · 네트워크 · 서버 오류) · 무입력 타이머를 관리한다.
 *
 * 서버 호출과 회신은 부르는 쪽(onSubmit)이 맡고, 결과만 돌려준다.
 *   done     — 다음 화면으로 넘어갔다 (이 화면은 그대로 둔다. 넘어간 화면이 덮는다)
 *   notFound — 입력란 아래 "등록된 회원이 없습니다" (번호를 고치면 사라진다)
 *   network  — 네트워크 팝업 (다시 시도 · 닫기)
 *   server   — 서버 오류 팝업 (닫기)
 */
import { useState } from "react";
import PhoneInputView, { type PhoneInputHeader } from "./PhoneInputView";
import { InactivityPopup, NetworkErrorPopup, PointUnavailablePopup, ServerErrorPopup } from "./Popups";
import { showScreen } from "./stage";
import AgreementDetailView from "./AgreementDetailView";
import { PRIVACY_DOC } from "./agreement-content";
import { useInactivity } from "./use-inactivity";

export type PhoneSubmitOutcome = "done" | "notFound" | "network" | "server";

export type PhoneInputOptions = {
  header: PhoneInputHeader;
  /** 개인정보 제공 동의 줄을 보일지. 마케팅 동의처럼 동의를 따로 받으면 false. */
  agreement: boolean;
  /** 무입력 대기 시간(초). 마지막 5초는 "대기화면으로 이동합니다" 팝업. 0 이하면 끈다. */
  inactivitySec: number;
  onSubmit: (phone: string) => Promise<PhoneSubmitOutcome>;
  /** X 버튼. */
  onClose: () => void;
  /** 무입력으로 시간이 다 됨. */
  onTimeout: () => void;
  /** 진입하자마자 띄울 "포인트를 사용할 수 없어요" 팝업 (결제금액 < 최소 사용 포인트). */
  pointUnavailable?: { payAmount: number; minPoint: number; onConfirm: () => void };
};

const MAX_PHONE = 11;

/** 서버에 닿지 못한 실패인지 (연결 불가 · 응답 지연). 네이버 PhoneNumberInput 과 같은 기준. */
export function isUnreachable(e: unknown): boolean {
  const err = e as { code?: string; response?: unknown };
  if (err?.response) return false;
  return err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT";
}

export type PhoneInputHandle = {
  /** 화면 일부만 바꾼다 (예: 적립예상 포인트가 늦게 도착). 입력값 등 화면 상태는 유지된다. */
  update: (patch: Partial<PhoneInputOptions>) => void;
};

let screenSeq = 0;

export function showPhoneInput(opts: PhoneInputOptions): PhoneInputHandle {
  let current = opts;
  // 부를 때마다 새 화면이다. key 가 같으면 React 가 이전 화면의 입력값 · 처리 중 상태를 이어 쓴다.
  const key = ++screenSeq;
  const render = () => showScreen(<PhoneInputScreen key={key} {...current} />);
  render();
  return {
    update: (patch) => {
      current = { ...current, ...patch };
      render();
    },
  };
}

function PhoneInputScreen(o: PhoneInputOptions) {
  const [phone, setPhone] = useState("010");
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorPopup, setErrorPopup] = useState<"network" | "server" | null>(null);
  const [unavailable, setUnavailable] = useState(o.pointUnavailable ?? null);
  // 약관 상세(Figma 07-3 개인정보 수집 및 동의) — 화면 위에 덮는다. 입력값은 그대로 남는다.
  const [showDetail, setShowDetail] = useState(false);

  const canConfirm = phone.length === MAX_PHONE && !loading && (!o.agreement || agreed);

  const edit = (next: (p: string) => string) => {
    setNotFound(false);
    setPhone(next);
  };

  const submit = async () => {
    if (!canConfirm) return;
    setLoading(true);
    let outcome: PhoneSubmitOutcome;
    try {
      outcome = await o.onSubmit(phone);
    } catch (e) {
      console.error("[PhoneInput] 처리 실패:", e);
      outcome = isUnreachable(e) ? "network" : "server";
    }
    if (outcome === "done") return; // 다음 화면이 덮는다. 처리 중 표시는 그대로 둔다.
    setLoading(false);
    if (outcome === "notFound") setNotFound(true);
    else setErrorPopup(outcome);
  };

  // ── 무입력 타이머 ── 화면 어디를 눌러도 처음부터. 처리 중 · 팝업 중에는 멈춘다.
  const paused = loading || !!errorPopup || !!unavailable;
  const { warnLeft, reset: resetTimer } = useInactivity(o.inactivitySec, paused, o.onTimeout);

  return (
    <div className="h-full w-full" onPointerDown={resetTimer}>
      <PhoneInputView
        header={o.header}
        phone={phone}
        notice={notFound ? "등록된 회원이 없습니다" : null}
        onDigit={(d) => edit((p) => (p.length < MAX_PHONE ? p + d : p))}
        onDelete={() => edit((p) => p.slice(0, -1))}
        onDeleteAll={() => edit(() => "")}
        agreement={
          o.agreement
            ? { checked: agreed, onToggle: () => setAgreed((v) => !v), onOpenDetail: () => setShowDetail(true) }
            : undefined
        }
        canConfirm={canConfirm}
        loading={loading}
        onConfirm={submit}
        onClose={o.onClose}
      >
        {errorPopup === "network" && (
          <NetworkErrorPopup
            onRetry={() => {
              setErrorPopup(null);
              void submit();
            }}
            onClose={() => setErrorPopup(null)}
          />
        )}
        {errorPopup === "server" && <ServerErrorPopup onClose={() => setErrorPopup(null)} />}
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
        {showDetail && <AgreementDetailView doc={PRIVACY_DOC} onClose={() => setShowDetail(false)} />}
        {warnLeft !== null && <InactivityPopup remaining={warnLeft} onContinue={resetTimer} />}
      </PhoneInputView>
    </div>
  );
}
