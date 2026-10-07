/**
 * 마케팅 약관 동의 화면을 새 디자인으로 띄운다 (Template API renderAgreementPage 대체).
 *
 * 화면은 네이버와 같은 MarketingAgreementView · AgreementDetailView 를 쓴다.
 * 필수(개인정보 수집 및 동의)는 체크해야 확인이 눌린다. 선택(마케팅)은 자유.
 * 처음엔 둘 다 체크 안 된 상태다 (Figma 07-1). 각 항목 ">" 는 약관 상세를 화면 위에 덮는다.
 * 무입력 타이머는 번호 입력 화면과 같다 — 마지막 5초는 "대기화면으로 이동합니다" 팝업.
 */
import { useState } from "react";
import MarketingAgreementView from "./MarketingAgreementView";
import AgreementDetailView from "./AgreementDetailView";
import { MARKETING_DOC, PRIVACY_DOC } from "./agreement-content";
import { InactivityPopup } from "./Popups";
import { showScreen } from "./stage";
import { useInactivity } from "./use-inactivity";

export type MarketingAgreementOptions = {
  /** [확인] — 선택(마케팅) 동의 여부를 넘긴다. */
  onConfirm: (marketingConsent: boolean) => void;
  /** X 버튼. */
  onClose: () => void;
  /** 무입력 대기 시간(초). 0 이하면 끈다. */
  inactivitySec: number;
  /** 무입력으로 시간이 다 됨. */
  onTimeout: () => void;
};

let screenSeq = 0;

export function showMarketingAgreement(opts: MarketingAgreementOptions): void {
  showScreen(<MarketingAgreementScreen key={++screenSeq} {...opts} />);
}

function MarketingAgreementScreen(o: MarketingAgreementOptions) {
  const [required, setRequired] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [detail, setDetail] = useState<"privacy" | "marketing" | null>(null);
  const { warnLeft, activity, reset } = useInactivity(o.inactivitySec, false, o.onTimeout);

  // 모두 동의하기 — 둘 다 체크돼 있으면 둘 다 해제, 아니면 둘 다 체크.
  const toggleAll = () => {
    const next = !(required && marketing);
    setRequired(next);
    setMarketing(next);
  };

  return (
    <div className="h-full w-full" onPointerDown={activity}>
      <MarketingAgreementView
        required={required}
        marketing={marketing}
        onToggleAll={toggleAll}
        onToggleRequired={() => setRequired((v) => !v)}
        onToggleMarketing={() => setMarketing((v) => !v)}
        onOpenDetail={setDetail}
        onConfirm={() => o.onConfirm(marketing)}
        onClose={o.onClose}
      >
        {detail && (
          <AgreementDetailView doc={detail === "privacy" ? PRIVACY_DOC : MARKETING_DOC} onClose={() => setDetail(null)} />
        )}
        {warnLeft !== null && <InactivityPopup remaining={warnLeft} onContinue={reset} />}
      </MarketingAgreementView>
    </div>
  );
}
