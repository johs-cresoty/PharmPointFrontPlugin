/**
 * EAN-13 인코더 — 단말기 005 전문의 1차원 바코드(종류 "1") 렌더용.
 *
 * 구조 (총 95 모듈):
 *   시작가드(101) + 좌측 6자리(42) + 중앙가드(01010) + 우측 6자리(42) + 종료가드(101)
 *
 *   · 첫 번째 자리는 막대로 그리지 않는다. 좌측 6자리(2~7번째)를 L/G 중 무엇으로
 *     인코딩할지 결정하는 "패리티 패턴" 으로만 쓰이고, 사람이 읽는 숫자로만 표기된다.
 *   · 우측 6자리(8~13번째)는 전부 R 패턴.
 *
 * 체크digit: 1번째부터 12번째까지 1,3,1,3… 가중합 → (10 - 합%10) % 10
 */

// L (홀수 패리티) — 좌측 그룹
const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

// G (짝수 패리티) — 좌측 그룹. R 패턴을 뒤집은 값.
const G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];

// R — 우측 그룹. L 의 보수.
const R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

// 첫 자리 → 좌측 6자리의 L/G 배치
const PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

const GUARD_START  = "101";
const GUARD_CENTER = "01010";
const GUARD_END    = "101";

export type Ean13Result = {
  /** 체크digit 까지 포함한 13자리 */
  digits: string;
  /** 95자리 "0"/"1" 모듈 문자열 */
  modules: string;
};

/** 1~12번째 자리로 체크digit 계산. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * 바코드 데이터 → EAN-13 모듈 문자열.
 *
 * 12자리를 받으면 체크digit 을 계산해 붙이고, 13자리를 받으면 체크digit 을 검증한다.
 * (검증 실패해도 렌더는 진행하되 경고를 남긴다 — 단말기가 보낸 값을 임의로 고치지 않는다.)
 * 형식이 아예 안 맞으면 null.
 */
export function encodeEan13(raw: string): Ean13Result | null {
  const src = raw.trim();

  if (!/^\d+$/.test(src)) {
    console.warn(`[EAN13] 숫자가 아닌 문자 포함 — 길이=${src.length}`);
    return null;
  }
  if (src.length !== 12 && src.length !== 13) {
    console.warn(`[EAN13] 자릿수 불일치 — ${src.length}자리 (12 또는 13 이어야 함)`);
    return null;
  }

  let digits: string;
  if (src.length === 12) {
    digits = src + String(ean13CheckDigit(src));
    console.log(`[EAN13] 12자리 수신 — 체크digit ${digits[12]} 계산해 부착`);
  } else {
    const expected = ean13CheckDigit(src.slice(0, 12));
    const actual   = src.charCodeAt(12) - 48;
    if (expected !== actual) {
      console.warn(`[EAN13] 체크digit 불일치 — 수신 ${actual}, 계산 ${expected}. 수신값 그대로 렌더`);
    }
    digits = src;
  }

  const first  = digits.charCodeAt(0) - 48;
  const parity = PARITY[first];

  let modules = GUARD_START;
  for (let i = 0; i < 6; i++) {
    const d = digits.charCodeAt(i + 1) - 48;
    modules += parity[i] === "L" ? L[d] : G[d];
  }
  modules += GUARD_CENTER;
  for (let i = 0; i < 6; i++) {
    modules += R[digits.charCodeAt(i + 7) - 48];
  }
  modules += GUARD_END;

  return { digits, modules };
}

// ─── SVG 렌더 ───────────────────────────────
//
// 좌표계 1 단위 = 1 모듈. 화면에서는 CSS 로 (모듈수 × 정수배) px 를 주어
// 모듈 경계가 픽셀 경계에 딱 맞게 한다 — 막대 굵기가 들쭉날쭉해지면 스캔율이 떨어진다.
//
// 가로 배치 (좌측 여백 11 + 본체 95 + 우측 여백 7 = 113 모듈, EAN-13 규격 최소 여백):
//   [ 좌여백11 ][ 시작가드3 ][ 좌그룹42 ][ 중앙가드5 ][ 우그룹42 ][ 종료가드3 ][ 우여백7 ]
//        0~10      11~13       14~55       56~60       61~102     103~105    106~112

