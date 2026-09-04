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
import { getCurrentPath, navigate, register, start as startRouter } from "./router";

import { renderHome } from "./pages/home";
import { renderMemberSearch } from "./pages/member-search";
import { renderPointEarnFlow, isTerminalEarnContext, clearEarnContext } from "./pages/point-earn-flow";
import { renderPointUseFlow, isTerminalUseContext, clearUseContext } from "./pages/point-use-flow";
import { renderPointUseWithCustomerFlow } from "./pages/point-use-with-customer-flow";
import { renderResult } from "./pages/result";
import { renderSettings } from "./pages/settings";
import { renderPriceDisplay, saveCart, clearCart, updatePriceDisplay } from "./pages/price-display";
import { renderBarcodeDisplay, saveBarcode, clearBarcode } from "./pages/barcode-display";

// ─── 뷰 등록 ────────────────────────────────

register({ path: "/",                             render: renderHome });
register({ path: "/member-search",                render: renderMemberSearch });
register({ path: "/point-earn-flow",              render: renderPointEarnFlow });
register({ path: "/point-use-flow",               render: renderPointUseFlow });
register({ path: "/point-use-with-customer-flow", render: renderPointUseWithCustomerFlow });
register({ path: "/result",                       render: renderResult });
register({ path: "/settings",                     render: renderSettings });
register({ path: "/price-display",                render: renderPriceDisplay });
register({ path: "/barcode-display",              render: renderBarcodeDisplay });

// ─── 단말기 999 (화면 미노출) ──────────────────
//
// 단말기가 999 를 보내면 '팜포인트가 띄운 화면'을 걷고 대기화면으로 돌아간다.
// 이 플러그인은 오버레이가 아니라 화면 전환 구조라, 미노출 = 대기화면 복귀다.
//
// 대상은 단말기(TRM) 유래 화면뿐 — CAT(POS) 가 띄운 화면(가격표시기·고객선택 사용 등)과
// 결과 화면은 그대로 둔다. 적립/사용 플로우는 두 채널이 공용이라 컨텍스트의 source 로 가른다.

/** 999 로 닫을 화면인지. */
function isTerminalOriginScreen(path: string | null): boolean {
  switch (path) {
    case "/barcode-display": return true;                    // 005 — 단말기 전용
    case "/point-earn-flow": return isTerminalEarnContext(); // 001 · 002
    case "/point-use-flow":  return isTerminalUseContext();  // 003
    default:                 return false;                   // CAT 유래 · 결과 · 대기화면은 유지
  }
}

/** 화면별 보관 컨텍스트 폐기 후 대기화면 복귀. */
function closeTerminalScreen(path: string): void {
  switch (path) {
    case "/barcode-display": clearBarcode();     break;
    case "/point-earn-flow": clearEarnContext(); break;
    case "/point-use-flow":  clearUseContext();  break;
  }
  navigate("/");
}

// ─── 부트스트랩 ──────────────────────────────

/**
 * settings.html 로 진입한 경우인지 판별.
 * 설정 화면만 표시하는 페이지에서는 CATPOS WebSocket 서버를 시작하지 않는다.
 * — WS 시작·정리 사이클이 Toss 로그 서비스 등 내부 서비스에 영향 줄 수 있음.
 * — 설정 화면 자체는 CATPOS 통신이 필요 없음.
 */
function isSettingsEntry(): boolean {
  return location.pathname.endsWith("/settings.html");
}

async function bootstrap(): Promise<void> {
  await ensureInit();

  try {
    const cfg = await getPointUseConfig();
    setAppConfig({ minPoint: cfg.minPoint, isMinPointEnabled: cfg.isMinPointEnabled });
  } catch (e) {
    console.warn("[main] 앱 설정 로드 실패", e);
  }

  if (isSettingsEntry()) {
    // 설정 진입점 — 라우터만 시작. WebSocket / AppSession 미기동.
    startRouter();
    return;
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

    // 고객 가격표시기 — catpos-cart-display-spec.md 참고.
    onCartUpdate: (cart) => {
      // 빈 카트(모든 상품 삭제 등)는 대기화면으로 복귀 처리. 가격표시기 유지 안 함.
      if (cart.items.length === 0) {
        clearCart();
        if (getCurrentPath() === "/price-display") navigate("/");
        return;
      }
      saveCart(cart); // 라우터 진입 시 초기 렌더용 스냅샷 보관
      if (getCurrentPath() === "/price-display") {
        updatePriceDisplay(cart); // 이미 진입 상태 → 실시간 갱신
      } else {
        navigate("/price-display"); // 첫 수신 → 진입 (renderPriceDisplay 가 스냅샷 로드)
      }
    },
    // 단말기 005 — 바코드 표시. (006 회신은 AppSession 이 수신 즉시 처리)
    onBarcodeDisplay: (barcode) => {
      console.log(
        `[main] 바코드 표시 요청 — ${barcode.kind} timeout=${barcode.timeoutSec}초 ` +
        `데이터=${barcode.dataLength}바이트`,
      );
      saveBarcode(barcode);
      navigate("/barcode-display");
    },

    // 단말기 999 — 팜포인트 화면 미노출. 회신은 게이트웨이 자동 ACK 뿐(010 미발신).
    onTerminalHideScreen: () => {
      const path = getCurrentPath();
      if (!isTerminalOriginScreen(path)) {
        console.log(`[main] 999 화면 미노출 — 단말기 유래 화면 아님(path=${path}). 무시`);
        return;
      }
      console.log(`[main] 999 화면 미노출 — ${path} 닫고 대기화면 복귀`);
      closeTerminalScreen(path!);
    },

    onCartClear: () => {
      // CART_CLEAR 는 카트 데이터 무효화 신호. 가격표시기 화면일 때만 대기화면 복귀.
      // 결제 완료 후 적립/사용 화면이 뜬 상태에서 POS 가 CART_CLEAR 를 이어 보내는 경우
      // (SESSION_END → CART_CLEAR 시퀀스) 무조건 navigate("/") 를 하면 방금 띄운
      // 적립·사용 화면이 바로 닫혀버린다 → 현재 경로 체크로 방어.
      clearCart();
      if (getCurrentPath() === "/price-display") navigate("/");
    },
  });

  // 결제 앱이 웹뷰 위를 덮으면 문서가 hidden 상태가 된다.
  // POS 가 CART_CLEAR 를 안 보내는 경우의 안전망 — 가격표시기 상태였으면 대기화면으로 복귀.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (getCurrentPath() !== "/price-display") return;
    console.log("[main] 웹뷰 hidden 감지 — 가격표시기 종료(백업)");
    clearCart();
    navigate("/");
  });

  startRouter();

  // 앱 종료 시 소켓 세션 정리 (원본 다중페이지 코드와 동일 흐름 유지)
  window.addEventListener("beforeunload", () => { void stopAppSession(); });
}

void bootstrap();
