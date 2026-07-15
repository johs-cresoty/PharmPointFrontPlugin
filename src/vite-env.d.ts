/// <reference types="vite/client" />

// Toss Front SDK 는 index.html 의 <script> 로 로드되어 window.sdk 로 노출됨.
// docs.tossplace.com 은 인증 게이트로 접근 불가하여, CDN 번들에서 확인한 시그니처 기반 최소 타입.
// 미커버된 SDK 영역은 Phase 3 (Toss 어댑터 계층) 에서 확장 예정.

interface TossSerialApi {
  open(opts: { baudRate: number }): Promise<void>;
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
}

interface TossStorageApi {
  get(opts:    { key: string }):                 Promise<{ key: string; value: string | null }>;
  set(opts:    { key: string; value: string }):  Promise<void>;
  remove(opts: { key: string }):                 Promise<void>;
}

interface TossResultPageButton {
  label:         string;
  closeOnClick?: boolean;
  onClick:       () => void;
}

interface TossResultPageOptions {
  type:         "text" | "image";
  status?:      "success" | "error";
  title?:       string;
  description?: string;
  text?:        string;
  timerMs?:     number;
  buttons?:     TossResultPageButton[];
  onTimeout?:   () => void;
  localeCode?:  string;
}

interface TossInputPageOptions {
  type:    "text" | "number" | "phone" | "identification";
  top:     { title: string; subtitle?: string };
  input:   {
    placeholder?: string;
    onChange?: (value: string) => void;
    maxLength?: number;
    type?: string;
  };
  button?:      { label: string };
  disclaimer?:  string;
  onSubmit:     (value: string) => void;
  onBack?:      () => void;
}

interface TossKeypadInputPageOptions {
  title?:       string;
  description?: string;
  input: {
    type?:        "phone" | "number" | string;
    trigger?:     "button" | "length";
    length?:      number;
    button?:      { label: string };
    placeholder?: string;
    onSubmit:     (value: string) => void | Promise<void>;
  };
  onBack?:       () => void;
  navbarButton?: unknown;
}

interface TossIdlePageOptions {
  [key: string]: unknown;
}

interface TossToastOptions {
  message: string;
  icon?:   "success" | "error";
}

interface TossTemplateApi {
  renderResultPage(opts:      TossResultPageOptions): void;
  renderInputPage(opts:       TossInputPageOptions): void;
  renderKeypadInputPage(opts: TossKeypadInputPageOptions): void;
  renderIdlePage(opts?:       TossIdlePageOptions): void;
  openToast(opts:             TossToastOptions): void;
  [key: string]: unknown;
}

interface TossSdk {
  app:       TossAppApi;
  serial:    TossSerialApi;
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
