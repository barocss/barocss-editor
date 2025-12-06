## 키보드 이동 & Selectable 노드 스펙 (Model / editor-view-dom 기준)

이 문서는 **키보드로 Selection을 이동할 때**  
`editable` / `selectable` / `block` 정보를 어떻게 활용할지 정의한다.

- Backspace / DeleteForward 의 동작은 이미 `DeleteExtension` + `DataStore` 기반으로 정의되어 있다.
- 여기서는 **화살표 키(← → ↑ ↓)**와 Tab 등을 눌렀을 때,
  - 텍스트 커서 이동 (RangeSelection)
  - 노드 선택 이동 (NodeSelection)
  를 어떻게 수행할지에 초점을 맞춘다.

---

## 1. 기본 개념 정리

### 1.1 Editable vs Selectable (요약)

- **Editable Node**
  - `DataStore.isEditableNode(nodeId) === true`
  - Backspace / DeleteForward / 화살표 키로 **커서가 들어갈 수 있는 노드**
  - 예:
    - 텍스트 노드 (`typeof node.text === 'string'`)
    - `editable: true` 인 block (codeBlock 등)의 내부 텍스트

- **Selectable Node**
  - `DataStore.isSelectableNode(nodeId) === true`
  - **클릭 또는 키보드 이동으로 전체가 선택될 수 있는 노드**
  - 예:
    - inline-image (`group: 'inline', atom: true, text 없음`)
    - table block, widget block (`group: 'block', selectable: true`)

### 1.2 Selection 타입

- **ModelRangeSelection**
  - 텍스트 범위 또는 커서 위치
  - `type: 'range'`, `startNodeId`, `startOffset`, `endNodeId`, `endOffset`, `collapsed`

- **ModelNodeSelection**
  - 노드 전체 선택
  - `type: 'node'`, `nodeId`

editor-view-dom 은 `DOMSelectionHandler`를 통해:

- DOM Selection ↔ ModelRangeSelection / ModelNodeSelection 간 변환을 담당한다.

### 1.3 Shift / Multi-node Selection에 대한 단계적 목표

- **1단계 (현재 목표)**:
  - 키보드 이동(Arrow, Backspace, DeleteForward)은 **모두 ModelRangeSelection** 기준으로만 처리한다.
  - Shift + Arrow 역시 RangeSelection 확장만 다루고,  
    MultiNodeSelection / NodeSelection + Shift 는 다루지 않는다.
  - NodeSelection / MultiNodeSelection 은 마우스 + modifier (Ctrl/Cmd + click) 위주로 설계한다.
- **2단계 (향후)**:
  - 키보드만으로도 MultiNodeSelection 을 쌓을 수 있는 규칙을 정의할 수 있다.
  - 예: NodeSelection 상태에서 Shift + Arrow 로 인접 노드를 포함하는 멀티 선택.
  - 이 단계는 toolbar / component manager / selection-system 전체와 연동이 필요하므로  
    별도 문서/라운드에서 정의한다.

---

## 2. editor-view-dom 의 역할

### 2.1 공통 패턴 (Backspace / Delete 와 동일)

editor-view-dom 은 **키 이벤트를 직접 해석하지 않고**, 항상 다음 패턴을 따른다:

1. **DOM Selection → Model Selection 변환**
   - `this.selectionHandler.convertDOMSelectionToModel(domSelection)`
2. **적절한 Command 호출**
   - Backspace: `editor.executeCommand('backspace', { selection: modelSelection })`
   - Delete: `editor.executeCommand('deleteForward', { selection: modelSelection })`
   - 화살표/탭 이동:
     - `editor.executeCommand('moveCursorLeft',  { selection: modelSelection })`
     - `editor.executeCommand('moveCursorRight', { selection: modelSelection })`
     - `editor.executeCommand('moveCursorUp',    { selection: modelSelection })`
     - `editor.executeCommand('moveCursorDown',  { selection: modelSelection })`

> **원칙**:  
> editor-view-dom 은 **DOM ↔ Model Selection 변환 + command 디스패치만 담당**한다.  
> 실제 “어디로 이동할지 / 무엇을 선택할지”는 Extension 또는 core command 가 결정한다.

### 2.2 Selection 반영

Command 가 ModelSelection 또는 ModelNodeSelection 을 결정하면:

1. `SelectionManager` 가 내부 selection state 를 업데이트한다.
2. editor-view-dom 의 `SelectionHandler` 가 이를 DOM Selection 으로 반영한다.
   - RangeSelection → 텍스트 커서/범위로 반영
   - NodeSelection → 해당 노드 DOM 전체를 선택 영역(예: wrapper div)으로 반영

---

## 3. MoveSelectionExtension (가칭) 설계

키보드 이동은 별도의 Extension 에서 처리한다.  
여기서는 이름을 **MoveSelectionExtension** 이라고 부른다.

### 3.1 책임

MoveSelectionExtension 은 다음 command 들을 등록하고 구현한다:

- `moveCursorLeft`
- `moveCursorRight`
- `moveCursorUp`
- `moveCursorDown`

각 command 는:

