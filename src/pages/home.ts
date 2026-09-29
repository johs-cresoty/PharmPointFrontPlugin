/**
 * Home 뷰 — 대기 화면 (sdk.template.renderIdlePage).
 *
 * 특수 진입 (CAT_REQUEST_NUM / CAT_REQUEST_CUSTOMER) 은 sessionStorage 로 신호받아
 * phone/customer 입력 서브뷰로 전환.
 */
import { getInactivityTimeoutSeconds, getPointUseConfig, getShowStoreName } from "../features/app-config/app-config.service";
import { setConfig as setAppSessionConfig } from "../features/app-session/app-session.service";
import { getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { showMarketingConsentDone } from "../features/result-page/result-page.service";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay, type PhoneOverlayHandles } from "./overlays";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";

const CAT_REQ_KEY = "pharm_cat_request_mode";

let storeNameOverlay: HTMLElement | null = null;
let overlay: PhoneOverlayHandles | null = null;
let currentPhone = "";
// 대기화면 활성 여부. 매장명 오버레이는 대기화면일 때만 표시 — 입력/약관 서브뷰에선 숨김.
// (pageshow/visibilitychange 시 syncIdleConfig 가 매장명을 다시 그리는 걸 막는다.)
let idleActive = false;

// 무동작 타임아웃 — 입력/약관 서브뷰에서만 활성. 대기화면·결과화면엔 없음.
let stopTimeout: (() => void) | null = null;
let inactivityDuration = 30; // 설정값(미동작 시 대기 시간). renderHome 진입 시 갱신.

// 입력 서브뷰 진입 시 타이머 시작(기존 것 정리 후). 타임아웃 = 뒤로가기와 동일(CAT 취소 + 대기화면).
function armTimeout(): void {
  disarmTimeout();
  stopTimeout = startInactivityTimeout({
    onTimeout: () => {
      stopTimeout = null;
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
    duration: inactivityDuration,
  });
}

function disarmTimeout(): void {
  stopTimeout?.();
  stopTimeout = null;
}

// ─── 매장명 오버레이 (renderIdlePage 위에 얹음) ───

/** 매장명 글자 크기 상한. 짧은 이름은 이 크기로 나온다. */
const STORE_NAME_MAX_PX = 48;
/**
 * 글자 크기 하한.
 *
 * 400px 화면 기준으로 12px 면 31자까지 한 줄에 들어간다. 그보다 긴 상호는
 * 실제로 없다시피 해서, 사실상 어떤 매장명이든 잘리지 않는다.
 * (17자 → 24px, 21자 → 18px, 31자 → 13px)
 * 여기서도 넘치는 극단적인 경우에만 말줄임으로 떨어진다.
 */
const STORE_NAME_MIN_PX = 12;
/** 좌우 여백 — 글자가 화면 끝에 붙지 않게. */
const STORE_NAME_SIDE_PAD = 20;

/**
 * 이름이 한 줄에 들어갈 때까지 글자 크기를 줄인다.
 *
 * 줄바꿈을 막지 않으면 긴 매장명이 두 줄이 되면서 아래 버튼을 덮는다.
 * nowrap 으로 줄바꿈을 막고, 넘치는 동안 1px 씩 줄여 한 줄에 맞춘다.
 */
function fitStoreNameToWidth(): void {
  if (!storeNameOverlay) return;
  const available = storeNameOverlay.clientWidth; // padding 제외한 안쪽 폭
  if (available <= 0) return;

  let size = STORE_NAME_MAX_PX;
  storeNameOverlay.style.fontSize = `${size}px`;
  // nowrap + overflow:hidden 이라 scrollWidth 가 줄바꿈 없는 실제 글자 폭이다.
  while (size > STORE_NAME_MIN_PX && storeNameOverlay.scrollWidth > available) {
    size -= 1;
    storeNameOverlay.style.fontSize = `${size}px`;
  }
}

function positionStoreNameOverlay(): void {
  if (!storeNameOverlay) return;
  const app = document.getElementById("app");
  if (!app) return;
  const r = app.getBoundingClientRect();
  storeNameOverlay.style.left  = `${r.left}px`;
  storeNameOverlay.style.width = `${r.width}px`;
  storeNameOverlay.style.top   = `${r.bottom - 240}px`;
  fitStoreNameToWidth(); // 폭이 정해진 뒤에 크기를 맞춘다
}

function showStoreNameOverlay(name: string): void {
  if (!storeNameOverlay) {
    storeNameOverlay = document.createElement("div");
    storeNameOverlay.style.cssText =
      "position:fixed;text-align:center;color:#ffffff;font-weight:700;letter-spacing:-1px;" +
      "pointer-events:none;z-index:10;box-sizing:border-box;" +
      // 한 줄 고정. 줄바꿈되면 아래 버튼을 덮는다.
      `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 ${STORE_NAME_SIDE_PAD}px;` +
      `font-size:${STORE_NAME_MAX_PX}px;`;
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
  disarmTimeout(); // 대기화면은 무동작 타임아웃 없음
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

  armTimeout();
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

  armTimeout();
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

// 약관 상세 페이지 — 저장소 agreements/ 를 Cloudflare Pages 로 배포한 주소.
//
// ⚠️ 플러그인 자기 도메인(cresoty-pharmpoint.plugin.tossplace.com)에 두면 안 된다.
//    SDK 가 항목을 shell.openExternal 로 외부 브라우저에 넘기는데, 그 브라우저에서는
//    플러그인 도메인이 풀리지 않아 ERR_NAME_NOT_RESOLVED 가 난다.
//    (settings.html 의 리다이렉트가 같은 이유로 실패했던 것과 동일한 제약)
//    따라서 공개 DNS 로 접근 가능한 호스트여야 한다.
//
// ⚠️ 확장자(.html)를 붙이지 않는다. Cloudflare Pages 가 .html 요청을 확장자 없는 주소로
//    308 리다이렉트하는데, 그 리다이렉트가 토스 ACL 검사에 걸려 Access Denied 가 뜬다.
//    확장자 없는 주소는 리다이렉트 없이 200 으로 바로 응답한다.
//
// 문구는 '팜포인트 회원 동의 폼' 원본을 옮긴 것이므로, 개정 시 두 파일을 함께 고친다.
const AGREEMENT_ORIGIN        = "https://pharmpoint-agreements.pages.dev";
const PRIVACY_AGREEMENT_URL   = `${AGREEMENT_ORIGIN}/agreement-privacy`;
const MARKETING_AGREEMENT_URL = `${AGREEMENT_ORIGIN}/agreement-marketing`;

function renderMarketingConsent(): void {
  removeStoreNameOverlay();
  idleActive = false;
  currentPhone = "";

  // 포인트 조회/사용 화면과 동일한 스타일 — minimal-overlay 로 상단 예약 공간 축소해
  // title·keypad 위치가 다른 두 화면과 정확히 일치하도록. 오버레이 hint 는 렌더 안 함.
  // 인라인 개인정보 동의 체크박스는 제외 (동의는 이후 renderAgreementPage 가 담당).
  overlay = mountPhoneOverlay({ hint: "", appMode: "minimal-overlay", agreement: false });

  const goToAgreement = (phone: string): void => {
    overlay?.remove(); // 입력 오버레이 제거 후 약관 화면으로
    overlay = null;
    renderMarketingAgreement(phone);
  };

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "휴대폰 번호를 입력해주세요", subtitle: " " },
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

  armTimeout();
}

function renderMarketingAgreement(phone: string): void {
  armTimeout();
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
      disarmTimeout(); // 결과 화면은 타임아웃 없음
      // 대기화면 직행 대신 결과 화면("입력 완료 / 감사합니다") 표시 후 복귀
      void showMarketingConsentDone({ onTimeout: () => { void renderIdle(); } });
    },
    onBack: () => {
      SocketGateway.sendCATFail("입력을 취소하였습니다.");
      void renderIdle();
    },
  });
}

