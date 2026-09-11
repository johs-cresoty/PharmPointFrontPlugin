// 로그에 남는 개인정보 마스킹.
//
// 토스 운영 가이드가 수집 대상에서 제외하라고 명시한 항목(개인정보·토큰·키)을
// 콘솔에 남기지 않기 위한 유틸. 개발자센터 로그 뷰어와 Sentry 양쪽에 적용된다.
// 진단 가치를 잃지 않도록 값 전체를 지우지 않고 뒤 4자리만 남긴다.

/** 휴대폰 번호 마스킹: "01012345678" → "***5678" */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "***";
  return `***${phone.slice(-4)}`;
}

/**
 * 국내 휴대폰 번호 패턴 — 010/011/016/017/018/019 + 7~8자리.
 * 앞뒤가 숫자면 매칭하지 않는다(금액·승인번호 등 긴 숫자열 오탐 방지).
 */
const PHONE_IN_TEXT = /(?<![0-9])01[016789][0-9]{7,8}(?![0-9])/g;

/**
 * 자유 형식 문자열 안의 휴대폰 번호를 마스킹한다.
 * 키 구조가 제각각인 전문·프레임 필드 로그용.
 */
export function maskPiiText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (m) => `***${m.slice(-4)}`);
}

/**
 * 바이트 배열에서 휴대폰 번호에 해당하는 ASCII 구간을 찾는다.
 * hex 덤프에서 프레임 구조(STX·길이·플래그·CMD·FS·ETX·LRC)는 그대로 보이되
 * 개인정보 바이트만 가리기 위한 보조 함수.
 */
export function findPiiByteRanges(bytes: Uint8Array): Array<[number, number]> {
  let ascii = "";
  for (let i = 0; i < bytes.length; i++) ascii += String.fromCharCode(bytes[i]);

  const ranges: Array<[number, number]> = [];
  for (const m of ascii.matchAll(PHONE_IN_TEXT)) {
    if (m.index === undefined) continue;
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}
