// Toss Front SDK 전역 alias — 앱 코드는 전역 `sdk` 를 참조한다.
// (테스트용 serialNumber/merchant 오버라이드 제거 — 토스 실단말이 내려주는
//  실제 serialNumber / businessNumber(=TAXNO) 를 그대로 사용한다.)
var sdk = window.TossFrontSDK;
