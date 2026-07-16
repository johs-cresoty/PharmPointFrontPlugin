/**
 * ApiConfig — Toss SDK 로부터 매장/단말기 식별 정보를 읽어 팜포인트 API 호출에 필요한 값을 제공.
 *
 * 읽는 값 3종:
 *   - sdk.app.getSerialNumber()             → serialNumber           (프론트 단말기 식별)
 *   - sdk.app.getMerchant().id              → merchantId             (Toss 매장 식별)
 *   - sdk.app.getMerchant().businessNumber  → businessNumber(=TAXNO) (약국 사업자번호)
 *
 * 서버 API 인증 스펙: { businessRegistrationNumber, serialNumber } — merchantId 는 현재 스펙에서 미사용
 * baseUrl: https://dev-app-api.catpos.co.kr (신규 인증 서버)
 */

/**
 * 절대 base URL.
 *   - 개발 (npm run dev) : https://dev-app-api.catpos.co.kr
 *   - 운영 (npm run build): https://app-api.catpos.co.kr
 * import.meta.env.PROD 는 Vite 가 build 시 true 로 정적 치환.
 */
export const API_BASE_URL = import.meta.env.PROD
  ? "https://app-api.catpos.co.kr"
  : "https://dev-app-api.catpos.co.kr";

/** axios baseURL — dev 는 vite proxy 우회를 위해 비움. */
export const AXIOS_BASE_URL = import.meta.env.DEV ? "" : API_BASE_URL;

/** 단말기 식별 공통 쿼리값 (PharmPoint Android PointRemoteDataSourceImpl 대응). */
export const POS_COMMON = {
  CMPTR_NAME: "TossFront_Plugin",
  POS_VER:    "1.0.0",
  POS_GUBN:   "CP",
} as const;

// ─── SDK 값 캐시 ─────────────────────────────────

const CACHE_KEY = "pharmpoint_sdk_cache";

type SdkCache = {
  serialNumber:   string;
  merchantId:     string;
  businessNumber: string;
};

let _serialNumber   = "";
let _merchantId     = "";
let _businessNumber = "";
let _initPromise: Promise<void> | null = null;

/**
 * Toss SDK 가 문자열 또는 { serialNumber } 형태의 객체를 반환할 가능성이 있어 방어적 추출.
 */
function extractSerial(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const obj = v as { serialNumber?: unknown; serial?: unknown; id?: unknown; value?: unknown };
    return String(obj.serialNumber ?? obj.serial ?? obj.id ?? obj.value ?? "");
  }
  return String(v);
}

function readCache(): SdkCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as SdkCache : null;
  } catch {
    return null;
  }
}

function writeCache(data: SdkCache): void {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
  catch { /* noop */ }
}

/**
 * Toss SDK 값 초기화. 첫 호출 시 SDK 를 읽고 sessionStorage 에 캐시.
 * 이후 호출은 캐시된 값을 즉시 반환.
 */
export function ensureInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cached = readCache();
    if (cached && cached.businessNumber) {
      _serialNumber   = cached.serialNumber   || "";
      _merchantId     = cached.merchantId     || "";
      _businessNumber = cached.businessNumber || "";
      return;
    }
    try {
      const [serial, merchant] = await Promise.all([
        sdk.app.getSerialNumber(),
        sdk.app.getMerchant(),
      ]);
      _serialNumber   = extractSerial(serial);
      _merchantId     = String(merchant?.id ?? "");
      _businessNumber = String(merchant?.businessNumber ?? "");

      if (!_serialNumber) {
        console.warn("[ApiConfig] ⚠️ serialNumber 를 추출하지 못했습니다. raw 값 확인 필요");
      }
      if (!_businessNumber || _businessNumber === "0000000000") {
        console.warn("[ApiConfig] ⚠️ businessNumber 가 비어있거나 기본값입니다!");
      }

      writeCache({
        serialNumber:   _serialNumber,
        merchantId:     _merchantId,
        businessNumber: _businessNumber,
      });
    } catch (e) {
      console.error("[ApiConfig] ❌ Toss SDK 읽기 실패:", e);
    }
  })();
  return _initPromise;
}

// ─── 접근자 ─────────────────────────────────────

export function currentSerialNumber():   string { return _serialNumber; }
export function currentMerchantId():     string { return _merchantId; }
export function currentBusinessNumber(): string { return _businessNumber; }

/** TAXNO — businessNumber alias */
export function currentTaxNo(): string { return _businessNumber; }

/**
 * enroll / token 재발급 API body 에 실을 인증 컨텍스트.
 * 서버 스펙: { businessRegistrationNumber, serialNumber }
 */
export function readAuthContext(): { businessRegistrationNumber: string; serialNumber: string } {
  return {
    businessRegistrationNumber: _businessNumber,
    serialNumber:               _serialNumber,
  };
}
