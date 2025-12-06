## DOM → 모델 동기화 케이스 정리 (`contenteditable` 기반 편집)

이 문서는 `contenteditable` 환경에서 **브라우저가 먼저 DOM을 변경했을 때**  
어떻게 그 변경을 **모델에 반영할지(= DOM → 모델 동기화)**를 케이스별로 정리한다.

전제:
- **모델이 최종 소스 오브 트루스**이다.
- 그러나 `contenteditable` 특성상, **일부 순간에는 DOM이 먼저 바뀌고 모델이 따라가야 한다.**
- 이 문서는 그런 순간들을 “DOM 기원 변경(DOM-origin change)” 케이스로 정의한다.

---

## 1. 공통 규칙

### 1.1 방향성 규칙

- **모델 기원 변경 (Model-origin)**  
  - 트리거: Command 실행, DataStore API 호출, 코드에서 `editor.render()` 직접 호출  
  - 흐름: **모델 → VNode → DOM**  
  - MutationObserver에서는 **무시**하거나, 내부 플래그로 “자기 자신이 만든 변경”으로 식별하여 스킵한다.

- **DOM 기원 변경 (DOM-origin)**  
  - 트리거: 브라우저의 기본 편집 동작 (`contenteditable`), IME, 붙여넣기, 일부 키 입력  
  - 흐름: **DOM (변경 발생) → MutationObserver 감지 → 모델 patch → VNode → DOM 재렌더**  
  - 이 문서에서 다루는 케이스는 모두 DOM-origin 변경이다.

### 1.2 공통 처리 파이프라인

모든 DOM-origin 변경은 다음 파이프라인을 공통으로 사용한다.

1. **DOM 변경 감지**
   - `MutationObserver`가 `childList` / `characterData` 변화를 수집한다.
2. **대상 노드 식별**
   - `data-bc-sid` 체인을 따라 올라가서  
     어떤 `inline-text` / `block` / `decorator-root`에 대한 변경인지 식별한다.
3. **DOM selection → 모델 selection 변환 (필요 시)**
   - 변경 직후 DOM selection을 읽어서  
     `SelectionState` / `contentRange` 등 모델 선택 정보로 변환한다.
4. **텍스트/구조 diff 분석**
   - 텍스트만 변한 경우: `@barocss/text-analyzer`의 `analyzeTextChanges` 사용  
   - 구조(노드 추가/삭제/merge/split)가 변한 경우: 별도 케이스로 분류 (아래 케이스 섹션 참조)
5. **DataStore 연산으로 모델 patch**
   - 텍스트 변경 → `dataStore.range.replaceText(...)`  
   - 노드 삽입/삭제/merge → `dataStore.range.insertText`, `deleteText`, block 관련 command 등
6. **렌더링 및 selection 동기화**
   - `editor.render()`로 VNode → DOM 재생성
   - 모델 selection을 DOM selection으로 다시 매핑하여 커서/범위를 복원한다.

---

## 2. 케이스 분류 개요

DOM-origin 변경을 다음 네 가지 상위 카테고리로 분류한다.

1. **C1: 단일 `inline-text` 내부의 순수 텍스트 변경 (구조 불변)**
2. **C2: 여러 `inline-text` / 인라인 노드에 걸친 텍스트 변경 (구조는 논리적으로 동일)**
3. **C3: 브라우저가 블록 구조를 변경한 경우 (엔터/백스페이스/붙여넣기 등)**
4. **C4: 마크/스타일/데코레이터에 대한 브라우저 기원 변경**

각 케이스는 “허용 여부”와 “DataStore 연산 매핑”을 명시한다.

---

## 3. C1: 단일 `inline-text` 내부의 순수 텍스트 변경

### 3.1 정의

- 하나의 `inline-text` 노드에 대응하는 DOM 영역 안에서만 텍스트가 변경된다.
- DOM 구조(태그/중첩/마크 wrapper)는 **논리적으로 동일**하게 유지된다.
- 예:
  - `"abc"` → `"abx"` (한 글자 치환)
  - `"abc"` → `"abcd"` (삽입)
  - `"abc"` → `"ac"` (삭제)

### 3.2 감지 기준 (MutationObserver)

