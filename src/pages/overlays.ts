/**
 * 페이지 뷰가 sdk.template 결과 화면 위에 얹는 상단/하단 오버레이 유틸.
 *
 * SPA 특성상 뷰가 전환될 때 이전 오버레이는 제거되어야 하므로 각 뷰의 cleanup 에서
 * remove() 호출.
 */
import { openAgreementSheet, closeAgreementSheet } from "./agreement-sheet";

/**
 * 약관 보기 화살표를 옆 문구의 '실제로 보이는' 세로 중앙에 맞춘다.
 *
 * flex 로 가운데 정렬하면 글자 '상자'의 중앙에 맞춰진다. 그런데 상자에는 글꼴이
 * 잡아둔 위아래 여유가 들어 있고, 한글은 그 여유를 다 쓰지 않아 실제로 찍히는
 * 위치가 상자 중앙과 어긋난다. 어긋나는 방향과 양은 글꼴마다 다르다.
 * 그래서 고정값을 넣지 않고, 실행 시점에 이 단말의 글꼴로 재서 그만큼만 옮긴다.
 *
 * 옮기는 것은 아이콘 하나뿐이다. transform 이라 주변 배치·크기·간격은 그대로다.
 */
/** 글꼴별 잉크 측정 결과 보관 — 같은 글꼴을 매번 다시 그릴 이유가 없다. */
const inkOffsetCache = new Map<string, number | null>();

/**
 * 글자가 실제로 칠해지는 세로 범위의 중심이 baseline 에서 얼마나 떨어져 있는지.
 *
 * measureText 의 actualBoundingBox 는 환경에 따라 글자 잉크가 아니라 글꼴이 잡아둔
 * em 상자를 그대로 돌려준다(높이가 font-size 와 똑같이 나온다). 그 값으로는 보정할 수
 * 없어서, 글자를 직접 그린 뒤 칠해진 픽셀 행을 찾는다. 글꼴 구현에 의존하지 않는다.
 *
 * @returns baseline 기준 오프셋(위쪽이 음수). 측정 불가면 null.
 */
function inkCenterOffset(font: string, text: string): number | null {
  const key = `${font}|${text}`;
  const hit = inkOffsetCache.get(key);
  if (hit !== undefined) return hit;

  let result: number | null = null;
  try {
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
    if (sizeMatch) {
      const size   = parseFloat(sizeMatch[1]);
      const canvas = document.createElement("canvas");

      const probeCtx = canvas.getContext("2d");
      if (probeCtx) {
        probeCtx.font = font;
        const w = Math.ceil(probeCtx.measureText(text).width) + 8;
        const h = Math.ceil(size * 4);
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && w > 8) {
          ctx.font = font;
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#000";
          const baseline = Math.round(size * 2.5); // 위아래로 충분한 여유
          ctx.fillText(text, 4, baseline);

          const data = ctx.getImageData(0, 0, w, h).data;
          let top = -1, bottom = -1;
          for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
              if (data[(row * w + col) * 4 + 3] > 8) { // 칠해진 픽셀
                if (top < 0) top = row;
                bottom = row;
                break;
              }
            }
          }
          if (top >= 0) result = (top + bottom) / 2 - baseline;
        }
      }
    }
  } catch {
    result = null; // 캔버스를 못 쓰는 환경
  }

  inkOffsetCache.set(key, result);
  return result;
}

function alignViewIconToText(footer: HTMLElement): void {
  const span = footer.querySelector<HTMLElement>(".footer-agreement span");
  const svg  = footer.querySelector<SVGElement>('[data-role="agreement-view"] svg');
  if (!span || !svg) return;

  try {
    const cs   = getComputedStyle(span);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = span.textContent ?? "";
    const offset = inkCenterOffset(font, text);
    if (offset === null) return; // 측정 불가 — 기본 정렬을 그대로 둔다

    // 글자가 놓이는 기준선(baseline) 위치를 실제 배치에서 얻는다.
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    span.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();

    // 보정 전 위치를 기준으로 계산해야 여러 번 불려도 값이 누적되지 않는다.
    svg.style.transform = "";
    const box   = svg.getBoundingClientRect();
    const delta = (baseline + offset) - (box.top + box.height / 2);

    // 몇 px 수준의 보정만 의미가 있다. 그 이상이면 측정이 잘못된 것으로 보고 넘어간다.
    if (!Number.isFinite(delta) || Math.abs(delta) > 6) return;

    svg.style.transform = `translateY(${delta.toFixed(2)}px)`;
  } catch {
    /* 보정에 실패해도 화면은 그대로 동작해야 한다 */
  }
}

