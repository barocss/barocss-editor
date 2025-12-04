## 입력 처리 구현 가이드 (이벤트 → DOM → 모델 통합)

이 문서는 다음 두 설계 문서를 **실제 코드에 어떻게 적용할지**를 정리한다.

- `input-event-editing-plan.md`  
- `dom-to-model-sync-cases.md`

목표:
- 어떤 **패키지 / 클래스 / 함수**를 사용해서  
  `브라우저 입력 → DOM → MutationObserver → DataStore → render` 흐름을 구현할지 명확히 한다.

---

## 1. 전역 아키텍처 개요

### 1.1 계층별 책임

- `apps/editor-test/src/main.ts`
  - 데모/테스트용 앱 부트스트랩, `Editor` + `EditorViewDOM` 생성.

- `packages/editor-core`
  - `Editor` (명령/History/이벤트 허브)
  - `DataStore` (문서/marks/decorators/RangeOperations)
  - `Command`/`Extension` 시스템

- `packages/editor-view-dom`
  - `EditorViewDOM` (DOM 기반 뷰 + 이벤트 레이어)
  - `InputHandlerImpl` (입력 이벤트 → DOM/모델 동기화)
  - SelectionManager (DOM selection ↔ 모델 selection)
  - MutationObserver 래퍼 (`mutation-observer-manager.ts`)
  - Keymap/KeyBinding (키 이벤트 처리)

- `packages/dom-observer`
  - 저수준 `MutationObserver` 도우미 (브라우저 DOM 변경 수집)

- `packages/datastore`
  - `RangeOperations.replaceText` / `deleteText` / DecoratorOperations
  - mark 연산/정규화

렌더링/리컨실은 이미 구현되어 있으므로,  
여기서는 “**입력 → DOM → 모델 patch → render 트리거**”에 집중한다.

---

## 2. 입력 이벤트 레이어 구현 (EditorViewDOM)

### 2.1 핵심 클래스: `EditorViewDOM`

위치:
- `packages/editor-view-dom/src/editor-view-dom.ts`

역할:
- 실제 DOM 노드(`contenteditable` root)에 대한 이벤트 리스너를 등록.
- `InputHandlerImpl`, SelectionManager, KeymapManager를 생성/연결.
- `editor.emit('editor:content.change', ...)` 를 받아 render를 트리거.

필수 구현/정리 포인트:

1. **이벤트 리스너 등록**
   - `setupEventListeners()` 내부에서 다음을 DOM root에 등록:
     - `beforeinput`
     - `keydown`
     - `selectionchange` (보통 `document` 기준)
   - 각 이벤트는 `InputHandlerImpl` 또는 KeyBindingManager로 전달.

2. **SelectionManager 연동**
   - DOM selection 변경 시:
     - DOM → 모델 selection 변환 (이미 구현된 selection 유틸 사용)
     - `editor.selectionManager.setSelection(modelSelection)`
     - `editor.emit('editor:selection.change', { selection })`

3. **MutationObserverManager 연동**
   - `EditorViewDOM` 생성 시 `MutationObserverManager` 인스턴스를 만들고,
   - content root와 연동하여 DOM-origin 변경을 `InputHandlerImpl`에게 전달.

---

## 3. InputHandler 구현 (브라우저 이벤트 → DOM/모델)

### 3.1 클래스: `InputHandlerImpl`

위치:
- `packages/editor-view-dom/src/event-handlers/input-handler.ts`

역할:
- `beforeinput` / `keydown` / MutationObserver 3가지 소스를 모두 받아서,  
  `input-event-editing-plan.md` 에 정의된 파이프라인을 실행한다.

권장 인터페이스(이미 일부 존재):

```ts
export class InputHandlerImpl {
  constructor(
    private readonly editor: Editor,
    private readonly view: EditorViewDOM,
    private readonly dataStore: DataStore,
  ) {}

  handleBeforeInput(event: InputEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
  handleDomMutations(mutations: MutationRecord[]): void;
}
```

