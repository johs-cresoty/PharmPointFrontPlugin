/**
 * AppSession — 소켓 이벤트 → 화면 라우팅 결정.
 *
 * Android: AppViewModel.handleSocketEvent
 *
 * 역할:
 *   1. SocketGateway 의 이벤트를 구독해서 TransactionParser 로 파싱
 *   2. 화면 진입에 필요한 args 를 만들어서 상위 라우터 콜백에 전달
 *   3. 설정 (isSave, minPoint 등) 을 참조해서 적립 트리거 여부 필터링
 *
 * UI 통합 방식:
 *   AppSession.start({
 *     onNavigateToSavePoint:  (args) => { ... },  // 적립 요청
 *     onNavigateToLookup:     (args) => { ... },  // 사용 요청 (조회 단계)
 *     onNavigateToUsePoint:   (args) => { ... },  // 사용 직접 화면 (CAT_WITH_CUSTOMER)
 *     onNavigateToCatRequest: (args) => { ... },  // 캣포스 단순 조회 요청
 *     onCatDisconnect:        () => { ... },
 *   });
 *
 * 의존: SocketGateway, SocketEvent, TransactionParserService, PointSettingsService
 */
window.AppSession = (function () {

  let started = false;
  let unsubscribes = [];

  /** 현재 적립 활성화 상태 (PointSettingsService 결과 캐시). 미설정 시 true 로 가정. */
  let isSaveEnabled = true;
  /** 최소 사용 포인트 활성화 설정 (use point 화면 진입 시 전달용). */
  let minPoint = 0;
  let isMinPointEnabled = false;

  function setConfig({ isSave, minPoint: minP, isMinPointEnabled: minEn } = {}) {
    if (typeof isSave === 'boolean') isSaveEnabled = isSave;
    if (Number.isFinite(minP))       minPoint = minP;
    if (typeof minEn === 'boolean')  isMinPointEnabled = minEn;
  }

  async function refreshConfig() {
    try {
      const save = await PointSettingsService.getPointSaveSetting();
      if (save.success) isSaveEnabled = save.isSave;
    } catch (e) { console.warn('[AppSession] getPointSaveSetting fail', e); }
  }

  function start(handlers = {}) {
    if (started) return;
    started = true;

    const E = SocketEvent;
    const reg = (event, fn) => unsubscribes.push(SocketGateway.on(event, fn));

    // ── TERMINAL ────────────────────────────────────

    reg(E.TerminalEarnPointSingle, ({ fields }) => {
      // isAfterUse(data[7]="1"): 사용(003) 후 적립(001) 전문 → 무시
      const isAfterUse = (fields?.[7] ?? '0') === '1';
      const otc = parseInt(fields?.[5] ?? '0', 10) || 0;
      if (isAfterUse || !isSaveEnabled || otc === 0) return;

      const td = TransactionParserService.parseTerminalSingle(fields);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.TERMINAL,
        paymentType: 'SINGLE',
        transactionData: td,
      });
    });

    reg(E.TerminalEarnPointComplex, ({ fields }) => {
      const isAfterUse = (fields?.[7] ?? '0') === '1';
      const otc = parseInt(fields?.[5] ?? '0', 10) || 0;
      if (isAfterUse || !isSaveEnabled || otc === 0) return;

      const td = TransactionParserService.parseTerminalComplex(fields);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.TERMINAL,
        paymentType: 'MULTIPLE',
        transactionData: td,
      });
    });

    reg(E.TerminalUsePoint, ({ fields }) => {
      const td = TransactionParserService.parseTerminalUsePoint(fields);
      handlers.onNavigateToLookup?.({
        source:          PointUseSource.TERMINAL,
        transactionData: td,
      });
    });

    // ── CAT ─────────────────────────────────────────

    reg(E.CatConnect, () => {
      // Android AppViewModel.sendCatConnectAck: "OK|\r\n" 송신
      SocketGateway.sendCATOk();
    });

    reg(E.CatRequestNum, () => {
      handlers.onNavigateToCatRequest?.({ mode: 'CAT_REQUEST_NUM' });
    });

    reg(E.CatRequestCustomer, () => {
      handlers.onNavigateToCatRequest?.({ mode: 'CAT_REQUEST_CUSTOMER' });
    });

    reg(E.CatDisconnect, () => {
      handlers.onCatDisconnect?.();
    });

    reg(E.CatEarnPointSingle, ({ data }) => {
      const td = TransactionParserService.parseCatSingle(data);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.CAT,
        paymentType: 'SINGLE',
        transactionData: td,
      });
    });

    reg(E.CatEarnPointComplex, ({ data }) => {
      const td = TransactionParserService.parseCatComplex(data);
      handlers.onNavigateToSavePoint?.({
        source:      PointUseSource.CAT,
        paymentType: 'MULTIPLE',
        transactionData: td,
      });
    });

    reg(E.CatUsePointNoCustomer, ({ data }) => {
      const td = TransactionParserService.parseCatUsePoint(data);
      handlers.onNavigateToLookup?.({
        source:          PointUseSource.CAT,
        transactionData: td,
      });
    });

    reg(E.CatUsePointWithCustomer, ({ data }) => {
      const balance   = parseInt(data?.balance   ?? '0', 10) || 0;
      const payAmount = parseInt(data?.payAmount  ?? '0', 10) || 0;
      handlers.onNavigateToUsePoint?.({
        source:    PointUseSource.CAT_WITH_CUSTOMER,
        balance,
        payAmount,
        minPoint,
        isMinPointEnabled,
      });
    });

    SocketGateway.start().catch(e => console.error('[AppSession] socket start fail', e));
    refreshConfig();
  }

  async function stop() {
    if (!started) return;
    unsubscribes.forEach(off => { try { off(); } catch (_) {} });
    unsubscribes = [];
    started = false;
    await SocketGateway.stop();
  }

  return { start, stop, setConfig, refreshConfig };
})();
