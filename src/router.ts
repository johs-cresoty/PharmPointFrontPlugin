/**
 * Router — hashchange 기반 SPA 라우터.
 *
 * multi-page 구조에서는 페이지 이동마다 웹소켓 서버가 재시작되던 문제를 해결하기 위해
 * 하나의 index.html 안에서 URL hash 만 변경하여 뷰 함수를 스위치.
 *
 * 사용:
 *   Router.register({ path: "/",              render: renderHome });
 *   Router.register({ path: "/point-earn",    render: renderPointEarnFlow });
 *   Router.register({ path: "/point-use",     render: renderPointUseFlow });
 *   ...
 *   Router.start();                                    // hashchange 리스너 등록 + 초기 진입
 *   Router.navigate("/point-earn", { source: "CAT" }); // 페이지 이동 + params 전달
 *
 * 라우팅 URL 형태: index.html#/path?key=value&...
 * - 웹뷰의 뒤로가기(back) 는 hash 변경 스택을 자연스럽게 처리 (pushState 대비 안정적).
 */

export type RouteParams = Record<string, string>;

export type Route = {
  path:   string;
  render: (params: RouteParams) => void | Promise<void>;
};

const routes: Route[] = [];
let currentPath: string | null = null;
let currentCleanup: (() => void) | null = null;

/**
 * 뷰 등록. path 는 "/" 로 시작하는 절대 경로 (hash 뒤 부분).
 */
export function register(route: Route): void {
  routes.push(route);
}

/**
 * navigate: hash 만 변경. hashchange 이벤트가 실제 렌더를 트리거함.
 * params 는 URLSearchParams 문자열로 직렬화되어 hash 뒤에 붙는다.
 */
export function navigate(path: string, params: RouteParams = {}): void {
  const search = new URLSearchParams(params).toString();
  const hash = search ? `#${path}?${search}` : `#${path}`;
  if (location.hash === hash) {
    // 같은 hash 로 재요청 시에도 렌더 (hashchange 미발생) — 명시적 재실행.
    handleRoute();
    return;
  }
  location.hash = hash;
}

/**
 * 시작 — window 에 hashchange 리스너 등록 + 초기 진입.
 * App 부트스트랩 (main.ts) 에서 1회 호출.
 */
export function start(): void {
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

function parseHash(): { path: string; params: RouteParams } {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return { path: "/", params: {} };
  const qIdx = raw.indexOf("?");
  const path = qIdx < 0 ? raw : raw.slice(0, qIdx);
  const search = qIdx < 0 ? "" : raw.slice(qIdx + 1);
  const params: RouteParams = {};
  new URLSearchParams(search).forEach((v, k) => { params[k] = v; });
  return { path: path || "/", params };
}

async function handleRoute(): Promise<void> {
  const { path, params } = parseHash();

  // 뷰 전환 전 이전 뷰의 cleanup 실행 (이벤트 리스너 해제 등)
  if (currentCleanup) {
    try { currentCleanup(); } catch (e) { console.warn("[Router] cleanup 실패", e); }
    currentCleanup = null;
  }

  const route = routes.find((r) => r.path === path) ?? routes[0];
  if (!route) {
    console.warn("[Router] 등록된 라우트 없음. path=" + path);
    return;
  }

  currentPath = path;
  try {
    const result = route.render(params);
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
  } catch (e) {
    console.error("[Router] render 실패", e);
  }
}

/**
 * 뷰가 다음 라우트 전환 전 자체 정리 로직 등록 (선택).
 * 뷰 함수 안에서:
 *   Router.onCleanup(() => { unsubscribeXxx(); });
 */
export function onCleanup(fn: () => void): void {
  currentCleanup = fn;
}

/** 현재 활성 경로 (진단·디버그용). */
export function getCurrentPath(): string | null {
  return currentPath;
}
