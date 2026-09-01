/**
 * MemberSearch 뷰 — 사용자가 대기화면에서 "포인트 조회" 를 눌러 진입.
 * 휴대폰 번호 입력 → getCustomer → getPointBalance → ResultNavigator 로 이동.
 */
import { getCustomer, getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { goLookupSuccess, goLookupFail } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay } from "./overlays";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";
import { getInactivityTimeoutSeconds } from "../features/app-config/app-config.service";

let currentPhone = "";

async function submitInquiry(phone: string): Promise<void> {
  try {
    const exist = await getCustomer(phone);
    if (!exist.success || !exist.customer) {
      sdk.template.openToast({ message: "등록된 회원이 없습니다.", icon: "error" });
      return;
    }
    const result = await getPointBalance(phone);
    if (result.success && result.customer) {
      goLookupSuccess({ phone, customer: result.customer });
    } else {
      goLookupFail({ phone, error: result.success === false ? result.error : undefined });
    }
  } catch (err) {
    console.error("[MemberSearch] 조회 실패:", err);
    goLookupFail({ phone, error: `조회 중 오류가 발생했습니다. (${(err as Error).message})` });
  }
}

function triggerSubmit(agreementEl: HTMLInputElement): void {
  const phone = currentPhone || "";
  if (phone.length !== 11) {
    sdk.template.openToast({ message: "휴대폰 번호 11자리를 모두 입력해주세요.", icon: "error" });
    return;
  }
  if (!agreementEl.checked) {
    sdk.template.openToast({ message: "개인정보 제공 동의가 필요합니다.", icon: "error" });
    return;
  }
  void submitInquiry(phone);
}

export async function renderMemberSearch(): Promise<void> {
  currentPhone = "";

  const app = document.getElementById("app");

  // 오버레이 상단은 back 버튼 하나만 — minimal-overlay 모드로 padding-top 축소해
  // 하단 SDK 영역(input + keypad + button) 이 잘리지 않게 한다.
  // 매장명·hint 모두 표시 안 함(SDK 메인타이틀이 안내 역할).
  const overlay = mountPhoneOverlay({ storeName: "", hint: "", appMode: "minimal-overlay" });

  sdk.template.renderInputPage({
    type: "phone",
    // subtitle 은 non-breaking space( ) — 보이지는 않지만 라인 높이는 예약해
    // 포인트 사용 화면(subtitle="15,000원 결제") 과 title·keypad 위치를 동일하게 유지.
    top:  { title: "포인트를 조회할게요", subtitle: " " },
    input: {
      placeholder: "전화번호 입력",
      onChange: (value) => { currentPhone = value; },
    },
    onSubmit: (phone) => { currentPhone = phone; },
    onBack:   () => { navigate("/"); },
  });

  overlay.backBtnEl.addEventListener("click",    () => { navigate("/"); });
  overlay.confirmBtnEl.addEventListener("click", () => { triggerSubmit(overlay.agreementEl); });

  // 대기화면에서 opacity 0 으로 페이드아웃 후 진입한 경우 다시 페이드인.
  if (app) {
    // 한 프레임 뒤에 opacity 복원 → 새 페이지 레이아웃 완성 후 자연스럽게 나타남
    requestAnimationFrame(() => {
      app.style.transition = "opacity 0.2s ease-in";
      app.style.opacity    = "1";
    });
  }

  const inactivitySec = await getInactivityTimeoutSeconds();
  const stopTimeout = startInactivityTimeout({ onTimeout: () => { navigate("/"); }, duration: inactivitySec });

  onCleanup(() => {
    stopTimeout();
    overlay.remove();
    if (app) app.style.opacity = "1";
  });
}
