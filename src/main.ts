/**
 * main.ts — PharmPoint Toss 플러그인 진입점.
 *
 * 책임:
 *   1) 앱 lifecycle 하나에 AppSession(=SocketGateway) 를 1회 start
 *      → 라우터 이동해도 웹소켓 서버 유지 (재연결 반복 이슈 해결)
 *   2) 라우터에 뷰 등록 후 시작
 *   3) 소켓 이벤트 → 화면 라우팅 콜백 연결
 */
import { ensureInit } from "./api/config";
import { start as startAppSession, setConfig as setAppConfig, stop as stopAppSession } from "./features/app-session/app-session.service";
import { getPointUseConfig } from "./features/app-config/app-config.service";
import { navigate, register, start as startRouter } from "./router";

import { renderHome } from "./pages/home";
import { renderMemberSearch } from "./pages/member-search";
import { renderPointEarnFlow } from "./pages/point-earn-flow";
import { renderPointUseFlow } from "./pages/point-use-flow";
import { renderPointUseWithCustomerFlow } from "./pages/point-use-with-customer-flow";
import { renderResult } from "./pages/result";
import { renderSettings } from "./pages/settings";

// ─── 뷰 등록 ────────────────────────────────

register({ path: "/",                             render: renderHome });
register({ path: "/member-search",                render: renderMemberSearch });
register({ path: "/point-earn-flow",              render: renderPointEarnFlow });
register({ path: "/point-use-flow",               render: renderPointUseFlow });
register({ path: "/point-use-with-customer-flow", render: renderPointUseWithCustomerFlow });
register({ path: "/result",                       render: renderResult });
register({ path: "/settings",                     render: renderSettings });

// ─── 부트스트랩 ──────────────────────────────

async function bootstrap(): Promise<void> {
  const bootCount = parseInt(localStorage.getItem("pharm_boot_count") || "0", 10) + 1;
  localStorage.setItem("pharm_boot_count", String(bootCount));
  console.log("[bootstrap] module loaded, cumulative bootCount=" + bootCount);

  await ensureInit();

  try {
    const cfg = await getPointUseConfig();
    setAppConfig({ minPoint: cfg.minPoint, isMinPointEnabled: cfg.isMinPointEnabled });
  } catch (e) {
    console.warn("[main] 앱 설정 로드 실패", e);
  }

  // 소켓 세션 — 앱 lifecycle 하나에 1회. 라우터 이동해도 유지.
  startAppSession({
    onNavigateToSavePoint: (args) => {
      sessionStorage.setItem("pharm_earn_point_ctx", JSON.stringify({
        source: args.source, paymentType: args.paymentType, transactionData: args.transactionData,
      }));
      navigate("/point-earn-flow");
    },
    onNavigateToLookup: (args) => {
      sessionStorage.setItem("pharm_use_point_ctx", JSON.stringify({
        source: args.source,
        payAmount: args.transactionData.payAmount,
        trnDate:   args.transactionData.trnDate,
      }));
      navigate("/point-use-flow");
    },
    onNavigateToUsePoint: (args) => {
      sessionStorage.setItem("pharm_use_point_with_customer_ctx", JSON.stringify(args));
      navigate("/point-use-with-customer-flow");
    },
    onNavigateToCatRequest: (args) => {
      // Home 뷰가 이 sessionStorage 를 읽어 phone/customer 입력 서브뷰로 전환.
      sessionStorage.setItem("pharm_cat_request_mode", args.mode);
      navigate("/");
    },
    onCatDisconnect: () => { navigate("/"); },
  });

  startRouter();

  // 앱 종료 시 소켓 세션 정리
  window.addEventListener("beforeunload", () => { void stopAppSession(); });
}

void bootstrap();
