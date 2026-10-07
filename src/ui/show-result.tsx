/**
 * 결과 화면을 새 디자인으로 띄운다 (Template API renderResultPage 대체).
 *
 * 자동 닫힘 시간은 기존과 같이 앱 설정(결과 화면 대기 시간)을 읽는다.
 * 닫히면(확인 · 자동) 무대를 내린 뒤 onDone 을 부른다 — 어디로 갈지는 부르는 쪽이 정한다.
 */
import { getResultTimeoutMs } from "../features/app-config/app-config.service";
import ResultScreen, { type ResultScreenProps } from "./ResultScreen";
import { hideScreen, showScreen } from "./stage";

const DEFAULT_TIMEOUT_MS = 5000;

export type ShowResultArgs = Omit<ResultScreenProps, "seconds" | "onDone"> & {
  onDone: () => void;
};

async function resultSeconds(): Promise<number> {
  try {
    return Math.round((await getResultTimeoutMs()) / 1000);
  } catch (e) {
    console.warn("[ResultScreen] timeout 조회 실패, 기본값 사용", e);
    return DEFAULT_TIMEOUT_MS / 1000;
  }
}

export async function showResult(args: ShowResultArgs): Promise<void> {
  const { onDone, ...rest } = args;
  const seconds = await resultSeconds();
  showScreen(
    <ResultScreen
      {...rest}
      seconds={seconds}
      onDone={() => {
        hideScreen();
        onDone();
      }}
    />,
  );
}