/**
 * 현재 Home 뷰가 대기화면인지. 입력·약관 서브뷰가 떠 있으면 false.
 *
 * Home 은 경로가 "/" 하나인데 대기화면·번호 입력·고객 조회·마케팅 동의를 모두 담고 있어,
 * 경로만으로는 고객이 조작 중인지 알 수 없다. 가격표시기 전환처럼 대기 상태에서만
 * 허용해야 하는 처리에서 이 값을 확인한다.
 */
export function isIdleActive(): boolean {
  return idleActive;
}

// ─── 진입점 (라우터 등록용) ────────────

export async function renderHome(): Promise<void> {
  const mode = sessionStorage.getItem(CAT_REQ_KEY);
  sessionStorage.removeItem(CAT_REQ_KEY);

  // 입력 서브뷰로 갈 것이 확정된 시점에 먼저 내려둔다.
  // 아래 await 동안에도 소켓 콜백은 계속 도는데, 그때까지 대기화면으로 보이면
  // 그 사이 도착한 카트가 아직 뜨지도 않은 입력 화면을 가격표시기로 덮어쓴다.
  if (mode) idleActive = false;

  // 입력 서브뷰 무동작 타임아웃 duration = 설정값 (미리 로드, 실패 시 기본 30초 유지).
  try { inactivityDuration = await getInactivityTimeoutSeconds(); }
  catch { /* 기본값 유지 */ }

  if (mode === "CAT_REQUEST_NUM")            renderPhoneInput();
  else if (mode === "CAT_REQUEST_CUSTOMER")  renderCustomerLookup();
  else if (mode === "CAT_MARKETING_CONSENT") renderMarketingConsent();
  else                                        void renderIdle();

  // 관리자 설정 화면에서 돌아오면 webview 가 살아있어 render 가 다시 안 돈다.
  // 포그라운드 복귀 시점에 설정을 다시 읽어 반영한다.
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void syncIdleConfig();
  };
  const onPageShow = (): void => { void syncIdleConfig(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);

  onCleanup(() => {
    disarmTimeout();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    overlay?.remove();
    overlay = null;
    removeStoreNameOverlay();
  });
}
