/**
 * 연동 현재 상태.
 *
 * 로그는 "일어난 일"만 남는다. 거래가 없던 동안에는 아무 줄도 안 찍히므로,
 * 로그만 봐서는 지금 붙어 있는지 끊겨 있는지 알 수 없다.
 * 그래서 상태가 바뀔 때마다 현재 값을 따로 적어두고, 진단 보낼 때 함께 싣는다.
 *
 * 시각은 채널마다 따로 둔다. 하나로 묶어두면 "09:19:29 에 뭔가 바뀌었다" 까지만
 * 알 수 있어, 정작 알고 싶은 "어느 쪽이 언제부터 끊겼나" 에 답하지 못한다.
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

export type LinkChannel = "캣포스" | "결제단말기";

/** 한 채널의 상태와, 그 상태가 된 시각. */
export type LinkEntry = {
  phase: LinkPhase;
  /** 이 상태로 바뀐 시각(HH:MM:SS). 아직 한 번도 안 바뀌었으면 "-". */
  since: string;
};

export type LinkStatus = Record<LinkChannel, LinkEntry>;

const UNKNOWN: LinkEntry = { phase: "확인 전", since: "-" };

function emptyStatus(): LinkStatus {
  return { 캣포스: { ...UNKNOWN }, 결제단말기: { ...UNKNOWN } };
}

function now(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 저장된 값을 현재 형식으로 맞춘다.
 *
 * 예전 형식(채널이 문자열이고 시각이 하나였던 때)이 단말에 남아 있을 수 있다.
 * 그 값을 그대로 읽으면 화면에 이상한 것이 찍히므로 "확인 전" 로 되돌린다.
 * 다음 상태 변화 때 정상 형식으로 덮인다.
 */
function normalize(raw: unknown): LinkStatus {
  const base = emptyStatus();
  if (!raw || typeof raw !== "object") return base;

  for (const ch of ["캣포스", "결제단말기"] as const) {
    const v = (raw as Record<string, unknown>)[ch];
    if (v && typeof v === "object") {
      const e = v as Partial<LinkEntry>;
      if (typeof e.phase === "string") {
        base[ch] = { phase: e.phase as LinkPhase, since: typeof e.since === "string" ? e.since : "-" };
      }
    }
  }
  return base;
}

export function readLinkStatus(): LinkStatus {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyStatus();
  } catch {
    return emptyStatus();
  }
}

/**
 * 캣포스 / 결제단말기 중 한쪽의 상태를 갱신한다.
 *
 * 같은 상태가 다시 들어오면 시각을 건드리지 않는다. 캣포스는 전문 하나마다 새로
 * 접속하는데, 그때마다 시각을 새로 쓰면 "언제부터 붙어 있었나" 가 지워진다.
 * 시각이 뜻하는 것은 '마지막으로 확인한 때' 가 아니라 '이 상태가 된 때' 다.
 */
export function setLinkStatus(which: LinkChannel, phase: LinkPhase): void {
  try {
    const cur = readLinkStatus();
    if (cur[which].phase === phase) return; // 상태가 그대로면 시각을 보존한다
    const next: LinkStatus = { ...cur, [which]: { phase, since: now() } };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장이 막힌 환경이면 상태 보관만 포기한다. 동작에는 영향 없다. */
  }
}

/** 진단에 실을 한 줄 — "연결됨 (09:19:29부터)". */
export function formatLinkEntry(entry: LinkEntry): string {
  return entry.since === "-" ? entry.phase : `${entry.phase} (${entry.since}부터)`;
}