- `characterData` 변경이 발생하고,
- 변경된 텍스트 노드의 상위 체인에서  
  `data-bc-sid="...inline-text..."` 를 가진 노드를 찾을 수 있으며,
- `childList` 변화가 “텍스트 노드 교체” 수준에서 그친다.

### 3.3 모델 동기화 절차

1. **모델 대상 식별**
   - `data-bc-sid` → `inline-text` 노드의 `sid` → 해당 모델 노드 ID.
2. **텍스트 diff 분석**
   - 변경 전/후 DOM 텍스트를 읽어서  
     `analyzeTextChanges(prevText, nextText)` 호출.
   - 결과를 `contentRange`(startOffset, endOffset, insertedText)로 변환.
3. **DataStore 연산**
   - `dataStore.range.replaceText({ nodeId, startOffset, endOffset }, insertedText)` 호출.
   - 이미 구현된 `replaceText`는:
     - marks 분할/병합, 범위 조정
     - decorators 범위 조정 (`DecoratorOperations`)
     를 내부에서 수행한다.
4. **렌더 및 selection 복원**
   - `editor.render()` 호출
   - 변경 직전 DOM selection을 모델 selection으로 변환해 저장해 두었다가,  
     렌더 후 다시 DOM selection으로 매핑.

### 3.4 허용/비허용 판단

- **허용**: C1은 브라우저가 먼저 DOM을 바꿔도,  
  모델에서 동일한 텍스트 변화로 표현 가능하므로 적극적으로 허용한다.

---

## 4. C2: 여러 인라인 노드에 걸친 텍스트 변경 (논리 구조는 동일)

### 4.1 정의

- 사용자가 range selection을 잡고 타이핑/삭제/붙여넣기를 수행해서  
  여러 `inline-text` / mark-wrapper / decorator-wrapped 텍스트가 함께 변경된다.
- 하지만 **논리적인 인라인 구조**는 유지할 수 있다.
  - 예: `bold + italic` 마크가 전체 범위를 계속 덮는 경우
  - 예: 여러 `inline-text`가 병합되거나 쪼개져도, 결국 하나의 텍스트 런으로 볼 수 있는 경우

### 4.2 감지 기준

- `childList` + `characterData`가 **연속된 인라인 영역**에 집중되어 있고,
- 변경 전후를 비교했을 때:
  - block 경계(`<p>`, `<li>` 등)는 유지,
  - mark wrapper / decorator root의 구조는 유지 가능,
  - 텍스트 내용만 크게 달라진 경우.

### 4.3 모델 동기화 절차

1. **선택 범위 기반 `contentRange` 계산**
   - DOM selection의 anchor/focus를  
     `inline-text` + offset → 모델 selection으로 변환.
   - selection이 여러 `inline-text`를 넘나들면  
     `contentRange`가 여러 노드에 걸칠 수 있다.
2. **평탄화된 텍스트 추출**
   - selection에 해당하는 DOM 구간의 텍스트를 “평탄화(flatten)”해서 하나의 문자열로 만든다.
   - 변경 후 DOM에서 같은 범위의 텍스트를 다시 평탄화해서 비교.
3. **DataStore 연산**
   - `dataStore.range.replaceText(contentRange, nextFlatText)` 호출.
   - 이때:
     - 여러 `inline-text`와 marks가 하나의 연산으로 정규화된다.
     - marks는 `replaceText`의 mark-normalization 로직에 따라 병합/조정된다.
4. **렌더 및 selection 복원**
   - C1과 동일한 방식으로 render + selection 재설정.

### 4.4 허용/비허용 판단

- **허용**: C2도 일반적인 텍스트 편집 케이스이므로 허용한다.
- 단, 구조가 실제로 유지 불가한 경우는 C3로 분류한다.

### 4.5 광범위 selection + 타이핑 시나리오 (실시간 입력 중)

이 시나리오는 다음 조건을 만족한다:

- 사용자가 **광범위 selection**(여러 단어/여러 `inline-text`)을 잡고 바로 타이핑한다.
- IME 조합이 아니라, 키 하나마다 바로 DOM에 반영되는 **직접 입력(영문 등)** 이다.
- 입력 도중에 매 키 입력마다 모델을 조금씩 바꾸더라도,  
  **사용자 시점에서 커서/selection이 “깨지지 않고” 자연스럽게 유지**되어야 한다.

