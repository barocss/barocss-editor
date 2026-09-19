# Note 수식 편집

본문에는 KaTeX로 수식을 표시하고, 구조 편집은 공통 팝업에서 제공한다. 문서의 텍스트 선택과 수식 내부의 선택·실행 취소가 충돌하지 않도록 팝업마다 별도의 math session을 사용한다.

## 사용 흐름

- `/` 메뉴에서 블록 수식 또는 인라인 수식을 추가한 뒤, 빈 수식을 클릭하면 시각 편집기가 열린다.
- 기존 수식은 더블클릭하거나 포커스 후 Enter를 누르면 편집한다. 한 번 클릭하면 크기·정렬·편집 도구가 나타난다.
- 시각 편집에서 분수, 루트, 지수, 첨자, 합, 적분, 행렬, 조건식, 등호 정렬을 사용한다. `모든 수식 도구`에서 나머지 구조를 선택한다.
- `LaTeX 원문`에서 입력하고 `시각 편집`으로 전환하면 패키지의 LaTeX 로드 기능을 사용한다. 지원하지 않는 구문은 오류 위치를 알리고 원문을 유지한다.
- `수식 적용`으로 저장한다. 취소·닫기는 문서에 편집 초안을 반영하지 않는다.

## 공통 모듈 계약

`math-editor`는 LaTeX 파서, 구조 모델, 세션과 렌더러를 소유한다. `office-editor-ui`는 팝업, 모드 전환과 문서 적용을 연결한다. Note는 삽입 메뉴와 문서 스키마를 소유한다.

기존 `mathDocument` JSON은 검증 후 LaTeX와 일치할 때만 사용한다. 그렇지 않으면 `parseLatex`로 원문을 불러온다. 변경된 원문은 `MathEditorHandle.importLatex`로 가져오며, 변환 실패 시 기존 세션은 보존된다. 단순한 모드 전환은 세션과 실행 취소 이력을 초기화하지 않는다.

문서를 열기만 해서는 원문을 정규화하지 않는다. 실제 구조 편집 또는 변경된 원문 가져오기가 일어났을 때만 패키지의 LaTeX 출력과 JSON을 초안에 반영한다. 적용은 기존 `setMathSource` 명령으로 한 번에 기록한다. 인라인 수식은 최상위 한 줄만 허용하며 행렬·분수 내부 구조는 편집할 수 있다.

## 검증과 범위

브라우저에서는 기존 원문 로드, 분수/행렬/조건식 편집, 취소, 저장 후 재열기, 편집 이력, 미지원 구문 보존, 인라인 줄 제한, 크기·정렬, 수식 앞뒤 커서와 범위 선택을 검증했다. 820px 화면에서 도구를 펼쳐도 적용 버튼이 보이는지 확인했다.

브라우저6개, Note 명령/교환/입력 규칙36개, 공통 미리보기3개가 통과했고 패키지와 Note 빌드가 성공했다. 전체 공유 TypeScript 검사에는 기존 의존 패키지 진단이 남아 있다. 임의의 TeX 문법 지원과 본문 안에서의 직접 구조 편집은 이번 범위에 포함하지 않는다.


## 2026-09-08 popup correction (supersedes the basic/expanded native toolbar above)

Note now uses the same React MathEditor as the math demo, including its rich toolbar, symbol browser, templates, token hints and descriptive suggestions. Source/visual switches keep the editor mounted and retain history. The source tab uses showPopovers=false to hide portaled menus.

Mode controls use common RibbonTabs. Font size is edited through the document context toolbar; the modal preview uses18px. The duplicate LaTeX result panel is removed. Both renderers use positionMathMenu to correct transformed modal coordinates, constrain overlays to the modal/viewport, and choose direction independently of candidate count. Text selection wrap menus support ArrowUp/ArrowDown/Enter and scroll the active option.

Verified: Note workflows4 checks, popup geometry/keyboard3 checks, standalone math-demo React import2 checks; math-editor and Note builds. Whole shared TypeScript checking still has existing dependency diagnostics; modified math UI files have none.


## 2026-09-08 Note 본문 직접 편집 — 현재 동작

이 절은 위의 팝업 기본 진입 및 본문 직접 편집 제외 설명을 대체한다. Word의 기본 팝업 진입은 유지한다.

- Note에서 수식을 클릭하거나 수식 버튼에 Enter를 누르면 그 자리에서 React MathEditor로 편집한다. 빈 수식도 바로 입력할 수 있다.
- 입력·삭제·방향키·선택·실행 취소는 수식 초안에서 처리한다. 자동완성이 열려 있으면 방향키/Enter는 후보를 선택하고 Escape는 후보를 닫는다. 이후 Enter는 문서에 적용하고 Escape는 취소한다. 문서에는 적용 시 한 번의 이력으로 기록한다.
- 수식에 포커스가 있을 때 Note의 서식/블록/표/슬래시 도구와 수식 문서 설정 도구를 숨긴다. 수식 편집기의 자동완성과 선택 도구는 유지한다. Note 설정 도구에는 분수·루트·지수 명령을 중복 배치하지 않는다.
- 포커스가 수식 밖으로 나가면 크기·블록 정렬·크게 편집·완료·취소 도구를 사용할 수 있다. 외부 클릭은 초안을 적용한다. 크게 편집은 초안을 팝업으로 전달하며, 팝업 취소는 원본을 유지한다.
- `--me-font-size`가 토큰 미리보기와 입력란, 지수/첨자의 상대 크기를 함께 제어한다. 커서 진입으로 글자 크기가 바뀌지 않는다.

공통 DOM view는 `data-editor-input-owner` 하위 입력·클립보드·조합 이벤트, 내부 선택과 DOM 변경을 본문의 편집으로 해석하지 않는다. 중첩 편집기는 명시적 명령으로 결과를 반영한다. React 이벤트 전파 차단만으로 이 경계를 대신하지 않는다. 적용 중 호스트가 다시 렌더링되어도 편집 세션은 종료한다. 조합 중 외부 클릭 적용은 compositionend 이후 최종 초안을 전달한다.

검증: Note 브라우저14개(범위별 실행), 공유 DOM 입력 회귀78개, math-demo2개 통과. math-editor 및 Note 빌드 성공. 공유 TypeScript 전체 검사에는 기존 진단이 남으며 이번 수식 UI 변경의 진단은 없다. 조합 이벤트 경계는 자동 검증했으나 실제 OS 한글 입력기 테스트는 수행하지 않았다.


### 읽기/편집 수식 크기 일치

Note의 본문 수식은 읽기 상태에서도 display 수식 스타일을 사용해 최상위 분자·분모를 편집기와 같은 기준 크기로 표시한다. 수식 원자는 CSS로 문장 안의 배치를 유지한다. KaTeX의 기본1.21배 글자 확대도 이 경로에서는 적용하지 않아 문서에서 지정한 크기를 따른다. LaTeX 원문은 바꾸지 않는다. 일반 문장용 분수의 약70% 축소와 편집기의 전체 크기 분수가 다르게 보이던 문제를 해결했다. 분수/일반 항의 실제 크기, 편집 진입 크기와 앞뒤 문장의 같은 줄 배치를 브라우저 테스트로 확인했다.

Enter 또는 완료 버튼으로 본문 입력에 복귀할 때는 수식 선택 팝업을 자동으로 열지 않는다. 수식 뒤에 커서를 두고 바로 타이핑을 이어간다. 외부 클릭/취소로 종료하는 기존 도구 흐름은 유지한다. Enter 이후 팝업 부재, 이어쓰기·실행 취소 및 외부 클릭 저장을 브라우저 회귀 테스트로 확인한다.
