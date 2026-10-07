// 대기화면 배경 테마 (안드로이드 PharmPoint 의 MainThemes enum 대응).
// Theme_A~E 프리셋만 제공. (사용자 지정 업로드는 제거 — 프리셋만 사용.)
//
// 디자인: Figma「커넥트_고객화면_디자인」 01-1 ~ 01-5.
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/main-themes.ts 를 함께 고친다.
// objectPosition = 이미지를 화면 비율로 자를 때 남길 위치. Figma 프레임 안 이미지 배치 그대로
// (A·B·C 위아래 20 씩 잘림 = 가운데, E 위 맞춤, D 는 이미 화면 크기 그대로인 합성 이미지).
// storeNameGap = 매장명 아래 ~ [포인트 조회] 위 간격. Figma 테마D 만 매장명이 10 아래에 있다.

export type MainTheme = {
  title: string;
  image: string; // public 경로
  objectPosition: string; // CSS object-position
  storeNameGap: number;
};

export const MAIN_THEMES: MainTheme[] = [
  { title: "테마A(기본)", image: "/main_1.png", objectPosition: "center", storeNameGap: 25.4 },
  { title: "테마B", image: "/main_2.png", objectPosition: "center", storeNameGap: 25.4 },
  { title: "테마C", image: "/main_3.png", objectPosition: "center", storeNameGap: 25.4 },
  { title: "테마D", image: "/main_4.png", objectPosition: "bottom", storeNameGap: 15.4 },
  { title: "테마E", image: "/main_5.png", objectPosition: "top", storeNameGap: 25.4 },
];

/** 인덱스로 테마 조회 (범위를 벗어나면 기본 테마). */
export function themeAt(index: number): MainTheme {
  return MAIN_THEMES[index] ?? MAIN_THEMES[0];
}