#### 4.5.1 흐름 개요

1. 사용자가 긴 범위를 선택한 상태에서 키 하나를 입력한다.
2. 브라우저는 selection 범위를 전부 지우고, 새 텍스트 노드(들)를 삽입한다.
3. MutationObserver가 이 DOM 변경을 감지한다.
4. 우리는 이 DOM 변경을 “**선택 범위 전체를 하나의 새 텍스트로 치환한 것**”으로 해석하여:
   - `contentRange`(이전 selection 범위)를 구하고
   - `range.replaceText(contentRange, insertedText)` 을 호출한다.
5. DataStore는 marks/decorators를 포함하여 모델을 업데이트한다.
6. `editor.render()`로 DOM을 재생성한 뒤,  
   **입력 후 커서 위치**에 해당하는 모델 selection을 다시 DOM selection으로 매핑한다.

#### 4.5.2 “입력 도중 다시 렌더링하면 안 된다”에 대한 해석

여기서 “다시 렌더링하면 안 된다”는 말은:

- **사용자 관점에서 커서가 튀거나, selection이 매 입력마다 이상한 곳으로 이동하면 안 된다** 는 의미이지,
- 기술적으로 `editor.render()`를 전혀 호출하지 말라는 뜻은 아니다.

우리 전략은 다음과 같다:

- **모델은 각 키 입력마다 즉시 업데이트**된다.  
  - 이유: undo/redo, 협업, Devtool, 다른 뷰(예: 미니맵/outline)와 동기화 필요.
- `editor.render()`도 각 키 입력 후 호출하되:
  - render 전에 **현재 DOM selection을 모델 selection으로 정확히 매핑**하고,
  - render 후에 **동일한 모델 selection을 DOM selection으로 복원**한다.
- 이렇게 하면:
  - 내부적으로는 “입력 → 모델 patch → render”가 매번 발생하지만,
  - 사용자 눈에는 **커서/selection이 자연스럽게 이어지는 것처럼** 보인다.

IME(한국어 등) 입력의 경우:

- 조합 중간 단계에서는 render를 최소화하거나,  
  조합 완료 시점(최종 문자열 확정)에만 C1/C2 경로로 `replaceText`를 적용하는 전략을 사용한다.
- 이 부분은 `input-event-editing-plan.md` / `input-rendering-race-condition.md` 에서  
  composition 이벤트를 사용하지 않고도 조합 완료 타이밍을 안전하게 잡는 방식과 연결된다.

#### 4.5.3 “MutationObserver만으로 가능한가?”에 대한 답

이 시나리오를 정확히 처리하려면 **MutationObserver만으로는 부족하고**, 다음이 함께 필요하다:

1. **모델의 이전 상태**
   - `prevText` / `prevMarks`는 DOM이 아니라 **모델에서 가져온다.**
   - `analyzeTextChanges(prevText, nextText)`의 `prevText`는 항상 모델 기준이다.
2. **DOM selection 정보**
   - MutationRecord만으로는 “어디가 선택되어 있었는지”를 알 수 없다.
   - 변경 직후의 **DOM selection(anchor/focus)** 을 읽어서  
     모델 selection / `contentRange` 로 변환해야 한다.
3. **입력 타입 정보 (선택적)**  
   - `beforeinput` / `keydown`에서 “이 변경이 타이핑인지, 붙여넣기인지, Enter인지”를  
     tag처럼 남겨두면, MutationObserver에서 케이스 분류(C1/C2/C3/C4)를 더 정확히 할 수 있다.

즉:

- **MutationObserver는 “무엇이 바뀌었는지(결과 DOM)”만 알려준다.**
- “**이전 상태(prev)**”와 “**선택 범위(selection)**”, “**동작의 의도(inputType/키 정보)**”는  
  **모델 + selection 레이어 + 이벤트 레이어**에서 가져와야 한다.

우리 설계에서는:

- DOM-origin 변경의 **결과**는 MutationObserver에서 읽고,
- **이전 상태/selection/행위 타입**은 이미 존재하는:
  - DataStore 모델
  - SelectionManager
  - `beforeinput`/`keydown` 처리
  에서 가져와 **C1/C2/C3/C4 케이스로 매핑**한다.

이 조합을 사용하면, 광범위 selection + 타이핑 상황에서도:

