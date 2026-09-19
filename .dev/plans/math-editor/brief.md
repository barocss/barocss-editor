---
work_id: math-editor
artifact_type: implementation-brief
status: qa_ready
owner_role: executor
source_request: 별도 수식 편집기 패키지 구조를 잡고 진행
last_updated: 2026-09-07
---

# 독립 수식 편집기 첫 구현

목표: 제품 의존 없는 @barocss/math-editor와 독립 데모로 직접 구조 편집을 검증한다.

수용 기준:
1. 공개 패키지로 빌드되고 데모가 그 exports로 동작한다.
2. 분수·루트·지수·첨자를 중첩 입력하고 Tab으로 이동한다.
3. 추천 확정과 일반 입력을 구분하고 문자열 선택에 도구를 적용한다.
4. 구조 편집을 실행 취소/재실행해 문서와 커서를 복원한다.
5. JSON과 LaTeX 출력을 제공하고 제품 연결 계약·한계를 문서화한다.

변경 범위: packages/math-editor, apps/math-demo, 이 brief, workspace lockfile.
기존 작업 중인 제품 변경은 보존한다. 제품 이력 연결과 고급 수학 기능은 README의 후속 범위로 명시한다.

검증: 모델 단위 테스트, 두 프로젝트 타입 검사와 빌드, 브라우저 입력 시나리오/화면 확인.

## 검증 결과 — 2026-09-07

- 기준 1: `pnpm --filter @barocss/math-editor build`, `pnpm --filter @barocss/math-demo build` 통과. 데모는 dist 공개 exports로 실행.
- 기준 2/4: `pnpm --filter @barocss/math-editor test:run` 7개 통과. 피연산자 경계, 부분 선택, 중첩 이동, 내용 보존, 이력 분기, 직렬화 검사.
- 기준 1/5: 패키지 및 데모 타입 검사 통과. README에 API와 제품 연결 계약 기록.
- 기준 2/3/4: 인앱 브라우저에서 x/2, Tab, sqrt 추천 확정, 루트 안 y^2 입력, Cmd+Z/Shift+Cmd+Z, alpha+Space 유지, Escape 추천 취소, 문자열 선택 후 루트 도구, Backspace 구조 풀기와 undo 복원 확인.
- 최종 화면: x_i = sqrt(a^2+b^2) 입력 및 LaTeX 출력 확인. localhost:5184 데모 유지.
- 발견 및 수정: React의 이전 입력 칸 selection 이벤트가 구조 명령의 커서를 덮어쓰는 문제. 포커스 복원 중 selection 이벤트를 차단해 해결.
- 확인 범위의 한계: 실제 OS 한글 IME 조합, 모바일, 스크린리더, 제품 전역 undo 연결은 미검증. 사각 셀 선택과 외부 LaTeX 가져오기 등 미구현 범위는 README 참조.
- Playwright CLI는 로컬 캐시에 없어 인앱 브라우저 도구로 수동 시나리오 검증. 모델 테스트는 자동화됨.

## 기호 추천 개선 — 2026-09-07

사용자 피드백: 기호별 드롭다운 부재로 입력이 제한됨.
Corca 공개 문서의 원문/렌더링 화면을 확인했다. 문서는 Locked 상태이므로 수정하지 않았다.

- suggestions/symbols 공통 목록 도입. 영문·한글 이름, LaTeX식 이름, 기호 모양을 검색.
- / ^ _ 강제 변환 제거. Enter/클릭 확정, 계속 입력/Space/Escape로 원문 유지.
- -> <-> >- === E A E/ 등 복합 입력은 가장 긴 기호를 우선 인식.
- 소괄호·대괄호·절댓값 및 합·곱·적분의 편집 가능한 하한/상한/본문 추가.
- 드롭다운은 커서 근처의 뷰포트 포털로 표시해 수식 스크롤 영역의 잘림을 방지.
- 모델/추천 테스트 19개, 타입 검사, 패키지와 데모 빌드 통과.
- 브라우저에서 / 두 후보와 키보드 두 번째 후보 선택, 화살표, E/, sum의 세 후보와 하한·상한·본문 입력, 괄호 후보 마우스 선택, 한글, === 적용 후 undo 원문 복원 확인.
- Corca 전체 구현과 동일하지 않음: 행렬, 변수/상수 의미 구분, 함수 적용은 후속 범위.


