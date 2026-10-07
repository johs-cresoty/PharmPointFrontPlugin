import { useState } from "react";
import SettingLayout from "./SettingLayout";
import { useSaveFlow } from "./use-save-flow";

const AUTO_CLOSE_OPTIONS = [3, 4, 5, 7, 10];
const INACTIVE_OPTIONS = [10, 15, 20, 25, 30];

// 화면 대기 — 결과 화면 자동 꺼짐 · 입력 화면 미동작 자동 꺼짐 (초).
// PharmPoint Android SettingScreenTimeout 대응.
//
// 디자인: Figma 09-7 (node 38:577).
// 네이버 · 토스 공용 (src/ui/settings/). 값을 어디에 저장할지는 onSave 를 넘기는 쪽이 정한다.

export type ScreenTimeoutSetting = { autoClose: number; inactive: number };

export default function SettingScreenTimeoutView({
  initial,
  onSave,
}: {
  initial: ScreenTimeoutSetting;
  onSave: (v: ScreenTimeoutSetting) => void | Promise<void>;
}) {
  const flow = useSaveFlow(initial, onSave);
  const [autoClose, setAutoClose] = useState(initial.autoClose);
  const [inactive, setInactive] = useState(initial.inactive);

  const canSave = autoClose !== flow.saved.autoClose || inactive !== flow.saved.inactive;

  return (
    <SettingLayout
      title="화면 대기"
      canSave={canSave}
      onSave={() => void flow.save({ autoClose, inactive })}
      savedToast={flow.savedToast}
    >
      {/* y=96, 선택지 y=153 */}
      <TimeoutOptionSelector
        className="mt-[39.6px]"
        title="화면 대기 시간"
        subTitle="완료 화면 자동 꺼짐"
        options={AUTO_CLOSE_OPTIONS}
        selected={autoClose}
        onSelect={setAutoClose}
      />
      {/* y=306, 선택지 y=363 */}
      <TimeoutOptionSelector
        className="mt-[36px]"
        title="미등록 대기 시간"
        subTitle="포인트 적립/사용 화면에서 미동작 시 자동 꺼짐"
        options={INACTIVE_OPTIONS}
        selected={inactive}
        onSelect={setInactive}
      />
    </SettingLayout>
  );
}

function TimeoutOptionSelector({
  className,
  title,
  subTitle,
  options,
  selected,
  onSelect,
}: {
  className: string;
  title: string;
  subTitle: string;
  options: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-[2px]">
        <p className="whitespace-nowrap text-[18px] font-normal leading-[1.35] tracking-[-0.18px] text-ui-text">
          {title}
        </p>
        <p className="whitespace-nowrap text-[14px] font-normal leading-[1.4] text-ui-text-sub">
          {subTitle}
        </p>
      </div>
      {/* 86×52 칩, 한 줄 3개 (폭 284) */}
      <div className="mt-[11.1px] flex w-[284px] flex-wrap gap-[13px]">
        {options.map((v) => {
          const active = v === selected;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onSelect(v)}
              className={`h-[52px] w-[86px] rounded-[12px] text-[18px] font-normal leading-[1.35] ${
                active ? "bg-ui-primary text-white" : "bg-ui-surface text-ui-text-sub"
              }`}
            >
              {v}초
            </button>
          );
        })}
      </div>
    </div>
  );
}
