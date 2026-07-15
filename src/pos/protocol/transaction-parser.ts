/**
 * TransactionParser — 소켓 raw 필드 → 구조화된 TransactionData 변환.
 *
 * PharmPoint Android com.cresoty.catpospoint.domain.parser.TransactionDataParser 대응.
 *
 * TERMINAL 전문 인덱스 (fields):
 *   001 단일: [1]=dateTime(14), [2]=appNum, [3]=method, [5]=otc, [6]=vat
 *   002 복합: [1]=dateTime(14), [2]=appNum1, [3]=method1, [5]=otc1, [6]=vat1,
 *             [7]=appNum2, [8]=method2, [10]=otc2, [11]=vat2
 *   003 사용: [3]=otc, [4]=vat (payAmount 만 의미)
 *
 * CAT 전문 (CatposCodec.parse().data):
 *   단일: { trnDate, appNum, method, amount }
 *   복합: { trnDate, payments: [{appNum, method, amount}, {...}] }
 *   006:  { trnDate, payAmount }
 */

export type PaymentDetail = {
  appNum:  string;
  trnGubn: string;   // "P" → "M" 정규화됨
  trnDate: string;   // yyyyMMdd
  trnTime: string;   // HHmmss
  trnAmt:  string;
};

export type TransactionData = {
  trnDate:   string;
  trnTime:   string;
  appNum:    string;
  trnGubn:   string;
  payAmount: number;
  payments?: [PaymentDetail, PaymentDetail];
};

// ── 유틸 ─────────────────────────────────────────

function at(arr: readonly string[] | undefined, idx: number, fallback = ""): string {
  const v = arr?.[idx];
  return v === undefined || v === null ? fallback : String(v);
}

function toInt(s: string, fallback = 0): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeGubn(g: string): string {
  return g === "P" ? "M" : g;
}

function makePayment(args: {
  appNum: string; gubn: string; date: string; time: string; amount: number;
}): PaymentDetail {
  return {
    appNum:  args.appNum,
    trnGubn: normalizeGubn(args.gubn),
    trnDate: args.date,
    trnTime: args.time,
    trnAmt:  String(args.amount),
  };
}

// ── TERMINAL ─────────────────────────────────────────

/** TERMINAL 001 — 단일 결제 적립 */
export function parseTerminalSingle(fields: readonly string[]): TransactionData {
  const dateTime = at(fields, 1);
  const otc = toInt(at(fields, 5, "0"));
  const vat = toInt(at(fields, 6, "0"));
  return {
    trnDate:   dateTime.slice(0, 8),
    trnTime:   dateTime.slice(8),
    appNum:    at(fields, 2),
    trnGubn:   normalizeGubn(at(fields, 3, "M")),
    payAmount: otc + vat,
  };
}

/** TERMINAL 002 — 복합 결제 적립 */
export function parseTerminalComplex(fields: readonly string[]): TransactionData {
  const dateTime = at(fields, 1);
  const date = dateTime.slice(0, 8);
  const time = dateTime.slice(8);
  const otc1 = toInt(at(fields, 5,  "0"));
  const vat1 = toInt(at(fields, 6,  "0"));
  const otc2 = toInt(at(fields, 10, "0"));
  const vat2 = toInt(at(fields, 11, "0"));
  const first  = makePayment({ appNum: at(fields, 2), gubn: at(fields, 3, "M"), date, time, amount: otc1 + vat1 });
  const second = makePayment({ appNum: at(fields, 7), gubn: at(fields, 8, "M"), date, time, amount: otc2 + vat2 });
  return {
    trnDate:   date,
    trnTime:   time,
    appNum:    first.appNum,
    trnGubn:   first.trnGubn,
    payAmount: otc1 + vat1 + otc2 + vat2,
    payments:  [first, second],
  };
}

/** TERMINAL 003 — 포인트 사용 요청 (payAmount 만 의미) */
export function parseTerminalUsePoint(fields: readonly string[]): TransactionData {
  const otc = toInt(at(fields, 3, "0"));
  const vat = toInt(at(fields, 4, "0"));
  return {
    trnDate:   "",
    trnTime:   "",
    appNum:    "",
    trnGubn:   "",
    payAmount: otc + vat,
  };
}

// ── CAT ──────────────────────────────────────────────
// data 는 CatposCodec.parse() 결과의 data 객체

type CatSinglePayload  = { trnDate?: unknown; appNum?: unknown; method?: unknown; amount?: unknown };
type CatComplexPayment = { appNum?: unknown; method?: unknown; amount?: unknown };
type CatComplexPayload = { trnDate?: unknown; payments?: unknown };
type CatUsePayload     = { trnDate?: unknown; payAmount?: unknown };

/** CAT 004/EARN_SINGLE_REQ — 단일 결제 적립 */
export function parseCatSingle(data: Record<string, unknown>): TransactionData {
  const d = data as CatSinglePayload;
  const date = String(d.trnDate ?? "");
  return {
    trnDate:   date,
    trnTime:   "",
    appNum:    String(d.appNum ?? ""),
    trnGubn:   normalizeGubn(String(d.method ?? "M")),
    payAmount: toInt(String(d.amount ?? "0")),
  };
}

/** CAT 005/EARN_MULTI_REQ — 복합 결제 적립 */
export function parseCatComplex(data: Record<string, unknown>): TransactionData {
  const d = data as CatComplexPayload;
  const date = String(d.trnDate ?? "");
  const paymentsRaw = Array.isArray(d.payments) ? (d.payments as CatComplexPayment[]) : [];
  const p0 = paymentsRaw[0] ?? {};
  const p1 = paymentsRaw[1] ?? {};
  const amount0 = toInt(String(p0.amount ?? "0"));
  const amount1 = toInt(String(p1.amount ?? "0"));
  const first  = makePayment({ appNum: String(p0.appNum ?? ""), gubn: String(p0.method ?? "M"), date, time: "", amount: amount0 });
  const second = makePayment({ appNum: String(p1.appNum ?? ""), gubn: String(p1.method ?? "M"), date, time: "", amount: amount1 });
  return {
    trnDate:   date,
    trnTime:   "",
    appNum:    first.appNum,
    trnGubn:   first.trnGubn,
    payAmount: amount0 + amount1,
    payments:  [first, second],
  };
}

/** CAT 006/USE_POINT_REQ — 포인트 사용 요청 (고객 미선택) */
export function parseCatUsePoint(data: Record<string, unknown>): TransactionData {
  const d = data as CatUsePayload;
  return {
    trnDate:   String(d.trnDate ?? ""),
    trnTime:   "",
    appNum:    "",
    trnGubn:   "",
    payAmount: toInt(String(d.payAmount ?? "0")),
  };
}
