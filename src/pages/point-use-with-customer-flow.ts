/**
 * PointUseWithCustomerFlow 뷰 — CAT_WITH_CUSTOMER (CAT|007) 진입.
 * 캣포스가 이미 고객을 선택했으므로 휴대폰 입력 없이 사용 포인트 입력 화면으로 직행.
 */
import { cancelUse, CancelMessage, relayUseResult, remainingPoint, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goInsufficient, goPayAmountBelowMinPoint, goUseSuccess } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";
import { getInactivityTimeoutSeconds } from "../features/app-config/app-config.service";

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

function setTossInputValue(value: number): void {
  const inp = document.querySelector("#app form input") as HTMLInputElement | null;
  if (!inp) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(inp, String(value));
  inp.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function renderPointUseWithCustomerFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) { returnToIdle(); return; }

  const balance   = ctx.balance   || 0;
  const payAmount = ctx.payAmount || 0;

  // 사전 차단 — 결제금액이 최소 사용 포인트 미만이면 포인트 입력 화면을 띄우지 않고
  // 바로 결과 화면으로 라우팅 + CATPOS 에 FAIL 회신. (point-use-flow 의 CAT 경로와 동일 정책)
  // 아래 잔액-기반 insufficient 판정과는 별개로, 결제금액만으로 먼저 판정한다.
  if (ctx.isMinPointEnabled && ctx.minPoint > 0 && payAmount < ctx.minPoint) {
    // FAIL 메시지 = 결과 화면 문구와 동일. 줄바꿈은 \r\n (CRLF) —
    // CATPOS(Delphi) 의 TLabel/TMemo 는 LF 단독으로 개행을 인식하지 않는다.
    const payAmountFmt = payAmount.toLocaleString("ko-KR");
    const minPointFmt  = ctx.minPoint.toLocaleString("ko-KR");
    const msg = `포인트를 사용할 수 없어요.\r\n결제 금액 ${payAmountFmt}원\r\n최소 사용 포인트 ${minPointFmt}P`;
    console.log(`[PointUseWithCustomer] 결제금액<최소포인트 사전차단 — payAmount=${payAmount}, minPoint=${ctx.minPoint}`);
    void cancelUse({ source: ctx.source, message: msg });
    clearContext();
    goPayAmountBelowMinPoint({ payAmount, minPoint: ctx.minPoint });
    return;
  }

  const storeName = await getStoreName();

  const insufficient =
    (ctx.isMinPointEnabled && ctx.minPoint > balance) || balance < 1;

  if (insufficient) {
    void cancelUse({ source: ctx.source, message: CancelMessage.insufficient });
    clearContext();
    goInsufficient({ storeName, minPoint: ctx.minPoint, balancePoint: balance });
    return;
  }

  const app = document.getElementById("app");
  if (app) { app.style.transition = "opacity 0.25s ease-in"; app.style.opacity = "0"; }

  const inactivitySec = await getInactivityTimeoutSeconds();
  const stopTimeout = startInactivityTimeout({
    onTimeout: () => {
      void cancelUse({ source: ctx.source, message: CancelMessage.back });
      returnToIdle();
    },
    duration: inactivitySec,
  });

  const maxPoint = Math.min(balance, payAmount || balance);
  const minUse   = ctx.isMinPointEnabled && ctx.minPoint > 0 ? ctx.minPoint : 1;
  const disclaimer = ctx.isMinPointEnabled && ctx.minPoint > 0
    ? `포인트는 최소 ${ctx.minPoint.toLocaleString("ko-KR")}P부터 사용 가능합니다`
    : `사용 가능 포인트 ${maxPoint.toLocaleString("ko-KR")}P`;

  let currentUse = 0;
  const syncBtn = (): void => {
    const el = document.getElementById("app");
    if (!el) return;
    el.classList.toggle("use-btn-disabled", currentUse < minUse);
  };

  sdk.template.renderInputPage({
    type: "number",
    top:  { title: "사용할 포인트를 입력해주세요", subtitle: `${balance.toLocaleString("ko-KR")}P 보유` },
    input: {
      placeholder: "포인트 입력",
      onChange: (v) => {
        let val = parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
        if (val > maxPoint) { setTossInputValue(maxPoint); val = maxPoint; }
        currentUse = val; syncBtn();
      },
    },
    button:     { label: "사용하기" },
    disclaimer,
    onSubmit: async (value) => {
      const raw = parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
      if (ctx.isMinPointEnabled && ctx.minPoint > 0 && raw < ctx.minPoint) {
        sdk.template.openToast({ message: `${ctx.minPoint.toLocaleString("ko-KR")}P 이상 입력해주세요`, icon: "error" });
        return;
      }
      if (raw <= 0) {
        sdk.template.openToast({ message: "사용 포인트를 입력해주세요.", icon: "error" });
        return;
      }
      const usePoint = Math.min(raw, maxPoint);
      await relayUseResult({ source: ctx.source, balance, usePoint });
      clearContext();
      goUseSuccess({
        usePoint, storeName,
        remainingPoint: remainingPoint(balance, usePoint),
      });
    },
    onBack: () => {
      void cancelUse({ source: ctx.source, message: CancelMessage.back });
      returnToIdle();
    },
  });

  setTimeout(syncBtn, 0);
  setTimeout(() => { if (app) app.style.opacity = "1"; }, 300);

  onCleanup(() => {
    stopTimeout();
    if (app) app.style.opacity = "1";
  });
}
