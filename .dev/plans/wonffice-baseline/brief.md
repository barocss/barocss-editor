---
work_id: wonffice-baseline
artifact_type: brief
status: verifying
owner_role: executor
source_request: "누적 변경 커밋·푸시 후 main 기준 GitHub 이슈·PR 흐름을 계속 진행"
last_updated: 2026-09-19
---

# Wonffice 기준점 검증 — #248 / PR #250

누적 구현을 보존한 `75dea9f1`에서 시작한다. 이번 변경은 기준점 CI 복구와 main 보호 설정이다. WP-01 operation 실패 처리는 #249이며 기준점 병합 후 별도 브랜치에서 진행한다.

## 구현

- Note·Slides 미사용 항목과 Site의 없는 페이지 접근을 수정했다.
- React contenteditable의 compositionstart/end를 연결했다. 종료 뒤 마지막 input이 없는 IME도 모델에 한 번 반영한다.
- React 예제의 빈 텍스트에 공통 filler를 넣어 새 문단 입력이 다음 문단으로 넘어가지 않게 했다.
- 테스트 타입 오류를 수정하고 apps/office와 query-editor를 검사 범위에 추가했다. 기존 오류 허용 한도는 올리지 않는다.
- 제품 4개의 workspace 배포 진입점을 빌드와 선언 파일에 연결했다. Note view 배포 경로도 실제 출력과 맞췄다.
- 외부 npm 의존성과 로컬 workspace 의존성을 검사에서 구분한다. private 패키지는 발행 검사가 아닌 앱 빌드로 검증한다. 그대로 배포하는 소스 CSS는 파일 포함 여부를 확인한다.
- 공통 UI 상태, 선택 도구 readout, ResizeObserver 모의 객체와 문서 수치 검사를 현재 구현에 맞췄다. 색상 테마의 스크린샷 전용 검사에 실제 색상 검증을 추가했다.
- 글자색·배경색 초기화는 선택 범위에 제거할 색상이 있을 때만 실행 가능하다. 검사 예제에 실제 색상을 넣어 제거 동작을 검증한다.

## main 보호 설정

GitHub API로 적용하고 다시 조회했다.

- PR 필수, 최신 main 기준 CI 필수.
- 필수 GitHub Actions 검사: `Lint, type-check, unit test`, `E2E (editor-react)`.
- 관리자도 적용. 강제 push와 삭제 금지. 대화 해결 필수.
- 1인 운영이므로 추가 승인자 수는 0. 자동 병합은 활성화하지 않았다.

## 검증

- 제품 소스 타입: 40개 프로젝트 검사 통과. 기존 예외 3개(docs-site, editor-decorator-test, editor-test)는 남아 있다.
- React 브라우저 14개, Site 편집·선택 3개, 색상 테마 1개 통과. 모두 데스크톱 검사다.
- Office 통합 빌드, 제품 4개 패키지 빌드, lint 통과.
- 전체 단위 검사: 29개 패키지, 8,540개 통과, 기존 17개 건너뛰기.
- 테스트 타입 검사: 통과. apps/office·query-editor는 오류 허용 0으로 추가했다. extensions 19→18, Slides 43→38, Word 9→7로 기존 한도를 낮췄다. 다른 기존 타입 부채는 유지한다.
- 제품 4개의 publishConfig.exports가 가리키는 JS·타입·CSS 파일이 모두 실제 빌드 출력에 있는지 확인했다.
- 첫 원격 실행은 Node 20에 없는 fs.globSync를 검사 코드가 사용해 실패했다. 호환되는 디렉터리 순회로 바꾸고 conformance 테스트 타입 한도를 4→2로 낮췄다. Node 20에서도 전체 단위 8,540개 통과(기존 17개 건너뛰기)를 확인했다.
- 사용자 요청에 따라 프로젝트 Node는 검증한 22.22.0으로 통일했다. `.nvmrc`를 CI 두 작업과 문서 빌드가 읽고, root engines와 README의 로컬 설치 절차도 맞췄다. 기본 셸의 22.19.0은 전역 변경하지 않는다. 프로젝트에서는 `nvm use`를 실행한다.
- Node 22 원격 실행에서 Site ZIP 검사가 macOS 전용 ditto를 호출해 실패했다. Python 3 zipfile 독립 검증을 추가하고 macOS ditto 검사도 유지했다. 한글 경로·바이너리 보존과 손상 CRC 거부를 검증했다. Site 패키지 54개 파일, 656개 검사 통과. Linux 결과는 후속 원격 실행으로 확인한다.
- React Enter 후 DOM 생성 전에 selection 복원이 실행되는 경합을 수정했다. 최대 10프레임 동안 대상 DOM을 기다리고 최신 선택·remote·none·skip 상태·unmount에서 이전 요청을 취소한다. React 단위 88개, CI 모드 브라우저 14개, Enter 반복 20개를 통과했다. 공개 패키지 patch changeset을 추가했다. 재시도 없이 실패 trace를 보관하도록 CI 진단도 추가했다.
- 새 head의 GitHub CI 결과는 PR #250에서 확인한다.

## 완료 경계

PR #250은 새 head의 필수 검사가 통과하기 전까지 draft로 유지한다. 이 기준점은 전체 제품의 출시 인수가 아니다. 기존 타입 검사 예외와 허용된 테스트 타입 부채는 숨기지 않는다. Codex 앱 실행만으로 시작하는 상주 자동화나 서비스 배포는 이번 작업에 없다.
