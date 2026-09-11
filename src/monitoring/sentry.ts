/**
 * Sentry — 운영 환경 자체 로그 수집.
 *
 * 토스 배포 가이드가 권장하는 방식이다. 단말기에서 문제가 나면 개발자센터 로그 뷰어는
 * 같은 네트워크에서 실시간으로 볼 때만 쓸 수 있어, 지나간 오류의 원인을 찾을 수 없다.
 *
 * 수집 범위는 플러그인 JavaScript 오류와 우리가 남긴 콘솔 로그뿐이다.
 * 프론트·POS 네이티브 로그는 여기로 오지 않는다.
 *
 * ── 설정 순서 ────────────────────────────────────────
 *   1) Sentry 프로젝트를 만들고 DSN 을 받는다
 *   2) 아래 SENTRY_DSN 에 넣는다
 *   3) DSN 의 호스트만 떼어 개발자센터 ACL 에 https://{host} 형태로 등록한다
 *   4) ACL 추가 후에는 단말기를 로그아웃하고 재온보딩해야 반영된다
 *
 * DSN 이 비어 있으면 초기화를 건너뛴다 — 설정 전에도 앱은 정상 동작한다.
 */
import * as Sentry from "@sentry/browser";
import { maskPiiText } from "../utils/pii-mask";
import { log, readLinkLog } from "../utils/log";

/**
 * Sentry 프로젝트 DSN. 비워두면 수집하지 않는다.
 *
 * 공개되어도 되는 값이다 — 브라우저 코드에 실려 나가므로 어차피 노출된다.
 * 이 값으로는 이벤트를 보낼 수만 있고 읽을 수는 없다.
 */
const SENTRY_DSN = "https://2e9f04fd9a6f958ce7c57f3143b9e78c@o4512065324318720.ingest.us.sentry.io/4512065354334208";

/** 개발자센터에 등록된 플러그인 ID. release 태그 앞부분. */
const PLUGIN_ID = "cresoty-pharmpoint";

/**
 * 전송 직전 마지막 방어선.
 *
 * 로그·오류 메시지는 이미 남기는 시점에 마스킹하지만, 예외 메시지나 SDK 가 덧붙인
 * 문자열까지는 통제할 수 없다. 외부로 나가기 전에 한 번 더 번호 패턴을 지운다.
 */
function scrub<T>(event: T): T {
  try {
    return JSON.parse(maskPiiText(JSON.stringify(event))) as T;
  } catch {
    return event; // 직렬화 불가(순환 참조 등)면 원본을 그대로 둔다
  }
}

/**
 * 이 단말이 어느 약국인지 표시.
 *
 * "○○약국에서 연동이 안 된다"는 문의가 왔을 때 Sentry 에서 바로 찾기 위함이다.
 * 사업자번호는 사업자 정보이지 개인정보가 아니다.
 */
export function setMerchantTag(businessNumber: string): void {
  if (!SENTRY_DSN || !businessNumber) return;
  Sentry.setTag("merchant", businessNumber);
}

/**
 * 연동이 끊긴 상태를 오류로 올린다.
 *
 * 연동 실패는 예외가 아니라 '아무 일도 안 일어나는' 상태라 가만히 두면 Sentry 에
 * 아무것도 남지 않는다. 그래서 실패를 감지한 쪽에서 직접 불러 올린다.
 * 직전 상태 기록은 breadcrumb 으로 자동으로 함께 붙는다.
 */
export function reportLinkFailure(message: string, detail?: unknown): void {
  if (!SENTRY_DSN) return;
  Sentry.captureMessage(message, {
    level: "error",
    extra: detail === undefined ? undefined : { detail: String(detail) },
  });
}

/** 진단 보내기 연타 방지 — 이 시간 안에 다시 누르면 무시한다. */
const DIAGNOSTIC_COOLDOWN_MS = 60_000;
let lastDiagnosticAt = 0;

