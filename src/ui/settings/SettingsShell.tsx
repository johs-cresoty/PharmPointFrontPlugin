import { useState, type ReactNode } from "react";

type MenuKey = "POINT" | "THEME" | "TIMEOUT";

const MENUS: Array<{ key: MenuKey; label: string }> = [
  { key: "POINT", label: "포인트설정" },
  { key: "THEME", label: "테마설정" },
  { key: "TIMEOUT", label: "화면대기" },
];

// 환경설정 — 좌측 메뉴 + 우측 설정 화면.
// PharmPoint Android SettingTypeList + 우측 콘텐츠 좌우 분할 대응.
//
// 디자인: Figma「커넥트_고객화면_디자인」 09-3 · 09-5 · 09-7.
// 네이버 · 토스 공용 (src/ui/settings/). 고칠 때는 두 저장소를 함께 고친다.
// 각 설정 화면에 있던 [닫기] 는 없어지고, 좌측 메뉴 아래 [나가기] 가 그 역할을 한다.
// 저장하지 않은 변경은 버린다(예전 닫기와 같음). 어디로 나갈지는 onExit 를 넘기는 쪽이 정한다.
export default function SettingsShell({
  point,
  theme,
  timeout,
  onExit,
}: {
  point: ReactNode;
  theme: ReactNode;
  timeout: ReactNode;
  onExit: () => void;
}) {
  const [selected, setSelected] = useState<MenuKey>("POINT");

  return (
    <div className="flex h-full bg-white font-display">
      {/* 좌측 메뉴 — 폭 166 */}
      <aside className="flex w-[166px] shrink-0 flex-col bg-ui-surface px-[16px] pt-[24px]">
        <h2 className="whitespace-nowrap text-[20px] font-semibold leading-[1.35] tracking-[-0.2px] text-ui-text">
          환경설정
        </h2>
        <div className="mt-[36px] flex flex-col gap-[15.4px]">
          {MENUS.map((m) => {
            const active = selected === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelected(m.key)}
                className={`flex w-full items-center rounded-[12px] px-[10px] py-[6px] text-[16px] font-medium leading-[1.35] ${
                  active ? "bg-white text-ui-primary" : "text-ui-text-sub"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* 나가기 — 예전 각 화면의 [닫기] 를 대신한다 */}
        <button
          type="button"
          onClick={onExit}
          className="mb-[65px] flex w-full items-center gap-[4px] rounded-[12px] px-[10px] py-[6px] text-[16px] font-medium leading-[1.35] text-ui-text-sub"
        >
          <img src="/icon_exit.svg" alt="" width={24} height={24} className="size-[24px]" />
          나가기
        </button>
      </aside>

      {/* 우측 콘텐츠 — 선택된 메뉴 화면 */}
      <main className="min-w-0 flex-1 overflow-auto">
        {selected === "POINT" && point}
        {selected === "THEME" && theme}
        {selected === "TIMEOUT" && timeout}
      </main>
    </div>
  );
}
