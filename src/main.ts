/**
 * main.ts — PharmPoint Toss 플러그인 진입점.
 *
 * 책임:
 *   1) 앱 lifecycle 하나에 AppSession(=SocketGateway) 를 1회 start
 *      → 라우터 이동해도 웹소켓 서버 유지 (재연결 반복 이슈 해결)
 *   2) 라우터에 뷰 등록 후 시작
 *   3) 소켓 이벤트 → 화면 라우팅 콜백 연결
 */
import { ensureInit, API_ENV_LABEL, currentBusinessNumber, currentSerialNumber } from "./api/config";
import { initMonitoring, setTerminalTags } from "./monitoring/sentry";
import { start as startAppSession, setConfig as setAppConfig, stop as stopAppSession } from "./features/app-session/app-session.service";
import { getPointUseConfig } from "./features/app-config/app-config.service";
import { getCurrentPath, navigate, register, start as startRouter } from "./router";

import { renderHome, isIdleActive } from "./pages/home";
import { renderMemberSearch } from "./pages/member-search";
import { renderPointEarnFlow, isTerminalEarnContext, clearEarnContext } from "./pages/point-earn-flow";
import { renderPointUseFlow, isTerminalUseContext, clearUseContext } from "./pages/point-use-flow";
import { renderPointUseWithCustomerFlow } from "./pages/point-use-with-customer-flow";
import { renderResult } from "./pages/result";
import { renderSettings } from "./pages/settings";
import { renderPriceDisplay, saveCart, clearCart, updatePriceDisplay } from "./pages/price-display";
import { renderBarcodeDisplay, saveBarcode, clearBarcode } from "./pages/barcode-display";
import { log } from "./utils/log";

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

/**
 * 진단 기록에 적을 화면 이름.
 *
 * 경로(/point-use-flow)를 그대로 적으면 약국 문의를 받는 사람이 무슨 화면인지 모른다.
 * "어느 화면이라 이렇게 됐다" 가 곧 책임 소재 설명이므로 사람 말로 적는다.
 */
