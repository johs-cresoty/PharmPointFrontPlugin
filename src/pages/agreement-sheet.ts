/**
 * 약관 상세 — 현재 화면 위를 덮는 시트.
 *
 * 휴대폰 번호 입력 화면의 "[필수] 개인정보 제공 동의합니다" 옆 '보기' 를 누르면 열린다.
 *
 * 마케팅 동의 흐름은 SDK 의 renderAgreementPage 가 항목을 외부 브라우저로 열어주지만
 * (agreements/ 를 Cloudflare Pages 로 배포한 주소), 그 기능은 SDK 내부 전용이라
 * 우리 코드에서 쓸 수 없다. 공개된 SDK 표면에 shell 이 없다.
 * 그래서 같은 내용을 화면 안에서 보여준다. 외부 주소·ACL 이 필요 없고 오프라인에서도 뜬다.
 *
 * 문구는 '팜포인트 회원 동의 폼' 원본의 상세보기 화면을 옮긴 것이다.
 * 개정 시 agreements/ 의 두 파일과 함께 고친다.
 */

const SHEET_ID  = "pharm-agreement-sheet";
const STYLE_ID  = "pharm-agreement-sheet-style";

type Section = {
  num:    string;
  title?: string;
  rows?:  Array<[string, string]>;
  body?:  string;
};

const SECTIONS: Section[] = [
  {
    num:   "Ⅰ. 필수 동의",
    title: "포인트 적립 서비스 이용을 위한 수집·이용",
    rows: [
      ["목적", "포인트 회원 식별, 적립·사용·조회 처리, 부정 적립 방지, 적립·사용·소멸 예정 등 서비스 이용 안내. 적립된 포인트는 가맹약국 POS 및 팜페이 앱에서 조회 가능"],
      ["항목", "휴대폰번호 (적립·사용 내역 자동 연동 포함)"],
      ["보유기간", "회원 탈퇴 시 또는 마지막 거래일로부터 5년까지 (전자상거래법상 대금결제 및 재화 등의 공급에 관한 기록 보존 의무)"],
      ["거부권", "동의하지 않을 권리가 있으며, 거부 시 포인트 적립 서비스 이용이 제한됩니다."],
    ],
  },
  {
    num:   "Ⅲ. 처리 위탁 안내",
    title: "개인정보 처리업무 위탁",
    rows: [
      ["수탁업체", "㈜크레소티"],
      ["위탁업무", "팜포인트(CATPOS 부가서비스) 적립·사용·조회·관리 시스템 개발, 운영 및 유지보수 / 팜페이 앱을 통한 회원 본인의 포인트 조회 기능 제공 / 회원의 별도 동의가 있는 경우 약국 명의 프로모션 등 마케팅 정보 발송 대행"],
      ["보유기간", "위탁계약(이용약관) 효력 존속 기간까지, 종료 시 지체 없이 파기 또는 반환"],
    ],
  },
  {
    num:  "Ⅳ. 정보주체의 권리",
    body: "고객은 개인정보 열람·정정·삭제·처리정지·동의철회를 언제든지 요구할 수 있으며, 요구 시 지체 없이 조치합니다.",
  },
  {
    num:   "Ⅴ. 이용 제한 및 포인트의 성격",
    title: "구매 제한 · 가입 제한 · 포인트의 성격",
    rows: [
      ["의약품 구매 제한", "포인트는 건강기능식품·화장품·의약외품 등 비의약품 구매 시에만 적립·사용할 수 있으며, 의약품(전문·일반) 구매대금 결제에는 사용할 수 없습니다. (약사법 제47조 제1항)"],
      ["가입 제한", "만 14세 미만인 회원은 법정대리인의 동의 없이 가입할 수 없습니다. (개인정보 보호법 제22조의2)"],
      ["유효기간·소멸", "포인트 유효기간 및 소멸 기준은 가맹약국이 정하며, 소멸 예정일 이전에 안내를 받습니다. 회원 탈퇴 시 보유 포인트는 즉시 소멸됩니다."],
      ["포인트의 성격", "포인트는 적립한 약국에서만 사용할 수 있고, 현금 환급·양도·타 회원과의 합산이 되지 않습니다. ㈜크레소티가 발행하는 팜페이포인트와는 별개입니다."],
    ],
  },
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  // 화면 전체를 덮는다. 뒤 화면의 입력값·체크 상태는 그대로 남는다.
  s.textContent = `
    #${SHEET_ID} {
      position: fixed; inset: 0; z-index: 9999;
      background: #fff; color: #191f28;
      display: flex; flex-direction: column;
      font-family: "Toss Product Sans", -apple-system, "Malgun Gothic", sans-serif;
    }
    #${SHEET_ID} .ag-head {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 16px 10px; border-bottom: 1px solid #e5e8eb; flex: 0 0 auto;
    }
    #${SHEET_ID} .ag-close {
      width: 36px; height: 36px; border: 0; background: none;
      font-size: 24px; color: #4e5968; cursor: pointer; line-height: 1;
    }
    #${SHEET_ID} .ag-title { font-size: 17px; font-weight: 700; margin: 0; }
    #${SHEET_ID} .ag-body { flex: 1 1 auto; overflow-y: auto; padding: 16px; -webkit-overflow-scrolling: touch; }
    #${SHEET_ID} section { margin-bottom: 22px; }
    #${SHEET_ID} .ag-num { font-size: 12px; font-weight: 700; color: #8b95a1; margin-bottom: 3px; }
    #${SHEET_ID} .ag-sub { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
    #${SHEET_ID} .ag-text { font-size: 13.5px; line-height: 1.6; margin: 0; }
    #${SHEET_ID} .ag-rows { border-top: 1px solid #e5e8eb; }
    #${SHEET_ID} .ag-row { border-bottom: 1px solid #e5e8eb; }
    #${SHEET_ID} .ag-key {
      background: #f9fafb; padding: 7px 10px;
      font-size: 12.5px; font-weight: 700; color: #4e5968; margin: 0;
    }
    #${SHEET_ID} .ag-val { padding: 9px 10px; font-size: 13.5px; line-height: 1.6; margin: 0; }
    #${SHEET_ID} .ag-foot { flex: 0 0 auto; padding: 12px 16px 16px; border-top: 1px solid #e5e8eb; }
    #${SHEET_ID} .ag-done {
      width: 100%; height: 52px; border: 0; border-radius: 12px;
      background: #3182f6; color: #fff; font-size: 17px; font-weight: 700; cursor: pointer;
      font-family: inherit;
    }
  `;
  document.head.appendChild(s);
}

