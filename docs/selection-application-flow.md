# Selection 적용 흐름 (Selection Application Flow)

이 문서는 트랜잭션 결과로 나온 `selectionAfter`가 **Model → Editor Core → View(DOM/React)** 에 어떻게 적용되는지 단계별로 기술한다.

---

## 1. 개요

- **Model**: 트랜잭션 실행 후 `selectionAfter`(ModelSelection)가 결정된다.
- **적용 여부**: 트랜잭션 옵션 `applySelectionToView`로 View에 반영할지 제어한다.
- **Editor Core**: `editor.updateSelection(selectionAfter)`가 호출되면 SelectionManager에 저장하고 `editor:selection.model` 이벤트를 발생시킨다.
- **View**: `editor:selection.model` 구독자가 ModelSelection을 DOM Selection으로 변환해 브라우저에 반영한다.

---

## 2. 트랜잭션 옵션 (Model)

**위치**: `packages/model/src/transaction-dsl.ts`

```ts
export interface TransactionOptions {
  /**
   * When true (default), selectionAfter is applied to View (SelectionManager + DOM/React).
   * When false, selection is not applied to View (e.g. remote sync, programmatic change).
   */
  applySelectionToView?: boolean;
}

transaction(editor, operations, options?: TransactionOptions).commit();
```

- **기본값**: `applySelectionToView !== false` 이면 View에 적용한다. 즉 생략 시 `true`와 동일.
- **false 사용 예**: 원격 동기화, 프로그래밍적 문서 변경 등 “사용자 포커스와 무관한” 트랜잭션에서 DOM 선택을 건드리지 않을 때.

---

## 3. TransactionManager에서의 적용 조건 (Model)

**위치**: `packages/model/src/transaction.ts` — `execute(operations, options?)` 내부

흐름 요약:

1. 연산 루프 실행 → selection 해석(5단계) → overlay end + commit.
2. `selectionAfter = context.selection.current` 로 확정.
3. `options?.applySelectionToView !== false` 일 때만 `this._editor.updateSelection(selectionAfter)` 호출.

즉, 트랜잭션 옵션으로 “View에 selection 적용”을 끄면, 여기서 `updateSelection`이 호출되지 않는다.

---

## 4. Editor.updateSelection (Editor Core)

**위치**: `packages/editor-core/src/editor.ts`

`updateSelection(selection)` 호출 시:

1. **Before 훅**: `ext.onBeforeSelectionChange(editor, selection)` — 확장에서 선택 변경/취소 가능.
2. **ModelSelection 처리** (`selection.type === 'range'`):
   - `this._selectionManager.setSelection(finalSelection)` — Model 레벨 선택 상태 저장.
   - `this._updateBuiltinContext()` — 에디터 내장 컨텍스트 갱신.
   - `this.emit('editor:selection.model', finalSelection)` — **View가 구독하는 이벤트**.
3. **After 훅**: `ext.onSelectionChange?.(editor, finalSelection)`.

DOM을 직접 건드리지 않고, SelectionManager 갱신 + 이벤트 발생까지만 수행한다.

---

## 5. View 계층에서의 DOM 반영

### 5.1 editor-view-dom

**위치**: `packages/editor-view-dom/src/editor-view-dom.ts`

- **구독**: `this.editor.on('editor:selection.model', (sel) => { ... })`.
- **동작**:
  - `_pendingModelSelection = sel` 저장.
  - 렌더 중이 아니면 `applyModelSelectionWithRetry()` 호출.
  - 렌더 중이면, 렌더 완료 콜백에서 같은 로직이 호출되도록 되어 있음.
- **applyModelSelectionWithRetry**:
  - `data-bc-sid`로 `sel.startNodeId` / `sel.endNodeId`에 해당하는 DOM 노드가 있으면 `applyModelSelectionToDOM(sel)` 호출.
  - 없으면(아직 DOM 미반영) rAF로 재시도(최대 10회).
- **applyModelSelectionToDOM**: `this.selectionHandler.convertModelSelectionToDOM(sel)` 호출 → 실제 DOM Selection API로 캐럿/범위 설정.

### 5.2 editor-view-react

**위치**: `packages/editor-view-react/src/EditorViewContentLayer.tsx`

- **구독**: `editor.on('editor:selection.model', onModelSelection)`.
- **동작**:
  - `viewStateRef?.current.skipApplyModelSelectionToDOM === true` 이면 아무것도 하지 않음 (DOM 입력 등으로 선택이 이미 DOM에서 왔을 때 중복 적용 방지).
  - 그 외에는 `requestAnimationFrame` 이중으로 감싼 뒤 `selectionHandler.convertModelSelectionToDOM(sel)` 호출.

즉, **실제 DOM 반영**은 두 View 모두 `SelectionHandler.convertModelSelectionToDOM(modelSelection)` 에서 이루어진다.

---

## 6. 요약 다이어그램

```
[TransactionManager.execute(ops, options)]
         │
         ▼
  selectionAfter 결정 (연산 루프 + selection 해석 + commit)
         │
         ▼
  options?.applySelectionToView === false ?
         │
    Yes  │  No
    └────┼────► editor.updateSelection(selectionAfter)
         │              │
         │              ├─► SelectionManager.setSelection(selection)
         │              ├─► emit('editor:selection.model', selection)
         │              │
         ▼              ▼
   (호출 안 함)   [editor-view-dom / editor-view-react]
                          │
                          ▼
                 on('editor:selection.model')
                          │
                          ▼
                 convertModelSelectionToDOM(selection)
                          │
                          ▼
                 DOM Selection API로 캐럿/범위 설정
```

---

## 7. Extension/Command 작성 시

- **사용자 입력에 따른 선택 이동**(예: Enter로 새 단락 생성 후 캐럿 이동)  
  → `transaction(editor, ops, { applySelectionToView: true }).commit()` 로 명시하거나, 옵션 생략(기본 적용).
- **원격 동기화·배치 업데이트** 등 View 선택을 바꾸고 싶지 않을 때  
  → `transaction(editor, ops, { applySelectionToView: false }).commit()`.
- 선택 변경은 **트랜잭션 실행 중** `op()` 등으로 `context.selection`을 직접 바꾸지 말고,  
  **selection 해석 단계**(`lastCreatedBlock` 등)와 **commit 후 updateSelection** 경로만 사용한다.  
  자세한 원칙은 `docs/transaction-selection.md` 참고.
