/**
 * CresotyCrypt JS 포팅 (XOR + 날짜키 방식)
 *
 * 원본: app/src/main/java/com/cresoty/catpospoint/remote/crypt/CresotyCrypt.kt
 *
 * 키 생성 규칙: "crecat" + 오늘 일자(dd, 2자리)
 *   예) 5월 15일 → "crecat15"
 *   주의: 키가 날마다 바뀌므로 오늘 암호화한 값을 내일 복호화하면 깨짐.
 *
 * 출력 포맷:
 *   "{XORed-decimal-concat}^{length-per-decimal}"
 *   예) 원본 "abc" → "2166^121" (각 바이트 XOR 결과를 10진수 문자열로 이어붙임)
 */
window.CresotyCrypt = (function () {
  function getDefaultKey() {
    const day = String(new Date().getDate()).padStart(2, '0');
    return 'crecat' + day;
  }

  // 문자열 → UTF-8 바이트 배열
  function toUtf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  // UTF-8 바이트 배열 → 문자열
  function fromUtf8Bytes(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * 평문 문자열 암호화
   * @param {string|number|null|undefined} plain
   * @returns {string} "cypher^lengths" 형식. 입력이 null/빈문자열이면 ""
   */
  function getEncode(plain) {
    if (plain == null) return '';
    const plainText = String(plain);
    if (plainText.length === 0) return '';

    const key = getDefaultKey();
    const textBytes = toUtf8Bytes(plainText);
    const keyBytes = toUtf8Bytes(key);

    let cypherText = '';
    let cypherTextLength = '';
    let j = 0;

    for (let i = 0; i < textBytes.length; i++) {
      const tmpStr = String(textBytes[i] ^ keyBytes[j]);
      cypherText += tmpStr;
      cypherTextLength += tmpStr.length;

      j++;
      if (j === keyBytes.length) j = 0;
    }

    return cypherText + '^' + cypherTextLength;
  }

  /**
   * 암호문 복호화 (Kotlin 원본의 hex 우회 로직을 동등한 직접 변환으로 단순화)
   * @param {string} cypherText
   * @returns {string} 평문
   */
  function getDecode(cypherText) {
    if (!cypherText) return '';

    const key = getDefaultKey();
    const delimiterPos = cypherText.indexOf('^');
    if (delimiterPos <= 0) return '';

    const splitText = cypherText.substring(0, delimiterPos);
    const splitKey = cypherText.substring(delimiterPos + 1);
    const numChunks = splitKey.length;

    const keyBytes = toUtf8Bytes(key);
    const bytes = new Uint8Array(numChunks);

    let pos = 0;
    for (let i = 0; i < numChunks; i++) {
      const size = parseInt(splitKey.charAt(i), 10);
      const decimal = parseInt(splitText.substring(pos, pos + size), 10);
      bytes[i] = decimal ^ keyBytes[i % keyBytes.length];
      pos += size;
    }

    return fromUtf8Bytes(bytes);
  }

  return {
    getDefaultKey,
    getEncode,
    getDecode,
  };
})();
