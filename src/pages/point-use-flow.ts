/**
 * PointUseFlow 뷰 — CAT/TERMINAL 사용 요청 (고객 미선택) 후 진입.
 *
 * 흐름:
 *   1) 전화번호 입력 → 회원 조회
 *   2) 잔액 검증 (미달·최소 미만 → 결과 화면으로)
 *   3) 사용 포인트 입력 → 사용 결과 송신 → Result 이동
 */
import { getCustomer, getPointBalance, type InquiryResult } from "../features/point-inquiry/point-inquiry.service";
import { getPointUseConfig } from "../features/app-config/app-config.service";
import { cancelUse, CancelMessage, relayUseResult, remainingPoint, PointUseSource, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goUseSuccess, goInsufficient } from "../features/result-page/result-navigator";
import { navigate, onCleanup } from "../router";
import { mountPayHeader, mountConfirmFooter } from "./overlays";

const CTX_KEY = "pharm_use_point_ctx";

type UseContext = {
  source:    PointUseSourceType;
  payAmount: number;
  trnDate:   string;
};

function loadContext(): UseContext | null {
  try { const raw = sessionStorage.getItem(CTX_KEY); return raw ? JSON.parse(raw) as UseContext : null; }
  catch { return null; }
}
function clearContext(): void { sessionStorage.removeItem(CTX_KEY); }
function returnToIdle(): void { clearContext(); navigate("/"); }

async function getStoreName(): Promise<string> {
  try { const m = await sdk.app.getMerchant(); return m?.name ?? ""; }
  catch { return ""; }
}

function setTossInputValue(value: string | number): void {
  const inp = document.querySelector("#app form input") as HTMLInputElement | null;
  if (!inp) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(inp, String(value));
  inp.dispatchEvent(new Event("input", { bubbles: true }));
}

// ─── 진입점 ──────────────────────────────

export async function renderPointUseFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) { returnToIdle(); return; }

  let cleanupPhoneStep: (() => void) | null = null;
  let cleanupUseStep:   (() => void) | null = null;

  cleanupPhoneStep = renderPhoneStep(ctx, "", (fn) => { cleanupPhoneStep = fn; }, (fn) => { cleanupUseStep = fn; });

  onCleanup(() => {
    cleanupPhoneStep?.();
    cleanupUseStep?.();
  });
}

function renderPhoneStep(
  ctx: UseContext,
  prefilledPhone: string,
  setPhoneCleanup: (fn: () => void) => void,
  setUseCleanup:   (fn: () => void) => void,
): () => void {
  let currentPhone = prefilledPhone || "";

  const header = mountPayHeader({
    hint:   "휴대폰 번호 입력 후 확인 버튼을 눌러주세요.",
    onBack: () => { void cancelUse({ source: ctx.source, message: CancelMessage.back }); returnToIdle(); },
  });
  header.setAmount(`${(ctx.payAmount || 0).toLocaleString()}원 결제`);
  header.hideEstimate();

  const footer = mountConfirmFooter({ agreement: true });

  const syncBtn = (): void => {
    footer.confirmBtnEl.disabled = !(footer.agreementEl.checked && currentPhone.length === 11);
  };
  footer.agreementEl.addEventListener("change", syncBtn);

  const onSubmitPhone = async (phone: string): Promise<void> => {
    const exist = await getCustomer(phone);
    if (!exist.success || !exist.customer) {
      sdk.template.openToast({ message: "등록된 회원이 없습니다.", icon: "error" });
      return;
    }
    const res = await getPointBalance(phone);
    if (!res.success || !res.customer) {
      sdk.template.openToast({ message: res.success === false ? res.error : "등록된 회원이 없습니다.", icon: "error" });
      return;
    }
    // Phone step 오버레이는 유지 (SDK 가 화면 전환 시 잔상 방지)
    await handleLookupResult(ctx, phone, res, header, footer, setPhoneCleanup, setUseCleanup);
  };

  const triggerSubmit = (): void => {
    if (currentPhone.length !== 11) {
      sdk.template.openToast({ message: "휴대폰 번호 11자리를 모두 입력해주세요.", icon: "error" }); return;
    }
    if (!footer.agreementEl.checked) {
      sdk.template.openToast({ message: "개인정보 제공 동의가 필요합니다.", icon: "error" }); return;
    }
    void onSubmitPhone(currentPhone);
  };

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "", subtitle: "" },
    input: {
      placeholder: "전화번호 입력",
      onChange: (v) => { currentPhone = (v ?? "").replace(/\D/g, ""); syncBtn(); },
    },
    onSubmit: (phone) => { currentPhone = phone; syncBtn(); },
    onBack:   () => { void cancelUse({ source: ctx.source, message: CancelMessage.back }); returnToIdle(); },
  });

  footer.confirmBtnEl.addEventListener("click", triggerSubmit);
  syncBtn();

  if (prefilledPhone) setTimeout(() => setTossInputValue(prefilledPhone), 50);

  const cleanup = (): void => { header.remove(); footer.remove(); };
  setPhoneCleanup(cleanup);
  return cleanup;
}

