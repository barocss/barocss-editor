# 편집 가능 영역과 contenteditable 전략

스키마별 contenteditable 적용 여부, ProseMirror식 contenteditable=false와 한글 IME 깨짐, 그리고 “입력 허용 영역”을 inline-text 등으로 제한하는 방식에 대한 정리.

---

## 1. contenteditable=false 형태로 스키마에 대응되는 컴포넌트를 관리해야 하는가?

### 1.1 ProseMirror 방식

- **NodeView**에서 노드 타입별로 DOM을 직접 만든다.
- **편집 불가 노드**(이미지, 비디오, 임베드, 코드 블록 등)에는 **contenteditable=false**를 붙인다.
- **contenteditable=true**는 “텍스트가 들어가는 컨테이너”에만 둔다.
- 효과: 브라우저가 해당 노드에 커서를 두지 않고, 해당 영역에 직접 문자 입력이 들어가지 않는다. 구조가 스키마와 1:1로 맞기 쉬움.

### 1.2 BaroCSS 현재 구조

- **루트 한 개**만 contenteditable=true (`layers.content`).
- 블록·인라인 모두 **같은 contenteditable 영역** 안에 있고, **data-bc-sid / data-bc-stype**으로 노드 타입을 구분한다.
- “편집 불가” 노드는 **별도 contenteditable=false**를 두지 않고, **이벤트/입력 처리 단계에서 “여기서는 입력 무시”**로 제어할 수 있다.

### 1.3 스키마 대응 컴포넌트를 contenteditable=false로 관리할지

**선택지**

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. 루트만 contenteditable=true (현재)** | 한글/IME가 “한 편집 영역”에만 붙어서 조합 깨짐 가능성이 낮음. 구현 단순. | “입력 불가 영역”은 **이벤트 단계**(keydown/compositionstart 등)에서 막아야 함. |
| **B. 노드별 contenteditable=true/false (ProseMirror식)** | 브라우저가 “편집 불가” 영역에 입력을 받지 않음. 스키마와 DOM이 잘 대응. | **선택이 true/false 경계에 걸치면** 한글 IME 조합이 깨지는 문제가 보고됨(§2). |

**정리**

- **지금 단계에서는 A 유지**가 안전하다.  
  - “입력 허용 영역 = inline-text 내부만” 등은 **이벤트에서 제한**하는 쪽으로 가면, contenteditable=false를 도입하지 않아도 된다.
- **나중에** 이미지/임베드 등 “완전히 편집 불가” 블록을 **contenteditable=false**로 두고 싶다면,  
  - **선택이 해당 노드에만 완전히 갇혀 있을 때**만 사용하고,  
  - **선택이 블록 경계/여러 노드에 걸치지 않도록** 정규화하거나,  
  - **경계에 걸친 선택 + 한글 입력** 시에는 **preventDefault + model 반영 + 우리 render**로만 처리하는 경로를 두는 식으로 IME 깨짐을 줄여야 한다.

---

## 2. ProseMirror식 contenteditable=false일 때 선택 후 한글 입력이 깨지는 이유

### 2.1 현상

- **선택(collapsed 또는 range)**이 **contenteditable=true**인 노드와 **contenteditable=false**인 노드에 걸치거나,  
  또는 **블록 경계**에 걸친 상태에서 한글을 입력하면,  
  **조합 중에 글자가 잘못 들어가거나(ㄱㅏ나다라), 마지막 글자가 사라지는** 등 IME가 깨진다.

### 2.2 원인 요약

- **IME(조합 입력)**은 “현재 선택/포커스가 있는 **편집 가능한 한 영역**”을 전제로 동작한다.
- **contenteditable=true/false가 섞인 DOM**에서는:
  - selection이 **여러 편집 영역에 걸치거나**,
  - 브라우저가 **composition을 “어느 노드에 붙일지”** 애매하게 해석하면서,
- **compositionstart → compositionupdate → compositionend**와 **beforeinput/input**의 **순서·대상**이 꼬인다.
- 특히 **Safari**는 compositionend와 input 순서가 스펙과 다르고, **Android**는 CompositionEvents 의존도가 높아서, **영역이 나뉘어 있으면** 조합 상태 기계가 깨지기 쉽다.

### 2.3 ProseMirror 쪽 보고

- NodeView에서 **contenteditable=false**를 쓰면 **커서가 해당 노드를 건너뛰는** 동작이 있고,
- **한글/일본어 등 IME** 사용 시 **선택 후 첫 글자 조합이 깨지는** 이슈가 있다.
- 대응으로 **composition 이벤트와 타이밍을 세밀하게 제어**하는 플러그인/패치가 필요하다는 식의 논의가 있다.