### 3.2 `handleBeforeInput` 구현 지침

문서 참조: `input-event-editing-plan.md` 4장, 6장

- 처리 대상:
  - `insertParagraph`, `insertLineBreak`, `historyUndo`, `historyRedo` 등 **구조 변경/히스토리**만 담당.
- 단계:
  1. `event.inputType` 스위치:
     - 구조 변경이면 `event.preventDefault()`
     - 텍스트 입력/삭제 등은 **prevent 하지 않고** 브라우저에 맡김.
  2. SelectionManager에서 최신 모델 selection 획득.
  3. DataStore/Command 호출:
     - `insertParagraph` → ParagraphExtension/Block 관련 command (`editor.executeCommand('insertParagraph')`)  
       또는 직접 `dataStore.range.splitNode(...)`.
     - `insertLineBreak` → `dataStore.range.insertText(..., '\n')` 또는 line-break 노드 삽입.
     - `historyUndo/Redo` → `editor.history.undo()/redo()`.
  4. `editor.render()` + selection 복원.

### 3.3 `handleKeyDown` 구현 지침

- 역할:
  - `KeyBindingManager`를 통해 단축키(Command) 처리 (Bold/Italic/Undo/Redo 등).
  - `getKeyString(event)`로 문자열 키 생성 → `keyBindingManager.getBindings(key)`.
- 구현 위치:
  - Key parsing: `EditorViewDOM` 내부의 `getKeyString` 유틸 or 별도 유틸.
  - Binding 조회/실행: 향후 `KeyBindingManager` 구현 시 이쪽으로 위임.

### 3.4 `handleDomMutations` 구현 지침

문서 참조: `dom-to-model-sync-cases.md`

- 역할:
  - DOM-origin 변경(C1~C4 + 8.x 케이스)을 분류하고,  
    해당하는 DataStore 연산(`replaceText`, `deleteText`, marks/decorators 조정 등)을 호출.
- 흐름:
  1. `mutations` 를 순회하여 `characterData` / `childList` 중심으로 정리.
  2. 각 mutation에 대해:
     - 대상 노드의 `data-bc-sid`로 **어떤 모델 노드**에 해당하는지 찾기.
     - DOM selection/이전 selection 정보와 결합하여  
       C1/C2/C3/C4/8.x 중 어떤 케이스인지 판정.
  3. 케이스별로:
     - C1/C2 → `dataStore.range.replaceText(contentRange, newText)`
     - C3 → 가능하면 command 패턴 인식(`insertParagraph`, `mergeBlock` 등), 아니면 fallback 텍스트 흡수.
     - C4 → 스타일/태그를 marks/decorators로 매핑.
  4. 모델 patch 후:
     - 필요 시 `editor.render()` 호출
     - SelectionManager를 통해 selection 동기화.

---

## 4. DOM → 모델 동기화에 사용하는 핵심 API

### 4.1 DataStore: 텍스트/마크/데코레이터 연산

위치:
- `packages/datastore/src/operations/range-operations.ts`

핵심 함수:
- `range.replaceText(contentRange, newText)`
  - 텍스트 변경의 대부분(C1/C2/IME 최종 결과, 붙여넣기, 자동 교정)을 이 하나로 처리.
  - 내부에서:
    - marks 범위 조정/병합 (`mark-operations`)
    - decorators 범위 조정 (`DecoratorOperations`)
    - normalize 옵션으로 중복/빈 marks 정리
- `range.deleteText(contentRange)`
  - Backspace/Delete/단어 삭제 등 C2/C3 일부에 사용.

### 4.2 SelectionManager

위치:
- `packages/editor-core` (Selection 상태)
- `packages/editor-view-dom` (DOM ↔ 모델 변환 유틸)

역할:
- `selectionchange` 시 DOM selection → 모델 selection 변환
- render 후 모델 selection → DOM selection 복원
- C2/C3/C4 판정 시 **contentRange 계산의 기준**이 된다.

