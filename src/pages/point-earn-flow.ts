/**
 * PointEarnFlow 뷰 — CAT/TERMINAL 적립 요청 후 진입.
 *
 * 흐름:
 *   1) sessionStorage 컨텍스트 로드 (source / transactionData)
 *   2) estimate 병렬 시작 (badge 표시용)
 *   3) 사용자 휴대폰 번호 입력 → commitWithFallback → Result 로 이동
 */
import { commitWithFallback, estimate, cancelEarn, type CommitCommand } from "../features/point-earn/point-earn.service";
import { CancelMessage, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goEarnSuccess } from "../features/result-page/result-navigator";
import type { TransactionData } from "../pos/protocol/transaction-parser";
import type { EstimateResult } from "../features/point-transaction/point-transaction.service";
import { navigate, onCleanup } from "../router";
import { mountPayHeader, mountConfirmFooter } from "./overlays";

const CTX_KEY = "pharm_earn_point_ctx";

type EarnContext = {
  source:          PointUseSourceType;
  paymentType?:    "SINGLE" | "MULTIPLE";
  transactionData: TransactionData;
};

function loadContext(): EarnContext | null {
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    return raw ? (JSON.parse(raw) as EarnContext) : null;
  } catch { return null; }
}
function clearContext(): void { sessionStorage.removeItem(CTX_KEY); }

function returnToIdle(): void { clearContext(); navigate("/"); }

async function getStoreName(): Promise<string> {
  try { const m = await sdk.app.getMerchant(); return m?.name ?? ""; }
  catch { return ""; }
}

export async function renderPointEarnFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) { returnToIdle(); return; }
  console.log("[earn-flow] enter, source=" + ctx.source);

  const payAmount = parseInt(String(ctx.transactionData.payAmount ?? "0"), 10) || 0;

  const header = mountPayHeader({
    hint:         "휴대폰 번호 입력 후 확인 버튼을 눌러주세요.",
    showEstimate: true,
    onBack:       () => { void cancelEarn({ source: ctx.source, message: CancelMessage.back }); returnToIdle(); },
  });
  header.setAmount(`${payAmount.toLocaleString()}원 결제`);

  const footer = mountConfirmFooter({ agreement: true });

  let currentPhone = "";

  const syncBtnState = (): void => {
    footer.confirmBtnEl.disabled = !(footer.agreementEl.checked && currentPhone.length === 11);
  };
  footer.agreementEl.addEventListener("change", syncBtnState);

  // estimate 병렬 시작 — badge 채우기용
  const estimatePromise: Promise<EstimateResult> = estimate(ctx.transactionData)
    .catch((e) => { console.warn("[earn-flow] estimate error", e); return { success: false, error: String(e) } as EstimateResult; });

  void estimatePromise.then((est) => {
    if (est.success && est.data) {
      const p = parseInt(String(est.data.pointAmount ?? "0"), 10) || 0;
      header.setEstimate(`${p.toLocaleString()}P 적립예상`);
    }
  });

  sdk.template.renderInputPage({
    type: "phone",
    top:  { title: "", subtitle: "" },
    input: {
      placeholder: "전화번호 입력",
      onChange: (v) => { currentPhone = (v ?? "").replace(/\D/g, ""); syncBtnState(); },
    },
    onSubmit: (phone) => { currentPhone = phone; syncBtnState(); },
    onBack:   () => { void cancelEarn({ source: ctx.source, message: CancelMessage.back }); returnToIdle(); },
  });

  footer.confirmBtnEl.addEventListener("click", () => void submitEarn(ctx, currentPhone, estimatePromise, footer.agreementEl));

  syncBtnState();

  onCleanup(() => { header.remove(); footer.remove(); });
}

async function submitEarn(
  ctx: EarnContext,
  phone: string,
  estimatePromise: Promise<EstimateResult>,
  agreementEl: HTMLInputElement,
): Promise<void> {
  if (phone.length !== 11) {
    sdk.template.openToast({ message: "휴대폰 번호 11자리를 모두 입력해주세요.", icon: "error" });
    return;
  }
  if (!agreementEl.checked) {
    sdk.template.openToast({ message: "개인정보 제공 동의가 필요합니다.", icon: "error" });
    return;
  }

  const td = ctx.transactionData;
  let sleSeq = "";
  let estimatedPoint = 0;
  try {
    const est = await estimatePromise;
    if (est.success && est.data) {
      sleSeq = est.data.sleSeq ?? "";
      estimatedPoint = parseInt(String(est.data.pointAmount ?? "0"), 10) || 0;
    }
  } catch (e) {
    console.warn("[earn-flow] estimate failed, continuing", e);
  }

  const cmd: CommitCommand = {
    customerPhone:     phone,
    transactionDate:   td.trnDate || "",
    sleSeq,
    transactionGubn:   td.trnGubn || "",
    transactionTime:   td.trnTime || "",
    transactionAmount: td.payAmount || 0,
    approvalNumber:    td.appNum || "",
    payments:          td.payments,
  };

  const result = await commitWithFallback(cmd);
  if (!result.success) {
    const errMsg = result.error || "적립 실패";
    sdk.template.openToast({ message: errMsg, icon: "error" });
    void cancelEarn({ source: ctx.source, message: errMsg });
    return;
  }

  const balancePoint = parseInt(result.data.pointBalance, 10) || 0;
  const earnPoint    = estimatedPoint || parseInt(result.data.pointAmount, 10) || 0;
  const customerName = result.data.customerName || "";
  const storeName    = await getStoreName();

  clearContext();
  goEarnSuccess({ earnPoint, storeName, balancePoint, customerName });
}
