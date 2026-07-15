/**
 * Home 뷰 — 대기 화면 (sdk.template.renderIdlePage).
 *
 * 특수 진입 (CAT_REQUEST_NUM / CAT_REQUEST_CUSTOMER) 은 sessionStorage 로 신호받아
 * phone/customer 입력 서브뷰로 전환.
 */
import { getShowStoreName } from "../features/app-config/app-config.service";
import { getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay, type PhoneOverlayHandles } from "./overlays";

const CAT_REQ_KEY = "pharm_cat_request_mode";

let storeNameOverlay: HTMLElement | null = null;
let overlay: PhoneOverlayHandles | null = null;
let currentPhone = "";

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

  sdk.template.renderIdlePage({
    type:   "oneButton",
    button: {
      text:    "포인트 조회",
      onClick: () => { navigate("/member-search"); },
    },
  } as never);

  // 매장명 조회 후 표시 (미노출 설정이면 hide)
  const [showStoreName, storeName] = await loadStoreNameConfig();
  if (showStoreName && storeName) showStoreNameOverlay(storeName);
  else                            hideStoreNameOverlay();
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

// ─── 진입점 (라우터 등록용) ────────────

export function renderHome(): void {
  const mode = sessionStorage.getItem(CAT_REQ_KEY);
  sessionStorage.removeItem(CAT_REQ_KEY);

  if (mode === "CAT_REQUEST_NUM")           renderPhoneInput();
  else if (mode === "CAT_REQUEST_CUSTOMER") renderCustomerLookup();
  else                                       void renderIdle();

  onCleanup(() => {
    overlay?.remove();
    overlay = null;
    removeStoreNameOverlay();
  });
}
