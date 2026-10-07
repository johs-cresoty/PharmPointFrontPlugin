import type { ReactNode } from "react";

// 숫자 키패드 — 번호 입력(04) · 사용 포인트 입력(06) 공통.
//
// 디자인: Figma「커넥트_고객화면_디자인」 number_pad (y=308, 162×86 칸 3열 4행).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/Keypad.tsx 를 함께 고친다.

export type KeypadProps = {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onDeleteAll: () => void;
};

export default function Keypad(p: KeypadProps) {
  return (
    <div className="absolute left-[24px] top-[308px] grid w-[486px] select-none grid-cols-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <PadKey key={d} onClick={() => p.onDigit(d)}>
          <span className="text-[38px] font-normal leading-[normal] text-ui-text">{d}</span>
        </PadKey>
      ))}
      <PadKey onClick={p.onDeleteAll}>
        <span className="whitespace-nowrap text-[22px] font-normal leading-[normal] text-ui-text">전체삭제</span>
      </PadKey>
      <PadKey onClick={() => p.onDigit("0")}>
        <span className="text-[38px] font-normal leading-[normal] text-ui-text">0</span>
      </PadKey>
      <PadKey onClick={p.onDelete} aria="한 자리 삭제">
        <img src="/icon_backspace.svg" alt="" width={44.7225} height={31.3725} className="max-w-none" />
      </PadKey>
    </div>
  );
}

/** Figma number_key — 162×86, 바탕 없음. 누르는 동안만 옅게 표시. */
function PadKey({ onClick, aria, children }: { onClick: () => void; aria?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="flex h-[86px] w-[162px] items-center justify-center rounded-[16px] active:bg-ui-surface"
    >
      {children}
    </button>
  );
}
