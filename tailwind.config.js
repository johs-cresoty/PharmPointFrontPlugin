/** @type {import('tailwindcss').Config} */
// 새 디자인 화면(React, src/ui) 전용 Tailwind 설정.
//
// preflight(기본 스타일 초기화)는 끈다. 켜면 전역 h1·button·img 등이 초기화되어
// 아직 Template API 로 그리는 다른 화면(토스 디자인 시스템 스타일)이 깨진다.
// 새 화면은 필요한 스타일을 클래스로 직접 지정한다.
//
// 색은 네이버 플러그인(PharmPointFrontPlugin-Naver tailwind.config.js)의 ui-* 와 같다.
// Figma「커넥트_고객화면_디자인」 변수 그대로이며, 두 플러그인이 같은 화면을 그린다.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        // 앱과 함께 배포하는 폰트 파일(@fontsource-variable/noto-sans-kr, OFL).
        display: ['"Noto Sans KR Variable"', "sans-serif"],
      },
      colors: {
        ui: {
          primary:        "#0D92FA", // Primary      — 제목·포인트·확인 버튼
          text:           "#0D152A", // Text         — 본문(고객명)
          "text-sub":     "#717C84", // Text Sub     — 보조 문구(카운트다운·안내)
          border:         "#CDE7FF", // Border       — 포인트 배지 테두리
          disabled:       "#D0D0D0", // Disabled     — 포인트 부족 배지 테두리
          surface:        "#F3F7FA", // Surface      — 키패드·토글 바탕
          "surface-blue": "#E8F4FF", // Surface Blue — 보조 버튼 바탕
          error:          "#F8552C", // Error        — 오류 문구
          "error-surface": "#FFEBDF", // Error Surface — 오류 입력란 바탕 (테두리 Error Border #F87C4F)
        },
      },
    },
  },
  plugins: [],
};
