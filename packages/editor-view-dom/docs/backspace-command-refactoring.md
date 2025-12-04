# Backspace Command 리팩토링 제안

## 문제점

### 현재 구조

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
private handleBackspaceKey(): void {
  // 1. DOM selection 읽기
  const domSelection = window.getSelection();
  const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
  
  // 2. 케이스 분기 (비즈니스 로직)
  if (modelSelection.collapsed && modelSelection.type === 'range') {
    if (modelSelection.startOffset > 0) {
      // 일반 Backspace
      this.editor.executeCommand('deleteText', { range: deleteRange });
    }
    // offset 0 처리 등...
  } else if (!modelSelection.collapsed) {
    // Range selection 처리
    this.editor.executeCommand('deleteText', { range: modelSelection });
  }
}
```

**문제점:**
1. ❌ Backspace 로직이 `handleBackspaceKey()`에만 존재
2. ❌ 다른 곳에서 Backspace를 수행하려면 같은 로직을 다시 구현해야 함
3. ❌ Command 패턴을 제대로 따르지 않음
4. ❌ 테스트하기 어려움 (DOM에 의존)

---

## 개선 방안

### 목표

**Backspace 동작을 Command로 추상화하여 재사용 가능하게 만들기**

### 새로운 구조

```
handleBackspaceKey() (View Layer)
    ↓
DOM Selection 읽기
    ↓
backspace Command 호출
    ↓
backspace Command (Extension)
    ↓
케이스 분기 및 적절한 Command 호출
    ↓
deleteText / mergeTextNodes / deleteNode Command
```

---

## 구현 계획

### 1. `backspace` Command 추가

**위치**: `packages/extensions/src/delete.ts`

**책임**:
- Model selection을 받아서 Backspace 동작 수행
- 케이스 분기 처리 (offset 0, 일반 Backspace, Range selection 등)
- 적절한 하위 Command 호출 (`deleteText`, `mergeTextNodes`, `deleteNode`)

**시그니처**:
```typescript
editor.registerCommand({
  name: 'backspace',
  execute: async (editor: Editor, payload: { selection: ModelSelection }) => {
    return await this._executeBackspace(editor, payload.selection);
  },
  canExecute: (editor: Editor, payload?: any) => {
    return payload?.selection != null;
  }
});
```

**구현**:
```typescript
private async _executeBackspace(editor: Editor, selection: ModelSelection): Promise<boolean> {
  // 1. Range Selection 처리
  if (!selection.collapsed) {
    return await this._executeDeleteText(editor, selection);
  }
  
  // 2. Offset 0 처리
  if (selection.startOffset === 0) {
    return await this._handleBackspaceAtOffsetZero(editor, selection);
  }
  
  // 3. 일반 Backspace 처리 (offset > 0)
  const deleteRange: ModelSelection = {
    type: 'range',
    startNodeId: selection.startNodeId,
    startOffset: selection.startOffset - 1,
    endNodeId: selection.startNodeId,
    endOffset: selection.startOffset,
    collapsed: false,
    direction: 'forward'
  };
  
  return await this._executeDeleteText(editor, deleteRange);
}

private async _handleBackspaceAtOffsetZero(
  editor: Editor, 
  selection: ModelSelection
): Promise<boolean> {
  const dataStore = (editor as any).dataStore;
  if (!dataStore) return false;
  
  const prevNodeId = dataStore.getPreviousNode(selection.startNodeId);
  if (!prevNodeId) return false; // 케이스 E: 이전 노드 없음
  
  const prevNode = dataStore.getNode(prevNodeId);
  const prevParent = dataStore.getParent(prevNodeId);
  const currentParent = dataStore.getParent(selection.startNodeId);
  
  // 케이스 D: 다른 부모 (블록 경계)
  if (prevParent?.sid !== currentParent?.sid) {
    return false; // 아무 동작도 하지 않음
  }
  
  // 케이스 A, B, C 처리
  if (prevNode?.text !== undefined && typeof prevNode.text === 'string') {
    const prevTextLength = prevNode.text.length;
    
    if (prevTextLength > 0) {
      // 케이스 A: 이전 노드의 마지막 문자 삭제
      const deleteRange: ModelSelection = {
        type: 'range',
        startNodeId: prevNodeId,
        startOffset: prevTextLength - 1,
        endNodeId: prevNodeId,
        endOffset: prevTextLength,
        collapsed: false,
        direction: 'forward'
      };
      return await this._executeDeleteText(editor, deleteRange);
    } else {
      // 케이스 B: 빈 노드 병합
      return await this._executeMergeTextNodes(editor, prevNodeId, selection.startNodeId);
    }
  } else {
    // 케이스 C: 이전 노드 전체 삭제 (.text 필드 없음)
    return await this._executeDeleteNode(editor, prevNodeId);
  }
}

