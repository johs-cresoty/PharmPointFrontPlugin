// 약관 상세 문구 — Figma「커넥트_고객화면_디자인」 07-3 두 장 그대로.
//   개인정보 수집 및 동의 (node 68:447) · 마케팅 정보 수신 동의 (node 61:777)
//
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/agreement-content.ts 를 함께 고친다.
//
// 원본은 '팜포인트 회원 동의 폼'이다. Figma 는 화면에 맞게 한 항목을 본문 줄과
// 회색 보조 줄로 나누고 일부를 굵게 강조했다 — 문구 자체는 원본과 같다.
// 번호는 화면마다 새로 매긴다(필수 Ⅰ~Ⅳ, 선택 Ⅰ~Ⅲ). 원본 동의 폼은 Ⅰ~Ⅴ 한 벌이다.

/** 본문 조각 — 문자열은 보통 글씨, { b } 는 굵게. */
export type TextPart = string | { b: string };

export type AgreementLine = {
  parts: TextPart[];
  /** 줄 전체를 굵게. */
  bold?: boolean;
  /** 줄 높이(px). Figma 가 줄마다 26 · 27 로 다르게 두었다. */
  lineHeight: 26 | 27;
};

export type AgreementField = {
  label: string;
  /** 거부권처럼 파란 이름표로 강조하는 항목. */
  notice?: boolean;
  /** 본문 줄 (굵거나 보통, 16px). */
  main?: AgreementLine;
  /** 회색 보조 줄 (15px). */
  sub?: string;
  /** 점 목록 (위탁업무). */
  tasks?: string[];
};

export type AgreementSection = {
  num: string;
  title?: string;
  fields?: AgreementField[];
  /** 항목 없이 문단 하나인 절 (정보주체의 권리). */
  body?: TextPart[];
};

export type AgreementDoc = { title: string; sections: AgreementSection[] };

const ENTRUST: AgreementSection = {
  num: "II. 처리 위탁 안내",
  title: "개인정보 처리업무 위탁",
  fields: [
    { label: "수탁업체", main: { parts: ["㈜크레소티"], bold: true, lineHeight: 26 } },
    {
      label: "위탁업무",
      tasks: [
        "팜포인트(CATPOS 부가서비스) 적립·사용·조회·관리 시스템 개발, 운영 및 유지보수 /",
        "팜페이 앱을 통한 회원 본인의 포인트 조회 기능 제공 /",
        "회원의 별도 동의가 있는 경우 약국 명의 프로모션 등 마케팅 정보 발송 대행",
      ],
    },
    { label: "보유기간", main: { parts: ["위탁계약(이용약관) 효력 존속 기간까지, 종료 시 지체 없이 파기 또는 반환"], lineHeight: 26 } },
  ],
};

const RIGHTS: AgreementSection = {
  num: "III. 정보주체의 권리",
  body: ["고객은 개인정보 ", { b: "열람·정정·삭제·처리정지·동의철회" }, "를 언제든지 요구할 수 있으며, 요구 시 지체 없이 조치합니다."],
};

/** [필수] 개인정보 수집 및 동의 */
export const PRIVACY_DOC: AgreementDoc = {
  title: "개인정보 수집 및 동의",
  sections: [
    {
      num: "I. 필수 동의",
      title: "포인트 적립 서비스 이용을 위한 수집·이용",
      fields: [
        {
          label: "목적",
          main: { parts: ["포인트 회원 식별, 적립·사용·조회 처리, 부정 적립 방지, 적립·사용·소멸 예정 등 서비스 이용 안내."], lineHeight: 26 },
          sub: "적립된 포인트는 가맹약국 POS 및 팜페이 앱에서 조회 가능",
        },
        { label: "항목", main: { parts: ["휴대폰번호"], bold: true, lineHeight: 27 }, sub: "(적립·사용 내역 자동 연동 포함)" },
        {
          label: "보유기간",
          main: { parts: ["회원 탈퇴 시 또는 마지막 거래일로부터 5년까지"], lineHeight: 26 },
          sub: "전자상거래법상 대금결제 및 재화 등의 공급에 관한 기록 보존 의무",
        },
        {
          label: "거부권",
          notice: true,
          main: { parts: ["동의하지 않을 권리가 있으며, 거부 시 포인트 적립 서비스 이용이 제한됩니다."], bold: true, lineHeight: 27 },
        },
      ],
    },
    ENTRUST,
    RIGHTS,
    {
      num: "IV. 이용 제한 및 포인트의 성격",
      title: "구매 제한 · 가입 제한 · 포인트의 성격",
      fields: [
        {
          label: "의약품 구매 제한",
          main: {
            parts: [
              "포인트는 건강기능식품·화장품·의약외품 등 비의약품 구매 시에만 적립·사용할 수 있으며, ",
              { b: "의약품(전문·일반) 구매대금 결제에는 사용할 수 없습니다." },
            ],
            lineHeight: 26,
          },
          sub: "(약사법 제47조 제1항)",
        },
        {
          label: "가입 제한",
          main: { parts: ["만 14세 미만인 회원은 법정대리인의 동의 없이 가입할 수 없습니다."], bold: true, lineHeight: 26 },
          sub: "(개인정보 보호법 제22조의2)",
        },
        {
          label: "유효기간·소멸",
          main: {
            parts: [
              "포인트 유효기간 및 소멸 기준은 가맹약국이 정하며, 소멸 예정일 이전에 안내를 받습니다. ",
              { b: "회원 탈퇴 시 보유 포인트는 즉시 소멸됩니다." },
            ],
            lineHeight: 26,
          },
        },
        {
          label: "포인트의 성격",
          main: { parts: ["포인트는 적립한 약국에서만 사용할 수 있고, 현금 환급·양도·타 회원과의 합산이 되지 않습니다."], bold: true, lineHeight: 26 },
          sub: "㈜크레소티가 발행하는 팜페이포인트와는 별개입니다.",
        },
      ],
    },
  ],
};

/** [선택] 마케팅 수신 동의 */
export const MARKETING_DOC: AgreementDoc = {
  title: "마케팅 정보 수신 동의",
  sections: [
    {
      num: "I. 선택 동의",
      title: "마케팅 정보 수신 및 활용",
      fields: [
        {
          label: "목적",
          main: { parts: ["프로모션 · 이벤트 · 할인 쿠폰 안내"], bold: true, lineHeight: 27 },
          sub: "(약국 명의로 SMS/알림톡 발송, ㈜크레소티가 발송 대행)",
        },
        { label: "항목", main: { parts: ["휴대폰번호"], bold: true, lineHeight: 27 } },
        { label: "보유기간", main: { parts: ["동의 철회 시 또는 회원 탈퇴 시까지"], lineHeight: 26 } },
        {
          label: "거부권",
          notice: true,
          main: { parts: ["미동의 시에도 포인트 적립 서비스는 그대로 이용 가능합니다."], bold: true, lineHeight: 27 },
          sub: "위 정보는 정보통신망법상 광고성 정보에 해당하며, 수신 동의 후에도 언제든 거부할 수 있습니다.",
        },
      ],
    },
    ENTRUST,
    RIGHTS,
  ],
};
