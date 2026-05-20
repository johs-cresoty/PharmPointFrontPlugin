/**
 * ResultPageService — sdk.template.renderResultPage 호출 헬퍼.
 *
 * Android: presentation/result/ResultContract.State
 *
 * 4가지 케이스:
 *   - showEarnSuccess(earnPoint, storeName, balancePoint, timeout?)
 *   - showUseSuccess(usePoint, storeName, remainingPoint, timeout?)
 *   - showInsufficientPoint(storeName, minPoint, balancePoint, timeout?)
 *   - showLookupResult(storeName, balancePoint, timeout?)
 *
 * 문구 포맷 (디자인 명세):
 *   적립 완료    : "<earnPoint>P 적립완료" / "<storeName> 약국 포인트가 적립되었습니다." / "<balancePoint>P"
 *   사용 완료    : "<usePoint>P 사용완료"  / "<storeName> 약국 포인트가 사용되었습니다." / "<remainingPoint>P"
 *   포인트 부족  : "포인트 부족"            / "<storeName> 최소 <minPoint>P부터 사용 가능합니다." / "<balancePoint>P"
 *   조회 결과    : "<storeName>"           / "현재 보유하고 있는 포인트입니다." / "보유 포인트 <balancePoint>P"
 *
 * 의존: sdk (Toss Front SDK)
 */
window.ResultPageService = (function () {

  const DEFAULT_TIMEOUT_MS = 5000;

  function fmtPoint(n) {
    const num = Number.isFinite(n) ? n : parseInt(n, 10) || 0;
    return num.toLocaleString('ko-KR');
  }

  function render({ type = 'text', status, title, description, text, onTimeout, timerMs, buttons }) {
    const params = {
      type,
      title,
      description,
      onTimeout: onTimeout || (() => {}),
      timerMs: Number.isFinite(timerMs) ? timerMs : DEFAULT_TIMEOUT_MS,
      localeCode: 'ko',
    };
    if (type === 'image') params.status = status || 'success';
    if (type === 'text')  params.text   = text || '';
    if (buttons && buttons.length) params.buttons = buttons;
    return sdk.template.renderResultPage(params);
  }

  /**
   * 적립 완료.
   * @param {{earnPoint:number, storeName:string, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showEarnSuccess({ earnPoint, storeName, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `${fmtPoint(balancePoint)}P`,
      title:       `${fmtPoint(earnPoint)}P 적립완료`,
      description: `${storeName} 약국 포인트가 적립되었습니다.`,
      onTimeout, timerMs,
    });
  }

  /**
   * 사용 완료.
   * @param {{usePoint:number, storeName:string, remainingPoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showUseSuccess({ usePoint, storeName, remainingPoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `${fmtPoint(remainingPoint)}P`,
      title:       `${fmtPoint(usePoint)}P 사용완료`,
      description: `${storeName} 약국 포인트가 사용되었습니다.`,
      onTimeout, timerMs,
    });
  }

  /**
   * 포인트 부족. (image:error 타입은 text 필드 미지원 → 잔액은 description 에 포함)
   * @param {{storeName:string, minPoint:number, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showInsufficientPoint({ storeName, minPoint, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'image',
      status:      'error',
      title:       '포인트 부족',
      description: `${storeName} 최소 ${fmtPoint(minPoint)}P부터 사용 가능합니다.\n보유 포인트 ${fmtPoint(balancePoint)}P`,
      onTimeout, timerMs,
    });
  }

  /**
   * 조회 결과.
   * @param {{storeName:string, balancePoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showLookupResult({ storeName, balancePoint, onTimeout, timerMs }) {
    return render({
      type:        'text',
      text:        `보유 포인트 ${fmtPoint(balancePoint)}P`,
      title:       storeName,
      description: '현재 보유하고 있는 포인트입니다.',
      onTimeout, timerMs,
    });
  }

  /**
   * 최소 사용 포인트 설정 완료.
   * @param {{minPoint:number, onTimeout?:()=>void, timerMs?:number}} args
   */
  function showMinPointSaved({ minPoint, onTimeout, timerMs }) {
    return render({
      type:        'image',
      status:      'success',
      title:       '설정 완료',
      description: `최소 사용 포인트 ${fmtPoint(minPoint)}P`,
      onTimeout, timerMs,
    });
  }

  return {
    showEarnSuccess,
    showUseSuccess,
    showInsufficientPoint,
    showLookupResult,
    showMinPointSaved,
  };
})();
