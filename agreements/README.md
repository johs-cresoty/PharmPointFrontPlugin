# 팜포인트 약관 페이지

토스 플러그인의 약관 동의 화면에서 필수·선택 항목을 눌렀을 때 열리는 정적 페이지다.

## 왜 별도로 배포하나

토스 SDK 의 `renderAgreementPage` 는 각 항목을 `shell.openExternal(href)` 로 **외부 브라우저**에 넘긴다.
그 브라우저에서는 플러그인 도메인(`cresoty-pharmpoint.plugin.tossplace.com`)이 풀리지 않아
`ERR_NAME_NOT_RESOLVED` 가 난다. 그래서 공개 DNS 로 접근 가능한 호스트에 따로 올린다.

SDK 는 약관 본문을 받는 필드가 없고 `id` / `title` / `href` 만 받는다. 내용은 URL 로만 전달된다.

## Cloudflare Pages 설정

| 항목 | 값 |
|---|---|
| 프로젝트 이름 | `pharmpoint-agreements` |
| 저장소 | `johs-cresoty/PharmPointFrontPlugin` |
| 프로덕션 브랜치 | `main` |
| 빌드 명령 | (비움) |
| 빌드 출력 디렉터리 | `agreements` |
| 루트 디렉터리 | (비움) |

빌드 과정이 없는 정적 파일이라 명령은 넣지 않는다.
프로젝트 이름이 그대로 도메인이 되므로(`pharmpoint-agreements.pages.dev`),
이름을 바꾸면 `src/pages/home.ts` 의 `AGREEMENT_ORIGIN` 도 같이 바꿔야 한다.

## 배포 확인

```
https://pharmpoint-agreements.pages.dev/                          목록
https://pharmpoint-agreements.pages.dev/agreement-privacy.html    필수
https://pharmpoint-agreements.pages.dev/agreement-marketing.html  선택
```

## 문구 수정 시

원본은 '팜포인트 회원 동의 폼 v1.0' 문서다. 문구를 고칠 일이 생기면 원본을 먼저 개정하고
여기에 반영한다. 위탁 안내(Ⅲ)와 정보주체의 권리(Ⅳ)는 두 파일에 같은 내용이 들어 있다 —
SDK 가 항목별로 다른 URL 을 열어서, 한쪽만 봐도 내용이 완결되어야 하기 때문이다.
