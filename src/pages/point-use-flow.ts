/**
 * PointUseFlow 뷰 — CAT/TERMINAL 사용 요청 (고객 미선택) 후 진입.
 *
 * 흐름:
 *   1) 전화번호 입력 → 회원 조회
 *   2) 잔액 검증 (미달·최소 미만 → 결과 화면으로)
 *   3) 사용 포인트 입력 → 사용 결과 송신 → Result 이동
 *
 * 1) 번호 입력은 새 디자인(Figma 04-4, src/ui/phone-input).
 * 3) 사용 포인트 입력도 새 디자인(Figma 06-1 · 06-2, src/ui/use-point-input).
 * 무입력 타이머는 두 화면이 각자 관리한다.
 */
import { getCustomer, getPointBalance, inquiryFailureNote, type InquiryResult } from "../features/point-inquiry/point-inquiry.service";
import { getInactivityTimeoutSeconds, getPointUseConfig } from "../features/app-config/app-config.service";
import { cancelUse, CancelMessage, relayUseResult, remainingPoint, PointUseSource, type PointUseSourceType } from "../features/point-use/point-use.service";
import { goUseSuccess, goInsufficient } from "../features/result-page/result-navigator";
import { SocketGateway } from "../pos/socket-gateway";
import { navigate, onCleanup } from "../router";
import { isUnreachable, showPhoneInput, type PhoneSubmitOutcome } from "../ui/phone-input";
import { showUsePointInput } from "../ui/use-point-input";
import { hideScreen } from "../ui/stage";
import { log } from "../utils/log";
import { maskPhone } from "../utils/pii-mask";

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

// ─── 진입점 ──────────────────────────────

export async function renderPointUseFlow(): Promise<void> {
  const ctx = loadContext();
  if (!ctx) {
    log.status("[팜포인트] ❌ 포인트 사용 화면 못 띄움 — 요청 정보가 비어 있음 · 확인 필요: 플러그인(프론트)");
    returnToIdle();
    return;
  }

  // 사용 요청은 결제 전이라 승인번호가 없다. 대조 키는 시각과 결제금액뿐이다.
  log.status(`[팜포인트·사용] 요청 접수 — 결제 ${(ctx.payAmount || 0).toLocaleString()}원`);

  const cfg = await getPointUseConfig();
  const inactivitySec = await getInactivityTimeoutSeconds();
  const header = { kind: "pay" as const, amount: ctx.payAmount || 0 };

  // CAT 요청 사전 차단 — 결제금액이 최소 사용 포인트 미만이면 번호 입력 화면 위에
  // "포인트를 사용할 수 없어요" 팝업(Figma 05-2 popup03)을 띄우고 CATPOS 에 FAIL 회신.
  // [확인] 을 누르면 대기화면. (기존 잔액-기반 insufficient 판정과 별개. 회원 조회 이전 결제금액만으로 판정)
  if (
    ctx.source === PointUseSource.CAT
    && cfg.isMinPointEnabled
    && cfg.minPoint > 0
    && (ctx.payAmount || 0) < cfg.minPoint
  ) {
    // FAIL 메시지 = 팝업 문구와 같은 정보.
    // 줄바꿈은 \r\n (CRLF) — CATPOS(Delphi)의 TLabel/TMemo 는 LF 단독으로는 개행 인식 안 함.
    const payAmountFmt = (ctx.payAmount || 0).toLocaleString("ko-KR");
    const minPointFmt  = cfg.minPoint.toLocaleString("ko-KR");
    const msg = `포인트를 사용할 수 없어요.\r\n결제 금액 ${payAmountFmt}원\r\n최소 사용 포인트 ${minPointFmt}P`;
    // 정상 동작인데 약국은 "고장났다"고 문의하는 대표 사례라 진단에 남긴다.
    log.status(
      `[팜포인트·사용] 중단 — 결제금액 ${payAmountFmt}원이 최소 사용 기준 ${minPointFmt}P 미만 (사용 불가 팝업)`,
    );
    log.info(`[PointUse] 결제금액<최소포인트 사전차단 — payAmount=${ctx.payAmount}, minPoint=${cfg.minPoint}`);
    void SocketGateway.sendCATFail(msg);
    clearContext();
    showPhoneInput({
      header,
      agreement: true,
      inactivitySec,
      onSubmit: async () => "done",
      onClose: returnToIdle,
      onTimeout: returnToIdle,
      pointUnavailable: { payAmount: ctx.payAmount || 0, minPoint: cfg.minPoint, onConfirm: returnToIdle },
    });
    onCleanup(() => { hideScreen(); });
    return;
  }

  const cancelByUser = (reason: string): void => {
    log.status(`[팜포인트·사용] 중단 — ${reason}`);
    void cancelUse({ source: ctx.source, message: CancelMessage.back });
    returnToIdle();
  };

  showPhoneInput({
    header,
    agreement: true,
    inactivitySec,
    onSubmit: async (phone) => {
      const outcome = await lookupForUse(phone);
      if (outcome.kind !== "found") return outcome.kind;
      const next = await handleLookupResult(ctx, phone, outcome.res);
      if (next === "useStep") {
        renderUseInputStep(ctx, phone, outcome.res, cfg, await getStoreName(), {
          inactivitySec,
          onTimeout: () => cancelByUser(`고객이 ${inactivitySec}초간 조작 없음`),
        });
      }
      return "done";
    },
    onClose: () => cancelByUser("고객이 뒤로가기"),
    onTimeout: () => cancelByUser(`고객이 ${inactivitySec}초간 조작 없음`),
  });

  onCleanup(() => { hideScreen(); });
}

