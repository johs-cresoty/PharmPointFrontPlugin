/**
 * 로그 출력 — 빌드에 따라 상세 로그를 끈다.
 *
 * 개발 중에는 전문 덤프·HTTP 본문까지 다 봐야 하지만, 검수·배포용 번들에서는
 * 그런 내부 기록이 단말기 로그 뷰어에 그대로 노출된다. 외부에서 플러그인을
 * 들여다볼 때 보여야 할 내용이 아니다.
 *
 *   log.debug / log.info  개발 빌드에서만 출력. 운영 빌드에서는 아무것도 안 한다.
 *   log.status            항상 출력 + 진단용으로 보관.
 *   console.warn / error  항상 출력. 문제 상황은 어디서든 보여야 한다.
 *
 * 경고·오류는 이 모듈을 거치지 않고 console 을 직접 쓴다 — 동작이 같고,
 * 파일마다 import 를 늘릴 이유가 없다.
 */

/** vite define. 개발 서버는 true, `npm run build` 는 false. */
const VERBOSE = __LOG_VERBOSE__;

function noop(): void { /* 운영 빌드에서는 출력하지 않는다 */ }

// ── 연동 기록 보관 ────────────────────────────────
//
// 설정 화면은 settings.html 이라는 별도 페이지로 뜬다. 포인트 화면이 돌던 것과
// 실행 환경이 달라 메모리를 공유하지 않는다. 그래서 설정 화면에서 '진단 보내기'를
// 눌러도 정작 필요한 연동 기록이 담기지 않는다.
//
// 두 화면이 함께 읽을 수 있는 곳에 남겨야 해서 localStorage 를 쓴다.
// 담기는 것은 log.status 로 남긴 연동 상태 줄뿐이다 — 개인정보는 들어가지 않는다.

const LINK_LOG_KEY = "pharmpoint_link_log";

/** 보관 줄 수. 거래 1건에 6~10줄이라 최근 거래 열 건 남짓 담긴다. */
const LINK_LOG_MAX = 100;

function hhmmss(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 같은 줄이 연달아 쌓일 때 뒤에 붙이는 반복 표시. */
const REPEAT_MARK = /  \(×(\d+)\)$/;

function recordLinkLog(line: string): void {
  try {
    const prev = localStorage.getItem(LINK_LOG_KEY);
    const rows: string[] = prev ? JSON.parse(prev) : [];

    // 같은 줄이 연달아 나오면 새로 쌓지 않고 횟수만 올린다.
    // 장바구니 갱신처럼 연속으로 반복되는 요청이 기록을 덮는 것을 막는다.
    const last = rows[rows.length - 1];
    if (last) {
      const body = last.slice(9).replace(REPEAT_MARK, ""); // 앞 9자는 "HH:MM:SS "
      if (body === line) {
        const n = Number(REPEAT_MARK.exec(last)?.[1] ?? 1) + 1;
        rows[rows.length - 1] = `${hhmmss(new Date())} ${line}  (×${n})`;
        localStorage.setItem(LINK_LOG_KEY, JSON.stringify(rows));
        return;
      }
    }

    rows.push(`${hhmmss(new Date())} ${line}`);
    // 오래된 것부터 버린다. 오래 켜둬도 양이 늘지 않는다.
    if (rows.length > LINK_LOG_MAX) rows.splice(0, rows.length - LINK_LOG_MAX);
    localStorage.setItem(LINK_LOG_KEY, JSON.stringify(rows));
  } catch {
    /* 저장이 막힌 환경이면 보관만 포기한다. 출력은 그대로 된다. */
  }
}

/** 보관된 연동 기록. 진단 보내기가 Sentry 에 함께 싣는다. */
export function readLinkLog(): string[] {
  try {
    const raw = localStorage.getItem(LINK_LOG_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

export const log = {
  /** 고빈도 기록 — 프레임 덤프, 신호 유지 알림, HTTP 요청 라인. */
  debug: VERBOSE ? console.debug.bind(console) : noop,
  /** 일반 진행 기록 — 전문 송수신, HTTP 응답, 화면 전환. */
  info:  VERBOSE ? console.log.bind(console)   : noop,
  /**
   * 연동 상태 — 운영 빌드에서도 남기고, 진단용으로 보관한다.
   *
   * 기동·캣포스 접속·결제단말기 연결처럼 "붙었는가"만 알리는 몇 줄이다.
   * 내부 구현이 드러나지 않고, 현장에서 연동이 안 될 때 이것마저 없으면
   * 원인을 짚을 방법이 없다. 상태가 바뀌는 순간에만 찍혀 양도 적다.
   */
  status(line: string): void {
    console.log(line);
    recordLinkLog(line);
  },
};
