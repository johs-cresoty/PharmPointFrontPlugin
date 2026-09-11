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

/** Sentry 프로젝트 DSN. 비워두면 수집하지 않는다. */
const SENTRY_DSN = "";

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

export function initMonitoring(version: string): void {
  if (!SENTRY_DSN) {
    console.log("[Sentry] DSN 미설정 — 로그 수집 비활성");
    return;
  }

  Sentry.init({
    dsn:        SENTRY_DSN,
    release:    `${PLUGIN_ID}@${version}`,
    enableLogs: true,
    beforeSend:     (event) => scrub(event),
    beforeSendLog:  (log)   => scrub(log),
  });

  console.log(`[Sentry] 로그 수집 시작 — release=${PLUGIN_ID}@${version}`);
}