## 행렬·여러 줄·정렬·조건식 및 데모 렌더링 — 2026-09-07

수용 범위: 행렬 삭제 단축키, 한글 크기 후보, 2/3/4차 단위행렬, 빈 입력칸의 클릭 크기,
Enter 줄 분리와 Backspace 합치기, aligned/cases 행 편집·이력, 테스트 페이지 전용 KaTeX 미리보기.
검증 기록의 현재 기준은 packages/math-editor/VALIDATION.md이며 과거의 미구현/테스트 수 기록을 대체한다.
단일 줄 JSON을 유지하면서 additionalLines를 추가했고, 격자 두 열은 고정한다. 실제 OS IME는 요청대로 보류한다.


## 변수·숫자 상수·기호별 입력 — 2026-09-07

수용 기준: 혼합 문자열을 별도 네이티브 input으로 표시, 연속 입력과 칸별 수정,
칸 경계 이동·삭제·이력, 한글 조합 칸 유지, 기존 행렬·여러 줄·LaTeX 출력 보존.
MathText 저장 호환성을 유지하며 어휘 토큰으로 UI를 구성한다. 이름 있는 상수 지정과 의미 참조 ID는 후속이다.
검증: 토큰 단위 5개, 브라우저 4개 추가 및 기존 회귀 전체. 최신 결과는 VALIDATION.md 참조.

## 활성 input + 모델 범위 편집 완료 — 2026-09-07

일반 요소로 토큰을 렌더링하고 활성 토큰만 input으로 전환한다. 클릭/외부 blur/Escape 전환, 드래그 및 프리뷰 전체 선택, 구조 MIME+LaTeX 복사/잘라내기, 모델 삽입/대체와 undo를 구현했다. 슬롯 간 선택은 공통 구조로 확장한다. 외부 LaTeX 파싱·사각 셀 선택·Shift 방향키 범위 확장은 후속이다.
56개 단위 + 47개 Chromium 테스트, 타입 검사와 패키지/데모 빌드 통과. 인앱 브라우저의 실제 Cmd+C/V로 분수 구조 복제와 undo 확인. 실제 OS IME는 요청대로 보류.
사용자 추가 질문: cases/조건식 + Enter로 직접 호출 가능. ^는 피연산자가 있을 때 즉시 지수 이동을 권장했지만 이번 변경에서는 기존 후보+Enter 동작을 유지했다.

## 선택 감싸기 + 각도 완료 — 2026-09-07

wrapRange로 한 줄의 모델 범위를 구조에 감싸며, 분모/지수/첨자 커서와 undo를 보존한다. 복합 지수 밑에는 괄호를 추가하고 기존 구조 괄호는 중복하지 않는다. 선택 도구막대 및 상단 버튼 연결, 여러 줄/지원하지 않는 삽입 비활성화. 도/degree/각도 → °와 angle → ∠ 추천 및 LaTeX 출력 추가. 61개 단위 + 54개 브라우저 검증, 빌드/타입 검사와 실제 인앱 중첩 변환 확인.

## Bilingual UI, catalog and documentation — 2026-09-07

Added locale=ko/en to the library and a shared language selector to the demo. UI text, accessible slot names, status, matrix controls and suggestions translate without remounting the model; bilingual aliases remain available. Added 19 symbols (90 total), seven editable zero-matrix/vector/formula templates. README, IMPLEMENTATION, SUPPORT (complete table), ROADMAP, VALIDATION and LATEX-SCOPE are now English.
Verification: 71 unit + 58 Chromium tests passed; types and builds passed. Actual in-app English UI, quadratic-template rendering and locale switch with content preservation confirmed. OS IME testing remains deferred.

## Line gutter and symbol discovery — 2026-09-07

Added optional showLineNumbers (default true for multiple top-level rows), excluded from model/clipboard/LaTeX. Added localized All symbols searchable catalog with 90 glyphs, saved-caret/range insertion and isolated search clipboard/keyboard handling. SYMBOLS.md provides the requested glyph/English/Korean table; clarified English display names and differentiated uppercase Pi/Phi. 71 unit tests and 61 browser cases passed (last line-number case rerun with platform-neutral Left arrow). Type checks and builds passed; in-app catalog visual check completed.
