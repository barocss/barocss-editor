# 삭제 처리 아키텍처: Command vs Operation 조합

## 질문

`handleDelete`에서 operations를 직접 조합하는 것이 맞는가, 아니면 미리 정의된 Command를 호출하는 것이 맞는가?

---

## 아키텍처 레이어 분석

### 현재 구조

```
┌─────────────────────────────────────┐
│  editor-view-dom (View Layer)      │
│  - handleDelete()                   │
│  - 사용자 입력 감지                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  editor-core (Command Layer)        │
│  - executeCommand()                 │
│  - Command 정의                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  model (Transaction Layer)          │
│  - transaction()                   │
│  - Operation 정의                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  datastore (Data Layer)             │
│  - deleteText()                     │
│  - deleteNode()                     │
└─────────────────────────────────────┘
```

---

## 옵션 비교

### 옵션 1: View에서 Operations 직접 조합 ❌

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  const operations: any[] = [];
  
  if (contentRange._deleteNode) {
    operations.push({ type: 'delete', payload: { nodeId: contentRange.nodeId } });
  } else if (contentRange.startNodeId === contentRange.endNodeId) {
    operations.push(
      ...control(contentRange.startNodeId, [
        { type: 'deleteTextRange', payload: { start: contentRange.startOffset, end: contentRange.endOffset } }
      ])
    );
  } else {
    // Cross-node: 직접 처리
    dataStore.range.deleteText(contentRange);
  }
  
  await transaction(this.editor, operations).commit();
}
```

**문제점**:
- ❌ View 레이어에 비즈니스 로직 포함
- ❌ 재사용 불가능
- ❌ 테스트 어려움
- ❌ 다른 곳에서 삭제 기능 사용 시 중복 코드

---

### 옵션 2: Command 패턴 사용 ✅ (권장)

```typescript
// packages/editor-core/src/commands/delete.ts
export const deleteCommand: Command = {
  name: 'delete',
  execute: async (editor: Editor, payload: { range: ContentRange }) => {
    const { range } = payload;
    
    const operations: any[] = [];
    
    if (range._deleteNode) {
      operations.push({ type: 'delete', payload: { nodeId: range.nodeId } });
    } else if (range.startNodeId === range.endNodeId) {
      operations.push(
        ...control(range.startNodeId, [
          { type: 'deleteTextRange', payload: { start: range.startOffset, end: range.endOffset } }
        ])
      );
    } else {
      // Cross-node: 직접 처리 또는 새로운 operation
      const dataStore = editor.dataStore;
      dataStore.range.deleteText(range);
      return true; // 직접 처리 완료
    }
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
};

// packages/editor-view-dom/src/event-handlers/input-handler.ts
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, modelSelection.startNodeId);
  if (!contentRange) return;
  
  // Command 호출
  const success = await this.editor.executeCommand('delete', { range: contentRange });
  if (!success) {
    console.error('[InputHandler] handleDelete: command failed');
    return;
  }
  
  // Selection 업데이트 등 후처리
  // ...
}
```

**장점**:
- ✅ View 레이어는 비즈니스 로직을 모름
- ✅ Command 재사용 가능 (다른 곳에서도 호출 가능)
- ✅ 테스트 용이 (Command 단위 테스트)
- ✅ 일관된 패턴 (다른 Command들과 동일)
- ✅ 확장성 (Command에 before/after hook 추가 가능)

---

### 옵션 3: 하이브리드 (Command + 직접 호출)

```typescript
// 단순한 경우: Command 사용
if (contentRange.startNodeId === contentRange.endNodeId && !contentRange._deleteNode) {
  await this.editor.executeCommand('deleteTextRange', { 
    nodeId: contentRange.startNodeId,
    start: contentRange.startOffset,
    end: contentRange.endOffset
  });
}
// 복잡한 경우: 직접 처리
else {
  // ...
}
```

**장점**:
- ✅ 단순한 경우는 Command 사용
- ✅ 복잡한 경우는 직접 처리

**단점**:
- ❌ 일관성 부족
- ❌ 두 가지 패턴 혼재

---

## 다른 에디터들의 패턴

### ProseMirror

```typescript
// Command 정의
const deleteSelection = (state: EditorState, dispatch?: (tr: Transaction) => void) => {
  const { selection } = state;
  if (selection.empty) return false;
  
  if (dispatch) {
    dispatch(state.tr.delete(selection.from, selection.to));
  }
  return true;
};

// View에서 호출
handleDelete(event: InputEvent) {
  const command = deleteSelection;
  command(state, dispatch);
}
```

**패턴**: Command 패턴 사용

---

### Slate.js

```typescript
// Transforms API (미리 정의된 함수)
Transforms.delete(editor, { at: selection });

