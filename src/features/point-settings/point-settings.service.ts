/**
 * PointSettingsService — 포인트 적립·사용 설정 조회.
 *
 * PharmPoint Android CatposCloudApi.getPointSaveSetting / getPointAmountSetting 대응.
 */
import { apiClient, POS_COMMON } from "../../api/client";
import { currentTaxNo } from "../../api/config";
import type { ApiEnvelope } from "../../api/types";

const DEFAULT_MIN_AMOUNT = 20000;

export type SaveSettingResult =
  | { success: true;  isSave: boolean }
  | { success: false; error: string };

export type AmountSettingResult =
  | { success: true;  minAmount: number }
  | { success: false; error: string };

type SaveSettingDto = {
  INFO?: Array<{ PNT_GUBN?: string }>;
};

type AmountSettingDto = {
  INFO?: Array<{ BASE_AMT?: string }>;
};

/** GET /api/point/settings — 적립 활성 여부 (PNT_GUBN != "NON") */
export async function getPointSaveSetting(): Promise<SaveSettingResult> {
  const { data } = await apiClient.get<ApiEnvelope<SaveSettingDto>>("/api/point/settings", {
    params: {
      TAXNO:      currentTaxNo(),
      CMPTR_NAME: POS_COMMON.CMPTR_NAME,
      POS_VER:    POS_COMMON.POS_VER,
      POS_GUBN:   POS_COMMON.POS_GUBN,
    },
  });

  if (data.CODE === "0000") {
    const pntGubn = data.DATA?.INFO?.[0]?.PNT_GUBN ?? "";
    return { success: true, isSave: pntGubn !== "NON" };
  }
  return { success: false, error: data.MSG || "적립 설정 조회 실패" };
}

/** GET /api/point/payment-settings — 사용 최소 금액 (INFO 중 최소 BASE_AMT) */
export async function getPointAmountSetting(): Promise<AmountSettingResult> {
  const { data } = await apiClient.get<ApiEnvelope<AmountSettingDto>>("/api/point/payment-settings", {
    params: {
      TAXNO:      currentTaxNo(),
      CMPTR_NAME: POS_COMMON.CMPTR_NAME,
      POS_VER:    POS_COMMON.POS_VER,
      POS_GUBN:   POS_COMMON.POS_GUBN,
    },
  });

  if (data.CODE === "0000") {
    const amounts = (data.DATA?.INFO ?? [])
      .map((it) => parseInt(it.BASE_AMT ?? "", 10))
      .filter((n) => Number.isFinite(n));
    const minAmount = amounts.length ? Math.min(...amounts) : DEFAULT_MIN_AMOUNT;
    return { success: true, minAmount };
  }
  return { success: false, error: data.MSG || "사용 설정 조회 실패" };
}
