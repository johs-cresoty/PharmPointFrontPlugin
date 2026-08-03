/**
 * 페이지 뷰가 sdk.template 결과 화면 위에 얹는 상단/하단 오버레이 유틸.
 *
 * SPA 특성상 뷰가 전환될 때 이전 오버레이는 제거되어야 하므로 각 뷰의 cleanup 에서
 * remove() 호출.
 */

export type PhoneOverlayHandles = {
  root:         HTMLElement;
  headerEl:     HTMLElement;
  footerEl:     HTMLElement;
  agreementEl:  HTMLInputElement;
  confirmBtnEl: HTMLButtonElement;
  backBtnEl:    HTMLButtonElement;
  remove(): void;
};

/**
 * 휴대폰 번호 입력 화면용 상하단 오버레이 (매장명 · 힌트 · 개인정보 동의 · 확인).
 * 다양한 뷰(회원조회, 적립, 사용 등) 공통 사용.
 *
 * @param opts.hint       하단 힌트 문구
 * @param opts.storeName  상단 매장명 표시 (있으면)
 * @param opts.appMode    #app 에 추가할 CSS 클래스 (기본 "always-overlay")
 */
export function mountPhoneOverlay(opts: {
  hint?:      string;
  storeName?: string;
  appMode?:  "always-overlay" | "phone-overlay-on";
  agreement?: boolean; // 개인정보 동의 체크박스 표시 (기본 true)
}): PhoneOverlayHandles {
  const {
    hint      = "휴대폰 번호 입력하고 포인트 받아가세요.",
    storeName = "",
    appMode   = "always-overlay",
    agreement: showAgreement = true,
  } = opts;

  const header = document.createElement("header");
  header.className = "overlay-top";
  header.innerHTML = `
    <button class="header-back" data-role="back" aria-label="뒤로 가기">←</button>
    ${storeName ? `<p class="header-store">${escapeHtml(storeName)}</p>` : ""}
    <p class="header-hint">${escapeHtml(hint)}</p>
  `;

  const footer = document.createElement("footer");
  footer.className = "overlay-bottom";
  footer.innerHTML = `
    ${showAgreement ? `
    <label class="footer-agreement">
      <input type="checkbox" data-role="agreement" checked />
      <span>[필수] 개인정보 제공 동의합니다.</span>
    </label>
    ` : ""}
    <button class="footer-confirm" data-role="confirm" type="button">확인</button>
  `;

  document.body.appendChild(header);
  document.body.appendChild(footer);
  document.getElementById("app")?.classList.add(appMode);

  const agreement  = footer.querySelector('[data-role="agreement"]')  as HTMLInputElement | null;
  const confirmBtn = footer.querySelector('[data-role="confirm"]')    as HTMLButtonElement;
  const backBtn    = header.querySelector('[data-role="back"]')       as HTMLButtonElement;

  if (agreement) {
    const syncBtn = () => { confirmBtn.disabled = !agreement.checked; };
    agreement.addEventListener("change", syncBtn);
    syncBtn();
  }

  return {
    root:         header,
    headerEl:     header,
    footerEl:     footer,
    // 체크박스 없을 땐 항상 동의된 것으로 취급 (공용 triggerPhoneSubmit 호환)
    agreementEl:  agreement ?? ({ checked: true } as HTMLInputElement),
    confirmBtnEl: confirmBtn,
    backBtnEl:    backBtn,
    remove(): void {
      header.remove();
      footer.remove();
      document.getElementById("app")?.classList.remove(appMode);
    },
  };
}

/**
 * 결제 금액 · 적립 예상 표시용 상단 오버레이 (point-earn-flow, point-use-flow 공용).
 */
export type PayHeaderHandles = {
  root:     HTMLElement;
  setAmount(text: string): void;
  setEstimate(text: string): void;
  hideEstimate(): void;
  remove(): void;
};

export function mountPayHeader(opts: {
  hint:            string;
  showEstimate?:   boolean;
  onBack?:         () => void;
}): PayHeaderHandles {
  const header = document.createElement("header");
  header.className = "overlay-top";
  header.innerHTML = `
    <button class="header-back" data-role="back" aria-label="뒤로 가기">←</button>
    <h1 class="header-amount" data-role="amount">&nbsp;</h1>
    ${opts.showEstimate ? `
      <div class="header-estimate-row" data-role="estimate-row">
        <span class="header-estimate">
          <span class="header-estimate-icon">₩</span>
          <span data-role="estimate-text">0P 적립예상</span>
        </span>
      </div>
    ` : ""}
    <p class="header-hint">${escapeHtml(opts.hint)}</p>
  `;
  document.body.appendChild(header);
  document.getElementById("app")?.classList.add("always-overlay");

  const backBtn      = header.querySelector('[data-role="back"]')          as HTMLButtonElement;
  const amountEl     = header.querySelector('[data-role="amount"]')        as HTMLElement;
  const estimateRow  = header.querySelector('[data-role="estimate-row"]')  as HTMLElement | null;
  const estimateText = header.querySelector('[data-role="estimate-text"]') as HTMLElement | null;

  if (opts.onBack) backBtn.addEventListener("click", opts.onBack);

  return {
    root: header,
    setAmount(text)   { amountEl.textContent = text; },
    setEstimate(text) { if (estimateText) estimateText.textContent = text; },
    hideEstimate()    { if (estimateRow) estimateRow.style.display = "none"; },
    remove(): void {
      header.remove();
      document.getElementById("app")?.classList.remove("always-overlay");
    },
  };
}

/**
 * 확인 버튼만 있는 하단 오버레이 (개인정보 동의 없는 경우).
 */
export type ConfirmFooterHandles = {
  root:      HTMLElement;
  confirmBtnEl: HTMLButtonElement;
  agreementEl:  HTMLInputElement;
  remove(): void;
};

export function mountConfirmFooter(opts: { agreement?: boolean }): ConfirmFooterHandles {
  const footer = document.createElement("footer");
  footer.className = "overlay-bottom";
  footer.innerHTML = `
    ${opts.agreement !== false ? `
      <label class="footer-agreement">
        <input type="checkbox" data-role="agreement" checked />
        <span>[필수] 개인정보 제공 동의합니다.</span>
      </label>
    ` : ""}
    <button class="footer-confirm" data-role="confirm" type="button">확인</button>
  `;
  document.body.appendChild(footer);

  const agreement  = footer.querySelector('[data-role="agreement"]') as HTMLInputElement | null;
  const confirmBtn = footer.querySelector('[data-role="confirm"]')   as HTMLButtonElement;

  if (agreement) {
    const syncBtn = () => { confirmBtn.disabled = !agreement.checked; };
    agreement.addEventListener("change", syncBtn);
    syncBtn();
  }

  return {
    root:         footer,
    confirmBtnEl: confirmBtn,
    agreementEl:  agreement ?? ({} as HTMLInputElement),
    remove(): void { footer.remove(); },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch] as string));
}
