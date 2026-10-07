/**
 * PointUseWithCustomerFlow 뷰 — CAT_WITH_CUSTOMER (CAT|007) 진입.
 * 캣포스가 이미 고객을 선택했으므로 휴대폰 입력 없이 사용 포인트 입력 화면으로 직행.
 * 사용 포인트 입력은 새 디자인(Figma 06-1 · 06-2, src/ui/use-point-input).
 */
import { cancelUse, CancelMessage, relayUseResult, remainingPoint, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goInsufficient, goUseSuccess } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { getInactivityTimeoutSeconds } from "../features/app-config/app-config.service";
import { showUsePointInput } from "../ui/use-point-input";
import { hideScreen } from "../ui/stage";
import { log } from "../utils/log";

const CTX_KEY = "pharm_use_point_with_customer_ctx";

type UseWithCustomerContext = {
  source:             PointUseSourceType;
  balance:            number;
  payAmount:          number;
  minPoint:           number;
  isMinPointEnabled:  boolean;
};

function loadContext(): UseWithCustomerContext | null {
  try { const raw = sessionStorage.getItem(CTX_KEY); return raw ? JSON.parse(raw) as UseWithCustomerContext : null; }
  catch { return null; }
}
function clearContext(): void { sessionStorage.removeItem(CTX_KEY); }
function returnToIdle(): void { clearContext(); navigate("/"); }

async function getStoreName(): Promise<string> {
  try { const m = await sdk.app.getMerchant(); return m?.name ?? ""; }
  catch { return ""; }
}

export async function renderPointUseWithCustomerFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) {
    log.status("[팜포인트] ❌ 포인트 사용(회원 지정) 화면 못 띄움 — 요청 정보가 비어 있음 · 확인 필요: 플러그인(프론트)");
    returnToIdle();
    return;
  }

  const balance   = ctx.balance   || 0;
  const payAmount = ctx.payAmount || 0;

  // 캣포스가 고객을 이미 골라 보낸 경로라 번호가 오지 않는다. 대조 키는 시각·금액·보유 포인트.
  log.status(`[팜포인트·사용] 요청 접수(회원 지정) — 결제 ${payAmount.toLocaleString()}원 · 보유 ${balance.toLocaleString()}P`);

  const inactivitySec = await getInactivityTimeoutSeconds();
  const maxPoint = Math.min(balance, payAmount || balance);
  const minUse   = ctx.isMinPointEnabled && ctx.minPoint > 0 ? ctx.minPoint : 1;
  const minPoint = ctx.isMinPointEnabled ? ctx.minPoint : 0;

  // 사전 차단 — 결제금액이 최소 사용 포인트 미만이면 포인트 입력 화면 위에
  // "포인트를 사용할 수 없어요" 팝업(Figma 05-2 popup03)을 띄우고 CATPOS 에 FAIL 회신.
  // [확인] 을 누르면 대기화면. (point-use-flow 의 CAT 경로 · 네이버 UseInput 과 같은 정책)
  // 아래 잔액-기반 insufficient 판정과는 별개로, 결제금액만으로 먼저 판정한다.
  if (ctx.isMinPointEnabled && ctx.minPoint > 0 && payAmount < ctx.minPoint) {
    // FAIL 메시지 = 팝업 문구와 같은 정보. 줄바꿈은 \r\n (CRLF) —
    // CATPOS(Delphi) 의 TLabel/TMemo 는 LF 단독으로 개행을 인식하지 않는다.
    const payAmountFmt = payAmount.toLocaleString("ko-KR");
    const minPointFmt  = ctx.minPoint.toLocaleString("ko-KR");
    const msg = `포인트를 사용할 수 없어요.\r\n결제 금액 ${payAmountFmt}원\r\n최소 사용 포인트 ${minPointFmt}P`;
    log.status(`[팜포인트·사용] 중단 — 결제금액 ${payAmountFmt}원이 최소 사용 기준 ${minPointFmt}P 미만 (사용 불가 팝업)`);
    log.info(`[PointUseWithCustomer] 결제금액<최소포인트 사전차단 — payAmount=${payAmount}, minPoint=${ctx.minPoint}`);
    void cancelUse({ source: ctx.source, message: msg });
    clearContext();
    showUsePointInput({
      payAmount, balance, maxPoint, minUse, minPoint, inactivitySec,
      onSubmit: () => {},
      onClose: returnToIdle,
      onTimeout: returnToIdle,
      pointUnavailable: { payAmount, minPoint: ctx.minPoint, onConfirm: returnToIdle },
    });
    onCleanup(() => { hideScreen(); });
    return;
  }

  const storeName = await getStoreName();

  const insufficient =
    (ctx.isMinPointEnabled && ctx.minPoint > balance) || balance < 1;

  if (insufficient) {
    log.status(
      `[팜포인트·사용] 중단 — 보유 ${balance.toLocaleString()}P · ` +
      (ctx.isMinPointEnabled && ctx.minPoint > balance
        ? `최소 ${ctx.minPoint.toLocaleString()}P 이상부터 사용 가능`
        : "사용할 포인트 없음"),
    );
    void cancelUse({ source: ctx.source, message: CancelMessage.insufficient });
    clearContext();
    goInsufficient({ storeName, minPoint: ctx.minPoint, isMinPointEnabled: ctx.isMinPointEnabled, balancePoint: balance });
    return;
  }

  showUsePointInput({
    payAmount, balance, maxPoint, minUse, minPoint, inactivitySec,
    onSubmit: async (usePoint) => {
      await relayUseResult({ source: ctx.source, balance, usePoint });
      log.status(
        `[팜포인트·사용] 완료(회원 지정) — ${usePoint.toLocaleString()}P 사용 · ` +
        `남은 ${remainingPoint(balance, usePoint).toLocaleString()}P`,
      );
      clearContext();
      goUseSuccess({
        usePoint, storeName,
        remainingPoint: remainingPoint(balance, usePoint),
      });
    },
    onClose: () => {
      log.status("[팜포인트·사용] 중단 — 고객이 뒤로가기");
      void cancelUse({ source: ctx.source, message: CancelMessage.back });
      returnToIdle();
    },
    onTimeout: () => {
      log.status(`[팜포인트·사용] 중단 — 고객이 ${inactivitySec}초간 조작 없음`);
      void cancelUse({ source: ctx.source, message: CancelMessage.back });
      returnToIdle();
    },
  });

  onCleanup(() => { hideScreen(); });
}
