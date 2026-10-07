/**
 * 마케팅 약관 동의 화면을 새 디자인으로 띄운다 (Template API renderAgreementPage 대체).
 *
 * 화면은 네이버와 같은 MarketingAgreementView · AgreementDetailView 를 쓴다.
 * 필수(개인정보 수집 및 동의)는 체크해야 확인이 눌린다. 선택(마케팅)은 자유.
 * 처음엔 둘 다 체크 안 된 상태다 (Figma 07-1). 각 항목 ">" 는 약관 상세를 화면 위에 덮는다.
 */
import { useState } from "react";
import MarketingAgreementView from "./MarketingAgreementView";
import AgreementDetailView from "./AgreementDetailView";
import { MARKETING_DOC, PRIVACY_DOC } from "./agreement-content";
import { showScreen } from "./stage";

export type MarketingAgreementOptions = {
  /** [확인] — 선택(마케팅) 동의 여부를 넘긴다. */
  onConfirm: (marketingConsent: boolean) => void;
  /** X 버튼. */
  onClose: () => void;
};

let screenSeq = 0;

export function showMarketingAgreement(opts: MarketingAgreementOptions): void {
  showScreen(<MarketingAgreementScreen key={++screenSeq} {...opts} />);
}

function MarketingAgreementScreen(o: MarketingAgreementOptions) {
  const [required, setRequired] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [detail, setDetail] = useState<"privacy" | "marketing" | null>(null);

  // 모두 동의하기 — 둘 다 체크돼 있으면 둘 다 해제, 아니면 둘 다 체크.
  const toggleAll = () => {
    const next = !(required && marketing);
    setRequired(next);
    setMarketing(next);
  };

  return (
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
    </MarketingAgreementView>
  );
}
