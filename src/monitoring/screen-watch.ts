/**
 * 화면 감시 — 단말기 결제 직후 토스 화면이 끼어드는 현상을 가리기 위한 기록.
 *
 * 단말기 결제(현금 · 카드)가 끝나면 단말기가 멀티패드용 표시 전문("=현금영수증승인= 정상승인
 * 감사합니다" 등)을 보내고, 플러그인은 이것을 결제모듈(sdk.van.write)로 넘긴다. 그 직후
 * 대기화면 → 토스 화면 → 대기화면 → 적립 화면 순으로 바뀌는 것이 관찰됐다.
 * 원인 후보가 둘이라, 어느 쪽인지 진단 기록으로 갈리게 남긴다.
 *   1) 토스 앱이 플러그인 웹뷰 위로 자기 화면을 띄웠다 닫는다 → '화면 가려짐 · 다시 보임'
 *   2) 결제모듈이 플러그인 웹뷰 안(#app 또는 body)에 화면을 그리는데 플러그인 화면(무대)이
 *      그 위를 덮는다 → '[결제모듈] 플러그인 화면 아래에 그림'
 *
 * 동작에는 손대지 않는다. 기록만 남긴다.
 */
import { log } from "../utils/log";
import { maskPiiText } from "../utils/pii-mask";

/** 플러그인이 body 에 직접 붙이는 요소. 이것들은 결제모듈이 그린 것이 아니다. */
const OWN_IDS = new Set([
  "app",
  "pp-stage",
  "pp-stage-cover",
  "pharm-barcode-display-container",
  "pharm-settings-container",
]);
const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);

/** 진단에 실을 짧은 설명 — 태그 · id · class · z-index · 보이는 문구. */
function describe(el: Element, withZ = true): string {
  const id  = el.id ? `#${el.id}` : "";
  const cls = typeof el.className === "string" && el.className.trim()
    ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
    : "";
  const z = (() => {
    try { return getComputedStyle(el).zIndex; } catch { return "?"; }
  })();
  return `${el.tagName.toLowerCase()}${id}${cls}` + (withZ ? ` (z-index ${z})` : "");
}

function textOf(el: Element | null): string {
  const t = (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "(문구 없음)";
  return maskPiiText(t.length > 80 ? `${t.slice(0, 80)}…` : t);
}

export function startScreenWatch(): void {
  if (typeof document === "undefined") return;

  // 1) 플러그인 화면이 가려지고 다시 보이는 순간
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      log.status("[팜포인트] 화면 가려짐 — 다른 화면이 위를 덮음");
    } else if (hiddenAt) {
      const sec = ((Date.now() - hiddenAt) / 1000).toFixed(1);
      hiddenAt = 0;
      log.status(`[팜포인트] 화면 다시 보임 (${sec}초 만에)`);
    }
  });

  // 2) 결제모듈이 플러그인 웹뷰 안에 그리는 것
  //    #app 은 플러그인이 비워 두는 자리다. 여기에 무엇이 생기면 플러그인 밖(결제모듈 · SDK)이 그린 것이다.
  const app = document.getElementById("app");
  if (app) {
    let pending: ReturnType<typeof setTimeout> | null = null;
    let wasFilled = app.childElementCount > 0;
    // 그리는 동안 변화가 연달아 오므로 잠깐 모아 한 줄로 남긴다.
    new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        const filled = app.childElementCount > 0 || !!app.textContent?.trim();
        if (filled) {
          log.status(`[결제모듈] 플러그인 화면 아래(#app)에 그림 — 문구: ${textOf(app)}`);
        } else if (wasFilled) {
          log.status("[결제모듈] #app 에 그린 화면을 내림");
        }
        wasFilled = filled;
      }, 300);
    }).observe(app, { childList: true, subtree: true, characterData: true });
  }

  //    body 에 직접 붙는 것도 본다(결제모듈이 #app 밖에 덮어 그릴 수 있다).
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (IGNORED_TAGS.has(n.tagName) || OWN_IDS.has(n.id)) return;
        log.status(`[결제모듈] 화면 요소 추가 — ${describe(n)} · 문구: ${textOf(n)}`);
      });
      r.removedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (IGNORED_TAGS.has(n.tagName) || OWN_IDS.has(n.id)) return;
        log.status(`[결제모듈] 화면 요소 제거 — ${describe(n, false)}`);
      });
    }
  }).observe(document.body, { childList: true });
}
