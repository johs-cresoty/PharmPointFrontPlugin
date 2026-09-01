/**
 * AppSession — 소켓 이벤트 → 화면 라우팅 결정 (Android AppViewModel.handleSocketEvent 대응).
 *
 * 역할:
 *   1. SocketGateway 이벤트 구독 → TransactionParser 로 파싱
 *   2. 화면 진입 args 를 만들어 상위 라우터 콜백에 전달
 *   3. 적립 활성/최소 사용 포인트 설정 참조해서 필터링
 *
 * 앱 lifecycle 에 하나로 붙어 SocketGateway 도 함께 관리 (SPA 전환 후 세션 유지).
 */
import { SocketGateway } from "../../pos/socket-gateway";
import { SocketEvent } from "../../pos/socket-events";
import {
  parseCatComplex,
  parseCatSingle,
  parseCatUsePoint,
  parseTerminalComplex,
  parseTerminalSingle,
  parseTerminalUsePoint,
  type TransactionData,
} from "../../pos/protocol/transaction-parser";
import { getPointSaveSetting } from "../point-settings/point-settings.service";
import { PointUseSource } from "../point-use/point-use.service";
import type {
  CatEventPayload,
  TerminalEventPayload,
  TerminalBarcodePayload,
} from "../../pos/socket-gateway";
import type { BarcodeDisplayData } from "../../pos/protocol/terminal-codec";
import { parseCartData, type CartData } from "../../pos/cart-types";

// ─── 화면 라우팅 콜백 타입 ───────────────────

export type NavigateSavePointArgs = {
  source:      "TERMINAL" | "CAT";
  paymentType: "SINGLE" | "MULTIPLE";
  transactionData: TransactionData;
};

export type NavigateLookupArgs = {
  source: "TERMINAL" | "CAT";
  transactionData: TransactionData;
};

export type NavigateUsePointArgs = {
  source:    "CAT_WITH_CUSTOMER";
  balance:   number;
  payAmount: number;
  minPoint:  number;
  isMinPointEnabled: boolean;
};

export type NavigateCatRequestArgs = {
  mode: "CAT_REQUEST_NUM" | "CAT_REQUEST_CUSTOMER" | "CAT_MARKETING_CONSENT";
};

export type AppSessionHandlers = {
  onNavigateToSavePoint?:  (args: NavigateSavePointArgs) => void;
  onNavigateToLookup?:     (args: NavigateLookupArgs) => void;
  onNavigateToUsePoint?:   (args: NavigateUsePointArgs) => void;
  onNavigateToCatRequest?: (args: NavigateCatRequestArgs) => void;
  onCatDisconnect?:        () => void;
  /** CART_UPDATE — 첫 수신 시 가격표시기 진입, 이후 실시간 갱신. */
  onCartUpdate?:           (cart: CartData) => void;
  /** CART_CLEAR — 결제 개시 직전. 대기화면으로 복귀. */
  onCartClear?:            () => void;
  /** TRM 005 — 바코드 표시 요청. 화면 진입 후 006 회신은 세션이 담당. */
  onBarcodeDisplay?:       (barcode: BarcodeDisplayData) => void;
  /** TRM 999 — 화면 미노출 요청. 단말기 유래 화면만 닫는다. */
  onTerminalHideScreen?:   () => void;
};

// ─── 세션 상태 ───────────────────────────────

let started = false;
let unsubscribes: Array<() => void> = [];

/** 현재 적립 활성 (PointSettingsService 결과 캐시). 미설정 시 true. */
let isSaveEnabled = true;
let minPoint = 0;
let isMinPointEnabled = false;

/** 외부에서 최소 사용 포인트 등 설정 주입 (Home 등에서 AppConfigService 값 전달). */
export function setConfig(cfg: { isSave?: boolean; minPoint?: number; isMinPointEnabled?: boolean }): void {
  if (typeof cfg.isSave === "boolean") isSaveEnabled = cfg.isSave;
  if (Number.isFinite(cfg.minPoint))   minPoint = cfg.minPoint!;
  if (typeof cfg.isMinPointEnabled === "boolean") isMinPointEnabled = cfg.isMinPointEnabled;
}

/** 서버에서 적립 활성 여부 조회 후 세션에 반영. */
export async function refreshConfig(): Promise<void> {
  try {
    const save = await getPointSaveSetting();
    if (save.success) isSaveEnabled = save.isSave;
  } catch (e) {
    console.warn("[AppSession] getPointSaveSetting fail", e);
  }
}

// ─── 이벤트 등록 ─────────────────────────────

