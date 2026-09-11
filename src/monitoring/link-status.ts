/**
 * 연동 현재 상태.
 *
 * 로그는 "일어난 일"만 남는다. 거래가 없던 동안에는 아무 줄도 안 찍히므로,
 * 로그만 봐서는 지금 붙어 있는지 끊겨 있는지 알 수 없다.
 * 그래서 상태가 바뀔 때마다 현재 값을 따로 적어두고, 진단 보낼 때 함께 싣는다.
 *
 * 설정 화면은 별도 페이지라 메모리를 공유하지 않는다. 두 화면이 같이 읽어야 해서
 * localStorage 에 둔다. 담기는 것은 연결 여부뿐이라 개인정보가 들어가지 않는다.
 */

const KEY = "pharmpoint_link_status";

/**
 * 사람이 읽을 상태 문구. 값 자체가 그대로 진단에 실린다.
 *
 * "화면 이탈" 은 설정 화면으로 옮겨가거나 결제 앱이 위를 덮어 이 웹뷰가
 * 뒤로 물러난 상태다. 고장이 아니므로 장애로 보고하지 않는다.
 */
export type LinkPhase = "확인 전" | "연결 대기 중" | "연결됨" | "연결 끊김" | "준비 실패" | "화면 이탈";

type Stored = {
  캣포스:    LinkPhase;
  결제단말기: LinkPhase;
  갱신시각:   string;
};

const EMPTY: Stored = { 캣포스: "확인 전", 결제단말기: "확인 전", 갱신시각: "-" };

function now(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function readLinkStatus(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) as Stored } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** 캣포스 / 결제단말기 중 한쪽의 상태를 갱신한다. */
export function setLinkStatus(which: "캣포스" | "결제단말기", phase: LinkPhase): void {
  try {
    const next = { ...readLinkStatus(), [which]: phase, 갱신시각: now() };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장이 막힌 환경이면 상태 보관만 포기한다. 동작에는 영향 없다. */
  }
}
