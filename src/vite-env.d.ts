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

interface TossSdk {
  serial:    TossSerialApi;
  websocket: TossWebSocketApi;
  // 다른 영역 (template / app / payment / storage 등) 은 Phase 3 에서 확장
  [key: string]: unknown;
}

declare const sdk: TossSdk;
interface Window {
  sdk?: TossSdk;
}