### 2.4 BaroCSS에 대한 함의

- **contenteditable=false를 노드 단위로 도입하면** “선택 + 한글 입력” 경로에서 **동일한 종류의 IME 깨짐**을 겪을 수 있다.
- **루트 하나만 contenteditable=true**로 두고, **“어디서 입력을 받을지”는 이벤트 단계에서만 제한**하는 편이, 한글/IME 관점에서는 위험을 줄인다.

---

## 3. contenteditable=false 없이 “입력 허용 영역”만 제한하기

### 3.1 목표

- **DOM 구조는 그대로 두고**(모든 콘텐츠가 한 contenteditable 안에 있음),
- **실제로 문자가 반영되는 곳**은 **inline-text(또는 스키마에서 정한 “텍스트 노드”) 내부로만** 한정한다.
- 블록 경계, 빈 블록, 이미지 옆 등 **입력되면 안 되는 곳**에서는 **keydown/compositionstart 등에서 입력을 막는다**.

### 3.2 “입력 허용” 판단

- **현재 selection(또는 포커스)**이 **어느 노드에 있는지**를 DOM→model 매핑으로 확인한다.
- **anchorNode / focusNode**에서 **closest('[data-bc-sid]')**로 sid를 찾고, **dataStore.getNode(sid)**로 **stype**을 본다.
- **stype === 'inline-text'**(또는 스키마에서 “텍스트 입력 허용”으로 정의한 타입)이면 **허용**, 아니면 **차단**.

**range selection인 경우**

- **start/end 모두** “입력 허용 노드” 내부인지,  
  또는 **교체될 범위 전체**가 우리가 정의한 “텍스트 노드” 범위 안인지 정책을 정한다.  
  지금은 **collapsed일 때 “현재 커서가 inline-text 안인가?”**만으로도 “입력 허용 영역 제한”의 대부분을 만족할 수 있다.

### 3.3 어디서 막을지: keydown vs compositionstart

| 이벤트 | 역할 | 한글/IME |
|--------|------|----------|
| **keydown** | “문자 입력” 키(알파벳, 한글 키 등)에서 **preventDefault**하면 **문자가 DOM에 안 들어감**. | **영문/숫자**는 keydown에서 막으면 입력 자체가 안 들어가서 안전. **한글**은 keydown이 IME에 먼저 넘어가고, **compositionstart**가 나중에 오므로, **keydown에서 막아도** 일부 브라우저에서는 **이미 composition이 “잘못된 영역”에 붙은 뒤**일 수 있음. |
| **compositionstart** | IME가 **조합을 시작**할 때 한 번 발생. | **Safari**는 이벤트 순서가 **compositionstart → … → (나중에) compositionend, input** 식이라, **조합이 시작되는 시점**에 “지금 커서가 inline-text가 아니다”면 **여기서 preventDefault**해서 **조합 자체를 붙이지 못하게** 하는 편이 한글 깨짐을 줄이는 데 유리하다는 보고가 있다. |

### 3.4 Safari와 “compositionstart에서 막기”

- Safari(macOS/iOS)에서는 **compositionend와 input 순서**가 달라서, **beforeinput.isComposing**만으로는 “조합 중/직후”를 신뢰하기 어렵다(기존 `input-and-composition-review.md` §2).
- **한글 입력을 “입력 불가 영역”에서 막으려면**  
  - **keydown**에서 막으면: **영문 등**은 확실히 막지만, **한글**은 IME가 먼저 key를 먹고 composition이 시작된 뒤에야 우리가 알 수 있어서, **keydown 시점에는 이미 “조합이 잘못된 노드에 붙을” 수 있음.**  
  - **compositionstart**에서 **“현재 selection이 inline-text가 아니다”**면 **preventDefault** (및 필요 시 **stopPropagation**) 하면, **조합이 시작되자마자** 차단할 수 있어서, Safari에서도 **한글 입력이 잘못된 영역에 붙는 것**을 줄일 수 있다.

**권장**

- **keydown**:  
  - “문자 입력”으로 볼 수 있는 키(문자, 숫자, 공백 등)에서 **현재 커서가 inline-text가 아니면 preventDefault**.  
  - **이미 조합 중**이면(keyCode 229 또는 _isComposing) **keydown에서는 막지 않고** composition 쪽에 맡긴다.