1. 현재 selection (range / node) 를 입력으로 받는다.
2. `DataStore` 의 helper 를 이용해 다음 타겟을 결정한다.
   - `getPreviousEditableNode`, `getNextEditableNode`
   - `isSelectableNode`, `isEditableNode`
   - `getParent`, `getChildren`
3. 최종 ModelSelection / ModelNodeSelection 을 만들어 `SelectionManager` 에 전달한다.

### 3.2 수평 이동 (Left / Right)

#### 3.2.1 RangeSelection 상태 (텍스트 안에 커서/범위)

**케이스 1: 텍스트 안에서의 단순 이동**

- 같은 텍스트 노드 안에서는 selection-handler 의 **텍스트 오프셋 알고리즘**을 그대로 사용한다.
  - `startOffset > 0` 이면:
    - Left: `startOffset - 1`
  - `startOffset < textLength` 이면:
    - Right: `startOffset + 1`

**케이스 2: 텍스트 끝/처음에서 인접 노드로 이동**

- Left 키, `startOffset === 0`:
  1. `const prevEditable = dataStore.getPreviousEditableNode(startNodeId)`
  2. prevEditable 이:
     - **editable** 이면 → 해당 노드의 **마지막 텍스트 offset** 으로 RangeSelection 이동
     - **editable 이 아니고 selectable 이면**:
       - `ModelNodeSelection` 으로 전환 (`type: 'node', nodeId: prevEditable`)

- Right 키, `startOffset === textLength`:
  1. `const nextEditable = dataStore.getNextEditableNode(startNodeId)`
  2. nextEditable 이:
     - editable 이면 → 해당 노드의 **처음 offset 0** 으로 RangeSelection 이동
     - editable 이 아니고 selectable 이면:
       - `ModelNodeSelection` 으로 전환

> 이 때 **“editable 이 아니고 selectable 인지”** 여부는  
> `isEditableNode(nextId) === false` && `isSelectableNode(nextId) === true` 로 판별한다.

#### 3.2.1-Shift RangeSelection 확장 (Shift + Left / Shift + Right)

- **원칙**:
  - Shift + Arrow 는 항상 **RangeSelection 확장**만 담당한다.
  - NodeSelection / MultiNodeSelection 은 키보드 기반으로는 아직 지원하지 않는다.

- **같은 노드 안에서**:
  - Shift + Right:
    - focus 쪽 offset 을 `+1` 하여 `selectRange(startOffset, endOffset+1)`
  - Shift + Left:
    - focus 쪽 offset 을 `-1` 하여 `selectRange(startOffset-1, endOffset)`

- **노드 경계를 넘을 때**:
  - Right, caret 이 텍스트 끝에 있고 Shift 가 눌린 상태:
    - `getNextEditableNode(startNodeId)` 를 호출하여 다음 텍스트 노드를 찾는다.
    - 다음 텍스트 노드가 있으면:
      - `selectRangeMulti(startNodeId, startOffset, nextNodeId, 1)` 처럼  
        cross-node RangeSelection 으로 확장한다.
  - Left, caret 이 텍스트 처음에 있고 Shift 가 눌린 상태:
    - `getPreviousEditableNode(startNodeId)` 로 이전 텍스트 노드를 찾고,
    - 이전 텍스트 노드의 마지막 글자까지 범위를 확장한다.

- **inline-image 등 non-text에 대한 Shift + Arrow**:
  - 현재 단계에서는 **NodeSelection / MultiNodeSelection 로 확장하지 않는다.**
  - inline-image 구간에서 Shift + Arrow 를 눌렀을 때의 정확한 UX 는  
    selection-system / multi-node-spec 이 정리된 후 별도 라운드에서 정의한다.

#### 3.2.1-Ctrl/Alt 조합 (Ctrl/Alt + Left / Right)

- **현재 단계 정의**:
  - Ctrl/Alt 키가 눌려 있어도, 좌우 화살표의 **논리 동작은 Shift 여부만** 고려한다.
  - 즉, `Ctrl+ArrowLeft/Right`, `Alt+ArrowLeft/Right` 는  
    - Shift 가 없으면 → `moveCursorLeft/Right` 와 동일한 **한 글자 단위 이동**
    - Shift 가 있으면 → `Shift+ArrowLeft/Right` 와 동일한 **RangeSelection 확장**
- **단어 단위 이동/선택 (word-wise navigation)**:
  - 단어 단위 이동/선택 (`Ctrl+Arrow`, `Ctrl+Shift+Arrow` / macOS 에서 `Alt+Arrow`) 은  
    DataStore 의 word boundary 정의 및 i18n 이슈가 정리된 이후 별도 스펙으로 추가한다.
  - 이 스펙이 도입되기 전까지는, Ctrl/Alt 수정자는 MoveSelectionExtension 에서  
    추가적인 의미를 갖지 않는다 (브라우저 수준에서만 해석되는 키 조합 없음).

#### 3.2.2 NodeSelection 상태 (노드 전체 선택) – 향후 단계

현재 구현에서는 MoveSelectionExtension 이 **RangeSelection**만 다루며,  
NodeSelection / MultiNodeSelection 은 키보드에서 직접 생성하지 않는다.

