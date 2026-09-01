/**
 * BarcodeDisplay 뷰 — 단말기(TRM) 005 요청으로 띄우는 바코드 표시 화면.
 *
 * 전문: STX + "XX" + Len(4) + "TRM" + "005" + FS + 종류(1) + FS + timeout(2)
 *       + FS + 문구(EUC-KR) + FS + 길이(2, BCD) + 바코드데이터
 *
 * 지원 종류:
 *   · 종류 "2" → 2차원(QR)
 *   · 종류 "1" → 1차원(EAN-13)
 *
 * 렌더 방식은 price-display.ts 와 동일 — #app 을 숨기고 자체 컨테이너를 body 에 붙인다.
 */
import qrcode from "qrcode-generator";
import { navigate, onCleanup } from "../router";
import { buildEan13Svg, encodeEan13, EAN13_DISPLAY_WIDTH } from "../features/barcode/ean13";
import type { BarcodeDisplayData } from "../pos/protocol/terminal-codec";

const STYLE_ID     = "pharm-barcode-display-style";
const CONTAINER_ID = "pharm-barcode-display-container";

/** 라우터 진입 시 읽을 스냅샷 키. */
export const BARCODE_DISPLAY_CTX_KEY = "pharm_barcode_display_ctx";

// QR 오류정정 레벨 — 화면 표시용 결제 QR 은 M 이 일반적(용량/복원력 균형).
const QR_EC_LEVEL = "M" as const;

// ─── 스타일 ─────────────────────────────

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  // price-display 와 동일하게 body(400×640) 기준. 실장비는 index.html 이 1280×800 로 스케일.
  s.textContent = `
    body.pharm-barcode-display-active { background:#fff; margin:0; }
    #${CONTAINER_ID} {
      width:100%; height:100%;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      background:#fff;
      font-family:"Toss Product Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color:#191f28;
      box-sizing:border-box;
      padding:24px;
      overflow:hidden;
    }
    #${CONTAINER_ID} .bc-text {
      font-size:24px; font-weight:500; line-height:1.4;
      text-align:center; color:#191f28;
      margin-bottom:24px;
      word-break:keep-all;
    }
    #${CONTAINER_ID} .bc-qr {
      width:300px; height:300px;
      display:block;
    }
    /* EAN-13 — 폭을 viewBox(113모듈)의 정수배로 고정해 1모듈=3px 로 떨어지게 한다.
       임의 폭이면 모듈 경계가 픽셀 사이에 걸려 막대 굵기가 들쭉날쭉해지고 스캔율이 떨어진다.
       (body 400px - 컨테이너 좌우 padding 48px = 352px 안에 들어옴) */
    #${CONTAINER_ID} .bc-1d {
      width:${EAN13_DISPLAY_WIDTH}px; height:auto;
      display:block;
    }
    #${CONTAINER_ID} .bc-countdown {
      margin-top:24px; font-size:15px; color:#8b95a1;
    }
    #${CONTAINER_ID} .bc-fallback {
      max-width:340px; padding:16px;
      border:1px solid #e5e8eb; border-radius:12px;
      background:#f9fafb;
      font-size:12px; line-height:1.5; color:#4e5968;
      word-break:break-all;
    }
    #${CONTAINER_ID} .bc-fallback .bc-fallback-title {
      display:block; margin-bottom:8px;
      font-size:14px; font-weight:500; color:#f04452;
    }
  `;
  document.head.appendChild(s);
}

function hideAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  document.body.classList.add("pharm-barcode-display-active");
}

function restoreAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "";
  document.body.classList.remove("pharm-barcode-display-active");
}

function mountContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (el) { el.style.display = ""; return el; }
  el = document.createElement("div");
  el.id = CONTAINER_ID;
  el.style.width  = "400px";
  el.style.height = "640px";
  document.body.appendChild(el);
  return el;
}

function removeContainer(): void {
  document.getElementById(CONTAINER_ID)?.remove();
}

// ─── QR 렌더 ─────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

/**
 * QR 모듈 배열 → 단일 path SVG.
 * 모듈마다 <rect> 를 만들면 버전 15 기준 수천 개 노드가 생기므로 path 하나로 합친다.
 */
