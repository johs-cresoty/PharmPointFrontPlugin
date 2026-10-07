import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

// 대기화면 — 배경 테마 + 매장명 + [포인트 조회].
//
// 디자인: Figma「커넥트_고객화면_디자인」 01-1 ~ 01-5 (테마 A ~ E).
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/IdleView.tsx 를 함께 고친다.
//
// 버튼은 아래 여백 80, 매장명은 버튼 바로 위(테마A 기준 y=560, 80px).
// 매장명은 한 줄로 두고, 길면 화면 폭(좌우 24)에 들어올 때까지 글자를 줄인다.
// 매장명이 작아져도 버튼과의 간격은 그대로라 아래쪽에 붙어 있다.

/** 매장명 최대 크기 — Figma 80px. */
const STORE_NAME_MAX_PX = 80;
const STORE_NAME_MIN_PX = 12;

export type IdleViewProps = {
  /** 배경 이미지 경로. */
  image: string;
  /** 배경을 화면 비율로 자를 때 남길 위치 (CSS object-position). */
  objectPosition?: string;
  /** 매장명. 비우면 표시하지 않는다. */
  storeName?: string | null;
  /** 매장명 아래 ~ 버튼 위 간격. Figma 테마A·B·C·E 25.4, 테마D 15.4. */
  storeNameGap?: number;
  onLookup: () => void;
  /** 매장명에 붙일 이벤트 (네이버: 2초 롱프레스 → 관리자). */
  storeNameProps?: HTMLAttributes<HTMLParagraphElement>;
  /** 화면 위에 덮는 것 (관리자 비밀번호 팝업 · 미리보기 닫기 등). */
  children?: ReactNode;
};

export default function IdleView(p: IdleViewProps) {
  const nameRef = useRef<HTMLParagraphElement>(null);

  // 한 줄에 들어올 때까지 1px 씩 줄인다. 그리기 전에 맞춰 깜빡이지 않는다.
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    let size = STORE_NAME_MAX_PX;
    el.style.fontSize = `${size}px`;
    while (size > STORE_NAME_MIN_PX && el.scrollWidth > el.clientWidth) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }, [p.storeName]);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-white font-display">
      <img
        src={p.image}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-cover"
        style={{ objectPosition: p.objectPosition ?? "center" }}
      />

      <div className="absolute inset-x-0 bottom-[80px] flex flex-col items-center">
        {p.storeName && (
          <p
            ref={nameRef}
            {...p.storeNameProps}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full overflow-hidden whitespace-nowrap px-[24px] text-center font-normal leading-[1.2] text-white"
            style={{ fontSize: STORE_NAME_MAX_PX, marginBottom: p.storeNameGap ?? 25.4 }}
          >
            {p.storeName}
          </p>
        )}

        {/* 포인트 조회 — 흰 바탕, 좌우 80 · 위아래 22, 모서리 24, 그림자 */}
        <button
          type="button"
          onClick={p.onLookup}
          className="flex items-center justify-center rounded-[24px] bg-white px-[80px] py-[22px] drop-shadow-[0px_8px_7.5px_rgba(13,21,42,0.18)] active:bg-ui-surface"
        >
          <span className="whitespace-nowrap text-center text-[36px] font-medium leading-[1.35] text-ui-text">
            포인트 조회
          </span>
        </button>
      </div>

      {p.children}
    </div>
  );
}
