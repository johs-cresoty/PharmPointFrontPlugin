/**
 * PointEarnFlow 뷰 — CAT/TERMINAL 적립 요청 후 진입.
 *
 * 흐름:
 *   1) sessionStorage 컨텍스트 로드 (source / transactionData)
 *   2) estimate 병렬 시작 (badge 표시용)
 *   3) 사용자 휴대폰 번호 입력 → commitWithFallback → Result 로 이동
 */
import { commitWithFallback, estimate, cancelEarn, type CommitCommand } from "../features/point-earn/point-earn.service";
import { CancelMessage, PointUseSource, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goEarnSuccess } from "../features/result-page/result-navigator";
import type { TransactionData } from "../pos/protocol/transaction-parser";
import type { EstimateResult } from "../features/point-transaction/point-transaction.service";
import { navigate, onCleanup } from "../router";
import { mountPayHeader, mountConfirmFooter } from "./overlays";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";
import { getInactivityTimeoutSeconds } from "../features/app-config/app-config.service";
import { log } from "../utils/log";
import { maskPhone } from "../utils/pii-mask";

const CTX_KEY = "pharm_earn_point_ctx";

/**
 * 진단 기록에 남길 승인번호.
 *
 * 약국 문의는 "몇 시에 얼마 결제한 손님"으로 들어온다. 승인번호는 영수증에 찍혀 있어
 * 그 말과 로그를 1:1 로 맞출 수 있는 유일한 값이다. 개인정보가 아니라 그대로 남긴다.
 * 복합결제는 승인이 둘이라 함께 적는다.
 */
function approvalLabel(td: TransactionData): string {
  if (td.payments) {
    const nums = td.payments.map((p) => p.appNum).filter(Boolean);
    if (nums.length) return nums.join("+");
  }
  return td.appNum || "없음";
}

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

/** 보관된 컨텍스트가 단말기(TRM) 유래인지. TRM 999(화면 미노출) 판별용. */
export function isTerminalEarnContext(): boolean {
  return loadContext()?.source === PointUseSource.TERMINAL;
}

/** 컨텍스트 폐기 — 외부(999 등)에서 이 화면을 강제 종료할 때. */
export function clearEarnContext(): void { clearContext(); }

async function getStoreName(): Promise<string> {
  try { const m = await sdk.app.getMerchant(); return m?.name ?? ""; }
  catch { return ""; }
}

export async function renderPointEarnFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) {
    log.status("[팜포인트] ❌ 적립 화면 못 띄움 — 요청 정보가 비어 있음 · 확인 필요: 플러그인(프론트)");
    returnToIdle();
    return;
  }

  const payAmount = parseInt(String(ctx.transactionData.payAmount ?? "0"), 10) || 0;

  // 적립 화면이 실제로 떴다는 기록. 승인번호가 있어 영수증과 대조된다.
  log.status(`[적립] 요청 접수 — 결제 ${payAmount.toLocaleString()}원 · 승인 ${approvalLabel(ctx.transactionData)}`);

  // 고객이 끝까지 가지 않은 경우. "화면은 떴는데 적립이 안 됐다"는 문의에서
  // 중단인지 실패인지를 가르는 줄이다.
  const abortEarn = (reason: string): void => {
    log.status(`[적립] 중단 — ${reason}`);
    void cancelEarn({ source: ctx.source, message: CancelMessage.back });
    returnToIdle();
  };

  const header = mountPayHeader({
    // 적립예상 배지가 있는 화면이라 헤더가 높아 입력란이 잘림 → 안내문구 생략(공간 확보).
    hint:         "",
    showEstimate: true,
    onBack:       () => abortEarn("고객이 뒤로가기"),
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

  // 배지는 기본 숨김(공간은 유지). 유효한 예상 포인트(1P 이상)를 받았을 때만 노출한다.
  // 조회 실패거나 0P 면 "0P 적립예상" 대신 아무것도 보이지 않게 둔다.
  void estimatePromise.then((est) => {
    const p = est.success && est.data ? parseInt(String(est.data.pointAmount ?? "0"), 10) || 0 : 0;
    if (p > 0) {
      header.setEstimate(`${p.toLocaleString()}P 적립예상`);
      log.status(`[적립] 적립예상 ${p.toLocaleString()}P`);
    } else {
      // "적립예상이 안 보인다"는 문의의 근거. 조회가 실패한 것인지 원래 0P 인지 갈린다.
      log.status(`[적립] 적립예상 표시 안 함 — ${est.success ? "적립 대상 금액 아님(0P)" : `조회 실패: ${est.error || "사유 미상"}`}`);
      log.info(`[earn-flow] 적립예상 미표시 (success=${est.success}, point=${p})`);
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
    onBack:   () => abortEarn("고객이 뒤로가기"),
  });

  footer.confirmBtnEl.addEventListener("click", () => void submitEarn(ctx, currentPhone, estimatePromise, footer.agreementEl));

  syncBtnState();

  const inactivitySec = await getInactivityTimeoutSeconds();
  const stopTimeout = startInactivityTimeout({
    onTimeout: () => abortEarn(`고객이 ${inactivitySec}초간 조작 없음`),
    duration:  inactivitySec,
  });

  onCleanup(() => { stopTimeout(); header.remove(); footer.remove(); });
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
    // 어느 번호가 왜 실패했는지. 약국 문의에 되묻지 않고 답하려면 사유가 있어야 한다.
    log.status(`[적립] ❌ 실패 — ${maskPhone(phone)} · 승인 ${approvalLabel(td)} · ${errMsg} · 확인 필요: 서버(API)`);
    sdk.template.openToast({ message: errMsg, icon: "error" });
    void cancelEarn({ source: ctx.source, message: errMsg });
    return;
  }

  const balancePoint = parseInt(result.data.pointBalance, 10) || 0;
  const earnPoint    = estimatedPoint || parseInt(result.data.pointAmount, 10) || 0;
  const customerName = result.data.customerName || "";
  const storeName    = await getStoreName();

  // 이름은 남기지 않는다. 뒷 4자리만으로 약국이 말한 손님과 맞출 수 있다.
  log.status(
    `[적립] 완료 — ${maskPhone(phone)} · 승인 ${approvalLabel(td)} · ` +
    `${earnPoint.toLocaleString()}P 적립 · 잔액 ${balancePoint.toLocaleString()}P`,
  );

  clearContext();
  goEarnSuccess({ earnPoint, storeName, balancePoint, customerName });
}