// View에서 호출
handleDelete(event: InputEvent) {
  Transforms.delete(editor, { at: selection });
}
```

**패턴**: 미리 정의된 함수 사용 (Command와 유사)

---

### Lexical

```typescript
// Command 정의
const deleteCommand = (editor: LexicalEditor) => {
  editor.update(() => {
    const selection = $getSelection();
    selection.removeText();
  });
};

// View에서 호출
handleDelete(event: InputEvent) {
  deleteCommand(editor);
}
```

**패턴**: Command 패턴 사용

---

## 권장 사항

### ✅ 옵션 2: Command 패턴 사용

**이유**:
1. **레이어 분리**: View 레이어는 비즈니스 로직을 모름
2. **재사용성**: 다른 곳에서도 동일한 Command 사용 가능
3. **테스트 용이**: Command 단위 테스트 가능
4. **일관성**: 다른 에디터들과 유사한 패턴
5. **확장성**: Command에 before/after hook 추가 가능

### 구현 계획

#### 1. Command 정의 (`packages/editor-core/src/commands/delete.ts`)

```typescript
import { transaction, control } from '@barocss/model';
import type { Editor, Command } from '../types';

export const deleteCommand: Command = {
  name: 'delete',
  
  canExecute: (editor: Editor, payload?: any) => {
    // 삭제 가능 여부 확인
    return payload?.range != null;
  },
  
  execute: async (editor: Editor, payload: { range: ContentRange }) => {
    const { range } = payload;
    const dataStore = editor.dataStore;
    
    const operations: any[] = [];
    
    // 노드 삭제
    if (range._deleteNode) {
      operations.push({
        type: 'delete',
        payload: { nodeId: range.nodeId }
      });
    }
    // 단일 노드 텍스트 삭제
    else if (range.startNodeId === range.endNodeId) {
      operations.push(
        ...control(range.startNodeId, [
          { type: 'deleteTextRange', payload: { 
            start: range.startOffset, 
            end: range.endOffset 
          } }
        ])
      );
    }
    // Cross-node 범위: 직접 처리 (향후 operation 추가)
    else {
      dataStore.range.deleteText(range);
      return true; // 직접 처리 완료
    }
    
    // Transaction 실행
    if (operations.length > 0) {
      const result = await transaction(editor, operations).commit();
      return result.success;
    }
    
    return true;
  }
};
```

#### 2. Command 등록 (`packages/editor-core/src/commands/index.ts`)

```typescript
import { deleteCommand } from './delete';

export function registerDeleteCommands(editor: Editor): void {
  editor.use(deleteCommand);
}
```

#### 3. View에서 Command 호출

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, modelSelection.startNodeId);
  if (!contentRange) return;
  
  // Command 호출
  const success = await this.editor.executeCommand('delete', { range: contentRange });
  if (!success) {
    console.error('[InputHandler] handleDelete: command failed');
    return;
  }
  
  // Selection 업데이트
  const newModelSelection = this.calculateNewSelectionAfterDelete(contentRange, modelSelection);
  this.editor.emit('editor:selection.change', { selection: newModelSelection });
  
  // Render
  this.editor.emit('editor:content.change', { skipRender: false, from: 'beforeinput-delete' });
  
  // DOM selection 적용
  requestAnimationFrame(() => {
    (this.editorViewDOM as any).convertModelSelectionToDOM?.(newModelSelection);
  });
}
```

---

## Command vs Operation

### Command (editor-core)
- **목적**: 사용자 의도를 표현하는 고수준 인터페이스
- **예시**: `delete`, `insertText`, `toggleBold`
- **특징**: 
  - 사용자 친화적 이름
  - 비즈니스 로직 포함
  - 여러 Operation 조합 가능
  - before/after hook 지원

### Operation (model)
- **목적**: 모델 변경을 표현하는 저수준 인터페이스
- **예시**: `deleteTextRange`, `delete`, `replaceText`
- **특징**:
  - 기술적 이름
  - 단일 모델 변경
  - Transaction 내에서 실행
  - inverse operation 제공

### 관계

```
Command (고수준)
  ↓
여러 Operation 조합
  ↓
Transaction 실행
  ↓
DataStore 변경
```

---

## 결론

**권장: Command 패턴 사용**

1. **`handleDelete`는 Command만 호출**: 비즈니스 로직 없음
2. **Command에서 Operations 조합**: 재사용 가능한 로직
3. **Operation은 모델 변경만 담당**: 단일 책임 원칙

**구현 순서**:
1. `deleteCommand` 정의 (`packages/editor-core/src/commands/delete.ts`)
2. Command 등록
3. `handleDelete`에서 Command 호출
4. Selection 업데이트 등 후처리는 View에서 처리

이렇게 하면 아키텍처가 깔끔하고 확장 가능합니다.

