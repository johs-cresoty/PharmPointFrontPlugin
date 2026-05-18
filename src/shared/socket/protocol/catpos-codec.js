/**
 * CatposCodec — CATPOS(PC) 텍스트 전문 인코더/디코더
 *
 * Android: CatposParser  +  SocketResponseRepositoryImpl.sendCATXxx
 *
 * 수신 포맷: "CAT|cmd|f1|f2|...\r\n"
 * 송신 포맷:
 *   - 성공: "OK|f1|f2|...\r\n"
 *   - 실패: "FAIL|code|msg\r\n"
 *
 * 의존: SocketConstants
 */
window.CatposCodec = (function () {

  const C = SocketConstants;

  /**
   * 수신 텍스트 → { system, command, fields } 또는 null.
   * @param {string} text - 트림된 텍스트 (개행 제거 권장)
   */
  function parse(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.replace(/[\r\n]+$/, '').trim();
    if (!trimmed) return null;

    const parts = trimmed.split('|');
    if (parts.length < 2) return null;
    if (parts[0] !== C.CATPOS) return null;

    return {
      system:  parts[0],
      command: parts[1],
      fields:  parts.slice(2),
    };
  }

  function makeOk(...fields) {
    return ['OK', ...fields].join('|') + '\r\n';
  }

  function makeFail(code, message) {
    return ['FAIL', String(code), String(message)].join('|') + '\r\n';
  }

  /** CAT 000 연결 응답 : "OK|\r\n" (필드 없음, 파이프 포함) */
  function ok() {
    return 'OK|\r\n';
  }

  // ── 자주 쓰는 응답 헬퍼 (Android SocketResponseRepositoryImpl 1:1) ─

  /** CAT 001 응답 : OK|phone */
  function ackPhoneNumber(phone) {
    return makeOk(phone);
  }

  /** CAT 002 응답 : OK|phone|customerCode */
  function ackCustomerInfo(phone, customerCode) {
    return makeOk(phone, customerCode);
  }

  /** 공통 실패 : FAIL|100|다음에하기 */
  function fail() {
    return makeFail(100, '다음에하기');
  }

  /** CAT 006 응답 : OK|customerCode|balance|usePoint */
  function ackUsePointResult(customerCode, balance, usePoint) {
    return makeOk(customerCode, balance, usePoint);
  }

  /** CAT 007 응답 : OK|usePoint */
  function ackUsePointWithCustomer(usePoint) {
    return makeOk(usePoint);
  }

  return {
    parse,
    makeOk, makeFail, ok, fail,
    ackPhoneNumber, ackCustomerInfo,
    ackUsePointResult, ackUsePointWithCustomer,
  };
})();
