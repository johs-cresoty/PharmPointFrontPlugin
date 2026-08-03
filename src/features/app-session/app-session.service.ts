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
import type { CatEventPayload, TerminalEventPayload } from "../../pos/socket-gateway";

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
  const reg = (event: string, fn: (payload: CatEventPayload | TerminalEventPayload) => void) => {
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
