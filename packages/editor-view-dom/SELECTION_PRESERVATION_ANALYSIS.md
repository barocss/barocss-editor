# Selection 보존 분석

## 문제 상황

사용자 요구사항:
- **Selection은 브라우저가 계속 가지고 있는 상태로 둬야 함**
- 데이터 업데이트할 때 selection을 바꾸면 안됨
- 현재는 selection 위치 기준으로 data-bc-sid를 찾고, 하위 text node들을 결합해서 값을 만들고, 모델의 text와 비교해서 부분만 업데이트해야 함
- 테스트를 위해 전체 문자열을 다 바꿔도 상관없지만, selection은 변경하면 안됨

## 현재 코드에서 Selection을 변경하는 부분

### 1. `editor:content.change` 이벤트 후 `applyModelSelectionWithRetry()` 호출

**위치**: `packages/editor-view-dom/src/editor-view-dom.ts:287`

```typescript
this.editor.on('editor:content.change' as any, (e: any) => {
  if (this._isComposing) {
    console.log('[EditorViewDOM] content.change (composing=true) skip render');
    return;
  }
  console.log('[EditorViewDOM] content.change -> render with diff');
  this.render();
  // 렌더 후 selection 재적용 시도
  this.applyModelSelectionWithRetry();  // ← 문제: 모델 selection을 DOM에 적용하려고 시도
});
```

**문제점**:
- `applyModelSelectionWithRetry()`는 `_pendingModelSelection`이 있으면 DOM selection을 변경합니다
- `applyModelSelectionToDOM()`에서 `selection.removeAllRanges()`와 `selection.addRange(range)`를 호출하여 **브라우저의 selection을 강제로 변경**합니다

**영향**:
- 사용자가 텍스트를 입력하면:
  1. MutationObserver가 변경 감지
  2. InputHandler가 트랜잭션 실행
  3. `editor:content.change` 이벤트 발생
  4. `render()` 호출
  5. **`applyModelSelectionWithRetry()` 호출 → 브라우저 selection 변경** ❌

### 2. `applyModelSelectionToDOM()` 함수

**위치**: `packages/editor-view-dom/src/editor-view-dom.ts:511-539`

```typescript
private applyModelSelectionToDOM(sel: any): void {
  try {
    // ... 노드 찾기 ...
    const range = document.createRange();
    range.setStart(anchorText, Math.max(0, Math.min(sel.anchor.offset || 0, anchorText.length)));
    range.setEnd(headText, Math.max(0, Math.min(sel.head.offset || 0, headText.length)));
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();  // ← 브라우저 selection 제거
    selection.addRange(range);    // ← 새로운 selection 설정
    // ...
  } catch (e) {
    console.warn('[EditorViewDOM] applyModelSelectionToDOM:error', e);
  }
}
```

**문제점**:
- `selection.removeAllRanges()`와 `selection.addRange(range)`를 호출하여 **브라우저의 selection을 강제로 변경**합니다

### 3. `render()` 함수의 `selectionContext`

**위치**: `packages/editor-view-dom/src/editor-view-dom.ts:870-930`

```typescript
// 4. Selection 정보 수집 (Content 레이어 렌더링용)
const selection = window.getSelection();
let selectionContext: { 
  textNode?: Text; 
  restoreSelection?: (textNode: Text, offset: number) => void;
  model?: { sid: string; modelOffset: number };
} | undefined = undefined;

if (selection && selection.rangeCount > 0) {
  const range = selection.getRangeAt(0);
  const textNode = range.startContainer.nodeType === Node.TEXT_NODE 
    ? range.startContainer as Text 
    : null;
  const domOffset = range.startOffset;
  
  if (textNode && this.layers.content.contains(textNode)) {
    // Model selection으로 변환하여 sid와 modelOffset 얻기
    try {
      const modelSel = this.selectionHandler.convertDOMSelectionToModel(selection);
      if (modelSel && modelSel.anchor) {
        selectionContext = {
          textNode,
          restoreSelection: (node: Text, offset: number) => {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset);
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          },
          // ...
        };
      }
    } catch (error) {
      // ...
    }
  }
}
```

**분석**:
- `selectionContext`는 **현재 브라우저 selection을 보존**하려고 하는 것입니다
- `restoreSelection` 함수는 렌더링 후 selection을 복원하려고 하지만, 실제로는 **DOMRenderer가 호출**해야 합니다
- 이 부분은 selection을 **보존**하려고 하는 것이므로 문제없습니다

## 해결 방법

### 방법 1: `applyModelSelectionWithRetry()` 호출 제거 (권장)

