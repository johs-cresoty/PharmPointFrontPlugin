import type { AgreementDoc, AgreementField, AgreementSection, TextPart } from "./agreement-content";

// 약관 상세 — 화면 위를 덮는다. 뒤 화면의 체크 상태는 그대로 유지된다.
//
// 디자인: Figma「커넥트_고객화면_디자인」 07-3 (개인정보 수집 및 동의 · 마케팅 정보 수신 동의).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/AgreementDetailView.tsx 를 함께 고친다.
//
// Figma 는 문서 전체를 한 장(세로 1527 · 2239)으로 그렸다. 화면(534×854)에서는
// 같은 배치로 세로 스크롤한다. 닫기(X)는 스크롤해도 오른쪽 위에 남는다.

export default function AgreementDetailView({ doc, onClose }: { doc: AgreementDoc; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 bg-white font-display">
      <div className="h-full overflow-y-auto overflow-x-hidden px-[24px] pb-[60px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 제목 — y=88 */}
        <p className="mt-[88px] text-[28px] font-bold leading-[38px] text-ui-text">{doc.title}</p>

        {doc.sections.map((s, i) => (
          <Section key={s.num} section={s} first={i === 0} />
        ))}

        {/* 문의 — 마지막 절 아래 33 */}
        <p className="mt-[33px] text-[15px] font-normal leading-[24px] text-ui-text-sub">
          <span className="font-bold">문의</span> · <span className="text-ui-text">해당 가맹약국 또는 크레소티 고객센터</span>
        </p>
      </div>

      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute right-[24px] top-[24px] size-[45px]"
      >
        <img src="/icon_close.svg" alt="" width={45} height={45} className="size-[45px]" />
      </button>
    </div>
  );
}

/**
 * Figma Divider (회색 2px 테두리). 아래 절 머리까지 33.
 * 위 간격은 제목 다음이면 32, 앞 절 다음이면 33 (Figma 좌표).
 */
function Divider({ afterTitle }: { afterTitle: boolean }) {
  return <div className={`${afterTitle ? "mt-[32px]" : "mt-[33px]"} h-px border-2 border-solid border-ui-surface`} />;
}

function Section({ section, first }: { section: AgreementSection; first: boolean }) {
  return (
    <>
      <Divider afterTitle={first} />
      {/* 절 머리 — 첫 절 번호만 Primary */}
      <div className="mt-[29px]">
        <p className={`text-[20px] font-bold leading-[30px] ${first ? "text-ui-primary" : "text-ui-text"}`}>{section.num}</p>
        {section.title && <p className="text-[18px] font-medium leading-[34px] text-ui-text">{section.title}</p>}
      </div>

      {section.body && (
        <p className="mt-[18px] text-[16px] font-normal leading-[27px] text-ui-text">
          <Parts parts={section.body} />
        </p>
      )}

      {section.fields && (
        <div className="mt-[18px] flex flex-col gap-[20px]">
          {section.fields.map((f) => (
            <Field key={f.label} field={f} />
          ))}
        </div>
      )}
    </>
  );
}

function Field({ field }: { field: AgreementField }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className={`rounded-[6px] px-[12px] py-[6px] ${field.notice ? "bg-ui-surface-blue" : "bg-ui-surface"}`}>
        <p className={`whitespace-nowrap text-[14px] font-bold leading-[21px] ${field.notice ? "text-ui-primary" : "text-ui-text-sub"}`}>
          {field.label}
        </p>
      </div>

      <div className="flex flex-col gap-[4px] px-[12px]">
        {field.main && (
          <p
            className={`text-[16px] text-ui-text ${field.main.bold ? "font-bold" : "font-normal"}`}
            style={{ lineHeight: `${field.main.lineHeight}px` }}
          >
            <Parts parts={field.main.parts} />
          </p>
        )}
        {field.sub && <p className="text-[15px] font-normal leading-[24px] text-ui-text-sub">{field.sub}</p>}
        {field.tasks && (
          <div className="flex flex-col gap-[6px]">
            {field.tasks.map((t) => (
              <div key={t} className="flex items-start gap-[10px]">
                <img src="/icon_dot.svg" alt="" width={6} height={26} className="h-[26px] w-[6px] shrink-0" />
                <p className="min-w-0 flex-1 text-[16px] font-normal leading-[26px] text-ui-text">{t}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Parts({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="font-bold">
            {p.b}
          </span>
        ),
      )}
    </>
  );
}