/**
 * 화살표 정렬을 걸어둔다.
 *
 * 웹폰트는 나중에 도착할 수 있어, 먼저 한 번 맞추고 글꼴이 준비되면 다시 맞춘다.
 * (글꼴이 바뀌면 글자가 찍히는 위치도 바뀐다)
 */
function scheduleViewIconAlign(footer: HTMLElement): void {
  alignViewIconToText(footer);
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  fonts?.ready.then(() => {
    if (footer.isConnected) alignViewIconToText(footer);
  }).catch(() => { /* 무시 */ });
}

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
  appMode?:  "always-overlay" | "phone-overlay-on" | "minimal-overlay";
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
    ${hint ? `<p class="header-hint">${escapeHtml(hint)}</p>` : ""}
  `;

  const footer = document.createElement("footer");
  footer.className = "overlay-bottom";
  footer.innerHTML = `
    ${showAgreement ? `
    <div class="footer-agreement-row">
      <label class="footer-agreement">
        <input type="checkbox" data-role="agreement" checked />
        <span>[필수] 개인정보 제공 동의합니다.</span>
      </label>
      <button class="footer-agreement-view" data-role="agreement-view" type="button" aria-label="약관 전문 보기">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
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

  // 약관 전문 보기. label 밖에 둔 버튼이라 눌러도 동의 체크가 바뀌지 않는다.
  footer.querySelector('[data-role="agreement-view"]')
    ?.addEventListener("click", () => { openAgreementSheet(); });

  // 화살표를 옆 문구의 실제 세로 중앙에 맞춘다.
  scheduleViewIconAlign(footer);

  return {
    root:         header,
    headerEl:     header,
    footerEl:     footer,
    // 체크박스 없을 땐 항상 동의된 것으로 취급 (공용 triggerPhoneSubmit 호환)
    agreementEl:  agreement ?? ({ checked: true } as HTMLInputElement),
    confirmBtnEl: confirmBtn,
    backBtnEl:    backBtn,
    remove(): void {
      closeAgreementSheet(); // 화면을 떠날 때 약관 시트가 남지 않게
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
  /** 결제금액 h1 을 완전히 숨김(display:none) — SDK subtitle 로 이관한 화면용. */
  hideAmount(): void;
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
      <div class="header-estimate-row" data-role="estimate-row" style="visibility:hidden">
        <span class="header-estimate">
          <span class="header-estimate-icon">₩</span>
          <span data-role="estimate-text">0P 적립예상</span>
        </span>
      </div>
    ` : ""}
    ${opts.hint ? `<p class="header-hint">${escapeHtml(opts.hint)}</p>` : ""}
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
    // amount 는 문서 흐름에서 완전 제거 — 오버레이 상단 세로 공간을 SDK subtitle 이 대신 채운다.
    hideAmount()      { if (amountEl) amountEl.style.display = "none"; },
    // 배지는 기본 숨김(visibility) 상태로 시작한다 — 유효한 예상 포인트가 왔을 때만 노출.
    // display 가 아닌 visibility 를 쓰는 이유: 숨겨도 영역 높이를 유지해 아래 레이아웃이 밀리지 않게 함.
    setEstimate(text) {
      if (estimateText) estimateText.textContent = text;
      if (estimateRow)  estimateRow.style.visibility = "visible";
    },
    hideEstimate()    { if (estimateRow) estimateRow.style.visibility = "hidden"; },
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
      <div class="footer-agreement-row">
        <label class="footer-agreement">
          <input type="checkbox" data-role="agreement" checked />
          <span>[필수] 개인정보 제공 동의합니다.</span>
        </label>
        <button class="footer-agreement-view" data-role="agreement-view" type="button" aria-label="약관 전문 보기">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
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

  // 약관 전문 보기. label 밖에 둔 버튼이라 눌러도 동의 체크가 바뀌지 않는다.
  footer.querySelector('[data-role="agreement-view"]')
    ?.addEventListener("click", () => { openAgreementSheet(); });

  // 화살표를 옆 문구의 실제 세로 중앙에 맞춘다.
  scheduleViewIconAlign(footer);

  return {
    root:         footer,
    confirmBtnEl: confirmBtn,
    agreementEl:  agreement ?? ({} as HTMLInputElement),
    remove(): void { closeAgreementSheet(); footer.remove(); },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch] as string));
}