export function start(handlers: AppSessionHandlers = {}): void {
  if (started) return;
  started = true;

  const E = SocketEvent;
  const reg = (
    event: string,
    fn: (payload: CatEventPayload | TerminalEventPayload | TerminalBarcodePayload) => void,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unsubscribes.push(SocketGateway.on(event as any, fn));
  };

  // ── TERMINAL ─────────────────────────────

  reg(E.TerminalEarnPointSingle, (payload) => {
    const { fields } = payload as TerminalEventPayload;
    const isAfterUse = (fields[7] ?? "0") === "1";
    const otc = parseInt(fields[5] ?? "0", 10) || 0;
    if (isAfterUse || !isSaveEnabled || otc === 0) return;

    const td = parseTerminalSingle(fields);
    handlers.onNavigateToSavePoint?.({
      source: PointUseSource.TERMINAL, paymentType: "SINGLE", transactionData: td,
    });
  });

  reg(E.TerminalEarnPointComplex, (payload) => {
    const { fields } = payload as TerminalEventPayload;
    const isAfterUse = (fields[7] ?? "0") === "1";
    const otc = parseInt(fields[5] ?? "0", 10) || 0;
    if (isAfterUse || !isSaveEnabled || otc === 0) return;

    const td = parseTerminalComplex(fields);
    handlers.onNavigateToSavePoint?.({
      source: PointUseSource.TERMINAL, paymentType: "MULTIPLE", transactionData: td,
    });
  });

  reg(E.TerminalUsePoint, (payload) => {
    const { fields } = payload as TerminalEventPayload;
    const td = parseTerminalUsePoint(fields);
    handlers.onNavigateToLookup?.({
      source: PointUseSource.TERMINAL, transactionData: td,
    });
  });

  // 005 — 바코드 표시 요청. 명세상 수신 즉시 006 회신.
  reg(E.TerminalBarcodeDisplay, (payload) => {
    const { barcode } = payload as TerminalBarcodePayload;
    handlers.onBarcodeDisplay?.(barcode);
    SocketGateway.sendTerminalBarcodeAck("0000");
  });

  // 999 — 화면 미노출 요청. 응답 전문은 없다(게이트웨이 자동 ACK 로 끝).
  reg(E.TerminalHideScreen, () => {
    handlers.onTerminalHideScreen?.();
  });

  // ── CAT ──────────────────────────────────

  reg(E.CatConnect, () => {
    // Android AppViewModel.sendCatConnectAck: CONNECT_ACK 회신
    SocketGateway.sendCATOk();
  });

  reg(E.CatRequestNum, () => {
    handlers.onNavigateToCatRequest?.({ mode: "CAT_REQUEST_NUM" });
  });

  reg(E.CatRequestCustomer, () => {
    handlers.onNavigateToCatRequest?.({ mode: "CAT_REQUEST_CUSTOMER" });
  });

  reg(E.CatMarketingConsent, () => {
    handlers.onNavigateToCatRequest?.({ mode: "CAT_MARKETING_CONSENT" });
  });

  reg(E.CatDisconnect, () => {
    handlers.onCatDisconnect?.();
  });

  reg(E.CatEarnPointSingle, (payload) => {
    const { data } = payload as CatEventPayload;
    const td = parseCatSingle(data);
    handlers.onNavigateToSavePoint?.({
      source: PointUseSource.CAT, paymentType: "SINGLE", transactionData: td,
    });
  });

  reg(E.CatEarnPointComplex, (payload) => {
    const { data } = payload as CatEventPayload;
    const td = parseCatComplex(data);
    handlers.onNavigateToSavePoint?.({
      source: PointUseSource.CAT, paymentType: "MULTIPLE", transactionData: td,
    });
  });

  reg(E.CatUsePointNoCustomer, (payload) => {
    const { data } = payload as CatEventPayload;
    const td = parseCatUsePoint(data);
    handlers.onNavigateToLookup?.({
      source: PointUseSource.CAT, transactionData: td,
    });
  });

  reg(E.CatUsePointWithCustomer, (payload) => {
    const { data } = payload as CatEventPayload;
    const balance   = parseInt(String(data.balance   ?? "0"), 10) || 0;
    const payAmount = parseInt(String(data.payAmount ?? "0"), 10) || 0;
    handlers.onNavigateToUsePoint?.({
      source: PointUseSource.CAT_WITH_CUSTOMER,
      balance, payAmount, minPoint, isMinPointEnabled,
    });
  });

  // ── 고객 가격표시기 ─────────────────────────
  reg(E.CatCartUpdate, (payload) => {
    const { data } = payload as CatEventPayload;
    const cart = parseCartData(data);
    handlers.onCartUpdate?.(cart);
  });

  reg(E.CatCartClear, () => {
    handlers.onCartClear?.();
  });

  SocketGateway.start().catch((e) => console.error("[AppSession] socket start fail", e));
  void refreshConfig();
}

export async function stop(): Promise<void> {
  if (!started) return;
  unsubscribes.forEach((off) => { try { off(); } catch { /* noop */ } });
  unsubscribes = [];
  started = false;
  await SocketGateway.stop();
}
