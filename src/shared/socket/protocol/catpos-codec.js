/**
 * CatposCodec — CATPOS(PC) JSON 전문 인코더/디코더
 *
 * Android: CatposParser  +  SocketResponseRepositoryImpl.sendCATXxx
 *
 * 수신 포맷: {"command":"<CMD>","data":{...}}
 * 송신 포맷: {"command":"<CMD_ACK>","data":{...}}
 *
 * 의존: SocketConstants
 */
window.CatposCodec = (function () {

  const C = SocketConstants;

  /**
   * 수신 텍스트 → { command, data } 또는 null.
   * @param {string} text
   */
  function parse(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      const msg = JSON.parse(trimmed);
      if (!msg || typeof msg.command !== 'string') return null;
      return {
        command: msg.command,
        data:    msg.data && typeof msg.data === 'object' ? msg.data : {},
      };
    } catch {
      return null;
    }
  }

  function makeJson(command, data) {
    return JSON.stringify({ command, data: data || {} });
  }

  // ── 송신 헬퍼 (PAD → PC) ───────────────────────

  /** CONNECT_ACK */
  function ok() {
    return makeJson(C.CATPOS_CONNECT_ACK, {});
  }

  /** PHONE_INPUT_ACK : { phone } */
  function ackPhoneNumber(phone) {
    return makeJson(C.CATPOS_PHONE_INPUT_ACK, { phone });
  }

  /** CUSTOMER_REGISTER_ACK : { phone, customerCode } */
  function ackCustomerInfo(phone, customerCode) {
    return makeJson(C.CATPOS_CUSTOMER_REGISTER_ACK, { phone, customerCode });
  }

  /** FAIL : { message: "다음에하기" } */
  function fail() {
    return makeJson(C.CATPOS_FAIL, { message: '다음에하기' });
  }

  /** USE_POINT_ACK : { customerCode, balance, usePoint } */
  function ackUsePointResult(customerCode, balance, usePoint) {
    return makeJson(C.CATPOS_USE_POINT_ACK, { customerCode, balance, usePoint });
  }

  /** USE_POINT_WITH_CUSTOMER_ACK : { usePoint } */
  function ackUsePointWithCustomer(usePoint) {
    return makeJson(C.CATPOS_USE_POINT_WITH_CUSTOMER_ACK, { usePoint });
  }

  return {
    parse,
    ok, fail,
    ackPhoneNumber, ackCustomerInfo,
    ackUsePointResult, ackUsePointWithCustomer,
  };
})();
