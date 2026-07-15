/**
 * Settings 뷰 — 환경설정 화면.
 *
 * 최소 사용 포인트 / 결과 대기 시간 / 매장명 표시 / baudRate 등 조절.
 * SDK renderSelectGridPage 등 세부 UI 는 다음 세션에서 이식.
 * 지금은 최소 스캐폴딩 (기존 로직 유지, 자체 HTML UI).
 */
import { getMinPoint, getResultTimeoutSeconds, getShowStoreName, setMinPoint, setResultTimeoutSeconds } from "../features/app-config/app-config.service";
import { StorageKeys } from "../shared/constants/storage-keys";
import { navigate, onCleanup } from "../router";

function fmtPoint(n: number): string {
  return `${n.toLocaleString("ko-KR")}P`;
}

export async function renderSettings(): Promise<void> {
  const container = document.createElement("div");
  container.id = "settings-container";
  container.style.cssText = "padding:20px;background:#f5f5f5;min-height:100vh;font-family:system-ui;";
  container.innerHTML = `
    <div style="margin-bottom:16px">
      <button id="settings-back" style="background:none;border:0;font-size:24px;color:#4e5968;cursor:pointer">← 돌아가기</button>
      <h2 style="margin:8px 0">플러그인 설정</h2>
    </div>
    <div style="background:#fff;padding:16px;border-radius:12px;margin-bottom:12px;display:flex;justify-content:space-between">
      <span>Toss SN</span><span id="s-serial">-</span>
    </div>
    <div id="s-min-point-row" style="background:#fff;padding:16px;border-radius:12px;margin-bottom:12px;display:flex;justify-content:space-between;cursor:pointer">
      <span>최소 사용 포인트</span><span id="s-min-point">-</span>
    </div>
    <div id="s-timeout-row" style="background:#fff;padding:16px;border-radius:12px;margin-bottom:12px;display:flex;justify-content:space-between;cursor:pointer">
      <span>화면 대기 시간</span><span id="s-timeout">-</span>
    </div>
    <div style="background:#fff;padding:16px;border-radius:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <span>대기 화면에 매장명 표시</span>
      <input type="checkbox" id="s-show-store" />
    </div>
    <div style="background:#fff;padding:16px;border-radius:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <span>시리얼 통신 속도</span>
      <select id="s-baud" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px">
        <option value="9600">9600</option>
        <option value="115200">115200</option>
        <option value="38400">38400</option>
      </select>
    </div>
  `;
  document.body.appendChild(container);
  document.getElementById("app")!.style.display = "none";

  const cleanup = (): void => {
    container.remove();
    const app = document.getElementById("app");
    if (app) app.style.display = "";
  };
  onCleanup(cleanup);

  // 뒤로가기
  document.getElementById("settings-back")!.addEventListener("click", () => { navigate("/"); });

  // 초기값 로드
  try {
    const serialRaw = await sdk.app.getSerialNumber();
    const serial = typeof serialRaw === "string" ? serialRaw : (serialRaw?.serialNumber ?? serialRaw?.serial ?? "");
    document.getElementById("s-serial")!.textContent = String(serial || "알 수 없음");
  } catch { document.getElementById("s-serial")!.textContent = "알 수 없음"; }

  document.getElementById("s-min-point")!.textContent = fmtPoint(await getMinPoint());
  document.getElementById("s-timeout")!.textContent   = `${await getResultTimeoutSeconds()}초`;
  const showStore = await getShowStoreName();
  (document.getElementById("s-show-store") as HTMLInputElement).checked = showStore;

  const baudItem = await sdk.storage.get({ key: StorageKeys.BAUD_RATE });
  if (baudItem.value) (document.getElementById("s-baud") as HTMLSelectElement).value = baudItem.value;

  // 이벤트 핸들러
  document.getElementById("s-min-point-row")!.addEventListener("click", async () => {
    const input = prompt("최소 사용 포인트 (원)", String(await getMinPoint()));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (!Number.isFinite(n) || n < 0) return;
    await setMinPoint(n);
    document.getElementById("s-min-point")!.textContent = fmtPoint(n);
  });

  document.getElementById("s-timeout-row")!.addEventListener("click", async () => {
    const input = prompt("결과 화면 대기 시간 (초, 3~10)", String(await getResultTimeoutSeconds()));
    if (input === null) return;
    const sec = await setResultTimeoutSeconds(parseInt(input, 10));
    document.getElementById("s-timeout")!.textContent = `${sec}초`;
  });

  (document.getElementById("s-show-store") as HTMLInputElement).addEventListener("change", async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await sdk.storage.set({ key: StorageKeys.SHOW_STORE_NAME, value: String(checked) });
  });

  (document.getElementById("s-baud") as HTMLSelectElement).addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    await sdk.storage.set({ key: StorageKeys.BAUD_RATE, value });
  });
}
