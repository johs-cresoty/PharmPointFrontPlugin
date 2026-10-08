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

// ── 결제단말기 마지막 수신 ─────────────────────────
//
// "단말기에서 결제했는데 반응이 없다" 문의의 첫 질문은 '단말기가 보냈나, 팜포인트가 못 받았나' 다.
// 플러그인이 볼 수 있는 것은 토스 장비가 넘겨준 데이터뿐이라, 두 시각을 따로 적어둔다.
//   lastRxAt  : 무엇이든 받은 마지막 시각. 단말기는 결제할 때 결제모듈 전문을 보내므로
//               결제 시각 뒤에 이 값이 갱신돼 있으면 단말기 데이터가 플러그인까지 온 것이다.
//   lastTrmAt : 팜포인트 전문(001 · 003 등)을 받은 마지막 시각과 그 종류.
// 결제 시각과 비교하면 단말기 쪽인지 팜포인트 쪽인지가 갈린다.
//
// 결제 한 건에 수십 조각이 몰려 와서, 받을 때마다 저장하면 저장소를 쉴 새 없이 쓴다.
// 무엇이든 받은 시각은 5초에 한 번만 쓴다(판정에는 이 정도 오차면 충분하다).

const RX_KEY = "pharmpoint_terminal_rx";
const RX_WRITE_INTERVAL_MS = 5_000;

export type TerminalRx = {
  lastRxAt:     number | null;
  lastTrmAt:    number | null;
  lastTrmLabel: string | null;
};

const EMPTY_RX: TerminalRx = { lastRxAt: null, lastTrmAt: null, lastTrmLabel: null };

let lastRxWrite = 0;

export function readTerminalRx(): TerminalRx {
  try {
    const raw = localStorage.getItem(RX_KEY);
    if (!raw) return { ...EMPTY_RX };
    const v = JSON.parse(raw) as Partial<TerminalRx>;
    return {
      lastRxAt:     typeof v.lastRxAt  === "number" ? v.lastRxAt  : null,
      lastTrmAt:    typeof v.lastTrmAt === "number" ? v.lastTrmAt : null,
      lastTrmLabel: typeof v.lastTrmLabel === "string" ? v.lastTrmLabel : null,
    };
  } catch {
    return { ...EMPTY_RX };
  }
}

function writeTerminalRx(next: TerminalRx): void {
  try { localStorage.setItem(RX_KEY, JSON.stringify(next)); }
  catch { /* 저장이 막힌 환경이면 보관만 포기한다. 동작에는 영향 없다. */ }
}

/** 시리얼로 무엇이든 받았을 때. */
export function noteTerminalRx(): void {
  const now = Date.now();
  if (now - lastRxWrite < RX_WRITE_INTERVAL_MS) return;
  lastRxWrite = now;
  writeTerminalRx({ ...readTerminalRx(), lastRxAt: now });
}

/** 팜포인트 전문을 받았을 때. label 은 "포인트 적립 요청(001)" 처럼 사람이 읽는 이름. */
export function noteTerminalFrame(label: string): void {
  const now = Date.now();
  lastRxWrite = now;
  writeTerminalRx({ lastRxAt: now, lastTrmAt: now, lastTrmLabel: label });
}

/** 진단에 실을 시각 — "10/08 10:37:17 (3분 12초 전)". 날짜가 바뀌어도 헷갈리지 않게 월/일을 붙인다. */
export function formatAgo(at: number | null, now = Date.now()): string {
  if (at === null) return "(받은 적 없음)";
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const sec = Math.max(0, Math.round((now - at) / 1000));
  const ago =
    sec < 60    ? `${sec}초 전` :
    sec < 3600  ? `${Math.floor(sec / 60)}분 ${sec % 60}초 전` :
    sec < 86400 ? `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분 전` :
                  `${Math.floor(sec / 86400)}일 전`;
  return `${stamp} (${ago})`;
}