### 4.3 dom-observer (저수준 MutationObserver)

위치:
- `packages/dom-observer`
- `packages/editor-view-dom/src/mutation-observer/mutation-observer-manager.ts`

역할:
- 실제 `MutationObserver`를 만들고, 등록된 콜백으로 변경 사항을 전달.
- `EditorViewDOM` / `InputHandlerImpl` 에서 이 콜백을 받아 `handleDomMutations` 호출.

---

## 5. 케이스 분류 로직을 둘 위치

문서 기준:
- 케이스 정의: `dom-to-model-sync-cases.md` (C1~C4, 8.x)

구현 위치 제안:

1. **헬퍼 모듈 추가**
   - 파일 예시: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts`
   - 책임:
     - `classifyDomChange(mutations, selection, modelSnapshot) → { type: 'C1' | 'C2' | 'C3' | 'C4' | 'AUTO_LINK' | ... , payload }`
     - InputHandler는 이 결과만 보고 DataStore/Command를 호출.

2. **InputHandlerImpl에서 사용**
   - `handleDomMutations` 내부:

   ```ts
   const classification = classifyDomChange(mutations, selectionManager.current, dataStoreSnapshot);

   switch (classification.type) {
     case 'C1':
     case 'C2':
       dataStore.range.replaceText(classification.contentRange, classification.newText);
       break;
     case 'C3':
       // insertParagraph / mergeBlock 등 command 실행
       break;
     case 'C4':
       // marks/decorators 업데이트
       break;
     // ...
   }
   ```

이렇게 하면, 케이스 정의(문서)와 실제 구현 사이의 연결 지점을 한 파일에서 관리할 수 있다.

---

## 6. IME/한글 입력과의 연결

문서 참조:
- `input-event-editing-plan.md` 7장 (IME 입력 처리 전략)
- `input-rendering-race-condition.md`
- `dom-to-model-sync-cases.md` 8.5

구현 포인트:

1. composition 이벤트는 사용하지 않지만:
   - `beforeinput` 의 `insertCompositionText` / `insertText` 를  
     “조합 중/조합 완료” 힌트로만 사용.
2. MutationObserver에서는:
   - 조합 **중간** 변경은 가능한 무시하거나 보류.
   - 조합 **완료** 시점의 최종 DOM 텍스트만 C1/C2 경로로 `replaceText`.
3. SelectionManager는:
   - 조합 완료 후 selection을 정확히 모델 selection으로 옮기고,
   - render 후 다시 DOM selection으로 복원.

핵심은:
- **IME 중간 상태는 최대한 건드리지 않고**,  
  최종 결과만 DOM → 모델로 동기화한다는 점이다.

---

## 7. 구현 순서 (실제 작업용 체크리스트)

1. `EditorViewDOM`에서 이벤트/MutationObserver/SelectionManager 연결 구조 정리
2. `InputHandlerImpl`에:
   - `handleBeforeInput`, `handleKeyDown`, `handleDomMutations` 3개 진입점 정리
3. `dom-change-classifier.ts` (또는 유사 모듈) 추가:
   - C1~C4 + 8.x 케이스 분류 헬퍼 구현
4. DataStore 연산 경로 확인:
   - `range.replaceText`, `deleteText`, marks/decorators 정규화
5. 간단한 시나리오부터 테스트:
   - C1: 단일 inline 텍스트 입력/삭제
   - C2: 넓은 selection + 덮어쓰기
   - C3: Enter/Backspace 통한 단락 분리/병합 (`beforeinput` 경로)
   - C4: 붙여넣기 + 기본 mark 변환
6. IME/한글 입력, 자동 교정/링크, DnD 등 엣지 케이스 순차 검증

이 가이드는 설계 문서(`input-event-editing-plan.md`, `dom-to-model-sync-cases.md`)와  
실제 코드 구조를 하나의 흐름으로 연결하기 위한 “브릿지 문서”로 사용한다.


