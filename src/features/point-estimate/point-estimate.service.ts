/**
 * PointEstimateService — 포인트 적립 예상치 조회.
 *
 * 재시도 정책: CODE 8888 / 9303 → 최대 3회 (1s, 2s 백오프).
 * 재시도 소진 시 graceful (data: null) — Android 동일.
 *
 * ※ 상위 orchestration (PointEarnService) 이 대체로 PointTransactionService.estimatePoint 를 직접 호출하므로
 *   이 서비스는 단독 사용 시 (외부 진입) 를 위한 편의 wrapper.
 */
import { apiClient, POS_COMMON } from "../../api/client";
import { currentTaxNo } from "../../api/config";
import type { ApiEnvelope } from "../../api/types";
import type { PaymentDetail } from "../point-transaction/point-transaction.service";

const RETRYABLE_CODES = new Set<string>(["8888", "9303"]);
const RETRY_DELAYS_MS = [1000, 2000];
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export type EstimateSingleCommand = {
  trnDate: string;
  trnGubn: string;
  trnAmt:  string | number;
  appNum:  string;
};

export type EstimateData = {
  sleSeq:      string;
  pointAmount: string;
};

export type EstimateResult =
  | { success: true;  data: EstimateData | null; retried?: boolean; lastCode?: string }
  | { success: false; error: string };

type EstimateResponseDto = {
  INFO?: Array<{ SLE_SEQ?: string; PNT_AMT?: string }>;
};

function buildSingleBody(cmd: EstimateSingleCommand): Record<string, unknown> {
  return {
    TAXNO:      currentTaxNo(),
    CMPTR_NAME: POS_COMMON.CMPTR_NAME,
    POS_VER:    POS_COMMON.POS_VER,
    TRN_DATE:   cmd.trnDate,
    TRN_GUBN:   cmd.trnGubn,
    TRN_AMT:    String(cmd.trnAmt),
    APP_NUM:    cmd.appNum,
  };
}

function buildComplexBody(payments: PaymentDetail[]): Record<string, unknown> {
  return {
    TAXNO:      currentTaxNo(),
    CMPTR_NAME: POS_COMMON.CMPTR_NAME,
    POS_VER:    POS_COMMON.POS_VER,
    ADD: payments.map((p) => ({
      TRN_GUBN: p.trnGubn,
      TRN_DATE: p.trnDate,
      TRN_TIME: p.trnTime,
      APP_NUM:  p.appNum,
      TRN_AMT:  String(p.trnAmt),
    })),
  };
}

async function callWithRetry(body: Record<string, unknown>): Promise<EstimateResult> {
  let lastCode = "-9999";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const { data } = await apiClient.post<ApiEnvelope<EstimateResponseDto>>("/api/point/estimate", body);
    const code = data.CODE ?? "-9999";
    if (code === "0000") {
      const dto = data.DATA?.INFO?.[0];
      return {
        success: true,
        data: {
          sleSeq:      dto?.SLE_SEQ ?? "",
          pointAmount: dto?.PNT_AMT ?? "",
        },
      };
    }
    if (!RETRYABLE_CODES.has(code)) {
      return { success: false, error: data.MSG || `estimatePoint failed: ${code}` };
    }
    lastCode = code;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return { success: true, data: null, retried: true, lastCode };
}

/** 단건 결제 적립 예상 */
export function estimateSingle(cmd: EstimateSingleCommand): Promise<EstimateResult> {
  return callWithRetry(buildSingleBody(cmd));
}

/** 복합 결제 적립 예상 */
export function estimateComplex(payments: PaymentDetail[]): Promise<EstimateResult> {
  return callWithRetry(buildComplexBody(payments));
}
