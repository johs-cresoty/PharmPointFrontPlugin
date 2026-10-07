/**
 * 팜포인트 백엔드 (catpos.co.kr) 공통 응답 envelope 및 도메인 타입.
 *
 * 서버 envelope 형태: { CODE, MSG, DATA?, DTL? } — 대문자 키.
 */

export type ApiEnvelope<T = unknown> = {
  CODE: string;   // "0000" 성공, 그 외 실패
  MSG:  string;
  DATA?: T;
  DTL?:  string;  // 실패 상세 (필수값 누락 필드명 등)
};

// ── 도메인 모델 (클라이언트 사용 형태 — camelCase 로 변환) ─────

export type CustomerInfo = {
  customerCode:  string;
  customerName:  string;
  customerPhone: string;
  pointBalance:  number;
  customerGender?: string;
  customerBirth?:  string;
};

