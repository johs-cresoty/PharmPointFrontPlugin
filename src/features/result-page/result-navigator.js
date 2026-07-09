/**
 * ResultNavigator — 결과 화면 페이지(result.html) 로의 이동을 캡슐화.
 *
 * 각 flow (earn / use / lookup 등) 는 결과 데이터를 sessionStorage 에 세팅한 뒤
 * result.html 로 navigate 한다. result.html 은 이 컨텍스트를 읽어 SDK 결과 페이지를 렌더한다.
 *
 * ResultPageService 는 result.html 안에서만 사용된다 (SDK 호출 계층).
 * flow 페이지는 반드시 ResultNavigator 를 통해 결과 화면을 표시한다.
 */
window.ResultNavigator = (function () {
  const CTX_KEY     = 'pharm_result_ctx';
  const RESULT_URL  = './result.html';
  const DEFAULT_HOME = './home.html';

  function _navigate(ctx) {
    sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx));
    location.href = RESULT_URL;
  }

  /** 적립 완료 */
  function goEarnSuccess({ earnPoint, storeName, balancePoint, customerName, onTimeoutHref }) {
    _navigate({
      type: 'earn',
      data: { earnPoint, storeName, balancePoint, customerName },
      onTimeoutHref: onTimeoutHref || DEFAULT_HOME,
    });
  }

  /** 사용 완료 */
  function goUseSuccess({ usePoint, storeName, remainingPoint, customerName, onTimeoutHref }) {
    _navigate({
      type: 'use',
      data: { usePoint, storeName, remainingPoint, customerName },
      onTimeoutHref: onTimeoutHref || DEFAULT_HOME,
    });
  }

  /** 포인트 부족 */
  function goInsufficient({ storeName, minPoint, balancePoint, onTimeoutHref }) {
    _navigate({
      type: 'insufficient',
      data: { storeName, minPoint, balancePoint },
      onTimeoutHref: onTimeoutHref || DEFAULT_HOME,
    });
  }

  /** 조회 성공 */
  function goLookupSuccess({ phone, customer, onTimeoutHref }) {
    _navigate({
      type: 'lookup',
      data: { phone, customer, success: true },
      onTimeoutHref: onTimeoutHref || DEFAULT_HOME,
    });
  }

  /** 조회 실패 (등록되지 않은 회원 등) */
  function goLookupFail({ phone, error, onTimeoutHref }) {
    _navigate({
      type: 'lookup',
      data: { phone, success: false, error: error || '등록된 회원이 없습니다.' },
      onTimeoutHref: onTimeoutHref || DEFAULT_HOME,
    });
  }

  /**
   * result.html 진입 시 저장된 컨텍스트를 읽고 sessionStorage 에서 제거.
   * 없으면 null.
   */
  function readContext() {
    try {
      const raw = sessionStorage.getItem(CTX_KEY);
      sessionStorage.removeItem(CTX_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[ResultNavigator] readContext parse 실패:', e);
      return null;
    }
  }

  return {
    goEarnSuccess,
    goUseSuccess,
    goInsufficient,
    goLookupSuccess,
    goLookupFail,
    readContext,
  };
})();
