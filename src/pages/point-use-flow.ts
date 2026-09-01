/**
 * PointUseFlow 뷰 — CAT/TERMINAL 사용 요청 (고객 미선택) 후 진입.
 *
 * 흐름:
 *   1) 전화번호 입력 → 회원 조회
 *   2) 잔액 검증 (미달·최소 미만 → 결과 화면으로)
 *   3) 사용 포인트 입력 → 사용 결과 송신 → Result 이동
 */
import { getCustomer, getPointBalance, type InquiryResult } from "../features/point-inquiry/point-inquiry.service";
import { getInactivityTimeoutSeconds, getPointUseConfig } from "../features/app-config/app-config.service";
import { cancelUse, CancelMessage, relayUseResult, remainingPoint, PointUseSource, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goUseSuccess, goInsufficient, goPayAmountBelowMinPoint } from "../features/result-page/result-navigator";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { mountPhoneOverlay, type PhoneOverlayHandles } from "./overlays";
import { startInactivityTimeout } from "../features/inactivity/inactivity-timeout";

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

/** 보관된 컨텍스트가 단말기(TRM) 유래인지. TRM 999(화면 미노출) 판별용. */
export function isTerminalUseContext(): boolean {
  return loadContext()?.source === PointUseSource.TERMINAL;
}

/** 컨텍스트 폐기 — 외부(999 등)에서 이 화면을 강제 종료할 때. */
export function clearUseContext(): void { clearContext(); }

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

  // CAT 요청 사전 차단 — 결제금액이 최소 사용 포인트 미만이면 번호 입력 화면을 띄우지 않고
  // 바로 결과 화면으로 라우팅 + CATPOS 에 FAIL 회신.
  // (기존 잔액-기반 insufficient 판정과 별개. 이건 회원 조회 이전 결제금액만으로 판정)
  const cfg = await getPointUseConfig();
  if (
    ctx.source === PointUseSource.CAT
    && cfg.isMinPointEnabled
    && cfg.minPoint > 0
    && (ctx.payAmount || 0) < cfg.minPoint
  ) {
    // FAIL 메시지 = 결과 화면 문구와 동일 (title + description 3줄 그대로).
    // CATPOS 측 로그·안내에 결과 화면과 같은 정보가 남도록 통일.
    // 줄바꿈은 \r\n (CRLF) — CATPOS(Delphi)의 TLabel/TMemo 는 LF 단독으로는 개행 인식 안 함.
    const payAmountFmt = (ctx.payAmount || 0).toLocaleString("ko-KR");
    const minPointFmt  = cfg.minPoint.toLocaleString("ko-KR");
    const msg = `포인트를 사용할 수 없어요.\r\n결제 금액 ${payAmountFmt}원\r\n최소 사용 포인트 ${minPointFmt}P`;
    console.log(`[PointUse] 결제금액<최소포인트 사전차단 — payAmount=${ctx.payAmount}, minPoint=${cfg.minPoint}`);
    void SocketGateway.sendCATFail(msg);
    clearContext();
    goPayAmountBelowMinPoint({ payAmount: ctx.payAmount || 0, minPoint: cfg.minPoint });
    return;
  }

  let cleanupPhoneStep: (() => void) | null = null;
  let cleanupUseStep:   (() => void) | null = null;

  cleanupPhoneStep = renderPhoneStep(ctx, "", (fn) => { cleanupPhoneStep = fn; }, (fn) => { cleanupUseStep = fn; });

  // 번호 입력 · 포인트 입력 두 단계 공통 무동작 타임아웃 (전역 터치 리셋이 두 단계 모두 커버).
  const inactivitySec = await getInactivityTimeoutSeconds();
  const stopTimeout = startInactivityTimeout({
    onTimeout: () => {
      void cancelUse({ source: ctx.source, message: CancelMessage.back });
      returnToIdle();
    },
    duration: inactivitySec,
  });

  onCleanup(() => {
    stopTimeout();
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

  // 상단 back 버튼만 있는 최소 오버레이 — padding-top 축소로 SDK 영역(input+keypad+button)이
  // 640px 뷰포트 안에 안 잘리게 한다. 결제금액·안내문구는 SDK title/subtitle 로 이관.
  const overlay = mountPhoneOverlay({
    storeName: "",
    hint:      "",
    appMode:   "minimal-overlay",
    agreement: true,
  });

  overlay.backBtnEl.addEventListener("click", () => {
    void cancelUse({ source: ctx.source, message: CancelMessage.back });
    returnToIdle();
  });

  const syncBtn = (): void => {
    overlay.confirmBtnEl.disabled = !(overlay.agreementEl.checked && currentPhone.length === 11);
  };
  overlay.agreementEl.addEventListener("change", syncBtn);

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
    await handleLookupResult(ctx, phone, res, overlay, setPhoneCleanup, setUseCleanup);
  };

  const triggerSubmit = (): void => {
    if (currentPhone.length !== 11) {
      sdk.template.openToast({ message: "휴대폰 번호 11자리를 모두 입력해주세요.", icon: "error" }); return;
    }
    if (!overlay.agreementEl.checked) {
      sdk.template.openToast({ message: "개인정보 제공 동의가 필요합니다.", icon: "error" }); return;
    }
    void onSubmitPhone(currentPhone);
  };

  sdk.template.renderInputPage({
    type: "phone",
    // 메인 = 목적 설명 / 보조 = 결제금액.
    top:  {
      title:    "포인트를 조회할게요",
      subtitle: `${(ctx.payAmount || 0).toLocaleString()}원 결제`,
    },
    input: {
      placeholder: "전화번호 입력",
      onChange: (v) => { currentPhone = (v ?? "").replace(/\D/g, ""); syncBtn(); },
    },
    onSubmit: (phone) => { currentPhone = phone; syncBtn(); },
    onBack:   () => { void cancelUse({ source: ctx.source, message: CancelMessage.back }); returnToIdle(); },
  });

  overlay.confirmBtnEl.addEventListener("click", triggerSubmit);
  syncBtn();

  if (prefilledPhone) setTimeout(() => setTossInputValue(prefilledPhone), 50);

  const cleanup = (): void => { overlay.remove(); };
  setPhoneCleanup(cleanup);
  return cleanup;
}

async function handleLookupResult(
  ctx: UseContext,
  phone: string,
  res: Extract<InquiryResult, { success: true }>,
  phoneOverlay: PhoneOverlayHandles,
  setPhoneCleanup: (fn: () => void) => void,
  setUseCleanup: (fn: () => void) => void,
): Promise<void> {
  const cfg = await getPointUseConfig();
  const balance = res.customer.pointBalance || 0;
  const insufficient = (cfg.isMinPointEnabled && cfg.minPoint > balance) || balance < 1;
  const storeName = await getStoreName();

  console.log(`[PointUse] 잔액판정 balance=${balance}P, minPoint=${cfg.minPoint}(enabled=${cfg.isMinPointEnabled}) → ${insufficient ? "부족" : "사용가능"} / source=${ctx.source}`);

  if (insufficient) {
    void cancelUse({ source: ctx.source, message: CancelMessage.insufficient });
    clearContext();
    goInsufficient({ storeName, minPoint: cfg.minPoint, balancePoint: balance });
    return;
  }

  // Phone step 오버레이 제거 후 use step 진입
  phoneOverlay.remove();
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
