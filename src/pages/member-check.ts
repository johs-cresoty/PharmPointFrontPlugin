/**
 * 약관 동의 전 회원 확인 — 조회 · 사용 흐름의 번호 입력 [확인] 에서 부른다 (phone-input checkMember).
 *
 * 등록된 회원이면 약관 동의로 넘어가고, 미등록이면 번호 입력 화면에 "등록된 회원이 없습니다".
 * 잔액 조회는 동의 처리 완료 [확인] 뒤에 각 흐름이 한다.
 * 적립은 부르지 않는다 — 미등록 번호는 서버가 임시 고객으로 등록해 적립한다.
 */
import { getCustomer, inquiryFailureNote } from "../features/point-inquiry/point-inquiry.service";
import { isUnreachable, type MemberCheckOutcome } from "../ui/phone-input";
import { log } from "../utils/log";
import { maskPhone } from "../utils/pii-mask";

export async function checkMember(phone: string, flow: "조회" | "사용"): Promise<MemberCheckOutcome> {
  try {
    const exist = await getCustomer(phone);
    if (exist.success && exist.customer) return "member";
    // 미가입인지 서버가 못 받은 것인지 갈라 남긴다. 문의를 받아도 원인을 알 수 있게.
    log.status(`[팜포인트·${flow}] 회원 조회 실패 — ${maskPhone(phone)} · ${inquiryFailureNote(exist)}`);
    return exist.success === false && !exist.notFound ? "server" : "notFound";
  } catch (err) {
    const unreachable = isUnreachable(err);
    log.status(
      `[팜포인트·${flow}] 회원 조회 실패 — ${maskPhone(phone)} · ${unreachable ? "서버에 닿지 못함" : "처리 중 오류"}: ${(err as Error).message}` +
      ` · 확인 필요: ${unreachable ? "네트워크(통신)" : "서버(API)"}`,
    );
    console.error("[member-check] 회원 확인 실패:", err);
    return unreachable ? "network" : "server";
  }
}
