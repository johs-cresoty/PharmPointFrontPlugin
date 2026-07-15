/**
 * PointInquiryService — 고객 조회 / 포인트 잔액 조회.
 *
 * PharmPoint Android CatposCloudApi.getCustomer / getPointBalance 대응.
 */
import { apiClient, POS_COMMON } from "../../api/client";
import { currentTaxNo } from "../../api/config";
import type { ApiEnvelope, CustomerInfo } from "../../api/types";

export type InquiryResult =
  | { success: true;  customer: CustomerInfo }
  | { success: false; error: string };

type CustomerListDto = {
  LIST?: Array<{
    CST_CODE?: string;
    CST_NAME?: string;
    CST_HP?:   string;
    PNT_AMT?:  string;
  }>;
};

type PointBalanceDto = {
  INFO?: Array<{
    CST_CODE?: string;
    CST_NAME?: string;
    CST_HP?:   string;
    CST_GNDR?: string;
    CST_BRTH?: string;
    PNT_BLC?:  string;
  }>;
};

/**
 * 고객 존재 여부 확인 및 포인트 조회.
 * GET /api/terminals/customers
 */
export async function getCustomer(phone: string): Promise<InquiryResult> {
  const { data } = await apiClient.get<ApiEnvelope<CustomerListDto>>(
    "/api/terminals/customers",
    {
      params: {
        TAXNO:      currentTaxNo(),
        CST_HP:     phone,
        CMPTR_NAME: POS_COMMON.CMPTR_NAME,
        POS_VER:    POS_COMMON.POS_VER,
      },
    },
  );

  if (data.CODE === "0000" && (data.DATA?.LIST?.length ?? 0) > 0) {
    const dto = data.DATA!.LIST![0];
    return {
      success: true,
      customer: {
        customerCode:  dto.CST_CODE ?? "",
        customerName:  dto.CST_NAME ?? "",
        customerPhone: dto.CST_HP   ?? "",
        pointBalance:  parseInt(dto.PNT_AMT ?? "0", 10) || 0,
      },
    };
  }
  return { success: false, error: "등록된 회원이 아닙니다." };
}

/**
 * 포인트 잔액 상세 조회.
 * GET /api/terminals/customers/code
 */
export async function getPointBalance(phone: string): Promise<InquiryResult> {
  const { data } = await apiClient.get<ApiEnvelope<PointBalanceDto>>(
    "/api/terminals/customers/code",
    {
      params: {
        TAXNO:      currentTaxNo(),
        CST_HP:     phone,
        CMPTR_NAME: POS_COMMON.CMPTR_NAME,
        POS_VER:    POS_COMMON.POS_VER,
        POS_GUBN:   POS_COMMON.POS_GUBN,
      },
    },
  );

  if (data.CODE === "0000" && (data.DATA?.INFO?.length ?? 0) > 0) {
    const dto = data.DATA!.INFO![0];
    return {
      success: true,
      customer: {
        customerCode:   dto.CST_CODE ?? "",
        customerName:   dto.CST_NAME ?? "",
        customerPhone:  dto.CST_HP   ?? "",
        customerGender: dto.CST_GNDR ?? "",
        customerBirth:  dto.CST_BRTH ?? "",
        pointBalance:   parseInt(dto.PNT_BLC ?? "0", 10) || 0,
      },
    };
  }
  return { success: false, error: data.MSG || "등록된 회원이 없습니다." };
}
