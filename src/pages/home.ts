/**
 * Home 뷰 — 대기 화면 (새 디자인 Figma 01-1, src/ui/idle).
 *
 * 특수 진입 (CAT_REQUEST_NUM / CAT_REQUEST_CUSTOMER) 은 sessionStorage 로 신호받아
 * phone/customer 입력 서브뷰로 전환.
 */
import { getIdleThemeIndex, getInactivityTimeoutSeconds, getPointUseConfig } from "../features/app-config/app-config.service";
import { refreshPriceDisplayTheme } from "./price-display";
import { setConfig as setAppSessionConfig } from "../features/app-session/app-session.service";
import { getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";
import { showResult } from "../ui/show-result";
import { showPhoneInput } from "../ui/phone-input";
import { showMarketingAgreement } from "../ui/marketing-agreement";
import { hideScreen } from "../ui/stage";
import { showIdle } from "../ui/idle";
import { lockAdmin, unlockAdmin } from "../features/admin/admin-session";

const CAT_REQ_KEY = "pharm_cat_request_mode";

// 대기화면 활성 여부. 입력/약관 서브뷰에선 false.
// (pageshow/visibilitychange 시 syncIdleConfig 가 입력 화면 위에 대기화면을 다시 그리는 걸 막는다.)
let idleActive = false;
// 대기화면에 보일 매장명 (토스 매장 정보). 매장명은 늘 보인다 — 길게 눌러 관리자로 들어가는 자리다.
// 아직 못 읽었으면 null.
let idleStoreName: string | null = null;
// 대기화면 배경 테마 (환경설정 > 테마설정). 0 = 테마A.
let idleThemeIndex = 0;

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

// ─── 대기화면 렌더 ─────────────────────────

function drawIdle(): void {
  showIdle({
    themeIndex: idleThemeIndex,
    storeName: idleStoreName,
    onLookup: () => {
      // 번호 입력 화면이 뜨기 전 잠깐 아래 Template API 화면(#app)이 비치지 않게 숨긴다.
      // member-search 가 새 화면을 띄운 뒤 되돌린다.
      const app = document.getElementById("app");
      if (app) app.style.opacity = "0";
      navigate("/member-search");
    },
    // 관리자 비밀번호 팝업이 떠 있는 동안은 대기 상태가 아니다 — 카트가 와도 가격표시기로 바꾸지 않는다.
    onAdminOpenChange: (open) => { idleActive = !open; },
    onAdminEnter: () => {
      unlockAdmin();
      navigate("/settings");
    },
    // 오른쪽 위 4번 탭 — 토스 단말 설정 화면
    onOpenDeviceSettings: () => {
      void sdk.app.openSetting().catch((e) => console.warn("[Home] 토스 설정 열기 실패", e));
    },
  });
}

async function renderIdle(): Promise<void> {
  disarmTimeout(); // 대기화면은 무동작 타임아웃 없음
  hideScreen();    // 입력 · 결과 화면이 떠 있었다면 내린다 (새 화면으로 다시 띄운다)
  lockAdmin();     // 대기화면으로 돌아오면 관리자 진입 권한을 회수한다
  idleActive = true;
  drawIdle();

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

  // 매장명을 못 읽으면 이전에 읽은 이름을 그대로 둔다.
  const storeName = await loadStoreName();
  if (storeName) idleStoreName = storeName;
  idleThemeIndex = await getIdleThemeIndex();
  if (idleActive) drawIdle();

  // 가격표시 테마도 미리 읽어 둔다 — 카트가 오면 기다리지 않고 맞는 테마로 그린다.
  void refreshPriceDisplayTheme();
}

async function loadStoreName(): Promise<string> {
  try {
    const m = await sdk.app.getMerchant();
    return m?.name ?? "";
  } catch (e) {
    console.warn("[Home] 매장명 조회 실패", e);
    return "";
  }
}

// ─── CAT_REQUEST_NUM (휴대폰만) ──────────

/** 입력 서브뷰 공통 — 취소(X · 무입력)는 캣포스에 FAIL 회신 후 대기화면. */
function cancelToIdle(): void {
  SocketGateway.sendCATFail("입력을 취소하였습니다.");
  void renderIdle();
}

// 번호 입력 화면은 새 디자인(Figma 04-1). 무입력 타이머도 화면이 직접 관리한다.
function renderPhoneInput(): void {
  idleActive = false;

  showPhoneInput({
    header: { kind: "title", text: "휴대폰 번호를 입력하세요" },
    agreement: true,
    inactivitySec: inactivityDuration,
    onSubmit: async (phone) => {
      await SocketGateway.sendCATPhoneNumber(phone);
      void renderIdle();
      return "done";
    },
    onClose: cancelToIdle,
    onTimeout: cancelToIdle,
  });
}

// ─── CAT_REQUEST_CUSTOMER (조회 → 회원코드 응답) ─
// 조회 화면과 같은 번호 입력 화면(Figma 04-1)을 쓴다. 미가입은 입력란 아래 안내(05-1).

function renderCustomerLookup(): void {
  idleActive = false;

  showPhoneInput({
    header: { kind: "title", text: "휴대폰 번호를 입력하세요" },
    agreement: true,
    inactivitySec: inactivityDuration,
    onSubmit: async (phone) => {
      const res = await getPointBalance(phone);
      if (!res.success || !res.customer) {
        return res.success === false && !res.notFound ? "server" : "notFound";
      }
      await SocketGateway.sendCATCustomerInfo(phone, res.customer.customerCode ?? "");
      void renderIdle();
      return "done";
    },
    onClose: cancelToIdle,
    onTimeout: cancelToIdle,
  });
}

// ─── CAT_MARKETING_CONSENT (연락처 마케팅 동의 요청) ─
// 1) 휴대폰 번호 입력 — 새 디자인 (Figma 04-5, 인라인 개인정보 동의 줄 없음)
// 2) 약관 동의 — 새 디자인 (Figma 07-1 · 07-2, 필수 1 + 선택 1, 약관 상세는 화면 안에서)
// 3) 입력 번호 + 선택(마케팅) 동의 여부를 캣포스로 전송 → 결과 화면("입력 완료")
//
// 예전에는 SDK renderAgreementPage 가 약관 상세를 외부 브라우저로 열어서
// agreements/ 를 별도 주소(pharmpoint-agreements.pages.dev)에 올려 두었다. 이제 그 주소는 쓰지 않는다.

function renderMarketingConsent(): void {
  idleActive = false;

  // 번호 입력은 새 디자인(Figma 04-5) — 인라인 개인정보 동의 없음 (동의는 다음 약관 화면에서).
  showPhoneInput({
    header: { kind: "title", text: "휴대폰 번호를 입력하세요" },
    agreement: false,
    inactivitySec: inactivityDuration,
    onSubmit: async (phone) => {
      renderMarketingAgreement(phone);
      return "done";
    },
    onClose: cancelToIdle,
    onTimeout: cancelToIdle,
  });
}

function renderMarketingAgreement(phone: string): void {
  armTimeout();
  showMarketingAgreement({
    onConfirm: (marketingConsent) => {
      void SocketGateway.sendCATMarketingConsent(phone, marketingConsent);
      disarmTimeout(); // 결과 화면은 타임아웃 없음
      // 대기화면 직행 대신 결과 화면("입력 완료 / 감사합니다") 표시 후 복귀
      void showResult({ mode: "MARKETING_DONE", onDone: () => { void renderIdle(); } });
    },
    onClose: cancelToIdle,
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
    // 다른 경로로 떠났다 — 늦게 끝난 syncIdleConfig 가 대기화면을 다시 띄우지 않게.
    idleActive = false;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    hideScreen();
  });
}
