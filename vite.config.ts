import { defineConfig } from "vite";

// PharmPoint Toss 플러그인 SPA 개발/빌드 설정 (순수 TypeScript, React 미사용).
// Toss SDK 가 자체 React 를 포함하므로 클라이언트는 SDK 위 얇은 로직만 담당.
export default defineConfig({
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
});