- DOM이 먼저 새로 만들어지더라도  
  → MutationObserver + 모델/selection 정보로 **정확한 `replaceText` 연산**을 만들고  
  → `editor.render()` 이후에도 **커서/selection이 자연스럽게 유지**되도록 만들 수 있다.

---

## 5. C3: 브라우저가 블록 구조를 변경한 경우

### 5.1 정의

- `Enter`, `Backspace`, `Delete`, 붙여넣기 등으로 인해  
  브라우저가 block-level 요소 구조를 바꿔버리는 경우.
- 예:
  - `Enter`로 `<p>`가 둘로 나뉨
  - `Backspace`로 두 개의 `<p>`가 병합됨
  - 붙여넣기로 `<div><p>...</p></div>` 등의 구조가 들어와 block 트리가 크게 바뀌는 경우

### 5.2 원칙

- **구조 변경은 원칙적으로 `beforeinput`에서 직접 처리**한다.  
  - `insertParagraph`, `insertLineBreak`, `historyUndo`, `historyRedo` 등은  
    `beforeinput`에서 `preventDefault()` 후 **모델 → DOM** 경로로만 처리한다.
- 따라서, MutationObserver에서 C3를 보는 경우는 다음 두 상황으로 한정한다:
  1. 브라우저/플랫폼 차이로 `beforeinput`이 오지 않았거나, inputType이 비표준인 경우
  2. 우리가 아직 처리하지 않은 특수 케이스(붙여넣기 중 block 포함 등)

### 5.3 C3 처리 전략

#### 5.3.1 가능한 경우: command 조합으로 표현

- MutationObserver가 감지한 구조 변경을  
  이미 존재하는 command들의 조합으로 표현할 수 있다면, 다음 순서로 처리한다:

1. 구조 패턴 인식
   - 예: `<p>AAA⦿BBB</p>` 에서 Enter → `<p>AAA</p><p>⦿BBB</p>`
   - 모델 selection/노드 정보와 비교하여 “이것은 insertParagraph 패턴”으로 판정.
2. 해당 command 실행
   - `editor.executeCommand('insertParagraph')`
3. 브라우저가 만든 DOM은 **무시**하고,  
   command 결과로 다시 render한 DOM을 기준으로 사용.

#### 5.3.2 표현 불가능한 경우: fallback 정책

- 붙여넣기 등으로 인해 모델 스키마에 없는 구조가 들어왔거나,  
  기존 command 조합으로 표현하기 어려운 경우:

1. **허용 가능한 텍스트/인라인만 추출**
   - block 구조는 버리고, 텍스트와 허용 인라인 요소만 평탄화.
2. block 경계를 모델 규칙에 맞게 재구성
   - 예: 현재 block을 기준으로 텍스트를 나누어 여러 paragraph로 삽입.
3. `dataStore.range.replaceText` + block 삽입 command 조합으로 모델 patch.

### 5.4 허용/비허용 판단

- **구조 변경은 원칙적으로 “모델 기원”으로만 허용**한다.  
  - 즉, C3 상황이 발생하면:  
    - 가능한 한 command 패턴으로 인식해서 “모델 기원 동작”으로 재해석한다.
    - 그렇지 못하면 fallback 정책으로 “텍스트만 안전하게 흡수”한다.

---

## 6. C4: 마크/스타일/데코레이터에 대한 브라우저 기원 변경

### 6.1 정의

- 브라우저/플랫폼에 따라 **Native Bold/Italic/Underline** 동작이  
  `contenteditable`에 직접 스타일을 입힐 수 있다.
  - 예: 사용자가 `Ctrl+B`를 누르는데, 우리가 이를 막지 못하면  
    브라우저가 `<b>`, `<strong>`, `style="font-weight: bold"` 등을 직접 삽입.
- 또한 일부 환경에서 붙여넣기 시 인라인 스타일이 그대로 들어올 수 있다.

### 6.2 원칙

- **마크/스타일/데코레이터는 모델에서만 관리**하는 것을 목표로 한다.
- 따라서, 브라우저가 직접 생성한 스타일/태그는  
  가능하면 **모델의 marks/decorators로 투영한 뒤 DOM 구조를 정규화**한다.

### 6.3 처리 전략

