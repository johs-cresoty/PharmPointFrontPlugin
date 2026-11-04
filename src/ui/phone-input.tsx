/**
 * 휴대폰 번호 입력 → 약관 동의 → 동의 처리 완료 화면을 새 디자인으로 띄운다
 * (Template API renderInputPage + 오버레이 대체, Figma 동의 개편 플로우).
 *
 * 화면은 네이버와 같은 PhoneInputView · ConsentView · TermsView · ConsentDoneView · Popups 를 쓴다.
 * 여기서는 토스 흐름에 맞춰 단계 · 입력값 · 체크 상태 · 처리 중 · 결과별 안내 · 무입력 타이머를 관리한다.
 *
 *   번호 입력 [확인]        → (checkMember 가 있으면 회원 확인) → 약관 동의 (매번 모두 해제로 시작)
 *   약관 동의 [동의 안함]    → 번호 입력으로 (취소 회신 없음, 입력 번호 유지)
 *   약관 동의 [동의]        → (onAgree) → 동의 처리 완료 (만 14세 · 필수가 체크돼야 눌린다)
 *   동의 처리 완료 [확인]    → onSubmit (서버 호출 · 회신)
 *
 * 회원 확인(checkMember)은 조회 · 사용만 넘긴다. 미등록이면 번호 입력 화면에 "등록된 회원이 없습니다".
 * 서버 호출과 회신은 부르는 쪽(checkMember · onSubmit)이 맡고, 결과만 돌려준다.
 *   done     — 다음 화면으로 넘어갔다 (이 화면은 그대로 둔다. 넘어간 화면이 덮는다)
 *   notFound — 번호 입력으로 돌아가 입력란 아래 "등록된 회원이 없습니다" (번호를 고치면 사라진다)
 *   network  — 네트워크 팝업 (동의 처리 완료 화면 위, 닫기)
 *   server   — 서버 오류 팝업 (동의 처리 완료 화면 위, 닫기)
 */
import { useEffect, useState } from "react";
import PhoneInputView, { type PhoneInputHeader } from "./PhoneInputView";
import ConsentView from "./ConsentView";
import ConsentDoneView from "./ConsentDoneView";
import TermsView from "./TermsView";
import {
  EMPTY_CHECKS,
  TERMS_DOCS,
  isAllChecked,
  phoneInputCaption,
  todayYmd,
  type ConsentChecks,
  type ConsentKey,
} from "./consent-terms";
import { InactivityPopup, NetworkErrorPopup, PointUnavailablePopup, ServerErrorPopup } from "./Popups";
import { showScreen } from "./stage";
import { useInactivity } from "./use-inactivity";

export type PhoneSubmitOutcome = "done" | "notFound" | "network" | "server";

/** 약관 동의 전 회원 확인 결과. member 면 약관 동의로 넘어간다. */
export type MemberCheckOutcome = "member" | Exclude<PhoneSubmitOutcome, "done">;

export type PhoneInputOptions = {
  header: PhoneInputHeader;
  /** 약관 동의 화면 제목 아래 안내 (흐름마다 다르다). */
  consentSubtitle: string;
  /** 적립 흐름 — 번호 입력 화면 안내가 세 줄이 된다 (Figma 04-3). */
  earn?: boolean;
  /** 무입력 대기 시간(초). 마지막 5초는 "대기화면으로 이동합니다" 팝업. 0 이하면 끈다. */
  inactivitySec: number;
  /** 번호 입력 [확인] — 약관 동의 전 회원 확인 (조회 · 사용). 없으면 바로 약관 동의로. */
  checkMember?: (phone: string) => Promise<MemberCheckOutcome>;
  /** 약관 동의 [동의] — 동의 처리 완료 화면을 띄우기 직전에 부른다 (마케팅 동의 요청의 회신). */
  onAgree?: (phone: string, consent: ConsentChecks) => void;
  /** 동의 처리 완료 [확인] — 입력 번호와 약관 동의 체크 상태를 넘긴다. */
  onSubmit: (phone: string, consent: ConsentChecks) => Promise<PhoneSubmitOutcome>;
  /** 번호 입력 화면의 X 버튼. */
  onClose: () => void;
  /** 무입력으로 시간이 다 됨. */
  onTimeout: () => void;
  /** 진입하자마자 띄울 "포인트를 사용할 수 없어요" 팝업 (결제금액 < 최소 사용 포인트). */
  pointUnavailable?: { payAmount: number; minPoint: number; onConfirm: () => void };
};

const MAX_PHONE = 11;

/** 매장명을 못 받았을 때 "○○약국" 자리에 쓰는 이름 (네이버 기본 매장명과 같다). */
const FALLBACK_STORE_NAME = "약국";

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

type Step = "input" | "consent" | "done";