const PAD_LEFT    = 11; // 좌측 quiet zone (규격 최소 11 모듈)
const PAD_RIGHT   = 7;  // 우측 quiet zone (규격 최소 7 모듈)
const BAR_H       = 48; // 일반 막대 높이
const GUARD_EXTRA = 6;  // 가드 막대가 아래로 더 내려오는 길이 (이 구간에 숫자가 들어감)
const DIGIT_SIZE  = 8;  // 숫자 폰트 크기. monospace 기준 자폭 ≈ 4.8 < 7 모듈이라 겹치지 않음
const BOTTOM_PAD  = 1;

const MODULE_W    = 95;
const GUARD_BOTTOM = BAR_H + GUARD_EXTRA;
const SVG_W        = PAD_LEFT + MODULE_W + PAD_RIGHT; // 113
const SVG_H        = GUARD_BOTTOM + BOTTOM_PAD;       // 55

/** 화면 표시 폭 — SVG_W 의 정수배여야 모듈이 픽셀에 정확히 떨어진다. */
export const EAN13_DISPLAY_WIDTH = SVG_W * 3; // 339px (1 모듈 = 3px)

/** 가드 위치(모듈 인덱스) — 이 구간의 막대는 아래로 더 길게 그린다. */
function isGuardModule(i: number): boolean {
  return (i >= 0 && i < 3)        // 시작
      || (i >= 45 && i < 50)      // 중앙
      || (i >= 92 && i < 95);     // 종료
}

/**
 * EAN-13 모듈 문자열 → SVG. 사람이 읽는 숫자까지 함께 그린다.
 *
 * 숫자는 6자리를 한 덩어리로 그리지 않고 **각 자리를 자기 7모듈 그룹 중앙에** 개별 배치한다.
 * (덩어리 + letter-spacing 방식은 글자 폭이 그룹 폭 42 모듈을 넘겨 좌우 그룹이 겹쳤다.)
 */
export function buildEan13Svg(res: Ean13Result, className = ""): string {
  const { digits, modules } = res;

  let bars = "";
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== "1") continue;
    const h = isGuardModule(i) ? GUARD_BOTTOM : BAR_H;
    bars += `M${i + PAD_LEFT} 0h1v${h}h-1z`;
  }

  // 숫자 — 베이스라인을 가드 하단에 맞춰 가드 연장 구간 안에 들어오게 한다.
  const ty = GUARD_BOTTOM;
  const at = (x: number, ch: string, anchor: string) =>
    `<text x="${x}" y="${ty}" text-anchor="${anchor}" font-size="${DIGIT_SIZE}">${ch}</text>`;

  // 1) 첫 자리 — 좌측 여백에 우측 정렬 (시작가드 왼쪽)
  let text = at(PAD_LEFT - 1.5, digits[0], "end");
  // 2) 좌측 6자리 — 각 7모듈 그룹 중앙 (본체 모듈 3 부터 시작)
  for (let j = 0; j < 6; j++) {
    text += at(PAD_LEFT + 3 + j * 7 + 3.5, digits[1 + j], "middle");
  }
  // 3) 우측 6자리 — 중앙가드 뒤(본체 모듈 50 부터)
  for (let j = 0; j < 6; j++) {
    text += at(PAD_LEFT + 50 + j * 7 + 3.5, digits[7 + j], "middle");
  }

  return (
    `<svg class="${className}" viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" ` +
    `shape-rendering="crispEdges" role="img" aria-label="바코드 ${digits}">` +
    `<rect width="${SVG_W}" height="${SVG_H}" fill="#ffffff"/>` +
    `<path d="${bars}" fill="#000000"/>` +
    `<g fill="#000000" font-family="monospace" shape-rendering="auto">${text}</g>` +
    `</svg>`
  );
}
