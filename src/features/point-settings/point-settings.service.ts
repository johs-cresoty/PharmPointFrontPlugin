/**
 * PointSettingsService — 포인트 적립 설정 조회.
 *
 * PharmPoint Android CatposCloudApi.getPointSaveSetting 대응.
 */
import { apiClient, POS_COMMON } from "../../api/client";
import { currentTaxNo } from "../../api/config";
import type { ApiEnvelope } from "../../api/types";

export type SaveSettingResult =
  | { success: true;  isSave: boolean }
  | { success: false; error: string };

type SaveSettingDto = {
  INFO?: Array<{ PNT_GUBN?: string }>;
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

