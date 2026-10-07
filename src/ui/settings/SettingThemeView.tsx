import { useState, type CSSProperties } from "react";
import { MAIN_THEMES, themeAt } from "../main-themes";
import IdleView from "../IdleView";
import SettingLayout from "./SettingLayout";
import { useSaveFlow } from "./use-save-flow";

/** 가격표시 테마 — 서버 · 저장소 값과 같은 대문자. LIGHT = Figma 02-1, DARK = 02-2. */
export type PriceDisplayTheme = "LIGHT" | "DARK";

export type ThemeSetting = { themeIndex: number; priceTheme: PriceDisplayTheme };

/**
 * 테마 카드 썸네일 배치 — Figma 09-5 카드(98 × 130.67) 안의 이미지 위치 그대로.
 *
 * Figma 는 카드마다 테마 이미지를 100.125 × 167.709 로 깔고 조금씩 다른 위치로 잘라 보여준다.
 * 모든 카드 맨 아래에 테마A 이미지가 한 장 더 깔려 있다(Figma 구성 그대로 둔다).
 * crop 은 이미지 틀 안에서 원본을 다시 자르는 경우(테마D)다.
 */
const THUMB_BOX: CSSProperties = { position: "absolute", width: 100.125, height: 167.709 };
const THUMB_BASE: CSSProperties = { ...THUMB_BOX, left: "calc(50% + 0.06px)", top: "calc(50% - 0.48px)", transform: "translate(-50%, -50%)" };
const THUMBS: Array<{ box: CSSProperties | null; crop?: CSSProperties }> = [
  { box: null }, // 테마A — 바탕 이미지가 곧 테마A
  { box: { ...THUMB_BOX, left: "calc(50% - 0.13px)", top: "calc(50% + 0.47px)", transform: "translate(-50%, -50%)" } },
  { box: { ...THUMB_BOX, left: "calc(50% + 0.38px)", top: "calc(50% - 9.48px)", transform: "translate(-50%, -50%)" } },
  {
    box: { ...THUMB_BOX, left: "calc(50% - 0.13px)", bottom: -1.04, transform: "translateX(-50%)" },
    crop: { position: "absolute", height: "100%", width: "104.74%", left: "-2.37%", top: "9.54%", maxWidth: "none" },
  },
  { box: { ...THUMB_BOX, left: "calc(50% + 0.38px)", top: -1, transform: "translateX(-50%)" } },
];

