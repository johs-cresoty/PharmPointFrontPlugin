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
  /**
   * notFound — 서버는 정상 응답했는데 그 번호의 회원이 없는 경우.
   *
   * 미가입은 고장이 아니라 흔한 상황이다. 서버 오류와 같은 실패로 뭉뚱그리면
   * 진단 기록에서 "서버를 봐야 하는 건"과 "그냥 회원이 아닌 건"이 구분되지 않아,
   * 문의를 엉뚱한 쪽으로 넘기게 된다.
   */
  | { success: false; error: string; notFound?: boolean };

/**
 * 진단 기록에 적을 조회 실패 사유와 소관.
 *
 * 조회 실패는 대부분 미가입이다. 그걸 서버 장애와 같은 줄로 적으면 문의를 받은
 * 사람이 서버팀에 넘기게 된다. 어느 쪽인지 여기서 갈라 적는다.
 */
export function inquiryFailureNote(res: InquiryResult): string {
  if (res.success)  return "회원 정보가 비어 있음 · 소관: 플러그인(프론트)";
  if (res.notFound) return `${res.error} · 정상 동작(고장 아님)`;
  return `${res.error} · 소관: 서버(API)`;
}

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
  // 응답 자체는 정상인데 목록이 비었으면 미가입이다. 서버 문제가 아니다.
  if (data.CODE === "0000") {
    return { success: false, error: "등록된 회원이 아닙니다.", notFound: true };
  }
  // 화면 문구는 호출부가 따로 정하므로(항상 "등록된 회원이 없습니다") 여기 문구는
  // 진단 기록에만 쓰인다. 서버가 준 사유를 그대로 실어 보낸다.
  return { success: false, error: data.MSG || `회원 조회 실패(코드 ${data.CODE})` };
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
  // 이 문구는 호출부가 토스트로 그대로 띄우므로 바꾸지 않는다.
  // 미가입인지 서버 오류인지는 notFound 로만 가른다.
  return {
    success:  false,
    error:    data.MSG || "등록된 회원이 없습니다.",
    notFound: data.CODE === "0000",
  };
}