/** 번호로 회원 · 잔액 조회. 화면에 보일 결과(미가입 · 오류)도 여기서 정한다. */
async function lookupForUse(
  phone: string,
): Promise<{ kind: "found"; res: Extract<InquiryResult, { success: true }> } | { kind: Exclude<PhoneSubmitOutcome, "done"> }> {
  try {
    const exist = await getCustomer(phone);
    if (!exist.success || !exist.customer) {
      // 미가입인지 서버가 못 받은 것인지 갈라 남긴다.
      log.status(`[팜포인트·사용] 회원 조회 실패 — ${maskPhone(phone)} · ${inquiryFailureNote(exist)}`);
      return { kind: exist.success === false && !exist.notFound ? "server" : "notFound" };
    }
    const res = await getPointBalance(phone);
    if (!res.success || !res.customer) {
      log.status(`[팜포인트·사용] 포인트 조회 실패 — ${maskPhone(phone)} · ${inquiryFailureNote(res)}`);
      return { kind: res.success === false && !res.notFound ? "server" : "notFound" };
    }
    return { kind: "found", res };
  } catch (err) {
    const unreachable = isUnreachable(err);
    log.status(
      `[팜포인트·사용] 회원 조회 실패 — ${maskPhone(phone)} · ${unreachable ? "서버에 닿지 못함" : "처리 중 오류"}: ${(err as Error).message}` +
      ` · 확인 필요: ${unreachable ? "네트워크(통신)" : "서버(API)"}`,
    );
    return { kind: unreachable ? "network" : "server" };
  }
}

async function handleLookupResult(
  ctx: UseContext,
  phone: string,
  res: Extract<InquiryResult, { success: true }>,
): Promise<"insufficient" | "useStep"> {
  const cfg = await getPointUseConfig();
  const balance = res.customer.pointBalance || 0;
  const insufficient = (cfg.isMinPointEnabled && cfg.minPoint > balance) || balance < 1;
  const storeName = await getStoreName();

  log.status(`[팜포인트·사용] 회원 조회됨 — ${maskPhone(phone)} · 보유 ${balance.toLocaleString()}P`);
  log.info(`[PointUse] 잔액판정 balance=${balance}P, minPoint=${cfg.minPoint}(enabled=${cfg.isMinPointEnabled}) → ${insufficient ? "부족" : "사용가능"} / source=${ctx.source}`);

  if (insufficient) {
    // 왜 못 썼는지가 여기서 갈린다 — 기준 미달인지, 아예 잔액이 없는지.
    log.status(
      `[팜포인트·사용] 중단 — ${maskPhone(phone)} · 보유 ${balance.toLocaleString()}P · ` +
      (cfg.isMinPointEnabled && cfg.minPoint > balance
        ? `최소 ${cfg.minPoint.toLocaleString()}P 이상부터 사용 가능`
        : "사용할 포인트 없음"),
    );
    void cancelUse({ source: ctx.source, message: CancelMessage.insufficient });
    clearContext();
    goInsufficient({ storeName, minPoint: cfg.minPoint, isMinPointEnabled: cfg.isMinPointEnabled, balancePoint: balance });
    return "insufficient";
  }
  return "useStep";
}

// 사용 포인트 입력 — 새 디자인(Figma 06-1 · 06-2). 번호 입력 화면을 바꿔 띄운다.
function renderUseInputStep(
  ctx: UseContext,
  phone: string,
  res: Extract<InquiryResult, { success: true }>,
  cfg: { minPoint: number; isMinPointEnabled: boolean },
  storeName: string,
  timer: { inactivitySec: number; onTimeout: () => void },
): void {
  const balance  = res.customer.pointBalance || 0;
  const maxPoint = Math.min(balance, ctx.payAmount || balance);
  const minUse   = cfg.isMinPointEnabled && cfg.minPoint > 0 ? cfg.minPoint : 1;
  const minPoint = cfg.isMinPointEnabled ? cfg.minPoint : 0;

  showUsePointInput({
    payAmount: ctx.payAmount || 0,
    balance, maxPoint, minUse, minPoint,
    inactivitySec: timer.inactivitySec,
    onTimeout: timer.onTimeout,
    onSubmit: async (usePoint) => {
      await relayUseResult({
        source:       ctx.source,
        phone,
        customerCode: res.customer.customerCode,
        balance, usePoint,
      });
      log.status(
        `[팜포인트·사용] 완료 — ${maskPhone(phone)} · ${usePoint.toLocaleString()}P 사용 · ` +
        `남은 ${remainingPoint(balance, usePoint).toLocaleString()}P`,
      );
      clearContext();
      goUseSuccess({
        usePoint, storeName,
        remainingPoint: remainingPoint(balance, usePoint),
        customerName:   res.customer.customerName || "",
      });
    },
    // X — 휴대폰 입력 단계로 복귀. 컨텍스트 유지 상태에서 재진입
    onClose: () => { void navigate("/point-use-flow"); },
  });
}

// PointUseSource 는 use-flow 뷰가 참조하도록 export
export { PointUseSource };