- **compositionstart**:  
  - **현재 anchorNode/focusNode가 inline-text(또는 허용 stype) 하위가 아니면 preventDefault**.  
  - Safari 포함해 “조합이 잘못된 영역에 붙는” 경우를 줄이기 위해 **compositionstart에서 한 번 더 검사**하는 것이 좋다.

### 3.5 구현 시 위치·흐름

- **EditorViewDOM** (또는 입력을 총괄하는 곳)에서:
  - **keydown**:  
    - `_isComposing` 또는 keyCode 229면 **문자 입력 차단 로직 스킵**.  
    - 그 외 “문자 입력” 키에서 **selection → closest('[data-bc-sid]') → getNode(sid).stype**이 **inline-text가 아니면** **preventDefault**.
  - **compositionstart** (리스너 다시 등록):  
    - **selection 기준으로** 위와 동일하게 **inline-text가 아니면 preventDefault**.
- **beforeinput** (insertText / insertReplacementText):  
  - getTargetRanges() 등으로 “대상이 inline-text 범위인지” 확인하고, **아니면 preventDefault**로 보강할 수 있다(기존 getTargetRanges 도입 후).

### 3.6 정리

- **contenteditable=false를 쓰지 않고** “입력 허용 영역 = inline-text 내부만”으로 두려면:
  1. **keydown**에서 “문자 입력” 키 + **커서가 inline-text가 아님** → **preventDefault**.
  2. **compositionstart**에서 **같은 조건**으로 **preventDefault** (Safari 등 한글 IME 안정화).
  3. (선택) **beforeinput**에서 insertText/insertReplacementText 시 **대상 범위가 허용 영역인지** 검사 후 **preventDefault**.
- 이렇게 하면 **한 개의 contenteditable**만 유지하면서도, **입력이 일어나면 안 되는 영역**에서는 입력이 들어가지 않게 할 수 있다.

---

## 4. 요약 표

| 주제 | 결론 |
|------|------|
| **스키마별 contenteditable=false** | ProseMirror처럼 쓰면 구조는 명확하지만 **선택+한글 입력 시 IME 깨짐** 위험이 있음. BaroCSS는 **당분간 루트만 contenteditable=true**로 두고, **입력 허용 영역만 이벤트로 제한**하는 쪽이 안전함. |
| **선택 후 한글 깨짐** | **contenteditable=true/false가 섞인** 구간에서 selection이 걸치면, IME가 “어느 영역에 조합을 붙일지” 애매해져서 깨짐. **한 편집 영역**만 두면 이 문제를 줄일 수 있음. |
| **입력 허용 영역 제한** | **keydown**으로 “문자 입력” 키 차단 + **compositionstart**에서 “inline-text가 아니면” 차단. Safari는 **compositionstart에서 막는 것**이 한글 입력을 잘못된 영역에 붙지 않게 하는 데 유리함. |

---

## 5. 코드에서 할 수 있는 것 (우선순위)

### 5.1 입력 허용 영역 검사 유틸

- **위치**: `packages/editor-view-dom` (예: selection-handler 또는 input-handler 인근).
- **내용**:  
  - `isSelectionInsideEditableText(domSelection?: Selection): boolean`  
  - anchorNode/focusNode에서 closest('[data-bc-sid]') → getNode(sid) → stype === 'inline-text' (또는 스키마에서 정의한 “텍스트 입력 허용” 타입).
- **용도**: keydown, compositionstart, (선택) beforeinput에서 공통 사용.

### 5.2 keydown에서 “문자 입력” 차단

- **위치**: `EditorViewDOM.handleKeydown` (또는 InputHandler에 위임).
- **내용**:  
  - **이미 조합 중**(_isComposing 또는 keyCode 229)이면 **차단 로직 스킵**.  
  - “문자 입력”에 해당하는 키(문자, 숫자, 공백 등; 제어/탐색 키 제외)에서 **isSelectionInsideEditableText() === false**이면 **event.preventDefault()**.

### 5.3 compositionstart 리스너 등록 + 차단

- **위치**: `EditorViewDOM` (contentEditableElement에 compositionstart 등록).
- **내용**:  
  - **compositionstart**에서 **isSelectionInsideEditableText() === false**이면 **event.preventDefault()** (필요 시 stopPropagation).  
  - 기존 IME 보강(compositionstart/end로 _isComposing 유지)과 함께 두면, “조합 시작” 시점에 잘못된 영역을 차단할 수 있음.

### 5.4 문서 참고

- **입력/IME 전반**: `docs/input-and-composition-review.md`  
- **편집 가능 영역·contenteditable 전략**: 본 문서.