function buildQrSvg(data: string): string | null {
  try {
    const qr = qrcode(0, QR_EC_LEVEL); // 0 = 버전 자동 선택
    qr.addData(data, "Byte");
    qr.make();

    const count  = qr.getModuleCount();
    const margin = 2;                  // quiet zone (모듈 단위)
    const size   = count + margin * 2;

    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
      }
    }

    console.log(`[BarcodeDisplay] QR 생성 — 모듈 ${count}x${count}, EC=${QR_EC_LEVEL}, 데이터 ${data.length}바이트`);

    return (
      `<svg class="bc-qr" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" ` +
      `shape-rendering="crispEdges" role="img" aria-label="결제 QR 코드">` +
      `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
      `<path d="${d}" fill="#000000"/>` +
      `</svg>`
    );
  } catch (e) {
    console.error("[BarcodeDisplay] QR 생성 실패", e);
    return null;
  }
}

function draw(el: HTMLElement, bc: BarcodeDisplayData): void {
  const parts: string[] = [];

  if (bc.text) parts.push(`<div class="bc-text">${escapeHtml(bc.text)}</div>`);

  if (bc.kind === "2D") {
    const svg = buildQrSvg(bc.data);
    parts.push(
      svg ??
      `<div class="bc-fallback"><span class="bc-fallback-title">QR 생성 실패</span>` +
      `${escapeHtml(bc.data)}</div>`,
    );
  } else {
    // 1차원 — EAN-13. 12자리면 체크digit 을 계산해 붙이고, 13자리면 검증만 한다.
    const ean = encodeEan13(bc.data);
    if (ean) {
      console.log(`[BarcodeDisplay] EAN-13 생성 — ${ean.digits} (95모듈)`);
      parts.push(buildEan13Svg(ean, "bc-1d"));
    } else {
      console.warn(`[BarcodeDisplay] EAN-13 인코딩 실패 — 데이터="${bc.data}"`);
      parts.push(
        `<div class="bc-fallback"><span class="bc-fallback-title">EAN-13 형식 오류</span>` +
        `${escapeHtml(bc.data)}</div>`,
      );
    }
  }

  // timeout 0 = 무한 대기 → 카운트다운 미표시
  if (bc.timeoutSec > 0) {
    parts.push(`<div class="bc-countdown"><span id="bc-remain">${bc.timeoutSec}</span>초 후 닫힘</div>`);
  }

  el.innerHTML = parts.join("");
}

// ─── 컨텍스트 저장/로드 ─────────────────────

function loadCtx(): BarcodeDisplayData | null {
  try {
    const raw = sessionStorage.getItem(BARCODE_DISPLAY_CTX_KEY);
    return raw ? (JSON.parse(raw) as BarcodeDisplayData) : null;
  } catch { return null; }
}

/** 005 수신 시 스냅샷 보관. main 의 onBarcodeDisplay 에서 호출. */
export function saveBarcode(bc: BarcodeDisplayData): void {
  try { sessionStorage.setItem(BARCODE_DISPLAY_CTX_KEY, JSON.stringify(bc)); }
  catch (e) { console.warn("[BarcodeDisplay] sessionStorage 저장 실패", e); }
}

export function clearBarcode(): void {
  try { sessionStorage.removeItem(BARCODE_DISPLAY_CTX_KEY); } catch { /* noop */ }
}

// ─── 진입점 ─────────────────────────────

export function renderBarcodeDisplay(): void {
  const bc = loadCtx();
  if (!bc || !bc.data) {
    console.warn("[BarcodeDisplay] 스냅샷 없음 — 대기화면 유지");
    clearBarcode();
    navigate("/");
    return;
  }

  ensureStyles();
  hideAppShell();
  const el = mountContainer();
  draw(el, bc);

  // timeout 초 후 자동 종료. 0 이면 무한 대기(자동 종료 없음).
  let timer:    ReturnType<typeof setTimeout>  | null = null;
  let countdown: ReturnType<typeof setInterval> | null = null;

  if (bc.timeoutSec > 0) {
    let remain = bc.timeoutSec;
    countdown = setInterval(() => {
      remain -= 1;
      const span = document.getElementById("bc-remain");
      if (span) span.textContent = String(Math.max(0, remain));
    }, 1000);
    timer = setTimeout(() => {
      console.log(`[BarcodeDisplay] timeout ${bc.timeoutSec}초 경과 — 대기화면 복귀`);
      clearBarcode();
      navigate("/");
    }, bc.timeoutSec * 1000);
  } else {
    console.log("[BarcodeDisplay] timeout=00 — 무한 대기 (자동 종료 없음)");
  }

  onCleanup(() => {
    if (timer) clearTimeout(timer);
    if (countdown) clearInterval(countdown);
    removeContainer();
    restoreAppShell();
  });
}