1. **Native 서식 단축키는 keydown에서 최대한 막는다**
   - `Ctrl+B`, `Ctrl+I`, `Ctrl+U` 등은 `keydown`에서 `preventDefault()`하고  
     `toggleMark('bold')` 등으로 처리한다.
   - 이렇게 하면 C4 발생 빈도가 크게 줄어든다.

2. **붙여넣기로 들어온 스타일 처리**
   - 붙여넣기는 MutationObserver에서 **텍스트 + 최소한의 mark 정보**만 추출하는 방향으로 설계한다.
   - 허용 정책:
     - 허용: 굵게/기울임/밑줄 등 우리가 이미 지원하는 mark에 매핑 가능한 스타일
     - 비허용: 폰트, 색상, 라인 높이 등 스키마에 없는 스타일 → 드롭 또는 별도 decorator로 매핑

3. **브라우저가 만든 태그를 모델 mark로 변환**
   - 예: `<b>텍스트</b>` → `inline-text` + `marks: [{ stype: 'bold', range: ... }]`
   - 이후 render 시에는 다시 우리가 정의한 mark wrapper 구조로만 생성한다.

### 6.4 허용/비허용 판단

- **허용**:
  - 붙여넣기 등에서 사용자 기대가 명확한 기본 서식 정보(bold/italic/underline 등)
  - 그리고 이를 모델의 mark/decorator로 정확히 매핑할 수 있는 경우
- **비허용 또는 강한 정규화**:
  - 스키마에 정의되지 않은 임의의 스타일/태그
  - 이 경우는 텍스트만 가져오거나, 최소한의 정보만 decorator로 캡슐화한다.

---

## 7. 케이스별 요약 표

| 케이스 | 예시 | 감지 방식 | DataStore 연산 | 허용 여부 |
|--------|------|-----------|----------------|-----------|
| C1: 단일 `inline-text` 텍스트 변경 | `abc` → `abx` | `characterData` + `inline-text sid` | `range.replaceText` | 허용 |
| C2: 여러 인라인에 걸친 텍스트 변경 | `bold+italic` 영역 전체 덮어쓰기 | 연속된 인라인 영역의 `childList`+`characterData` | `range.replaceText` (contentRange) | 허용 |
| C3: 블록 구조 변경 | `<p>AAA⦿BBB</p>` → `<p>AAA</p><p>⦿BBB</p>` | block-level `childList` 변경 | 가능하면 `insertParagraph` 등 command, 아니면 fallback | 제한적 허용 (command로 재해석) |
| C4: 마크/스타일/데코레이터 변경 | `<b>텍스트</b>` 삽입 | 인라인 태그/스타일 변경 | marks/decorators로 매핑 후 정규화 | 제한적 허용 (정책 기반) |

---

## 8. 추가로 고려해야 할 브라우저 기원 케이스

위의 C1–C4 외에도, 실제 브라우저/플랫폼에서는 다음과 같은 DOM-origin 케이스가 발생할 수 있다.

### 8.1 자동 교정 / Smart 기능 (오토코렉트, 스마트 인용부호 등)

**예시**:
- `"test"` → `"Test"` (문장 첫 글자 자동 대문자)
- `"` → `“` / `”` (스마트 인용부호)
- 오타 자동 수정 (`teh` → `the`) – OS/브라우저 설정에 따라

**다른 에디터들의 대응**:
- 많은 코드 에디터/리치 텍스트 에디터는 **OS/브라우저 자동 교정 기능을 끄거나 최소화**한다.
- ProseMirror/Slate 등은 텍스트 변경을 하나의 `insertText` / `deleteText` 연산으로 보아 모델에 반영한다.

**우리 쪽 정책 후보**:
- C1/C2의 **텍스트 변경 케이스로 흡수**한다.
  - 결국 “텍스트가 바뀌었다”는 점에서 동일하기 때문에,  
    `range.replaceText` 로 정규화하면 충분하다.
- 다만, 자동 교정이 marks/decorators 범위를 미묘하게 바꿀 수 있으므로  
  mark-normalization 로직이 안정적인지 테스트가 필요하다.

### 8.2 자동 링크 생성 / URL 감지

**예시**:
- `https://example.com` 을 입력했을 때 브라우저가 자동으로 `<a>`로 감쌀 수 있는 경우.

