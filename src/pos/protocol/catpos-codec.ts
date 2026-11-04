/**
 * CatposCodec — CATPOS(PC) JSON 전문 인코더/디코더.
 *
 * PharmPoint Android CatposParser + SocketResponseRepositoryImpl.sendCATXxx 미러.
 *
 * 수신 포맷: {"command":"<CMD>","data":{...}}
 * 송신 포맷: {"command":"<CMD_ACK>","data":{...}}
 */
import { SocketConstants as C } from "./socket-constants";

export type CatposMessage = {
  command: string;
  data:    Record<string, unknown>;
};

/**
 * 수신 텍스트 → CatposMessage 또는 null (형식 오류).
 */
export function parse(text: string): CatposMessage | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const msg = JSON.parse(trimmed);
    if (!msg || typeof msg.command !== "string") return null;
    return {
      command: msg.command,
      data:    msg.data && typeof msg.data === "object" ? msg.data : {},
    };
  } catch {
    return null;
  }
}

function makeJson(command: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ command, data });
}

// ── 송신 헬퍼 (PAD → PC) ───────────────────────

/** CONNECT_ACK */
export function ok(): string {
  return makeJson(C.CATPOS_CONNECT_ACK, {});
}

/** PHONE_INPUT_ACK : { phone } */
export function ackPhoneNumber(phone: string): string {
  return makeJson(C.CATPOS_PHONE_INPUT_ACK, { phone });
}

/** CUSTOMER_REGISTER_ACK : { phone, customerCode } */
export function ackCustomerInfo(phone: string, customerCode: string): string {
  return makeJson(C.CATPOS_CUSTOMER_REGISTER_ACK, { phone, customerCode });
}

/**
 * FAIL : { message } — 실패 응답. 메시지 미지정 시 기본값 "다음에하기".
 * 상황별로 다른 메시지 사용:
 *   - "포인트가 부족합니다"    : 포인트 부족 결과 화면으로 이어질 때
 *   - "입력을 취소하였습니다." : 뒤로가기 버튼으로 취소
 *   - 그 외 (서버 에러 등)      : "다음에하기" 기본값
 */
export function fail(message = "다음에하기"): string {
  return makeJson(C.CATPOS_FAIL, { message });
}

/** USE_POINT_ACK : { customerCode, balance, usePoint } */
export function ackUsePointResult(
  customerCode: string,
  balance: string | number,
  usePoint: string | number,
): string {
  return makeJson(C.CATPOS_USE_POINT_ACK, { customerCode, balance, usePoint });
}

/** USE_POINT_WITH_CUSTOMER_ACK : { usePoint } */
export function ackUsePointWithCustomer(usePoint: string | number): string {
  return makeJson(C.CATPOS_USE_POINT_WITH_CUSTOMER_ACK, { usePoint });
}

/**
 * 약관 동의 화면의 항목별 동의 여부 (만 14세 확인은 보내지 않는다). 네이버 marketing-codec 과 같다.
 *   privacyRequired  [필수] 약국 서비스 개인정보 수집·이용
 *   medicationSms    [선택] 복약안내 문자 받기
 *   pharmacyAd       [선택] 광고성 정보 수신 — 혜택 안내 문자 (약국)
 *   cresotyAd        [선택] 광고성 정보 수신 — 제휴 혜택 문자 (크레소티)
 */
export type MarketingConsentResult = {
  privacyRequired: boolean;
  medicationSms: boolean;
  pharmacyAd: boolean;
  cresotyAd: boolean;
};

/** MARKETING_CONSENT_ACK : { phone, privacyRequired, medicationSms, pharmacyAd, cresotyAd } — 입력 번호 + 항목별 동의 여부 */
export function ackMarketingConsent(phone: string, consent: MarketingConsentResult): string {
  return makeJson(C.CATPOS_MARKETING_CONSENT_ACK, {
    phone,
    privacyRequired: consent.privacyRequired,
    medicationSms: consent.medicationSms,
    pharmacyAd: consent.pharmacyAd,
    cresotyAd: consent.cresotyAd,
  });
}
