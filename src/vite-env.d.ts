/// <reference types="vite/client" />

/** vite define 으로 주입되는 package.json 의 version. */
declare const __APP_VERSION__: string;

/** vite define — 상세 로그 출력 여부. 운영 빌드에서는 false. */
declare const __LOG_VERBOSE__: boolean;

/** vite define — 개발 서버(vite serve)인지. axios baseURL 분기에 쓴다. */
declare const __DEV_PROXY__: boolean;

// Toss Front SDK 는 index.html 의 <script> 로 로드되어 window.sdk 로 노출됨.
// docs.tossplace.com 은 인증 게이트로 접근 불가하여, CDN 번들에서 확인한 시그니처 기반 최소 타입.
// 미커버된 SDK 영역은 Phase 3 (Toss 어댑터 계층) 에서 확장 예정.

interface TossSerialApi {
  // intercept: true — 리더기 모드 필수. 플러그인이 수신 전문을 먼저 받아 TRM/KIS 로 분기.
  open(opts: { baudRate: number; intercept?: boolean }): Promise<void>;
  close(): Promise<void>;
  write(opts: { data: Uint8Array }): Promise<void>;
  listen(cb: (p: { data: Uint8Array }) => void): () => void;
}

interface TossWebSocketServerHandle {
  send(connectionId: string, data: string): Promise<void>;
  stop?(): Promise<void>;
}

interface TossWebSocketApi {
  start(opts: {
    serverId: string;
    port:     number;
    path:     string;
    onConnection?:    (p: { connectionId: string }) => void;
    onMessage?:       (p: { connectionId: string; data: string }) => void;
    onDisconnection?: (p: { connectionId: string }) => void;
    onError?:         (p: unknown) => void;
  }): Promise<TossWebSocketServerHandle>;
  list(): Promise<{ servers: Array<{ serverId: string; port: number }> }>;
  close(opts: { serverId: string }): Promise<void>;
}

interface TossAppApi {
  getSerialNumber(): Promise<string | { serialNumber?: string; serial?: string; id?: string; value?: string }>;
  getMerchant(): Promise<{ id?: string; businessNumber?: string; name?: string }>;
  setIdle(): Promise<void>;
  /** 토스 단말기 설정 화면을 연다. */
  openSetting(): Promise<void>;
}

// VAN(밴) 결제모듈 — KIS 전문 전달용. write 만 사용.
// 응답은 VAN 모듈이 단말기로 직접 회신하므로 수신 API 불필요(토스 확인). sdk.van.listen 은 미제공.
interface TossVanApi {
  write(opts: { data: Uint8Array }): Promise<void>;
}

interface TossStorageApi {
  get(opts:    { key: string }):                 Promise<{ key: string; value: string | null }>;
  set(opts:    { key: string; value: string }):  Promise<void>;
  remove(opts: { key: string }):                 Promise<void>;
}

// Template API — 플러그인 설정 화면(settings.html)의 토스트만 쓴다.
interface TossTemplateApi {
  openToast(opts: { message: string; icon?: "success" | "error" }): void;
}

interface TossSdk {
  app:       TossAppApi;
  serial:    TossSerialApi;
  van:       TossVanApi;
  websocket: TossWebSocketApi;
  storage:   TossStorageApi;
  template:  TossTemplateApi;
  // 다른 영역 (payment 등) 은 Phase 3 에서 확장
  [key: string]: unknown;
}

declare const sdk: TossSdk;
interface Window {
  sdk?: TossSdk;
}