**다른 에디터들의 대응**:
- ProseMirror/Tiptap:
  - 보통 브라우저 기본 동작 대신, 자체 **InputRule** (예: URL 패턴 감지)로 링크 mark를 추가한다.
  - 즉, “브라우저가 `<a>`를 만드는 것”은 막고,  
    “모델이 link mark를 추가하도록” 설계한다.

**우리 쪽 정책 후보**:
- **원칙적으로 브라우저의 자동 링크 생성은 막는다.**
  - keydown + `beforeinput` 단계에서 가능한 한 `preventDefault()` 후  
    URL 패턴 감지는 모델/command 레벨에서 처리.
- 만약 MutationObserver에서 `<a>`가 새로 생긴 것을 감지한 경우:
  - 허용한다면: C4처럼 “스타일/태그 → decorator/mark”로 매핑.
  - 비허용한다면: 텍스트만 추출하고 `<a>`는 제거.

### 8.3 맞춤법/문법 검사 표시 (squiggly underline 등)

**특징**:
- 대부분의 브라우저/OS 맞춤법 기능은  
  **렌더링 레이어에서만 동작하고, 실제 DOM 트리를 바꾸지 않거나 별도 shadow 레이어를 사용**한다.
- MutationObserver에서 감지되지 않는 경우가 많다.

**정책**:
- DOM 트리를 바꾸지 않는 한, **완전히 무시**한다.
- 만약 특정 브라우저에서 맞춤법 표시를 위해 DOM을 건드린다면:
  - C4와 유사하게 “스키마에 없는 decorator”로 판단하고 제거/무시하는 쪽으로 정책 수립.

### 8.4 Drag & Drop (에디터 내부 / 외부에서 끌어오기)

**예시**:
- 에디터 내부에서 텍스트/블록을 드래그해서 다른 위치에 떨어뜨림.
- 외부 페이지/앱에서 텍스트/HTML을 드래그해서 붙여넣기.

**다른 에디터들의 대응**:
- ProseMirror/Slate/TinyMCE 등:
  - 보통 `drop` 이벤트를 가로채고,  
    **브라우저 기본 DnD 삽입을 막은 뒤, 자체 클립보드/insert API로 모델을 조작**한다.

**우리 쪽 정책 후보**:
- **가능하면 DnD의 기본 삽입을 막고**,  
  `drop` 이벤트에서:
  - 내부 drag면: `delete + insert` command 조합으로 모델 이동
  - 외부 drag면: 붙여넣기와 동일한 pipeline (클립보드/텍스트 정규화 → 모델 삽입)
- 만약 MutationObserver에서만 감지한 경우:
  - “붙여넣기 + 삭제” 조합으로 해석하여 C2/C3 + 붙여넣기 정책으로 처리.

### 8.5 IME 특수 케이스 (조합 중간 상태 DOM)

**특징**:
- IME 조합 중에는 브라우저가 **임시 DOM 상태**를 여러 번 만든다.
- 우리가 이미 설계한 대로:
  - composition 이벤트는 사용하지 않고,
  - 최종 확정 텍스트만 MutationObserver → `replaceText`로 처리하는 전략을 사용한다.

**추가 고려사항**:
- 일부 브라우저/플랫폼에서 조합 중간에 block 구조를 건드리는 버그/특성이 있다면,  
  C3의 정책 (구조 변경은 원칙적으로 beforeinput/command에서만 허용)을 우선하고  
  조합 중간 DOM은 최대한 무시하는 방식을 택해야 한다.

---

## 9. 다른 에디터들의 DOM-origin 처리 전략 요약

다음은 주요 에디터들이 DOM-origin 변경을 어떻게 다루는지에 대한 요약이다.

### 9.1 ProseMirror / Tiptap

- **핵심 아이디어**:
  - 가능한 한 **브라우저 기본 동작을 막고, 모든 편집을 command/keymap/inputRule로 처리**한다.
- 주요 전략:
  - `prosemirror-keymap`으로 keydown을 가로채고, 대부분의 구조 변경은 command로만 발생.
  - `beforeinput` / `input` / `composition` 이벤트와  
    `handleDOMEvents`, `handleTextInput`, `handleKeyDown` 등을 조합하여  
    “브라우저가 DOM을 망가뜨리기 전에” 개입.
  - DOMChange가 불가피한 경우(`handleDOMChange`)에도,  
    DOM을 다시 파싱해서 ProseMirror 모델로 재구성 → 다시 DOM을 재생성.
