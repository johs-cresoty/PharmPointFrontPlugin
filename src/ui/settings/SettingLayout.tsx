import type { ReactNode } from "react";

/**
 * 설정 화면 공통 틀 — Figma 09-3 · 09-5 · 09-7 의 오른쪽 영역.
 *
 * 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
 * 고칠 때는 두 저장소의 src/ui/settings/ 를 함께 고친다.
 *
 * 제목(y=24) · 내용 · [저장](320×75, 아래 여백 46). 좌우 여백 24.
 * 예전의 [닫기] 는 없다 — 좌측 메뉴의 [나가기] 가 대신한다 (SettingsShell).
 *
 * 저장 버튼은 Figma 대로 늘 같은 모양이다. 저장할 것이 없거나 값이 올바르지 않으면
 * 눌러도 아무 일도 없다 (canSave 가 false).
 */
export default function SettingLayout({
  title,
  canSave,
  onSave,
  savedToast,
  children,
}: {
  title: string;
  canSave: boolean;
  onSave: () => void;
  savedToast: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col px-[24px] pt-[24px]">
      <h1 className="whitespace-nowrap text-[24px] font-semibold leading-[1.35] tracking-[-0.24px] text-ui-text">
        {title}
      </h1>

      {children}

      <div className="flex-1" />

      {/* 저장 완료 안내 — 버튼 위 (Figma 에는 없는 상태라 기존 동작을 유지) */}
      <p className="mb-[8px] h-[24px] text-center text-[16px] font-normal leading-[1.5] text-ui-primary">
        {savedToast ? "저장되었습니다" : ""}
      </p>

      <button
        type="button"
        onClick={() => canSave && onSave()}
        className="mb-[46px] flex h-[75px] w-[320px] shrink-0 items-center justify-center rounded-[16px] bg-ui-primary text-[26px] font-bold leading-[1.4] text-white"
      >
        저장
      </button>
    </div>
  );
}