/**
 * 최근 상황을 Sentry 로 한 번 올린다 (설정 화면 '진단 보내기').
 *
 * 약국에서 "안 된다"는 문의가 왔을 때 쓰는 수단이다.
 * 연동이 안 되는 상황은 대부분 오류가 아니라 '아무 일도 안 일어나는' 상태라
 * 자동으로는 아무것도 올라가지 않는다. 그래서 사람이 눌러 올린다.
 *
 * 보내는 것은 이 시점의 breadcrumb(최근 100건)과 매장 태그뿐이다.
 * 로그는 메모리에만 쌓이고 상한이 있어, 오래 켜뒀어도 양은 늘 같다.
 *
 * @returns 전송했으면 true. 수집이 꺼져 있거나 연타면 false.
 */
export function sendDiagnostic(): boolean {
  if (!SENTRY_DSN) return false;

  const now = Date.now();
  if (now - lastDiagnosticAt < DIAGNOSTIC_COOLDOWN_MS) return false;
  lastDiagnosticAt = now;

  // 설정 화면(settings.html)은 포인트 화면과 실행 환경이 달라 breadcrumb 이 비어 있다.
  // 두 화면이 함께 읽는 곳에 따로 보관해 둔 연동 기록을 실어 보낸다.
  const linkLog = readLinkLog();

  Sentry.captureMessage("진단 보내기 — 사용자가 요청한 상태 보고", {
    level: "info",
    extra: {
      "연동 기록": linkLog.length ? linkLog.join("\n") : "(기록 없음 — 플러그인이 재시작된 직후일 수 있습니다)",
      "기록 줄수": linkLog.length,
    },
  });
  return true;
}

export function initMonitoring(version: string): void {
  if (!SENTRY_DSN) {
    log.debug("[Sentry] DSN 미설정 — 로그 수집 비활성");
    return;
  }

  Sentry.init({
    dsn:     SENTRY_DSN,
    release: `${PLUGIN_ID}@${version}`,

    // ── 무엇을 올리는가 ────────────────────────────────
    //
    // 오류만 올린다. 평상시 로그는 올리지 않는다.
    //
    // 대신 오류가 발생하면 직전 기록이 breadcrumb 으로 함께 붙어 올라간다.
    // (console.warn/error, HTTP 호출, 화면 전환 등을 SDK 가 자동으로 모아둔다)
    // 그래서 "무엇이 터졌는지"와 "그 직전에 무슨 일이 있었는지"를 같이 볼 수 있다.
    //
    // consoleLoggingIntegration 은 일부러 넣지 않는다. 그걸 넣으면 평상시 로그가
    // 전부 독립 항목으로 쌓여, 정작 봐야 할 오류가 묻히고 한도만 소진된다.
    enableLogs: false,

    // 오류에 함께 붙일 직전 기록 개수. 메모리에만 들고 있고 앱을 끄면 사라진다.
    // 101번째가 생기면 가장 오래된 1건이 밀려나므로, 한 달을 켜두든 방금 켜든
    // 올라가는 양은 항상 이 개수다.
    //
    // 거래 1건에 6~10줄이라 100건이면 최근 거래 열 건 남짓이 담긴다.
    // 문의는 대개 "방금 안 됐다" 라서 이 범위면 충분하다.
    maxBreadcrumbs: 100,

    integrations: [
      // 화면 터치는 기록하지 않는다(dom: false).
      // 번호 입력이 키패드라 전화번호 한 번에 터치만 11건이 쌓이고,
      // 그러면 정작 봐야 할 연동 기록이 100건 밖으로 밀려난다.
      // 어느 버튼을 눌렀는지보다 전문이 오갔는지가 중요하다.
      Sentry.breadcrumbsIntegration({ dom: false }),
    ],

    beforeSend:       (event) => scrub(event),
    beforeBreadcrumb: (crumb) => scrub(crumb),
  });

  log.debug(`[Sentry] 로그 수집 시작 — release=${PLUGIN_ID}@${version}`);
}
