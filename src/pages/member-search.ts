/**
 * MemberSearch 뷰 — 사용자가 대기화면에서 "포인트 조회" 를 눌러 진입.
 * 휴대폰 번호 입력 → getCustomer(회원 확인) → 약관 동의 → 동의 처리 완료 → getPointBalance → ResultNavigator 로 이동.
 *
 * 화면은 새 디자인(Figma 동의 개편 플로우 · 05-1, src/ui/phone-input).
 *   미가입      → 약관 동의 전에 입력란 아래 "등록된 회원이 없습니다" (번호를 고치면 사라진다)
 *   서버 오류   → 서버 오류 팝업
 *   연결 실패   → 네트워크 팝업 (다시 시도)
 */
import { getPointBalance, inquiryFailureNote } from "../features/point-inquiry/point-inquiry.service";
import { goLookupSuccess } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { getInactivityTimeoutSeconds } from "../features/app-config/app-config.service";
import { isUnreachable, showPhoneInput, type PhoneSubmitOutcome } from "../ui/phone-input";
import { CONSENT_SUBTITLE } from "../ui/consent-terms";
import { checkMember } from "./member-check";
import { hideScreen } from "../ui/stage";
import { log } from "../utils/log";
import { maskPhone } from "../utils/pii-mask";

// 회원 여부는 약관 동의 전에 확인했다(checkMember). 동의 처리 완료 [확인] 뒤에는 잔액만 조회한다.
async function submitInquiry(phone: string): Promise<PhoneSubmitOutcome> {
  try {
    const result = await getPointBalance(phone);
    if (result.success && result.customer) {
      log.status(`[팜포인트·조회] 완료 — ${maskPhone(phone)} · 보유 ${(result.customer.pointBalance || 0).toLocaleString()}P`);
      goLookupSuccess({ phone, customer: result.customer });
      return "done";
    }
    log.status(`[팜포인트·조회] 실패 — ${maskPhone(phone)} · ${inquiryFailureNote(result)}`);
    return result.success === false && !result.notFound ? "server" : "notFound";
  } catch (err) {
    const unreachable = isUnreachable(err);
    log.status(
      `[팜포인트·조회] 실패 — ${maskPhone(phone)} · ${unreachable ? "서버에 닿지 못함" : "처리 중 오류"}: ${(err as Error).message}` +
      ` · 확인 필요: ${unreachable ? "네트워크(통신)" : "서버(API)"}`,
    );
    console.error("[MemberSearch] 조회 실패:", err);
    return unreachable ? "network" : "server";
  }
}

export async function renderMemberSearch(): Promise<void> {
  const inactivitySec = await getInactivityTimeoutSeconds();

  showPhoneInput({
    header: { kind: "title", text: "휴대폰 번호를 입력하세요" },
    consentSubtitle: CONSENT_SUBTITLE.lookup,
    inactivitySec,
    checkMember: (phone) => checkMember(phone, "조회"),
    onSubmit: submitInquiry,
    onClose: () => { navigate("/"); },
    onTimeout: () => { navigate("/"); },
  });

  onCleanup(() => { hideScreen(); });
}