- 결론:
  - ProseMirror는 **DOM-origin 변경을 거의 허용하지 않고,  
    최대한 “DOM은 ProseMirror 모델의 projection”이 되도록 강제**한다.

### 9.2 Slate.js

- React 기반의 모델-뷰 구조:
  - React 트리가 모델을 나타내고, DOM은 그 projection.
- 입력 처리:
  - `beforeinput` 이벤트를 적극적으로 사용하여  
    대부분의 텍스트/구조 변경을 **Slate 명령어(insert_text, remove_text, insert_node 등)**로 표현.
  - 브라우저가 DOM을 먼저 바꾸는 케이스는  
    `onDOMBeforeInput`, `onKeyDown` 등에서 가로채어 모델에 먼저 반영.
- 결론:
  - Slate도 ProseMirror와 유사하게 **“가능한 한 Model-origin만 허용”**하는 경향이 강하다.

### 9.3 Lexical (Meta)

- Lexical은 **자체 노드 모델 + update queue**를 사용:
  - 모든 편집은 `editor.update(() => { ... })` 안에서 모델을 수정.
  - DOM은 reconciliation을 통해 업데이트.
- 입력 처리:
  - keydown/beforeinput/selectionchange를 정교하게 사용하고,  
    DOM 변경을 직접 신뢰하지 않는다.
- 결론:
  - Lexical도 DOM-origin 변경을 최소화하고,  
    “모델 → DOM 일방향”을 유지하려고 한다.

### 9.4 Quill / TinyMCE / CKEditor (전통적인 리치 텍스트 에디터)

- 공통점:
  - **Clipboard/Keyboard 모듈**을 따로 두고,  
    붙여넣기/키 입력을 자체 파이프라인으로 통제.
  - Delta(Quill) / 내부 모델(최소한의 구조)로 모든 변경을 표현.
  - 브라우저가 만든 HTML은 **파싱 후 정규화**해서 모델에 흡수.
- DOM-origin에 대한 태도:
  - 허용하더라도 “HTML 파싱 → 내부 모델 변환 → 다시 DOM 재생성” 경로로  
    항상 **모델을 거치도록** 설계.

---

## 10. 향후 구현 체크리스트

1. **MutationObserver → 케이스 분류 로직 구현**
   - C1/C2/C3/C4 + 8장에서 언급한 추가 케이스(자동 교정, 링크, DnD 등)를  
     식별하는 헬퍼 함수 정리.
2. **각 케이스별 DataStore 연산 구현/연결**
   - C1/C2: `range.replaceText` 경로 확인 (이미 구현됨)
   - C3: `insertParagraph`/`mergeBlock` 등과 패턴 매핑
   - C4: 스타일→mark/decorator 매핑 테이블 정의
   - 자동 링크/붙여넣기/DnD에 대한 추가 정책 구현
3. **에러/예외 로깅**
   - 분류 불가 케이스를 로그로 남겨 분석할 수 있도록 한다.
4. **테스트 케이스**
   - IME 입력, 붙여넣기, 엔터/백스페이스, Native Bold/Italic,  
     자동 교정/스마트 인용부호, URL 자동 링크, DnD, 복잡한 마크 조합 등
   - DOM 기원 변경이 모두 올바르게 모델 patch로 귀결되는지 검증한다.
5. **정책 문서와 구현 동기화**
   - 이 문서의 케이스 정의(C1–C4 + 8.x)가  
     실제 `MutationObserver` 구현, `input-handler`, `RangeOperations`와 일치하는지  
     주기적으로 검증한다.

이 문서는 다른 에디터(ProseMirror, Slate, Lexical, Quill 등)의 전략을 참고하여  
우리 에디터에서 발생 가능한 DOM-origin 케이스를 최대한 포괄적으로 정리하는 것을 목표로 한다.


이 문서의 목표는 “브라우저가 먼저 DOM을 변경하는 모든 상황”을  
명시적으로 케이스 분류하고, 각 케이스를 **구체적인 DataStore 연산과 연결**하는 것이다.


