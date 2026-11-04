import type { ReactNode } from "react";
import type { ConsentChecks } from "./consent-terms";

// 동의 처리 완료 화면 — 약관 동의 다음, 포인트 처리(조회·적립·사용) 전에 보인다.
// [확인] 을 누르면 부르는 쪽이 포인트 처리를 시작한다. 처리 중이면 버튼에 돌아가는 아이콘.
//
// 디자인: Figma「커넥트_고객화면_디자인」 동의 개편 플로우 08-6 (node 323:3762).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/ConsentDoneView.tsx 를 함께 고친다.
//
// 목록에는 이번에 동의한 선택 항목만 보인다. 하나도 없으면 목록과 그 아래 안내를 숨긴다.

export type ConsentDoneViewProps = {
  storeName: string;
  checks: ConsentChecks;
  /** 의사표시일 (YYYY-MM-DD). */
  date: string;
  loading: boolean;
  onConfirm: () => void;
  /** 오류 팝업 등 화면 위에 덮는 것. */
  children?: ReactNode;
};

export default function ConsentDoneView(p: ConsentDoneViewProps) {
  const rows = [
    p.checks.medication && `${p.storeName} 복약안내`,
    p.checks.pharmacyAd && `${p.storeName} 광고 수신`,
    p.checks.cresotyAd && "크레소티 광고 수신",
  ].filter((r): r is string => !!r);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white font-display">
      {/* 제목 — y=186 */}
      <p className="absolute left-1/2 top-[186px] -translate-x-1/2 whitespace-nowrap text-center text-[35px] font-semibold leading-[1.35] tracking-[-0.35px] text-ui-primary">
        동의 처리가 완료되었습니다
      </p>

      {/* 의사표시일 — y=250 */}
      <p className="absolute left-[24px] top-[250px] w-[486px] text-center text-[18px] font-normal leading-[25px] text-ui-text-sub">
        의사표시일: {p.date}
      </p>

      {/* 결과 안내 — y=290 */}
      <p className="absolute left-[24px] top-[290px] w-[486px] text-center text-[20px] font-medium leading-[30px] text-ui-text">
        {p.storeName} 포인트 등록이 완료되었습니다.
      </p>

      {/* 선택 동의 결과 — y=360 */}
      {rows.length > 0 && (
        <div className="absolute left-[24px] top-[360px] flex w-[486px] flex-col items-center">
          <div className="flex w-full flex-col rounded-[12px] bg-ui-surface px-[20px] py-[6px]">
            {rows.map((r, i) => (
              <div
                key={r}
                className={`flex items-center justify-between gap-[12px] py-[18px] ${
                  i < rows.length - 1 ? "border-b-2 border-solid border-white" : ""
                }`}
              >
                <span className="min-w-0 truncate text-[20px] font-normal leading-[normal] text-ui-text">{r}</span>
                <span className="shrink-0 whitespace-nowrap text-[18px] font-semibold leading-[normal] text-ui-primary">
                  동의 처리 완료
                </span>
              </div>
            ))}
          </div>
          {/* 목록 아래 6 (Figma 안내 틀 y=558 · 안쪽 여백 10) */}
          <p className="pt-[6px] text-center text-[15px] font-normal leading-[21px] text-ui-text-sub">
            선택 동의 결과는 이번에 제출한 항목만 표시합니다.
          </p>
        </div>
      )}

      {/* 안내 — y=706 */}
      <p className="absolute left-[24px] top-[706px] w-[486px] text-center text-[18px] font-normal leading-[22px] text-ui-text-sub">
        처리 결과를 확인한 후 확인을 눌러 주세요.
      </p>

      {/* 확인 — 486×75, 아래 여백 33. 처리 중이면 돌아가는 아이콘 */}
      <button
        type="button"
        onClick={() => !p.loading && p.onConfirm()}
        className="absolute bottom-[33px] left-1/2 flex h-[75px] w-[486px] -translate-x-1/2 items-center justify-center rounded-[16px] bg-ui-primary text-[26px] font-bold leading-[1.4] text-white"
      >
        {p.loading ? (
          <img
            role="status"
            aria-label="처리 중"
            src="/icon_loading.svg"
            alt=""
            width={35}
            height={35}
            className="size-[35px] animate-spin"
          />
        ) : (
          "확인"
        )}
      </button>

      {p.children}
    </div>
  );
}
