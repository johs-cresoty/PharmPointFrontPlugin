/**
 * PointTransactionService — 포인트 적립 예상 + 적립/사용 확정 (upsert).
 *
 * PharmPoint Android CatposCloudApi.estimatePoint / upsertCustomerPoint 대응.
 *
 * estimatePoint 재시도: CODE 8888 / 9303 → 최대 3회 (1s, 2s 백오프).
 *   소진 시 graceful (data: null) — Android EstimatePointRetryableException 동일.
 *
 * upsertCustomerPoint 3가지 호출 형태:
 *   1) BySleSeq         — estimate 로 받은 SLE_SEQ 로 확정
 *   2) BySinglePayment  — 단건 결제 정보로 확정
 *   3) ByMultiplePayment — 복합 결제 (2건) 정보로 확정
 */
import { apiClient, POS_COMMON } from "../../api/client";
import { currentTaxNo } from "../../api/config";
import type { ApiEnvelope } from "../../api/types";

// ── 재시도 정책 ─────────────────────────────────

const RETRYABLE_CODES = new Set<string>(["8888", "9303"]);
const RETRY_DELAYS_MS = [1000, 2000];
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// ── 도메인 커맨드/결과 타입 ────────────────────

export type PaymentDetail = {
  trnGubn: string;
  trnDate: string;
  trnTime: string;
  appNum:  string;
  trnAmt:  string | number;
};

export type CommitBySleSeqCommand = {
  customerPhone:   string;
  transactionDate: string;
  sleSeq:          string;
};

export type CommitBySinglePaymentCommand = {
  customerPhone:     string;
  transactionDate:   string;
  transactionGubn:   string;
  transactionTime:   string;
  transactionAmount: string | number;
  approvalNumber:    string;
};

export type CommitByMultiplePaymentCommand = {
  customerPhone:     string;
  transactionDate:   string;
  transactionAmount: string | number;
  payments:          PaymentDetail[];
};

export type UpsertData = {
  sleSeq:        string;
  customerCode:  string;
  customerPhone: string;
  customerName:  string;
  pointAmount:   string;
  pointBalance:  string;
};

export type UpsertResult =
  | { success: true;  data: UpsertData }
  | { success: false; error: string };

export type EstimateCommand = {
  trnDate?:  string;
  trnGubn?:  string;
  trnAmt?:   string | number;
  appNum?:   string;
  payments?: PaymentDetail[];
};

export type EstimateData = {
  sleSeq:      string;
  pointAmount: string;
  raw?:        unknown;
};

export type EstimateResult =
  | { success: true;  data: EstimateData | null; retried?: boolean; lastCode?: string }
  | { success: false; error: string };

// ── 내부 헬퍼 ─────────────────────────────────

type UpsertResponseDto = {
  INFO?: Array<{
    SLE_SEQ?:  string;
    CST_CODE?: string;
    CST_HP?:   string;
    CST_NAME?: string;
    PNT_AMT?:  string;
    PNT_BLC?:  string;
  }>;
};

type EstimateResponseDto = {
  INFO?: Array<{
    SLE_SEQ?: string;
    PNT_AMT?: string;
  }>;
};

function baseBody(cmd: { customerPhone: string; transactionDate: string }): Record<string, unknown> {
  return {
    TAXNO:      currentTaxNo(),
    CMPTR_NAME: POS_COMMON.CMPTR_NAME,
    POS_VER:    POS_COMMON.POS_VER,
    CST_HP:     cmd.customerPhone,
    TRN_DATE:   cmd.transactionDate,
  };
}

function paymentDetailDto(p: PaymentDetail): Record<string, string> {
  return {
    TRN_GUBN: p.trnGubn,
    TRN_DATE: p.trnDate,
    TRN_TIME: p.trnTime,
    APP_NUM:  p.appNum,
    TRN_AMT:  String(p.trnAmt),
  };
}

async function callUpsert(body: Record<string, unknown>): Promise<UpsertResult> {
  const { data } = await apiClient.post<ApiEnvelope<UpsertResponseDto>>(
    "/api/terminals/customers/code",
    body,
  );
  if (data.CODE === "0000") {
    const dto = data.DATA?.INFO?.[0];
    return {
      success: true,
      data: {
        sleSeq:        dto?.SLE_SEQ  ?? "",
        customerCode:  dto?.CST_CODE ?? "",
        customerPhone: dto?.CST_HP   ?? "",
        customerName:  dto?.CST_NAME ?? "",
        pointAmount:   dto?.PNT_AMT  ?? "0",
        pointBalance:  dto?.PNT_BLC  ?? "0",
      },
    };
  }
  return { success: false, error: data.MSG || "upsertCustomerPoint failed" };
}

// ── 공개 API ────────────────────────────────

/** SLE_SEQ 로 확정 */
export async function commitBySleSeq(cmd: CommitBySleSeqCommand): Promise<UpsertResult> {
  return callUpsert({
    ...baseBody(cmd),
    SLE_SEQ: cmd.sleSeq,
  });
}

/** 단건 결제 정보로 확정 */
export async function commitBySinglePayment(cmd: CommitBySinglePaymentCommand): Promise<UpsertResult> {
  return callUpsert({
    ...baseBody(cmd),
    TRN_GUBN: cmd.transactionGubn,
    TRN_TIME: cmd.transactionTime,
    TRN_AMT:  String(cmd.transactionAmount),
    APP_NUM:  cmd.approvalNumber,
  });
}

/** 복합 결제 정보로 확정 */
export async function commitByMultiplePayment(cmd: CommitByMultiplePaymentCommand): Promise<UpsertResult> {
  return callUpsert({
    ...baseBody(cmd),
    TRN_AMT: String(cmd.transactionAmount),
    ADD:     cmd.payments.map(paymentDetailDto),
  });
}

/**
 * 포인트 예상 적립 계산.
 * POST /api/point/estimate
 * 재시도 소진 시 { success: true, data: null } 반환 (Android Success(null) 동일).
 */
export async function estimatePoint(cmd: EstimateCommand): Promise<EstimateResult> {
  const body: Record<string, unknown> = {
    TAXNO:      currentTaxNo(),
    CMPTR_NAME: POS_COMMON.CMPTR_NAME,
    POS_VER:    POS_COMMON.POS_VER,
    ...(cmd.trnDate  && { TRN_DATE: cmd.trnDate }),
    ...(cmd.trnGubn  && { TRN_GUBN: cmd.trnGubn }),
    ...(cmd.trnAmt   && { TRN_AMT:  String(cmd.trnAmt) }),
    ...(cmd.appNum   && { APP_NUM:  cmd.appNum }),
    ...(cmd.payments && { ADD:      cmd.payments.map(paymentDetailDto) }),
  };

  let lastCode = "-9999";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const { data } = await apiClient.post<ApiEnvelope<EstimateResponseDto>>(
      "/api/point/estimate",
      body,
    );
    const code = data.CODE ?? "-9999";
    if (code === "0000") {
      const dto = data.DATA?.INFO?.[0];
      return {
        success: true,
        data: {
          sleSeq:      dto?.SLE_SEQ ?? "",
          pointAmount: dto?.PNT_AMT ?? "0",
          raw:         data.DATA,
        },
      };
    }
    if (!RETRYABLE_CODES.has(code)) {
      return { success: false, error: data.MSG || `estimatePoint failed: ${code}` };
    }
    lastCode = code;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  // 재시도 소진 → graceful pass
  return { success: true, data: null, retried: true, lastCode };
}
