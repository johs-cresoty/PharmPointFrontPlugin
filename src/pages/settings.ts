/**
 * Settings 뷰 — 환경설정 화면 (기존 settings.html 이식).
 *
 * UI 구성:
 *   - Toss SN                    (읽기 전용)
 *   - 최소 사용 포인트           → SDK renderSelectGridPage 프리셋 → "직접 입력" 시 renderInputPage
 *   - 화면 대기 시간             → SDK renderSelectGridPage 프리셋 (3·4·5·7·10초)
 *   - 대기 화면에 매장명 표시    (토글)
 *   - 시리얼 통신 속도           (select)
 *
 * 렌더 방식:
 *   - 자체 HTML container 만 사용, SDK 는 그리드/입력 페이지 진입 시에만 활용.
 *   - #app 은 hidden 처리 → 그리드/입력 페이지 진입 시 다시 표시.
 *   - 저장 성공 후 renderResultPage → onTimeout 으로 settings 재진입.
 */
import { getInactivityTimeoutSeconds, getMinPoint, getResultTimeoutSeconds, getShowStoreName, setInactivityTimeoutSeconds, setMinPoint, setResultTimeoutSeconds } from "../features/app-config/app-config.service";
import { showInactivityTimeoutSaved, showMinPointSaved, showTimeoutSaved } from "../features/result-page/result-page.service";
import { StorageKeys } from "../shared/constants/storage-keys";
import { navigate, onCleanup } from "../router";

const CONTAINER_ID = "pharm-settings-container";
const STYLE_ID     = "pharm-settings-style";

const MIN_POINT_PRESETS      = [0, 100, 500, 1000];
const RESULT_TIMEOUT_PRESETS = [3, 4, 5, 7, 10];
const INACTIVITY_TIMEOUT_PRESETS = [10, 15, 20, 25, 30];