// PharmPoint Android SettingTheme 대응 — 대기화면 배경 테마 선택 + 미리보기 · 가격표시 테마.
// (사용자 지정 업로드는 제거 — 프리셋만 제공. 안드로이드의 서브타이틀 입력도 제외.)
//
// 디자인: Figma 09-5 (node 38:429) · 미리보기 09-6 (node 59:510).
// 네이버 · 토스 공용 (src/ui/settings/). 값을 어디에 저장할지는 onSave 를 넘기는 쪽이 정한다.
export default function SettingThemeView({
  initial,
  storeName,
  onSave,
}: {
  initial: ThemeSetting;
  /** 미리보기에 보일 매장명. 비우면 매장명 없이 보인다. */
  storeName: string | null;
  onSave: (v: ThemeSetting) => void | Promise<void>;
}) {
  const flow = useSaveFlow(initial, onSave);
  const [selected, setSelected] = useState(initial.themeIndex);
  const [priceTheme, setPriceTheme] = useState<PriceDisplayTheme>(initial.priceTheme);
  const [showPreview, setShowPreview] = useState(false);

  const canSave = selected !== flow.saved.themeIndex || priceTheme !== flow.saved.priceTheme;

  const previewBg = themeAt(selected);

  return (
    <SettingLayout
      title="테마 설정"
      canSave={canSave}
      onSave={() => void flow.save({ themeIndex: selected, priceTheme })}
      savedToast={flow.savedToast}
    >
      {/* 대기화면 배경 테마 + 미리보기 — y=96 */}
      <div className="mt-[39.6px] flex items-center gap-[8px]">
        <p className="whitespace-nowrap text-[18px] font-normal leading-[1.35] tracking-[-0.18px] text-ui-text">
          대기화면 배경 테마
        </p>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="whitespace-nowrap text-[14px] font-medium leading-[1.35] text-ui-primary"
        >
          미리보기
        </button>
      </div>

      {/* 테마 카드 — y=130, 98×130.67 카드 한 줄 3개. 높이는 직접 준다(토스 화면에서 aspect-ratio 가 눌림) */}
      <div className="mt-[9.7px] flex w-[320px] flex-wrap gap-[13px]">
        {MAIN_THEMES.map((t, i) => {
          const thumb = THUMBS[i] ?? { box: null };
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className="flex w-[98px] flex-col items-center gap-[8px]"
            >
              <div className="relative h-[130.67px] w-full shrink-0 overflow-hidden rounded-[12px] border border-ui-border bg-white">
                <img src={MAIN_THEMES[0].image} alt="" draggable={false} className="max-w-none object-cover" style={THUMB_BASE} />
                {thumb.box && (
                  <div style={{ ...thumb.box, overflow: thumb.crop ? "hidden" : undefined }}>
                    <img
                      src={t.image}
                      alt={t.title}
                      draggable={false}
                      className={thumb.crop ? "" : "absolute inset-0 size-full max-w-none object-cover"}
                      style={thumb.crop}
                    />
                  </div>
                )}
              </div>
              <RadioLabel active={i === selected} label={t.title} />
            </button>
          );
        })}
      </div>

      {/* 가격표시 테마 — 라이트모드 Figma 02-1 · 다크모드 02-2 */}
      <p className="mt-[35.5px] whitespace-nowrap text-[18px] font-normal leading-[1.35] tracking-[-0.18px] text-ui-text">
        가격표시 테마
      </p>
      <div className="mt-[9.7px] flex gap-[22px]">
        <button type="button" onClick={() => setPriceTheme("LIGHT")} className="w-[98px]">
          <RadioLabel active={priceTheme === "LIGHT"} label="라이트모드" align="start" />
        </button>
        <button type="button" onClick={() => setPriceTheme("DARK")} className="w-[98px]">
          <RadioLabel active={priceTheme === "DARK"} label="다크모드" align="start" />
        </button>
      </div>

      {/* 미리보기 — Figma 09-6. 실제 대기화면(IdleView)에 닫기만 얹는다 */}
      {showPreview && (
        <div className="fixed inset-0 z-50">
          <IdleView
            image={previewBg.image}
            objectPosition={previewBg.objectPosition}
            storeName={storeName}
            storeNameGap={previewBg.storeNameGap}
            onLookup={() => {}}
          >
            <button
              type="button"
              aria-label="미리보기 닫기"
              onClick={() => setShowPreview(false)}
              className="absolute right-[24px] top-[24px] size-[45px]"
            >
              <img src="/icon_close_preview.svg" alt="" width={45} height={45} className="size-[45px]" />
            </button>
          </IdleView>
        </div>
      )}
    </SettingLayout>
  );
}

// 라디오 + 이름 — Figma: 18px 라디오, 글자는 선택 여부와 관계없이 Text Sub.
function RadioLabel({
  active,
  label,
  align = "center",
}: {
  active: boolean;
  label: string;
  align?: "center" | "start";
}) {
  return (
    <span className={`flex w-full items-center gap-[5px] ${align === "center" ? "justify-center" : ""}`}>
      <img
        src={active ? "/icon_radio_on.svg" : "/icon_radio_off.svg"}
        alt=""
        width={18}
        height={18}
        className="size-[18px] shrink-0"
      />
      <span className="whitespace-nowrap text-[15px] font-normal leading-[1.35] text-ui-text-sub">
        {label}
      </span>
    </span>
  );
}
