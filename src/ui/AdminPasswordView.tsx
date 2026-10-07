import { useState, type ReactNode } from "react";

// 관리자 비밀번호 팝업. PharmPoint Android AdminLogin 다이얼로그 대응.
// 대기화면에서 매장명 롱프레스(2초) 시 표시 → 비밀번호 일치하면 환경설정 진입.
//
// 네이버(PharmPointFrontPlugin-Naver)와 토스(PharmPointFrontPlugin)가 같은 파일을 쓴다.
// 고칠 때는 두 저장소의 src/ui/AdminPasswordView.tsx 를 함께 고친다.
// 전용 키패드 2행×6, 4자리 고정 비밀번호 + 숫자 마스킹(•) 표시.
//
// 디자인: Figma「커넥트_고객화면_디자인」 09-1 · 09-2 (node 24:818 · 24:1014).
// 팝업 486×526 안의 배치를 Figma 좌표 그대로 옮긴다(px 고정, 색은 ui-*).
//
// 보안 (SEC-01): 비밀번호는 서버가 대조한다 (verify-password API).
//   입력값만 서버로 보내고 일치 여부만 받으므로, 값이 클라이언트로 내려오지 않고
//   빌드 산출물에도 남지 않는다. 이 파일에는 비밀번호와 관련된 상수가 없다.
//
//   검증할 수 없으면(네트워크·서버 오류 등) 진입시키지 않는다 — fail-closed.
//   설정 화면 자체도 라우트 가드로 막혀 있어(네이버 RequireAdmin · 토스 admin-session),
//   이 검증을 통과하지 않으면 주소로 직접 들어갈 수 없다.
const PW_LENGTH = 4;

type Props = {
  /** 서버 대조 (verify-password API). 일치 여부를 돌려준다. 실패하면 throw. */
  verify: (password: string) => Promise<boolean>;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AdminPasswordView({ verify, onClose, onSuccess }: Props) {
  const [input, setInput] = useState("");
  const [showError, setShowError] = useState(false);
  const [checking, setChecking] = useState(false);

  const onNumber = (d: string) => {
    if (input.length >= PW_LENGTH || checking) return;
    setShowError(false);
    setInput((p) => p + d);
  };
  const onDelete = () => {
    if (checking) return;
    setShowError(false);
    setInput((p) => p.slice(0, -1));
  };
  const onDeleteAll = () => {
    if (checking) return;
    setShowError(false);
    setInput("");
  };

  // 버튼은 Figma 대로 늘 같은 모양이다. 4자리가 안 됐으면 눌러도 아무 일도 없다.
  const onLogin = async () => {
    if (checking || input.length < PW_LENGTH) return;
    setChecking(true);
    try {
      const verified = await verify(input);
      if (verified) onSuccess();
      else setShowError(true);
      return;
    } catch (e) {
      // 검증할 수 없으면 진입시키지 않는다 — fail-closed.
      const status = (e as { response?: { status?: number } })?.response?.status;
      console.error(
        `[AdminPassword] verify-password 호출 실패 (status=${status ?? "네트워크"}) — 진입 차단`,
      );
      setShowError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    // 오버레이 클릭으로는 닫히지 않는다(안드로이드 onDismiss 없음). 닫기 버튼만.
    // stopPropagation 으로 대기화면의 숨김 탭 카운터에 영향 주지 않도록 한다.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 font-display"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex h-[526px] w-[486px] flex-col items-center overflow-hidden rounded-[22px] bg-white">
        {/* 제목 — 팝업 안 y=35 */}
        <h2 className="mt-[35px] whitespace-nowrap text-center text-[28px] font-medium leading-[1.35] tracking-[-0.28px] text-ui-text">
          관리자 비밀번호
        </h2>

        {/* 비밀번호 4칸 — y=81. 빈 칸은 밑줄, 채운 칸은 Figma 의 점+밑줄 아이콘 */}
        <div className="mt-[8.2px] flex gap-[8px]">
          {Array.from({ length: PW_LENGTH }).map((_, i) =>
            i < input.length ? (
              <img key={i} src="/icon_pw_filled.svg" alt="" width={52} height={52} className="size-[52px]" />
            ) : (
              <div key={i} className="size-[52px] border-b-[1.5px] border-ui-primary" />
            ),
          )}
        </div>

        {/* 불일치 안내 — y=144. 높이를 늘 남겨 아래 키패드가 움직이지 않게 한다 */}
        <p className="mt-[11px] h-[27px] whitespace-nowrap text-center text-[18px] font-normal leading-[1.5] tracking-[-0.54px] text-ui-error">
          {showError ? "입력하신 비밀번호가 일치하지 않습니다." : ""}
        </p>

        {/* 전용 키패드 — y=183, 2행×6 (1~5 ⌫ / 6~9 0 전체삭제) */}
        <div className="mt-[12px] flex flex-col gap-[4px] rounded-[10px] bg-ui-surface p-[8px]">
          <div className="flex gap-[3px]">
            {["1", "2", "3", "4", "5"].map((n) => (
              <PadButton key={n} onClick={() => onNumber(n)}>
                <span className="text-[23px] font-normal text-ui-text">{n}</span>
              </PadButton>
            ))}
            <PadButton onClick={onDelete} aria="한 자리 삭제">
              <img
                src="/icon_backspace_admin.svg"
                alt=""
                width={26.1995}
                height={18.3396}
                className="block max-w-none"
              />
            </PadButton>
          </div>
          <div className="flex gap-[3px]">
            {["6", "7", "8", "9", "0"].map((n) => (
              <PadButton key={n} onClick={() => onNumber(n)}>
                <span className="text-[23px] font-normal text-ui-text">{n}</span>
              </PadButton>
            ))}
            <PadButton onClick={onDeleteAll}>
              <span className="text-[13px] font-normal text-ui-text">전체삭제</span>
            </PadButton>
          </div>
        </div>

        {/* 하단 버튼 — 로그인 / 닫기 (세로), 팝업 아래 여백 30 */}
        <div className="mb-[30px] mt-auto flex w-[440px] flex-col gap-[12px]">
          <button
            type="button"
            onClick={onLogin}
            className="flex h-[75px] w-full items-center justify-center rounded-[16px] bg-ui-primary text-[26px] font-bold leading-[1.4] text-white"
          >
            {checking ? (
              <span
                role="status"
                aria-label="처리 중"
                className="block h-9 w-9 animate-spin rounded-full border-4 border-white/30 border-t-white"
              />
            ) : (
              "로그인"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[75px] w-full items-center justify-center rounded-[16px] bg-ui-surface-blue text-[26px] font-bold leading-[1.4] text-ui-text-sub"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/** Figma popup_number_key — 68×50, 흰 바탕. */
function PadButton({
  onClick,
  aria,
  children,
}: {
  onClick: () => void;
  aria?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="flex h-[50px] w-[68px] items-center justify-center rounded-[6px] bg-white"
    >
      {children}
    </button>
  );
}