function PhoneInputScreen(o: PhoneInputOptions) {
  const [step, setStep] = useState<Step>("input");
  const [phone, setPhone] = useState("010");
  const [checks, setChecks] = useState<ConsentChecks>(EMPTY_CHECKS);
  // 열려 있는 약관 전문. null 이면 약관 동의 화면만 보인다.
  const [terms, setTerms] = useState<ConsentKey | null>(null);
  // 의사표시일 — [동의] 를 누른 날.
  const [consentDate, setConsentDate] = useState("");
  const [storeName, setStoreName] = useState(FALLBACK_STORE_NAME);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorPopup, setErrorPopup] = useState<"network" | "server" | null>(null);
  const [unavailable, setUnavailable] = useState(o.pointUnavailable ?? null);

  // 매장명 — "○○약국" · "[가맹약국명]" 자리에 쓴다. 못 받으면 기본 이름.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const m = await sdk.app.getMerchant();
        if (!cancelled && m?.name) setStoreName(m.name);
      } catch (e) {
        console.warn("[PhoneInput] 매장명 조회 실패", e);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canConfirm = phone.length === MAX_PHONE && !loading;

  const edit = (next: (p: string) => string) => {
    setNotFound(false);
    setPhone(next);
  };

  // 번호 입력 [확인] → (회원 확인) → 약관 동의. 약관 동의 화면은 매번 모두 해제된 상태로 시작한다.
  const toConsent = async () => {
    if (!canConfirm) return;
    if (o.checkMember) {
      setLoading(true);
      let outcome: MemberCheckOutcome;
      try {
        outcome = await o.checkMember(phone);
      } catch (e) {
        console.error("[PhoneInput] 회원 확인 실패:", e);
        outcome = isUnreachable(e) ? "network" : "server";
      }
      setLoading(false);
      if (outcome === "notFound") {
        setNotFound(true);
        return;
      }
      if (outcome !== "member") {
        setErrorPopup(outcome);
        return;
      }
    }
    setChecks(EMPTY_CHECKS);
    setTerms(null);
    setStep("consent");
  };

  const toggleAll = () => {
    const next = !isAllChecked(checks);
    setChecks({ age14: next, privacy: next, medication: next, pharmacyAd: next, cresotyAd: next });
  };
  const toggle = (key: keyof ConsentChecks) => setChecks((c) => ({ ...c, [key]: !c[key] }));

  const agree = () => {
    o.onAgree?.(phone, checks);
    setConsentDate(todayYmd());
    setStep("done");
  };

  // 동의 처리 완료 [확인] → 서버 호출 · 회신.
  const submit = async () => {
    if (loading) return;
    setLoading(true);
    let outcome: PhoneSubmitOutcome;
    try {
      outcome = await o.onSubmit(phone, checks);
    } catch (e) {
      console.error("[PhoneInput] 처리 실패:", e);
      outcome = isUnreachable(e) ? "network" : "server";
    }
    if (outcome === "done") return; // 다음 화면이 덮는다. 처리 중 표시는 그대로 둔다.
    setLoading(false);
    if (outcome === "notFound") {
      // 번호 입력으로 돌아가 안내한다. 다시 진행하면 동의부터 다시 받는다.
      setStep("input");
      setNotFound(true);
    } else setErrorPopup(outcome);
  };

  // ── 무입력 타이머 ── 화면 어디를 눌러도 처음부터. 처리 중 · 팝업 중에는 멈춘다. 세 단계 공통.
  const paused = loading || !!errorPopup || !!unavailable;
  const { warnLeft, activity, reset: resetTimer } = useInactivity(o.inactivitySec, paused, o.onTimeout);

  // 오류 · 무입력 팝업은 지금 보이는 단계 위에 뜬다.
  const popups = (
    <>
      {errorPopup === "network" && <NetworkErrorPopup onClose={() => setErrorPopup(null)} />}
      {errorPopup === "server" && <ServerErrorPopup onClose={() => setErrorPopup(null)} />}
      {warnLeft !== null && <InactivityPopup remaining={warnLeft} onContinue={resetTimer} />}
    </>
  );

  return (
    <div className="h-full w-full" onPointerDown={activity}>
      {step === "input" && (
        <PhoneInputView
          header={o.header}
          phone={phone}
          notice={notFound ? "등록된 회원이 없습니다" : null}
          onDigit={(d) => edit((p) => (p.length < MAX_PHONE ? p + d : p))}
          onDelete={() => edit((p) => p.slice(0, -1))}
          onDeleteAll={() => edit(() => "")}
          caption={phoneInputCaption(!!o.earn)}
          canConfirm={canConfirm}
          loading={loading}
          onConfirm={() => void toConsent()}
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
          {popups}
        </PhoneInputView>
      )}

      {step === "consent" && (
        <ConsentView
          subtitle={o.consentSubtitle}
          storeName={storeName}
          checks={checks}
          onToggleAll={toggleAll}
          onToggle={toggle}
          onOpenTerms={setTerms}
          onAgree={agree}
          onDecline={() => setStep("input")}
        >
          {terms && (
            <TermsView
              doc={TERMS_DOCS[terms]}
              storeName={storeName}
              checked={checks[terms]}
              onToggle={() => toggle(terms)}
              onBack={() => setTerms(null)}
              onClose={() => setTerms(null)}
            />
          )}
          {popups}
        </ConsentView>
      )}

      {step === "done" && (
        <ConsentDoneView storeName={storeName} checks={checks} date={consentDate} loading={loading} onConfirm={submit}>
          {popups}
        </ConsentDoneView>
      )}
    </div>
  );
}