향후 단계에서 다음과 같은 규칙을 도입할 수 있다:

- NodeSelection 상태에서 Left/Right:
  - 이전/다음 editable 노드로 RangeSelection 전환
  - 또는 인접 selectable 노드로 NodeSelection 이동
- Shift + Left/Right:
  - 인접 selectable 노드를 포함하는 MultiNodeSelection 생성

그러나 이는 toolbar, component manager, selection-system 의  
multi-node selection 스펙이 먼저 정리된 뒤에 구현한다.

---

## 4. 수직 이동 (Up / Down)

수직 이동은 DOM 레벨의 **라인 개념**과 맞추는 것이 이상적이지만, 구현 난이도가 높다.

### 4.1 현재 단계: 브라우저 네이티브 Up/Down 유지

- Up/Down 에 대해서는 당분간 **브라우저 기본 caret 이동**을 그대로 사용한다.
- editor-view-dom:
  - Left/Right, Backspace, Delete 키는 Model-first 로 가로채서 Command 로 처리한다.
  - Up/Down 키는 특별한 처리를 하지 않고 브라우저 네이티브 동작에 맡긴다.
- DOMSelection → ModelSelection 변환 시:
  - Up/Down 으로 caret 이 이동한 이후의 DOMSelection 을  
    최대한 근접한 ModelSelection 으로 정규화하되,
  - 라인 단위 정확도까지는 보장하지 않는다.

이 접근은:

- 수평 이동 / 삭제 / selectable 처리에 집중하면서,
- Up/Down 으로 인한 Selection-sync 문제를 관찰할 시간을 벌기 위함이다.

### 4.2 향후 단계: Model-first Up/Down

향후에는 다음과 같은 방향으로 Up/Down 을 Model-first 로 재정의할 수 있다:

1. `getBoundingClientRect()` 기반으로 현재 caret 의 x좌표, y좌표를 얻는다.
2. selection-handler 가 같은 x좌표를 기준으로 “위/아래 라인에서 가장 가까운 텍스트/inline 위치”를 찾는다.
3. 해당 위치를 ModelSelection 으로 변환하고, DOMSelection 을 이에 맞춰 재설정한다.

이 단계는:

- table, codeBlock, 다단계 레이아웃 등에서의 caret 동작이 충분히 관찰/정리된 뒤에  
  별도의 스펙/라운드에서 진행한다.

---

## 5. Backspace / DeleteForward 와의 상호작용

키보드 이동과 삭제는 다음 규칙을 공유한다:

- **Editable 기준 탐색**:  
  - Backspace: `getPreviousEditableNode`
  - DeleteForward: `getNextEditableNode`
  - MoveSelection: 동일한 helper 를 사용해 “다음 커서 위치”를 결정

- **Selectable 노드 처리**:
  - Delete / Backspace:
    - inline-image 같은 selectable + editable 노드는 **deleteNode / mergeTextNodes** 로 처리 (이미 구현/테스트 완료).
  - MoveSelection:
    - Arrow 키로 inline-image 에 도달하면:
      - Delete 없이 **NodeSelection** 으로만 이동.
      - 이 상태에서 Delete 키를 누르면 DeleteExtension 이 `deleteNode` 를 수행.

이렇게 분리하면:

- MoveSelectionExtension 은 **“어디로 이동할지/무엇을 선택할지”** 만 책임진다.
- DeleteExtension 은 **“선택된 것을 어떻게 지울지 / 병합할지”** 에만 집중한다.

---

## 6. 구현 및 검증 계획

1. **문서 스펙 고정 (현재 문서)**  
   - editable / selectable / block 에 따른 이동 규칙을 확정한다.

2. **MoveSelectionExtension 골격 추가 (`@barocss/extensions`)**
   - `onCreate`에서 `moveCursorLeft/Right/Up/Down` command 등록.
   - 최소 구현:
     - RangeSelection + 텍스트 안 단순 이동 (같은 노드 내 offset ±1)
     - 텍스트 끝/처음에서 `getPreviousEditableNode` / `getNextEditableNode` 호출 후:
       - editable → RangeSelection
       - selectable → NodeSelection

3. **editor-view-dom 연동**
   - `EditorViewDOM.handleArrowLeft/Right/Up/Down` (또는 key handler)에서:
     - DOM Selection → ModelSelection 변환
     - `editor.executeCommand('moveCursorLeft', { selection })` 호출로 변경.

4. **단위 테스트 (extensions 패키지)**
   - Backspace / deleteForward 테스트와 동일한 기법 사용:
     - fake DataStore + `getPreviousEditableNode`, `getNextEditableNode`, `isSelectableNode` mock.
     - MoveSelectionExtension 이 만들어내는 selection / operations 를 검증.

5. **통합 테스트 (선택 사항)**
   - editor-view-dom 레벨에서:
     - 간단한 DOM + selection 을 구성한 뒤
     - handleArrowLeft/Right 호출 → ModelSelection 변경 → DOMSelection 반영 과정을 snapshot 으로 확인.

이 계획에 따라, MoveSelectionExtension 과 editor-view-dom 의 키보드 이동이  

