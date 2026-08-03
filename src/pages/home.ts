/**
 * Home 뷰 — 대기 화면 (sdk.template.renderIdlePage).
 *
 * 특수 진입 (CAT_REQUEST_NUM / CAT_REQUEST_CUSTOMER) 은 sessionStorage 로 신호받아
 * phone/customer 입력 서브뷰로 전환.
 */
import { getPointUseConfig, getShowStoreName } from "../features/app-config/app-config.service";
import { setConfig as setAppSessionConfig } from "../features/app-session/app-session.service";
import { getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { showMarketingConsentDone } from "../features/result-page/result-page.service";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay, type PhoneOverlayHandles } from "./overlays";

const CAT_REQ_KEY = "pharm_cat_request_mode";

let storeNameOverlay: HTMLElement | null = null;
let overlay: PhoneOverlayHandles | null = null;
let currentPhone = "";
// 대기화면 활성 여부. 매장명 오버레이는 대기화면일 때만 표시 — 입력/약관 서브뷰에선 숨김.
// (pageshow/visibilitychange 시 syncIdleConfig 가 매장명을 다시 그리는 걸 막는다.)
let idleActive = false;

// ─── 매장명 오버레이 (renderIdlePage 위에 얹음) ───

function positionStoreNameOverlay(): void {
  if (!storeNameOverlay) return;
  const app = document.getElementById("app");
  if (!app) return;
  const r = app.getBoundingClientRect();
  storeNameOverlay.style.left  = `${r.left}px`;
  storeNameOverlay.style.width = `${r.width}px`;
  storeNameOverlay.style.top   = `${r.bottom - 240}px`;
}

function showStoreNameOverlay(name: string): void {
  if (!storeNameOverlay) {
    storeNameOverlay = document.createElement("div");
    storeNameOverlay.style.cssText =
      "position:fixed;text-align:center;color:#ffffff;font-size:48px;font-weight:700;letter-spacing:-1px;pointer-events:none;z-index:10;";
    document.body.appendChild(storeNameOverlay);
    window.addEventListener("resize", positionStoreNameOverlay);
  }
  storeNameOverlay.textContent = name;
  storeNameOverlay.style.display = "";
  positionStoreNameOverlay();
}

function hideStoreNameOverlay(): void {
  if (storeNameOverlay) storeNameOverlay.style.display = "none";
}

function removeStoreNameOverlay(): void {
  storeNameOverlay?.remove();
  storeNameOverlay = null;
}

// ─── 대기화면 렌더 ─────────────────────────

async function renderIdle(): Promise<void> {
  overlay?.remove();
  overlay = null;
  idleActive = true;

  sdk.template.renderIdlePage({
    type:   "oneButton",
    button: {
      text:    "포인트 조회",
      onClick: () => {
        // 화면 전환 중 SDK 가 버튼을 잠시 중앙으로 재배치하는 잔상 감춤.
        const app = document.getElementById("app");
        if (app) {
          app.style.transition = "opacity 0.15s ease-out";
          app.style.opacity    = "0";
        }
        navigate("/member-search");
      },
    },
  } as never);

  await syncIdleConfig();
}

/**
 * 대기화면 관련 설정 재조회 & 반영.
 * Toss 웹뷰는 관리자 설정 화면 → 대기화면 복귀 시 webview 컨텍스트를 살려둔 채 돌아오므로
 * 라우터 render 함수가 재실행되지 않음. visibilitychange/pageshow 시점에 이 함수를 다시 호출해
 * 설정 변경 사항이 즉각 반영되게 한다.
 */
async function syncIdleConfig(): Promise<void> {
  try {
    const cfg = await getPointUseConfig();
    setAppSessionConfig({ minPoint: cfg.minPoint, isMinPointEnabled: cfg.isMinPointEnabled });
  } catch (e) { console.warn("[Home] config sync fail", e); }

  const [showStoreName, storeName] = await loadStoreNameConfig();
  if (idleActive && showStoreName && storeName) showStoreNameOverlay(storeName);
  else                                          hideStoreNameOverlay();
}

async function loadStoreNameConfig(): Promise<[boolean, string]> {
  try {
    const [showRes, merchantRes] = await Promise.allSettled([
      getShowStoreName(),
      sdk.app.getMerchant(),
    ]);
    const show = showRes.status === "fulfilled" ? showRes.value : false;
    const name = merchantRes.status === "fulfilled" ? (merchantRes.value?.name ?? "") : "";
    return [show, name];
  } catch (e) {
    console.warn("[Home] store name config load fail", e);
    return [false, ""];
  }
}

// ─── CAT_REQUEST_NUM (휴대폰만) ──────────

function renderPhoneInput(): void {
  removeStoreNameOverlay();
  idleActive = false;
  currentPhone = "";

  overlay = mountPhoneOverlay({ hint: "휴대폰 번호 입력하고 포인트 받아가세요.", appMode: "phone-overlay-on" });

  const onSubmitPhone = async (phone: string): Promise<void> => {
    await SocketGateway.sendCATPhoneNumber(phone);
    void renderIdle();
  };

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "", subtitle: "" },
    input: {
      placeholder: "전화번호 입력",
      onChange: (value) => { currentPhone = value; },
    },
    onSubmit: (phone) => { currentPhone = phone; triggerPhoneSubmit(onSubmitPhone); },
    onBack: () => {
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
  });

  overlay.backBtnEl.addEventListener("click", () => {
    SocketGateway.sendCATFail("입력을 취소하였습니다.");
    void renderIdle();
  });
  overlay.confirmBtnEl.addEventListener("click", () => triggerPhoneSubmit(onSubmitPhone));
}

