/**
 * ResultPageService — sdk.template.renderResultPage 호출 헬퍼.
 *
 * PharmPoint Android presentation/result/ResultContract.State 대응.
 *
 * 적립 · 사용 · 포인트 부족 · 조회 성공 · 마케팅 동의 완료는 새 디자인(src/ui/show-result)으로 옮겼다.
 * 여기 남은 것은 아직 Template API 로 그리는 결과 화면이다.
 *   설정 완료 : 설정 화면(settings.html) 저장 결과
 * 결제금액<최소포인트("포인트 사용 불가")는 번호 입력 · 사용 포인트 입력 화면 위 팝업으로 옮겼다.
 * 조회 실패(등록된 회원 없음)는 번호 입력 화면 안 안내로 옮겨 이 화면에서 뺐다.
 */
import { getResultTimeoutMs } from "../app-config/app-config.service";

const DEFAULT_TIMEOUT_MS = 5000;

export type ResultButton = {
  label:         string;
  closeOnClick?: boolean;
  onClick:       () => void;
};

function fmtPoint(n: number | string): string {
  const num = typeof n === "number" ? n : parseInt(n, 10) || 0;
  return num.toLocaleString("ko-KR");
}

async function resolveTimerMs(timerMs?: number): Promise<number> {
  if (Number.isFinite(timerMs)) return timerMs as number;
  try { return await getResultTimeoutMs(); }
  catch (e) {
    console.warn("[ResultPage] timeout 조회 실패, 기본값 사용", e);
    return DEFAULT_TIMEOUT_MS;
  }
}

type RenderArgs = {
  type:         "text" | "image";
  status?:      "success" | "error";
  title?:       string;
  description?: string;
  text?:        string;
  onTimeout?:   () => void;
  timerMs?:     number;
  buttons?:     ResultButton[];
};

async function render(args: RenderArgs): Promise<void> {
  const params = {
    type:       args.type,
    title:      args.title,
    description: args.description,
    onTimeout:  args.onTimeout ?? (() => {}),
    timerMs:    await resolveTimerMs(args.timerMs),
    localeCode: "ko",
  } as Record<string, unknown>;
  if (args.type === "image") params.status = args.status ?? "success";
  if (args.type === "text")  params.text   = args.text ?? "";
  if (args.buttons && args.buttons.length) params.buttons = args.buttons;
  sdk.template.renderResultPage(params as never);
}

// ─── 공개 API ─────────────────────────────────

export function showMinPointSaved(args: { minPoint: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `최소 사용 포인트 ${fmtPoint(args.minPoint)}P`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}

export function showTimeoutSaved(args: { seconds: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `화면 대기 시간 ${args.seconds}초`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}

export function showInactivityTimeoutSaved(args: { seconds: number; onTimeout?: () => void; timerMs?: number }): Promise<void> {
  return render({
    type: "image", status: "success",
    title:       "설정 완료",
    description: `미동작 시 대기 시간 ${args.seconds}초`,
    onTimeout: args.onTimeout, timerMs: args.timerMs,
  });
}
