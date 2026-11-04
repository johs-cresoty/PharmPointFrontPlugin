import { CheckBox } from "./ConsentView";
import { TERMS_VERSION, fillStore, type TermsBlock, type TermsDoc } from "./consent-terms";

// 약관 전문 — 약관 동의 화면 위를 덮는다. 뒤 화면의 체크 상태는 그대로 유지된다.
//
// 디자인: Figma「커넥트_고객화면_디자인」 동의 개편 플로우 07-4 ~ 07-7 (node 323:3809 · 3870 · 3913 · 3963).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/TermsView.tsx 를 함께 고친다.
//
// Figma 는 문서 전체를 한 장(세로 1528 ~ 2376)으로 그렸다. 화면(534×854)에서는
// 같은 배치로 세로 스크롤한다. 닫기(X)는 스크롤해도 오른쪽 위에 남는다.
// 동의 상자를 누르면 약관 동의 화면의 같은 항목이 체크·해제된다.

export type TermsViewProps = {
  doc: TermsDoc;
  storeName: string;
  /** 이 약관 항목의 체크 상태 (동의 상자). */
  checked: boolean;
  onToggle: () => void;
  /** [이전 화면으로]. */
  onBack: () => void;
  /** 오른쪽 위 X. */
  onClose: () => void;
};

export default function TermsView(p: TermsViewProps) {
  const fill = (t: string) => fillStore(t, p.storeName);

  return (
    <div className="absolute inset-0 z-40 bg-white font-display">
      <div className="h-full overflow-y-auto overflow-x-hidden px-[24px] pb-[60px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mt-[88px] flex flex-col gap-[22px]">
          {/* 제목 + 구분선 */}
          <div className="flex flex-col gap-[22px]">
            <p className="text-[28px] font-bold leading-[38px] text-ui-text">{p.doc.title}</p>
            <div className="h-px w-full bg-ui-surface-blue" />
          </div>

          {/* 문서 이름 · 버전 */}
          <div className="flex flex-col gap-[12px]">
            <p className="text-[18px] font-semibold leading-[26px] text-ui-text">{p.doc.subtitle}</p>
            <p className="text-[15px] font-normal leading-[22px] text-ui-text-sub">{TERMS_VERSION}</p>
          </div>

          {p.doc.sections.map((s) => (
            <div key={s.head} className="flex flex-col gap-[16px] pt-[4px]">
              <p className="rounded-[8px] bg-ui-surface-blue px-[12px] py-[8px] text-[18px] font-semibold leading-[26px] text-ui-text">
                {s.head}
              </p>
              <div className="flex flex-col gap-[12px]">
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} fill={fill} checked={p.checked} onToggle={p.onToggle} />
                ))}
              </div>
            </div>
          ))}

          {/* 이전 화면으로 */}
          <div className="pt-[14px]">
            <button
              type="button"
              onClick={p.onBack}
              className="flex h-[75px] w-full items-center justify-center rounded-[16px] border-[1.5px] border-solid border-ui-border bg-white text-[26px] font-bold leading-[1.4] text-ui-primary"
            >
              이전 화면으로
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="닫기"
        onClick={p.onClose}
        className="absolute right-[24px] top-[24px] size-[45px]"
      >
        <img src="/icon_close.svg" alt="" width={45} height={45} className="size-[45px]" />
      </button>
    </div>
  );
}

function Block({
  block,
  fill,
  checked,
  onToggle,
}: {
  block: TermsBlock;
  fill: (t: string) => string;
  checked: boolean;
  onToggle: () => void;
}) {
  if (block.kind === "p") {
    return <p className="text-[16px] font-normal leading-[26px] text-ui-text">{fill(block.text)}</p>;
  }
  if (block.kind === "fields") {
    return (
      <div className="flex flex-col gap-[6px]">
        {block.lines.map((l, i) => (
          <p key={i} className="text-[16px] font-normal leading-[26px] text-ui-text">
            {l.label && <span className="font-bold">{l.label}</span>}
            {l.label && l.text && " "}
            {l.text && fill(l.text)}
          </p>
        ))}
      </div>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-start gap-[8px] rounded-[12px] border-[1.5px] border-solid border-ui-primary p-[14px] text-left"
    >
      <span className="pt-px">
        <CheckBox checked={checked} />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-medium leading-[26px] text-ui-text">{fill(block.text)}</span>
    </button>
  );
}
