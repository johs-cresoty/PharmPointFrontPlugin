/**
 * 토스 관리자 '플러그인 설정'(settings.html) 화면 — 단말 · 연동 관리용.
 *
 * 포인트 · 테마 · 화면 대기 설정은 고객 화면 안의 환경설정(매장명 길게 누르기 → 관리자 비밀번호,
 * Figma 09-x, pages/settings.tsx)으로 옮겼다. 여기에는 그곳에 없는 관리 항목만 남긴다.
 *   - Toss SN            (읽기 전용)
 *   - 시리얼 통신 속도   (select)
 *   - 진단 보내기        (최근 연동 기록을 Sentry 로)
 *
 * 렌더 방식 (예전 그대로):
 *   - 자체 HTML container 만 쓰고 #app 은 숨긴다.
 */
import { StorageKeys } from "../shared/constants/storage-keys";
import { onCleanup } from "../router";
import { sendDiagnostic } from "../monitoring/sentry";

const CONTAINER_ID = "pharm-settings-container";
const STYLE_ID     = "pharm-settings-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    body.pharm-settings-active { background:#f5f5f5; }
    #${CONTAINER_ID} { max-width:480px; margin:0 auto; padding:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    #${CONTAINER_ID} .settings-title { font-size:24px; font-weight:600; margin:0 0 24px; color:#1a1a1a; }
    #${CONTAINER_ID} .setting-row { display:flex; justify-content:space-between; align-items:center; background:#fff; padding:16px; border-radius:12px; margin-bottom:12px; }
    #${CONTAINER_ID} .setting-label { font-size:15px; color:#333; }
    #${CONTAINER_ID} .setting-value { font-size:15px; color:#666; }
    #${CONTAINER_ID} select { padding:8px 12px; border:1px solid #ddd; border-radius:8px; font-size:14px; background:#fff; cursor:pointer; }
  `;
  document.head.appendChild(s);
}

function hideAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  document.body.classList.add("pharm-settings-active");
}

function restoreBody(): void {
  document.body.classList.remove("pharm-settings-active");
  const app = document.getElementById("app");
  if (app) app.style.display = "";
}

function mountContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (el) { el.style.display = ""; return el; }
  el = document.createElement("div");
  el.id = CONTAINER_ID;
  el.innerHTML = `
    <h1 class="settings-title">플러그인 설정</h1>
    <div class="setting-row">
      <span class="setting-label">Toss SN</span>
      <span class="setting-value" id="s-serial">-</span>
    </div>
    <div class="setting-row">
      <span class="setting-label">시리얼 통신 속도</span>
      <select id="s-baud">
        <option value="9600">9600</option>
        <option value="115200">115200</option>
        <option value="38400">38400</option>
      </select>
    </div>
    <div class="setting-row" id="s-diag-row">
      <span class="setting-label">진단 보내기</span>
      <span class="setting-value" id="s-diag">눌러서 전송</span>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

export async function renderPluginSettingsPage(): Promise<void> {
  ensureStyles();
  hideAppShell();
  mountContainer();

  onCleanup(() => {
    document.getElementById(CONTAINER_ID)?.remove();
    restoreBody();
  });

  // 초기값 로드
  try {
    const serialRaw = await sdk.app.getSerialNumber();
    const serial = typeof serialRaw === "string" ? serialRaw : (serialRaw?.serialNumber ?? serialRaw?.serial ?? "");
    document.getElementById("s-serial")!.textContent = String(serial || "알 수 없음");
  } catch { document.getElementById("s-serial")!.textContent = "알 수 없음"; }

  const baudItem = await sdk.storage.get({ key: StorageKeys.BAUD_RATE });
  if (baudItem.value) (document.getElementById("s-baud") as HTMLSelectElement).value = baudItem.value;

  (document.getElementById("s-baud") as HTMLSelectElement).addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    await sdk.storage.set({ key: StorageKeys.BAUD_RATE, value });
  });

  // 진단 보내기 — 약국에서 "안 된다"는 문의가 왔을 때 쓴다.
  // 연동이 안 되는 상황은 대부분 오류가 아니라 아무 일도 안 일어나는 상태라
  // 자동으로는 아무것도 올라가지 않는다. 눌러서 현재 상황을 보낸다.
  document.getElementById("s-diag-row")!.addEventListener("click", () => {
    const label = document.getElementById("s-diag")!;
    if (sendDiagnostic()) {
      label.textContent = "보냈습니다";
      sdk.template.openToast({ message: "진단 정보를 보냈습니다.", icon: "success" });
    } else {
      // 연타했거나 수집이 꺼져 있는 경우. 어느 쪽이든 사용자가 할 일은 같다.
      label.textContent = "잠시 후 다시";
      sdk.template.openToast({ message: "잠시 후 다시 눌러주세요.", icon: "error" });
    }
    setTimeout(() => { label.textContent = "눌러서 전송"; }, 3000);
  });
}