private async _executeMergeTextNodes(
  editor: Editor,
  leftNodeId: string,
  rightNodeId: string
): Promise<boolean> {
  // mergeTextNodes operation 사용
  const operations = [
    {
      type: 'mergeTextNodes',
      payload: { leftNodeId, rightNodeId }
    }
  ];
  const result = await transaction(editor, operations).commit();
  return result.success;
}
```

---

### 2. `handleBackspaceKey()` 단순화

**변경 전**:
```typescript
private handleBackspaceKey(): void {
  const domSelection = window.getSelection();
  const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
  
  // 모든 케이스 분기 로직...
}
```

**변경 후**:
```typescript
private handleBackspaceKey(): void {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;
  
  // DOM Selection → Model Selection 변환
  const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
  if (!modelSelection || modelSelection.type === 'none') {
    console.warn('[EditorViewDOM] handleBackspaceKey: Failed to convert DOM selection');
    return;
  }
  
  // Backspace Command 호출 (모든 로직은 Command에서 처리)
  this.editor.executeCommand('backspace', { selection: modelSelection });
}
```

---

## 장점

### 1. 재사용성
```typescript
// 다른 곳에서도 Backspace 동작 수행 가능
editor.executeCommand('backspace', { selection: modelSelection });
```

### 2. 테스트 용이성
```typescript
// DOM 없이도 테스트 가능
const selection: ModelSelection = {
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 5,
  collapsed: true,
  direction: 'forward'
};

await editor.executeCommand('backspace', { selection });
```

### 3. 명확한 책임 분리
- **View Layer**: DOM 이벤트 처리, DOM ↔ Model 변환
- **Command Layer**: 비즈니스 로직 (케이스 분기), Operations 조합

### 4. 확장성
```typescript
// 다른 UI에서도 사용 가능
// 예: 툴바 버튼, 메뉴 등
toolbarButton.onClick(() => {
  const selection = editor.selectionManager.getCurrentSelection();
  editor.executeCommand('backspace', { selection });
});
```

---

## 레이어별 책임 재정의

### View Layer (editor-view-dom)

**책임**:
1. ✅ DOM 이벤트 처리 (`handleBackspaceKey()`)
2. ✅ DOM Selection → Model Selection 변환
3. ✅ Command 호출
4. ❌ 비즈니스 로직 처리하지 않음 (Command로 위임)

### Command Layer (extensions)

**책임**:
1. ✅ 비즈니스 로직 처리 (케이스 분기)
2. ✅ 적절한 하위 Command 호출
3. ✅ Operations 조합 (하위 Command에서)

---

## 마이그레이션 계획

### Phase 1: `backspace` Command 추가
- [ ] `DeleteExtension`에 `backspace` command 추가
- [ ] `_executeBackspace()` 메서드 구현
- [ ] `_handleBackspaceAtOffsetZero()` 메서드 구현
- [ ] `_executeMergeTextNodes()` 메서드 구현

### Phase 2: `handleBackspaceKey()` 리팩토링
- [ ] `handleBackspaceKey()` 단순화
- [ ] Command 호출로 변경

### Phase 3: 테스트 및 검증
- [ ] 기존 동작 검증
- [ ] Command 직접 호출 테스트
- [ ] 다른 UI에서 사용 테스트

---

## 참고: 다른 에디터들의 패턴

### ProseMirror
```typescript
// ProseMirror는 Command를 직접 제공
const backspaceCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => {
  // 케이스 분기 처리
  if (selection.empty) {
    // offset 0 처리 등...
  } else {
    // range selection 처리
  }
};

// 사용
dispatch(backspaceCommand(state));
```

### Slate.js
```typescript
// Slate는 Transforms API 제공
Transforms.delete(editor, {
  at: selection,
  // 내부적으로 케이스 분기 처리
});
```

### 우리 에디터
```typescript
// 제안하는 구조
editor.executeCommand('backspace', { selection });
// Command 내부에서 모든 케이스 분기 처리
```

---

## 결론

**Backspace 동작을 Command로 추상화하면:**
- ✅ 재사용성 향상
- ✅ 테스트 용이성 향상
- ✅ 명확한 책임 분리
- ✅ 확장성 향상

**구현 순서:**
1. `backspace` Command 추가 (Extension)
2. `handleBackspaceKey()` 단순화 (View Layer)
3. 테스트 및 검증

