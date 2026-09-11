/**
 * 로그 출력 — 빌드에 따라 상세 로그를 끈다.
 *
 * 개발 중에는 전문 덤프·HTTP 본문까지 다 봐야 하지만, 검수·배포용 번들에서는
 * 그런 내부 기록이 단말기 로그 뷰어에 그대로 노출된다. 외부에서 플러그인을
 * 들여다볼 때 보여야 할 내용이 아니다.
 *
 *   log.debug / log.info  개발 빌드에서만 출력. 운영 빌드에서는 아무것도 안 한다.
 *   console.warn / error  항상 출력. 문제 상황은 어디서든 보여야 한다.
 *                         Sentry 는 이것들을 breadcrumb 으로 모아 오류에 붙인다.
 *
 * 경고·오류는 이 모듈을 거치지 않고 console 을 직접 쓴다 — 동작이 같고,
 * 파일마다 import 를 늘릴 이유가 없다.
 */

/** vite define. 개발 서버는 true, `npm run build` 는 false. */
const VERBOSE = __LOG_VERBOSE__;

function noop(): void { /* 운영 빌드에서는 출력하지 않는다 */ }

export const log = {
  /** 고빈도 기록 — 프레임 덤프, 신호 유지 알림, HTTP 요청 라인. */
  debug: VERBOSE ? console.debug.bind(console) : noop,
  /** 일반 진행 기록 — 기동, 연동 상태, 전문 송수신, HTTP 응답. */
  info:  VERBOSE ? console.log.bind(console)   : noop,
};