**변경 사항**:
- `editor:content.change` 이벤트 핸들러에서 `applyModelSelectionWithRetry()` 호출 제거
- 브라우저가 자동으로 selection을 유지하도록 함

```typescript
this.editor.on('editor:content.change' as any, (e: any) => {
  if (this._isComposing) {
    console.log('[EditorViewDOM] content.change (composing=true) skip render');
    return;
  }
  console.log('[EditorViewDOM] content.change -> render with diff');
  this.render();
  // applyModelSelectionWithRetry() 제거 - 브라우저가 selection을 유지하도록 함
});
```

**장점**:
- 브라우저가 자동으로 selection을 유지
- 사용자 입력 중 selection이 변경되지 않음
- 코드가 단순해짐

**단점**:
- 모델 selection과 DOM selection이 동기화되지 않을 수 있음
- 하지만 사용자 요구사항에 따르면 이것이 올바른 동작입니다

### 방법 2: 조건부로 `applyModelSelectionWithRetry()` 호출

**변경 사항**:
- `_pendingModelSelection`이 있고, **사용자 입력이 아닌 경우**에만 호출
- 사용자 입력 중에는 호출하지 않음

```typescript
this.editor.on('editor:content.change' as any, (e: any) => {
  if (this._isComposing) {
    console.log('[EditorViewDOM] content.change (composing=true) skip render');
    return;
  }
  console.log('[EditorViewDOM] content.change -> render with diff');
  this.render();
  
  // 사용자 입력이 아닌 경우에만 selection 재적용
  // (예: 프로그래밍 방식으로 모델을 변경한 경우)
  const isUserInput = e?.transaction?.type === 'text_replace';
  if (!isUserInput && this._pendingModelSelection) {
    this.applyModelSelectionWithRetry();
  }
});
```

**장점**:
- 사용자 입력 중에는 selection을 변경하지 않음
- 프로그래밍 방식으로 모델을 변경한 경우에는 selection을 동기화할 수 있음

**단점**:
- 로직이 복잡해짐
- `text_replace` 외의 다른 트랜잭션 타입도 고려해야 함

### 방법 3: `render()` 함수의 `selectionContext`만 사용

**변경 사항**:
- `applyModelSelectionWithRetry()` 호출 제거
- `render()` 함수의 `selectionContext`만 사용하여 selection 보존
- DOMRenderer가 `restoreSelection`을 호출하도록 보장

**장점**:
- 브라우저 selection을 보존하면서도 렌더링 후 복원 가능
- DOMRenderer가 selection 보존을 처리

**단점**:
- DOMRenderer가 `restoreSelection`을 제대로 호출하는지 확인 필요

## 권장 사항

**방법 1 (권장)**: `applyModelSelectionWithRetry()` 호출 제거

이유:
1. 사용자 요구사항: "selection은 브라우저가 계속 가지고 있는 상태로 둬야 함"
2. 브라우저가 자동으로 selection을 유지함
3. 코드가 단순해짐
4. 사용자 입력 중 selection이 변경되지 않음

## 추가 확인 사항

### `input-handler.ts`에서 Selection 변경 여부

**확인 결과**: ✅ **Selection을 변경하지 않음**

- `getCurrentSelection()`: selection을 **읽기만** 함
- `handleTextContentChange()`: selection을 **읽기만** 함
- 트랜잭션 실행 시 `selectionAfter`를 설정하지 않음

### `native-commands.ts`에서 `selectionAfter` 사용

**위치**: `packages/editor-view-dom/src/native-commands/native-commands.ts:56, 62`

```typescript
selectionAfter: { anchor: { nodeId: newTextId, offset: 0 }, head: { nodeId: newTextId, offset: 0 } }
```

**분석**:
- `native-commands.ts`에서만 `selectionAfter`를 사용
- 이것은 **새로운 paragraph를 삽입**할 때 사용되는 것으로 보임
- `input-handler.ts`에서는 사용하지 않음

## 결론

**문제점**:
1. `editor:content.change` 이벤트 후 `applyModelSelectionWithRetry()` 호출 → 브라우저 selection 변경 ❌
2. `applyModelSelectionToDOM()` 함수 → 브라우저 selection 강제 변경 ❌

**해결 방법**:
- `editor:content.change` 이벤트 핸들러에서 `applyModelSelectionWithRetry()` 호출 제거
- 브라우저가 자동으로 selection을 유지하도록 함

**확인 사항**:
- `input-handler.ts`는 selection을 변경하지 않음 ✅
- `render()` 함수의 `selectionContext`는 selection을 보존하려고 함 ✅