function fmtPoint(n: number): string {
  return `${n.toLocaleString("ko-KR")}P`;
}

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
    #${CONTAINER_ID} .toggle { position:relative; width:52px; height:32px; }
    #${CONTAINER_ID} .toggle input { opacity:0; width:0; height:0; }
    #${CONTAINER_ID} .toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#ccc; transition:.3s; border-radius:32px; }
    #${CONTAINER_ID} .toggle-slider::before { content:""; position:absolute; height:26px; width:26px; left:3px; bottom:3px; background:#fff; transition:.3s; border-radius:50%; }
    #${CONTAINER_ID} .toggle input:checked + .toggle-slider { background:#0064ff; }
    #${CONTAINER_ID} .toggle input:checked + .toggle-slider::before { transform:translateX(20px); }
  `;
  document.head.appendChild(s);
}

function hideAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  document.body.classList.add("pharm-settings-active");
}

function showAppShell(): void {
  const app = document.getElementById("app");
  if (app) app.style.display = "";
}

function restoreBody(): void {
  document.body.classList.remove("pharm-settings-active");
  showAppShell();
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
    <div class="setting-row" id="s-min-point-row" style="cursor:pointer">
      <span class="setting-label">최소 사용 포인트</span>
      <span class="setting-value" id="s-min-point">-</span>
    </div>
    <div class="setting-row" id="s-timeout-row" style="cursor:pointer">
      <span class="setting-label">화면 대기 시간</span>
      <span class="setting-value" id="s-timeout">-</span>
    </div>
    <div class="setting-row" id="s-inactivity-row" style="cursor:pointer">
      <span class="setting-label">미동작 시 대기 시간</span>
      <span class="setting-value" id="s-inactivity">-</span>
    </div>
    <div class="setting-row">
      <span class="setting-label">대기 화면에 매장명 표시</span>
      <label class="toggle">
        <input type="checkbox" id="s-show-store" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="setting-row">
      <span class="setting-label">시리얼 통신 속도</span>
      <select id="s-baud">
        <option value="9600">9600</option>
        <option value="115200">115200</option>
        <option value="38400">38400</option>
      </select>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function hideContainer(): void {
  const el = document.getElementById(CONTAINER_ID);
  if (el) el.style.display = "none";
  showAppShell(); // SDK 그리드/입력 페이지 진입 시 #app 다시 보여줌
}

function removeContainer(): void {
  document.getElementById(CONTAINER_ID)?.remove();
}

// ─── 최소 사용 포인트 (그리드 선택) ─────────────

function buildMinPointOptions(current: number): Array<{ id: string; title: string; onClick: () => void }> {
  const presetSet = new Set(MIN_POINT_PRESETS);
  const values = [...MIN_POINT_PRESETS];
  if (Number.isFinite(current) && current >= 0 && !presetSet.has(current)) {
    values.push(current);
    values.sort((a, b) => a - b);
  }
  const opts: Array<{ id: string; title: string; onClick: () => void }> = values.map((v) => ({
    id:      String(v),
    title:   v === current ? `${fmtPoint(v)}\n(현재 설정)` : fmtPoint(v),
    onClick: () => { void applyMinPoint(v); },
  }));
  opts.push({ id: "custom", title: "직접 입력", onClick: () => openMinPointInput() });
  return opts;
}

async function applyMinPoint(n: number): Promise<void> {
  await setMinPoint(n);
  await showMinPointSaved({
    minPoint: n,
    onTimeout: () => { navigate("/settings"); },
  });
}

async function openMinPointGrid(): Promise<void> {
  hideContainer();
  const current = await getMinPoint();
  sdk.template.renderSelectGridPage({
    title:    "최소 사용 포인트",
    subtitle: "설정",
    options:  buildMinPointOptions(current),
    onBack:   () => { navigate("/settings"); },
    navbarButton: { label: "닫기", onClick: () => { navigate("/settings"); } },
  } as never);
}

function openMinPointInput(): void {
  hideContainer();
  sdk.template.renderInputPage({
    type: "number",
    top:  { title: "", subtitle: "" },
    input:  { placeholder: "최소 사용 포인트 입력" },
    button: { label: "저장" },
    disclaimer: "0P 입력 시 최소 사용 포인트 제한이 해제됩니다.",
    onSubmit: async (value: string | number) => {
      const n = Math.max(0, parseInt(String(value), 10) || 0);
      await applyMinPoint(n);
    },
    onBack: () => void openMinPointGrid(),
    navbarButton: { label: "뒤로", onClick: () => void openMinPointGrid() },
  } as never);
}

// ─── 화면 대기 시간 (그리드 선택) ──────────────

function buildTimeoutOptions(current: number): Array<{ id: string; title: string; onClick: () => void }> {
  return RESULT_TIMEOUT_PRESETS.map((v) => ({
    id:      String(v),
    title:   v === current ? `${v}초\n(현재 설정)` : `${v}초`,
    onClick: () => { void applyTimeout(v); },
  }));
}

async function applyTimeout(sec: number): Promise<void> {
  const saved = await setResultTimeoutSeconds(sec);
  await showTimeoutSaved({
    seconds: saved,
    onTimeout: () => { navigate("/settings"); },
  });
}

async function openResultTimeoutGrid(): Promise<void> {
  hideContainer();
  const current = await getResultTimeoutSeconds();
  sdk.template.renderSelectGridPage({
    title:    "화면 대기 시간",
    subtitle: "설정",
    options:  buildTimeoutOptions(current),
    onBack:   () => { navigate("/settings"); },
    navbarButton: { label: "닫기", onClick: () => { navigate("/settings"); } },
  } as never);
}

// ─── 미동작 시 대기 시간 (그리드 선택) ──────────

function buildInactivityOptions(current: number): Array<{ id: string; title: string; onClick: () => void }> {
  return INACTIVITY_TIMEOUT_PRESETS.map((v) => ({
    id:      String(v),
    title:   v === current ? `${v}초\n(현재 설정)` : `${v}초`,
    onClick: () => { void applyInactivityTimeout(v); },
  }));
}

async function applyInactivityTimeout(sec: number): Promise<void> {
  const saved = await setInactivityTimeoutSeconds(sec);
  await showInactivityTimeoutSaved({
    seconds: saved,
    onTimeout: () => { navigate("/settings"); },
  });
}

async function openInactivityTimeoutGrid(): Promise<void> {
  hideContainer();
  const current = await getInactivityTimeoutSeconds();
  sdk.template.renderSelectGridPage({
    title:    "미동작 시 대기 시간",
    subtitle: "설정",
    options:  buildInactivityOptions(current),
    onBack:   () => { navigate("/settings"); },
    navbarButton: { label: "닫기", onClick: () => { navigate("/settings"); } },
  } as never);
}

// ─── 진입점 ─────────────────────────────────

export async function renderSettings(): Promise<void> {
  ensureStyles();
  hideAppShell();
  mountContainer();

  onCleanup(() => {
    removeContainer();
    restoreBody();
  });

  // 초기값 로드
  try {
    const serialRaw = await sdk.app.getSerialNumber();
    const serial = typeof serialRaw === "string" ? serialRaw : (serialRaw?.serialNumber ?? serialRaw?.serial ?? "");
    document.getElementById("s-serial")!.textContent = String(serial || "알 수 없음");
  } catch { document.getElementById("s-serial")!.textContent = "알 수 없음"; }

  document.getElementById("s-min-point")!.textContent = fmtPoint(await getMinPoint());
  document.getElementById("s-timeout")!.textContent   = `${await getResultTimeoutSeconds()}초`;
  document.getElementById("s-inactivity")!.textContent = `${await getInactivityTimeoutSeconds()}초`;
  (document.getElementById("s-show-store") as HTMLInputElement).checked = await getShowStoreName();

  const baudItem = await sdk.storage.get({ key: StorageKeys.BAUD_RATE });
  if (baudItem.value) (document.getElementById("s-baud") as HTMLSelectElement).value = baudItem.value;

  // 클릭·변경 이벤트
  document.getElementById("s-min-point-row")!.addEventListener("click", () => void openMinPointGrid());
  document.getElementById("s-timeout-row")!.addEventListener("click", () => void openResultTimeoutGrid());
  document.getElementById("s-inactivity-row")!.addEventListener("click", () => void openInactivityTimeoutGrid());

  (document.getElementById("s-show-store") as HTMLInputElement).addEventListener("change", async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await sdk.storage.set({ key: StorageKeys.SHOW_STORE_NAME, value: String(checked) });
  });

  (document.getElementById("s-baud") as HTMLSelectElement).addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    await sdk.storage.set({ key: StorageKeys.BAUD_RATE, value });
  });
}
