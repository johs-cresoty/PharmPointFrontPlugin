/**
 * PluginBootstrap — 각 페이지 공통 초기화.
 *
 * 배경: Toss 플러그인은 SPA 가 아니라 multi-page 구조 (home / point-earn-flow / point-use-flow ...).
 *       페이지 전환 = 브라우저 완전 새로고침 → 이전 페이지가 소유하던 웹소켓 서버 handle 소실.
 *       각 페이지가 로드 시 이 모듈을 통해 웹소켓 서버를 재시작해야 캣포스 연결이 유지된다.
 *
 * 책임:
 *   - ApiConfig 초기화 (SDK 값 로드)
 *   - AppSession 시작 (SocketGateway.start 포함)
 *   - 페이지가 handler 를 오버라이드하지 않은 이벤트는 기본 동작 (홈 복귀) 적용
 *
 * 사용:
 *   (async () => {
 *     await PluginBootstrap.init({
 *       onNavigateToSavePoint:  (args) => { ... },     // 오버라이드
 *       // 그 외 이벤트는 default (홈 복귀) 유지
 *     });
 *   })();
 *
 * 의존: ApiConfig, AppSession
 */
window.PluginBootstrap = (function () {

  const HOME_URL = './home.html';
  const returnHome = () => { location.href = HOME_URL; };

  /**
   * default handlers — flow 페이지 중 새 CAT 이벤트가 오면 홈으로 복귀시켜
   * 흐름을 리셋한다. home.html 은 각 이벤트를 override 해 실제 flow 를 개시.
   */
  const DEFAULT_HANDLERS = Object.freeze({
    onNavigateToSavePoint:  returnHome,
    onNavigateToLookup:     returnHome,
    onNavigateToUsePoint:   returnHome,
    onNavigateToCatRequest: returnHome,
    onCatDisconnect:        returnHome,
  });

  /**
   * 페이지 로드 시 호출. ApiConfig 초기화 → AppSession 시작 (내부적으로 SocketGateway.start).
   *
   * @param {Partial<typeof DEFAULT_HANDLERS>} handlers — 페이지별 override
   */
  async function init(handlers = {}) {
    try {
      await ApiConfig.ensureInit();
      AppSession.start({ ...DEFAULT_HANDLERS, ...handlers });
    } catch (e) {
      console.error('[PluginBootstrap] init 실패:', e);
    }
  }

  return { init };
})();