async function handleLookupResult(
  ctx: UseContext,
  phone: string,
  res: Extract<InquiryResult, { success: true }>,
  phoneHeader: ReturnType<typeof mountPayHeader>,
  phoneFooter: ReturnType<typeof mountConfirmFooter>,
  setPhoneCleanup: (fn: () => void) => void,
  setUseCleanup: (fn: () => void) => void,
): Promise<void> {
  const cfg = await getPointUseConfig();
  const balance = res.customer.pointBalance || 0;
  const insufficient = (cfg.isMinPointEnabled && cfg.minPoint > balance) || balance < 1;
  const storeName = await getStoreName();

  if (insufficient) {
    void cancelUse({ source: ctx.source, message: CancelMessage.insufficient });
    clearContext();
    goInsufficient({ storeName, minPoint: cfg.minPoint, balancePoint: balance });
    return;
  }

  // Phone step 오버레이 제거 후 use step 진입
  phoneHeader.remove();
  phoneFooter.remove();
  setPhoneCleanup(() => { /* phone step 정리 완료 */ });

  const useCleanup = renderUseInputStep(ctx, phone, res, balance, cfg, storeName);
  setUseCleanup(useCleanup);
}

function renderUseInputStep(
  ctx: UseContext,
  phone: string,
  res: Extract<InquiryResult, { success: true }>,
  balance: number,
  cfg: { minPoint: number; isMinPointEnabled: boolean },
  storeName: string,
): () => void {
  const app = document.getElementById("app");
  if (app) {
    app.style.transition = "opacity 0.25s ease-in";
    app.style.opacity    = "0";
  }

  const maxPoint  = Math.min(balance, ctx.payAmount || balance);
  const minUse    = cfg.isMinPointEnabled && cfg.minPoint > 0 ? cfg.minPoint : 1;
  const disclaimer = cfg.isMinPointEnabled && cfg.minPoint > 0
    ? `포인트는 최소 ${cfg.minPoint.toLocaleString("ko-KR")}P부터 사용 가능합니다`
    : `사용 가능 포인트 ${maxPoint.toLocaleString("ko-KR")}P`;

  let currentUse = 0;

  const syncUseBtn = (): void => {
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
        currentUse = val; syncUseBtn();
      },
    },
    button:     { label: "사용하기" },
    disclaimer,
    onSubmit: async (value) => {
      const raw = parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
      if (cfg.isMinPointEnabled && cfg.minPoint > 0 && raw < cfg.minPoint) {
        sdk.template.openToast({ message: `${cfg.minPoint.toLocaleString("ko-KR")}P 이상 입력해주세요`, icon: "error" });
        return;
      }
      if (raw <= 0) {
        sdk.template.openToast({ message: "사용 포인트를 입력해주세요.", icon: "error" });
        return;
      }
      const usePoint = Math.min(raw, maxPoint);
      await relayUseResult({
        source:       ctx.source,
        phone,
        customerCode: res.customer.customerCode,
        balance, usePoint,
      });
      clearContext();
      goUseSuccess({
        usePoint, storeName,
        remainingPoint: remainingPoint(balance, usePoint),
        customerName:   res.customer.customerName || "",
      });
    },
    onBack: () => {
      // 휴대폰 입력 단계로 복귀 — 컨텍스트 유지 상태에서 재진입
      void navigate("/point-use-flow");
    },
  });

  setTimeout(syncUseBtn, 0);
  setTimeout(() => { if (app) app.style.opacity = "1"; }, 300);

  return (): void => {
    if (app) app.style.opacity = "1";
  };
}

// PointUseSource 는 use-flow 뷰가 참조하도록 export
export { PointUseSource };
