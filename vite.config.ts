import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// PharmPoint Toss 플러그인 SPA 개발/빌드 설정 (순수 TypeScript, React 미사용).
// Toss SDK 가 자체 React 를 포함하므로 클라이언트는 SDK 위 얇은 로직만 담당.
export default defineConfig(({ mode }) => ({
  // 번들에 버전을 심는다. 용도 둘:
  //   1) Sentry release 태그 (PLUGIN_ID@VERSION) — 어느 버전에서 난 오류인지 구분
  //   2) 기동 로그 — 단말기에 올라간 번들이 방금 올린 것인지 콘솔로 바로 확인
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 상세 로그 출력 여부. 개발 서버에서만 켠다 — 검수·배포 번들에는
    // 내부 진단 기록(전문 덤프·HTTP 본문)이 남지 않아야 한다.
    __LOG_VERBOSE__: JSON.stringify(mode !== "production"),
  },
  resolve: {
    extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
  },
  build: {
    // Toss 개발자센터가 서브폴더 (assets/) 를 지원하지 않아 dist 결과를 flat 하게.
    // 결과: dist/index.html + dist/index.js + dist/index.css (assets/ 폴더 없음)
    assetsDir: "",
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        chunkFileNames: "chunk-[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: {
    // dev 브라우저 테스트용 CORS 우회 proxy.
    proxy: {
      "/api": {
        target: "https://dev-app-api.catpos.co.kr",
        changeOrigin: true,
        secure: true,
      },
    },
  },
}));
