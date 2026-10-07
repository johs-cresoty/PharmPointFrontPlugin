import { useState } from "react";
import SettingLayout from "./SettingLayout";
import { useSaveFlow } from "./use-save-flow";

// 포인트 설정 — 최소 포인트 사용 여부 토글 + 최소 사용 포인트 입력.
// PharmPoint Android SettingPointUse 대응.
//
// 디자인: Figma 09-3 (미사용, node 26:1071) · '사용' 상태 (node 28:1263).
// 네이버 · 토스 공용 (src/ui/settings/). 값을 어디에 저장할지는 onSave 를 넘기는 쪽이 정한다.

export type PointSetting = { enabled: boolean; minPoint: number };

export default function SettingPointView({
  initial,
  onSave,
}: {
  initial: PointSetting;
  onSave: (v: PointSetting) => void | Promise<void>;
}) {
  const flow = useSaveFlow(initial, onSave);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [minPoint, setMinPoint] = useState(initial.minPoint);

  const canSave =
    (enabled !== flow.saved.enabled || minPoint !== flow.saved.minPoint) &&
    (!enabled || minPoint > 0);

  return (
    <SettingLayout
      title="포인트 설정"
      canSave={canSave}
      onSave={() => void flow.save({ enabled, minPoint })}
      savedToast={flow.savedToast}
    >
      {/* 최소 포인트 사용 여부 — y=96, 토글 y=130 */}
      <p className="mt-[39.6px] whitespace-nowrap text-[18px] font-normal leading-[1.35] tracking-[-0.18px] text-ui-text">
        최소 포인트 사용 여부
      </p>
      <div className="mt-[9.7px]">
        <ToggleAnimationButton value={enabled} onChange={setEnabled} />
      </div>

      {/* 최소 사용 포인트 (조건부) — y=212, 입력칸 y=246 */}
      {enabled && (
        <>
          <p className="mt-[36px] whitespace-nowrap text-[18px] font-normal leading-[1.35] tracking-[-0.18px] text-ui-text">
            최소 사용 포인트
          </p>
          <div className="relative mt-[9.7px] h-[46px] w-[232px] overflow-hidden rounded-[12px] border-[1.5px] border-ui-border">
            <input
              type="text"
              inputMode="numeric"
              value={minPoint === 0 ? "" : minPoint.toLocaleString()}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, "");
                setMinPoint(Number(raw) || 0);
              }}
              placeholder="0"
              aria-label="최소 사용 포인트"
              className="absolute inset-0 bg-transparent pl-[12px] pr-[32.5px] text-right text-[18px] font-medium leading-[1.5] tracking-[-0.54px] text-ui-text outline-none placeholder:text-ui-text-sub"
            />
            {/* 단위 — Figma 기준 칸 왼쪽에서 207 위치에 가운데 맞춤 */}
            <span className="pointer-events-none absolute left-[207px] top-1/2 -translate-x-1/2 -translate-y-1/2 text-[16px] font-medium leading-[1.5] tracking-[-0.48px] text-ui-text-sub">
              P
            </span>
          </div>
        </>
      )}
    </SettingLayout>
  );
}

// 안드로이드 ToggleAnimationButton 대응 — "미사용 / 사용" 2분할 토글.
// Figma: 바탕 p4 · 칸 112×38 · 선택 칸만 Primary.
function ToggleAnimationButton({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const seg = (active: boolean) =>
    `h-[38px] w-[112px] rounded-[10px] text-[18px] font-normal leading-[1.35] tracking-[-0.18px] ${
      active ? "bg-ui-primary text-white" : "text-ui-text-sub"
    }`;
  return (
    <div className="inline-flex items-center gap-[4px] rounded-[12px] bg-ui-surface p-[4px]">
      <button type="button" onClick={() => onChange(false)} className={seg(!value)}>
        미사용
      </button>
      <button type="button" onClick={() => onChange(true)} className={seg(value)}>
        사용
      </button>
    </div>
  );
}
