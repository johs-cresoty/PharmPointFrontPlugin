/**
 * MemberSearch 뷰 — 사용자가 대기화면에서 "포인트 조회" 를 눌러 진입.
 * 휴대폰 번호 입력 → getCustomer → getPointBalance → ResultNavigator 로 이동.
 */
import { getCustomer, getPointBalance } from "../features/point-inquiry/point-inquiry.service";
import { goLookupSuccess, goLookupFail } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay } from "./overlays";

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

  let storeName = "";
  try {
    const merchant = await sdk.app.getMerchant();
    storeName = merchant.name ?? "";
  } catch (e) {
    console.warn("[MemberSearch] 매장명 조회 실패", e);
  }

  const overlay = mountPhoneOverlay({ storeName });

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "", subtitle: "" },
    input: {
      placeholder: "전화번호 입력",
      onChange: (value) => { currentPhone = value; },
    },
    onSubmit: (phone) => { currentPhone = phone; },
    onBack:   () => { navigate("/"); },
  });

  overlay.backBtnEl.addEventListener("click",    () => { navigate("/"); });
  overlay.confirmBtnEl.addEventListener("click", () => { triggerSubmit(overlay.agreementEl); });

  onCleanup(() => { overlay.remove(); });
}
