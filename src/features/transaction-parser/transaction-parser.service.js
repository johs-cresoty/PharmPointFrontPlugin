/**
 * TransactionParserService — 소켓 raw 필드 → 구조화된 TransactionData 변환.
 *
 * Android: com.cresoty.catpospoint.domain.parser.TransactionDataParser
 *
 * TransactionData 형태:
 * {
 *   trnDate:   string,   // yyyyMMdd
 *   trnTime:   string,   // HHmmss
 *   appNum:    string,   // 승인번호 (복합결제 시 첫 번째 건)
 *   trnGubn:   string,   // 거래구분 ("P" → "M" 정규화)
 *   payAmount: number,   // 총 결제 금액
 *   payments?: Array<PaymentDetail>  // 복합결제 시 2건
 * }
 *
 * PaymentDetail 형태:
 * {
 *   appNum:  string,
 *   trnGubn: string,
 *   trnDate: string,
 *   trnTime: string,
 *   trnAmt:  string,
 * }
 *
 * TERMINAL 전문 포맷 (단일):
 *   list[1]=dateTime(14), list[2]=appNum, list[3]=method,
 *   list[5]=otc, list[6]=vat
 *
 * TERMINAL 전문 포맷 (복합):
 *   list[1]=dateTime(14), list[2]=appNum1, list[3]=method1,
 *   list[5]=otc1, list[6]=vat1,
 *   list[7]=appNum2, list[8]=method2,
 *   list[10]=otc2, list[11]=vat2
 *
 * TERMINAL 003 (사용 요청):
 *   list[3]=otc, list[4]=vat (payAmount 만 의미 있음)
 *
 * CAT 전문 포맷 (단일):
 *   fields[0]=dateTime(14), [1]=appNum, [2]=method, [3]=amount
 *
 * CAT 전문 포맷 (복합):
 *   fields[0]=dateTime(14),
 *   [1]=appNum1, [2]=method1, [3]=amount1,
 *   [4]=appNum2, [5]=method2, [6]=amount2
 *
 * CAT 006 (사용 요청):
 *   fields[0]=dateTime(14), fields[1]=amount
 */
window.TransactionParserService = (function () {

  const at = (arr, idx, fallback = '') => {
    const v = arr?.[idx];
    return (v === undefined || v === null) ? fallback : String(v);
  };

  const toInt = (s, fallback = 0) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeGubn = (g) => (g === 'P' ? 'M' : g);

  function makePayment({ appNum, gubn, date, time, amount }) {
    return {
      appNum:  appNum,
      trnGubn: normalizeGubn(gubn),
      trnDate: date,
      trnTime: time,
      trnAmt:  String(amount),
    };
  }

  // ── TERMINAL ─────────────────────────────────────────

  function parseTerminalSingle(data) {
    const dateTime = at(data, 1);
    const otc = toInt(at(data, 5, '0'));
    const vat = toInt(at(data, 6, '0'));
    return {
      trnDate:   dateTime.slice(0, 8),
      trnTime:   dateTime.slice(8),
      appNum:    at(data, 2),
      trnGubn:   normalizeGubn(at(data, 3, 'M')),
      payAmount: otc + vat,
    };
  }

  function parseTerminalComplex(data) {
    const dateTime = at(data, 1);
    const date = dateTime.slice(0, 8);
    const time = dateTime.slice(8);
    const otc1 = toInt(at(data, 5,  '0'));
    const vat1 = toInt(at(data, 6,  '0'));
    const otc2 = toInt(at(data, 10, '0'));
    const vat2 = toInt(at(data, 11, '0'));
    const first  = makePayment({
      appNum: at(data, 2), gubn: at(data, 3, 'M'),
      date, time, amount: otc1 + vat1,
    });
    const second = makePayment({
      appNum: at(data, 7), gubn: at(data, 8, 'M'),
      date, time, amount: otc2 + vat2,
    });
    return {
      trnDate:   date,
      trnTime:   time,
      appNum:    first.appNum,
      trnGubn:   first.trnGubn,
      payAmount: otc1 + vat1 + otc2 + vat2,
      payments:  [first, second],
    };
  }

  function parseTerminalUsePoint(data) {
    const otc = toInt(at(data, 3, '0'));
    const vat = toInt(at(data, 4, '0'));
    return {
      trnDate:   '',
      trnTime:   '',
      appNum:    '',
      trnGubn:   '',
      payAmount: otc + vat,
    };
  }

  // ── CAT ──────────────────────────────────────────────
  // data 는 CatposCodec.parse() 결과의 data 객체

  function parseCatSingle(data) {
    const date = String(data?.trnDate ?? '');
    return {
      trnDate:   date,
      trnTime:   '',
      appNum:    String(data?.appNum ?? ''),
      trnGubn:   normalizeGubn(String(data?.method ?? 'M')),
      payAmount: toInt(String(data?.amount ?? '0')),
    };
  }

  function parseCatComplex(data) {
    const date = String(data?.trnDate ?? '');
    const payments = Array.isArray(data?.payments) ? data.payments : [];
    const p0 = payments[0] || {};
    const p1 = payments[1] || {};
    const amount0 = toInt(String(p0.amount ?? '0'));
    const amount1 = toInt(String(p1.amount ?? '0'));
    const first  = makePayment({ appNum: String(p0.appNum ?? ''), gubn: String(p0.method ?? 'M'), date, time: '', amount: amount0 });
    const second = makePayment({ appNum: String(p1.appNum ?? ''), gubn: String(p1.method ?? 'M'), date, time: '', amount: amount1 });
    return {
      trnDate:   date,
      trnTime:   '',
      appNum:    first.appNum,
      trnGubn:   first.trnGubn,
      payAmount: amount0 + amount1,
      payments:  [first, second],
    };
  }

  function parseCatUsePoint(data) {
    return {
      trnDate:   String(data?.trnDate ?? ''),
      trnTime:   '',
      appNum:    '',
      trnGubn:   '',
      payAmount: toInt(String(data?.payAmount ?? '0')),
    };
  }

  return {
    parseTerminalSingle,
    parseTerminalComplex,
    parseTerminalUsePoint,
    parseCatSingle,
    parseCatComplex,
    parseCatUsePoint,
  };
})();
