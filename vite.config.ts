import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// PharmPoint Toss 플러그인 SPA 개발/빌드 설정 (순수 TypeScript, React 미사용).
// Toss SDK 가 자체 React 를 포함하므로 클라이언트는 SDK 위 얇은 로직만 담당.
export default defineConfig(({ command, mode }) => ({
  define: {
    // Sentry release 태그(PLUGIN_ID@VERSION)와 기동 로그에 쓴다.
    // 단말에 올라간 번들이 방금 올린 것인지 콘솔로 바로 구분하기 위함.
    __APP_VERSION__: JSON.stringify(pkg.version),

    // 상세 로그 출력 여부.
    //   npm run dev           → 켜짐
    //   npm run build:verbose → 켜짐 (실단말 문제 추적용. 서버는 build 와 동일)
    //   npm run build         → 꺼짐 (검수·배포 제출본)
    __LOG_VERBOSE__: JSON.stringify(command === "serve" || mode === "verbose"),

    // 개발 서버에서만 vite proxy 로 CORS 를 우회한다(baseURL 을 비움).
    // mode 가 아니라 command 로 판단해야 build:verbose 가 실제 API 주소를 쓴다.
    __DEV_PROXY__: JSON.stringify(command === "serve"),
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