function screenName(path: string | null): string {
  switch (path) {
    case "/":                             return isIdleActive() ? "대기화면" : "번호 입력";
    case "/member-search":                return "포인트 조회";
    case "/point-earn-flow":              return "적립";
    case "/point-use-flow":               return "포인트 사용";
    case "/point-use-with-customer-flow": return "포인트 사용(회원 지정)";
    case "/result":                       return "결과 안내";
    case "/settings":                     return "환경설정";
    case "/price-display":                return "가격표시";
    case "/barcode-display":              return "바코드 표시";
    default:                              return path ?? "알 수 없음";
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
  // 오류 수집을 가장 먼저 건다 — 이후 초기화 단계에서 터지는 것도 잡아야 한다.
  initMonitoring(__APP_VERSION__);
  // 어느 서버를 보는지 기동 즉시 남긴다 — 개발 서버를 본 채 운영에 나가는 사고 방지.
  // 설정 화면(settings.html)도 플러그인을 부팅한다. 거기서도 이 줄을 남기면
  // 진단 기록에 '시작' 이 두 번 찍혀 재시작한 것처럼 읽힌다. 본 화면에서만 남긴다.
  if (!isSettingsEntry()) {
    log.status(`[팜포인트] 시작 — 버전 ${__APP_VERSION__} · ${API_ENV_LABEL} 서버 사용`);
  }

  await ensureInit();

  // 어느 약국의 어느 단말인지 Sentry 에 표시.
  // "○○약국에서 연동이 안 된다" 문의가 오면 이 태그로 찾는다.
  // ensureInit 뒤라 두 값 모두 실단말에서 읽힌 상태다.
  setTerminalTags(currentBusinessNumber(), currentSerialNumber());

  // 포인트 설정 조회는 기다리지 않는다.
  //
  // 이 호출은 백엔드를 타고, 그 앞에 토큰 발급(enroll/refresh)이 먼저 붙는다.
  // await 로 묶어두면 백엔드가 느리거나 응답하지 않을 때 아래 소켓 기동까지
  // 통째로 밀려, 캣포스가 단말기에 접속하지 못한다.
  // 포인트 적립·사용과 캣포스 연결은 별개 경로이므로 설정은 오는 대로 반영한다.
  // (설정은 대기화면 진입 시 syncIdleConfig 가 다시 읽는다)
  void getPointUseConfig()
    .then((cfg) => setAppConfig({ minPoint: cfg.minPoint, isMinPointEnabled: cfg.isMinPointEnabled }))
    .catch((e) => console.warn("[main] 앱 설정 로드 실패", e));

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
      log.status(`[팜포인트] 번호 입력 화면 띄움 — ${args.mode}`);
    },
    onCatDisconnect: () => { navigate("/"); },

    // 고객 가격표시기 — catpos-cart-display-spec.md 참고.
    onCartUpdate: (cart) => {
      const amount = `${(cart.total || 0).toLocaleString()}원 ${cart.items.length}건`;

      // 빈 카트(모든 상품 삭제 등)는 대기화면으로 복귀 처리. 가격표시기 유지 안 함.
      if (cart.items.length === 0) {
        clearCart();
        if (getCurrentPath() === "/price-display") {
          navigate("/");
          log.status("[장바구니] 갱신 → 가격표시 닫음 — 담긴 상품 없음");
        } else {
          log.status("[장바구니] 갱신 → 화면 변화 없음 — 담긴 상품 없고 가격표시 중도 아님");
        }
        return;
      }
      if (getCurrentPath() === "/price-display") {
        saveCart(cart);           // 라우터 재진입 시 초기 렌더용 스냅샷 보관
        updatePriceDisplay(cart); // 이미 진입 상태 → 실시간 갱신
        log.status(`[장바구니] 갱신 → 가격표시 다시 그림 — ${amount}`);
        return;
      }
      // 고객이 조작 중인 화면(번호 입력·포인트 입력·약관 동의·결과·환경설정 등)에서는
      // 카트를 반영하지 않는다. 반영하면 결제 중 직원이 상품을 추가 스캔할 때
      // 고객이 입력하던 화면이 가격표시기로 바뀌어 흐름이 끊긴다.
      //
      // Home("/")은 대기화면과 입력 서브뷰를 한 경로에서 처리하므로 경로만으로는
      // 판별할 수 없다 → isIdleActive() 로 대기 상태인지 확인한다.
      const path = getCurrentPath();
      if (path !== "/" || !isIdleActive()) {
        // "스캔했는데 가격표시가 안 떠요" 문의의 답이 대부분 여기다.
        // 고장이 아니라 고객이 조작 중이라 일부러 안 바꾼 것임을 명시한다.
        log.status(`[장바구니] 갱신 → 가격표시 무시 — 고객이 조작 중인 화면(${screenName(path)})이라 그대로 둠`);
        return;
      }
      saveCart(cart);             // renderPriceDisplay 가 읽을 스냅샷
      navigate("/price-display"); // 대기 상태에서 첫 수신 → 가격표시기 진입
      log.status(`[장바구니] 갱신 → 가격표시 띄움 — ${amount}`);
    },
    // 단말기 005 — 바코드 표시. (006 회신은 AppSession 이 수신 즉시 처리)
    onBarcodeDisplay: (barcode) => {
      saveBarcode(barcode);
      navigate("/barcode-display");
      log.status(`[팜포인트] 바코드 화면 띄움 — ${barcode.kind} · ${barcode.timeoutSec}초`);
    },

    // 단말기 999 — 팜포인트 화면 미노출. 회신은 게이트웨이 자동 ACK 뿐(010 미발신).
    onTerminalHideScreen: () => {
      const path = getCurrentPath();
      if (!isTerminalOriginScreen(path)) {
        log.status(`[팜포인트] 화면 닫기 요청 → 변화 없음 — 단말기가 띄운 화면이 아님(현재 ${screenName(path)})`);
        return;
      }
      closeTerminalScreen(path!);
      log.status(`[팜포인트] 화면 닫기 요청 → ${screenName(path)} 닫고 대기화면 복귀`);
    },

    onCartClear: () => {
      // CART_CLEAR 는 카트 데이터 무효화 신호. 가격표시기 화면일 때만 대기화면 복귀.
      // 결제 완료 후 적립/사용 화면이 뜬 상태에서 POS 가 CART_CLEAR 를 이어 보내는 경우
      // (SESSION_END → CART_CLEAR 시퀀스) 무조건 navigate("/") 를 하면 방금 띄운
      // 적립·사용 화면이 바로 닫혀버린다 → 현재 경로 체크로 방어.
      const path = getCurrentPath();
      clearCart();
      if (path === "/price-display") {
        navigate("/");
        log.status("[장바구니] 비움 → 가격표시 닫고 대기화면 복귀");
      } else {
        // "POS 에서 비웠는데 단말기에 그대로예요" 문의의 답이 여기다.
        // 전문은 받았고, 가격표시 중이 아니라 바꿀 화면이 없었다는 뜻이다.
        log.status(`[장바구니] 비움 → 화면 변화 없음 — 가격표시 중이 아님(현재 ${screenName(path)})`);
      }
    },
  });

  // 결제 앱이 웹뷰 위를 덮으면 문서가 hidden 상태가 된다.
  // POS 가 CART_CLEAR 를 안 보내는 경우의 안전망 — 가격표시기 상태였으면 대기화면으로 복귀.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (getCurrentPath() !== "/price-display") return;
    log.info("[main] 웹뷰 hidden 감지 — 가격표시기 종료(백업)");
    clearCart();
    navigate("/");
  });

  startRouter();

  // 앱 종료 시 소켓 세션 정리 (원본 다중페이지 코드와 동일 흐름 유지)
  window.addEventListener("beforeunload", () => { void stopAppSession(); });
}

void bootstrap();