function renderSections(): string {
  return SECTIONS.map((s) => `
    <section>
      <p class="ag-num">${escapeHtml(s.num)}</p>
      ${s.title ? `<p class="ag-sub">${escapeHtml(s.title)}</p>` : ""}
      ${s.body ? `<p class="ag-text">${escapeHtml(s.body)}</p>` : ""}
      ${s.rows ? `<div class="ag-rows">${s.rows.map(([k, v]) => `
        <div class="ag-row">
          <p class="ag-key">${escapeHtml(k)}</p>
          <p class="ag-val">${escapeHtml(v)}</p>
        </div>`).join("")}</div>` : ""}
    </section>
  `).join("");
}

/** 약관 상세를 연다. 이미 열려 있으면 아무것도 하지 않는다. */
export function openAgreementSheet(): void {
  if (document.getElementById(SHEET_ID)) return;
  ensureStyles();

  const el = document.createElement("div");
  el.id = SHEET_ID;
  el.innerHTML = `
    <div class="ag-head">
      <button class="ag-close" data-role="close" type="button" aria-label="닫기">✕</button>
      <p class="ag-title">개인정보 수집·이용 동의서</p>
    </div>
    <div class="ag-body">
      ${renderSections()}
      <p class="ag-text" style="color:#4e5968">문의 · 해당 가맹약국 또는 크레소티 고객센터</p>
    </div>
    <div class="ag-foot">
      <button class="ag-done" data-role="done" type="button">확인했어요</button>
    </div>
  `;
  document.body.appendChild(el);

  const close = (): void => { el.remove(); };
  el.querySelector('[data-role="close"]')?.addEventListener("click", close);
  el.querySelector('[data-role="done"]')?.addEventListener("click", close);
}

/** 화면을 떠날 때 남아 있지 않도록 정리한다. */
export function closeAgreementSheet(): void {
  document.getElementById(SHEET_ID)?.remove();
}
