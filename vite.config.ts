import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PharmPoint Toss 플러그인 SPA 개발/빌드 설정.
// 실기기 (Toss Place 웹뷰) 에서는 CORS 무시되므로 별도 proxy 불필요하나,
// dev 브라우저 테스트를 위해 catpos 백엔드에 proxy 설정 유지.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://dev-app-api.catpos.co.kr",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
