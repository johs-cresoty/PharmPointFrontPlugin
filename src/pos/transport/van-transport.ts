/**
 * VanTransport — Toss Front SDK VAN API 래퍼 (KIS 전문 → VAN 결제모듈 전달).
 *
 * 팜포인트는 '리더기 모드'라 결제를 개시하지 않고, 단말에서 받은 KIS 전문을 VAN 모듈로 중계한다.
 *
 * 반환 경로: 우리가 구현할 필요 없음(토스 확인). sdk.van.write 로 전달하면 VAN 모듈이
 *   크레소티 단말기로 직접 시리얼 응답을 보낸다. (sdk.serial.write / sdk.van.listen 불필요·미제공)
 */

export type VanTransport = {
  write(bytes: Uint8Array): Promise<void>;
};

export function createVanTransport(): VanTransport {
  return {
    write(bytes: Uint8Array): Promise<void> {
      if (typeof sdk.van?.write !== "function") {
        console.warn("[van] sdk.van.write 미지원 — KIS 중계 불가");
        return Promise.resolve();
      }
      return sdk.van.write({ data: bytes });
    },
  };
}