function triggerPhoneSubmit(handler: (phone: string) => void | Promise<void>): void {
  if (currentPhone.length !== 11) {
    sdk.template.openToast({ message: "휴대폰 번호 11자리를 모두 입력해주세요.", icon: "error" });
    return;
  }
  if (overlay && !overlay.agreementEl.checked) {
    sdk.template.openToast({ message: "개인정보 제공 동의가 필요합니다.", icon: "error" });
    return;
  }
  void handler(currentPhone);
}

// ─── CAT_REQUEST_CUSTOMER (조회 → 회원코드 응답) ─

function renderCustomerLookup(): void {
  removeStoreNameOverlay();
  idleActive = false;

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "휴대폰 번호를 입력해주세요.", subtitle: "회원 조회" },
    disclaimer: "등록되지 않은 회원인 경우 신규 등록됩니다.",
    input: { placeholder: "전화번호 입력" },
    onSubmit: async (phone) => {
      const res = await getPointBalance(phone);
      if (!res.success || !res.customer) {
        sdk.template.openToast({ message: res.success === false ? res.error : "등록된 회원이 없습니다.", icon: "error" });
        return;
      }
      await SocketGateway.sendCATCustomerInfo(phone, res.customer.customerCode ?? "");
      void renderIdle();
    },
    onBack: () => {
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
  });
}

// ─── CAT_MARKETING_CONSENT (연락처 마케팅 동의 요청) ─
// 1) 휴대폰 번호 입력 (포인트 조회 입력 화면 재사용, 문구만 변경)
// 2) 토스 약관 동의 템플릿 (필수 1 + 선택 1)
// 3) 입력 번호 + 선택(마케팅) 동의 여부를 캣포스로 전송
//
// ⚠️ 이 흐름은 renderAgreementPage 가 동의를 담당하므로, 휴대폰 입력 화면의
//    인라인 개인정보 동의 체크박스(mountPhoneOverlay)는 쓰지 않는다.
// ⚠️ href 는 renderAgreementPage 필수 필드(약관 상세 링크) — 없으면 바텀시트/제출이 동작 안 함.

const MARKETING_OPTIONAL_ID = "marketing"; // 선택(마케팅) 동의 항목 id — 체크 여부 판별용
// TODO: 실제 약관 상세 페이지 URL 로 교체 (현재 placeholder)
const PRIVACY_AGREEMENT_URL   = "https://cresoty-pharmpoint.plugin.tossplace.com/agreements/privacy";
const MARKETING_AGREEMENT_URL = "https://cresoty-pharmpoint.plugin.tossplace.com/agreements/marketing";

function renderMarketingConsent(): void {
  removeStoreNameOverlay();
  idleActive = false;
  currentPhone = "";

  // 포인트 조회 번호 입력 화면 재사용 — 힌트 문구 변경 + 인라인 개인정보 동의 체크박스 제외
  // (동의는 이후 renderAgreementPage 가 담당).
  overlay = mountPhoneOverlay({ hint: "휴대폰 번호를 입력해 주세요.", appMode: "phone-overlay-on", agreement: false });

  const goToAgreement = (phone: string): void => {
    overlay?.remove(); // 입력 오버레이 제거 후 약관 화면으로
    overlay = null;
    renderMarketingAgreement(phone);
  };

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "", subtitle: "" },
    input: {
      placeholder: "전화번호 입력",
      onChange: (value) => { currentPhone = value; },
    },
    onSubmit: (phone) => { currentPhone = phone; triggerPhoneSubmit(goToAgreement); },
    onBack: () => {
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
  });

  overlay.backBtnEl.addEventListener("click", () => {
    SocketGateway.sendCATFail("입력을 취소하였습니다.");
    void renderIdle();
  });
  overlay.confirmBtnEl.addEventListener("click", () => triggerPhoneSubmit(goToAgreement));
}

function renderMarketingAgreement(phone: string): void {
  sdk.template.renderAgreementPage({
    title:    "약관에 동의해 주세요",
    subtitle: "",
    agreements: {
      required: [
        { id: "privacy", title: "개인정보 수집 및 동의", href: PRIVACY_AGREEMENT_URL },
      ],
      optional: [
        { id: MARKETING_OPTIONAL_ID, title: "마케팅 수신 동의", href: MARKETING_AGREEMENT_URL },
      ],
    },
    onSubmit: (agreedIds) => {
      // 동의된 id 배열에 선택(마케팅) id 포함 여부 = 마케팅 동의 여부
      const marketingConsent = agreedIds.includes(MARKETING_OPTIONAL_ID);
      void SocketGateway.sendCATMarketingConsent(phone, marketingConsent);
      // 대기화면 직행 대신 결과 화면("입력 완료 / 감사합니다") 표시 후 복귀
      void showMarketingConsentDone({ onTimeout: () => { void renderIdle(); } });
    },
    onBack: () => {
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
  });
}

// ─── 진입점 (라우터 등록용) ────────────

export function renderHome(): void {
  const mode = sessionStorage.getItem(CAT_REQ_KEY);
  sessionStorage.removeItem(CAT_REQ_KEY);

  if (mode === "CAT_REQUEST_NUM")            renderPhoneInput();
  else if (mode === "CAT_REQUEST_CUSTOMER")  renderCustomerLookup();
  else if (mode === "CAT_MARKETING_CONSENT") renderMarketingConsent();
  else                                        void renderIdle();

  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void syncIdleConfig();
  };
  const onPageShow = (): void => { void syncIdleConfig(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);

  onCleanup(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    overlay?.remove();
    overlay = null;
    removeStoreNameOverlay();
  });
}
