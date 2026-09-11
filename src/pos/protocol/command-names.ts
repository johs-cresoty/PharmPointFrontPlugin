/**
 * 전문 커맨드의 한글 이름.
 *
 * 로그에 `PHONE_INPUT_REQ`, `003` 만 찍히면 무슨 요청인지 알 수 없다.
 * 현장에서 로그를 읽는 사람이 프로토콜을 외우고 있을 거라고 가정하면 안 된다.
 * 한글 이름을 앞에 두고 원래 코드를 괄호에 남겨, 읽기도 되고 대조도 되게 한다.
 */
import { SocketConstants as C } from "./socket-constants";

const CAT_NAMES: Record<string, string> = {
  [C.CATPOS_CONNECT]:                     "연결 확인",
  [C.CATPOS_PHONE_INPUT_REQ]:             "휴대폰번호 입력 요청",
  [C.CATPOS_CUSTOMER_REGISTER_REQ]:       "회원 조회·등록 요청",
  [C.CATPOS_CANCEL]:                      "취소",
  [C.CATPOS_EARN_SINGLE_REQ]:             "포인트 적립 요청",
  [C.CATPOS_EARN_MULTI_REQ]:              "포인트 적립 요청(복합결제)",
  [C.CATPOS_USE_POINT_REQ]:               "포인트 사용 요청",
  [C.CATPOS_USE_POINT_WITH_CUSTOMER_REQ]: "포인트 사용 요청(회원 지정)",
  [C.CATPOS_MARKETING_CONSENT_REQ]:       "마케팅 동의 요청",
  [C.CATPOS_SESSION_START]:               "결제 시작",
  [C.CATPOS_SESSION_END]:                 "결제 종료",
  [C.CATPOS_CART_UPDATE]:                 "장바구니 갱신",
  [C.CATPOS_CART_CLEAR]:                  "장바구니 비움",

  [C.CATPOS_CONNECT_ACK]:                 "연결 확인 응답",
  [C.CATPOS_PHONE_INPUT_ACK]:             "휴대폰번호 전달",
  [C.CATPOS_CUSTOMER_REGISTER_ACK]:       "회원정보 전달",
  [C.CATPOS_USE_POINT_ACK]:               "포인트 사용 결과",
  [C.CATPOS_USE_POINT_WITH_CUSTOMER_ACK]: "포인트 사용 결과(회원 지정)",
  [C.CATPOS_MARKETING_CONSENT_ACK]:       "마케팅 동의 결과",
  [C.CATPOS_FAIL]:                        "실패 회신",
};

const TERMINAL_NAMES: Record<string, string> = {
  [C.TERMINAL_COMMAND_001]: "포인트 적립 요청",
  [C.TERMINAL_COMMAND_002]: "포인트 적립 요청(복합결제)",
  [C.TERMINAL_COMMAND_003]: "포인트 사용 요청",
  [C.TERMINAL_COMMAND_004]: "포인트 사용 결과",
  [C.TERMINAL_COMMAND_005]: "바코드 표시 요청",
  [C.TERMINAL_COMMAND_006]: "바코드 표시 응답",
  [C.TERMINAL_COMMAND_010]: "진행 취소",
  [C.TERMINAL_COMMAND_999]: "화면 닫기 요청",
};

/** 캣포스 커맨드 → "한글 이름(원래코드)". 모르는 커맨드는 코드만 남긴다. */
export function catCommandLabel(cmd: string): string {
  const name = CAT_NAMES[cmd];
  return name ? `${name}(${cmd})` : `알 수 없는 커맨드(${cmd})`;
}

/** 결제단말기 커맨드 → "한글 이름(원래코드)". */
export function terminalCommandLabel(cmd: string): string {
  const name = TERMINAL_NAMES[cmd];
  return name ? `${name}(${cmd})` : `알 수 없는 커맨드(${cmd})`;
}
