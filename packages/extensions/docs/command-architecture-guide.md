# Command 아키텍처 가이드

## 개요

이 문서는 Command의 책임, 구조, 그리고 구현 전략에 대한 종합 가이드입니다.

---

## 핵심 원칙

### 1. Command는 Operations를 조합한다

**Command에서 operations를 조합하는 것이 맞습니다.**

- ✅ Command는 "사용자 의도 해석" + "Operations 조합"의 책임
- ✅ 다른 에디터들(ProseMirror, Slate, Tiptap)도 동일한 패턴 사용
- ✅ Command는 Extension에 정의되고, operations를 조합하여 transaction 실행

### 2. 비즈니스 로직은 View Layer에 있다

**Command는 이미 정해진 operation을 잘 조합하는 것에 집중해야 합니다.**

- ✅ 비즈니스 로직: View Layer에서 처리 (어떤 범위를 삭제할지, 어떤 Command를 호출할지)
- ✅ 조합 로직: Command에서 처리 (받은 payload를 보고 operations 조합)
- ❌ Command에 비즈니스 로직 포함하지 않음

### 3. Command는 명확한 책임을 가진다

**한 Command에 너무 많은 역할을 주는 것보다, 각 Command가 명확한 책임을 가지는 것이 더 나음**

- ✅ 이해하기 쉬움
- ✅ 테스트하기 쉬움
- ✅ 유지보수하기 쉬움

---

## 레이어별 책임

### View Layer (editor-view-dom)

**책임**:
1. ✅ 비즈니스 로직 처리 (어떤 범위를 삭제할지, 어떤 Command를 호출할지)
2. ✅ DOM 이벤트 처리
3. ✅ DOM ↔ Model 변환
4. ✅ Command 호출
5. ❌ Operations 조합하지 않음

**예시**:
```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  // 1. 비즈니스 로직: 삭제 범위 계산
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, currentNodeId);
  
  // 2. 비즈니스 로직: 어떤 Command를 호출할지 결정
  if (contentRange._deleteNode && contentRange.nodeId) {
    await this.editor.executeCommand('deleteNode', { nodeId: contentRange.nodeId });
  } else if (contentRange.startNodeId !== contentRange.endNodeId) {
    await this.editor.executeCommand('deleteCrossNode', { range: contentRange });
  } else {
    await this.editor.executeCommand('deleteText', { range: contentRange });
  }
}
```

---

### Command Layer (extensions)

**책임**:
1. ✅ Operations 조합 (받은 payload를 보고 operations 조합)
2. ✅ Transaction 실행
3. ❌ 비즈니스 로직 포함하지 않음

**예시**:
```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // 분리된 Command들
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: Editor, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      }
    });

    editor.registerCommand({
      name: 'deleteText',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteText(editor, payload.range);
      }
    });
  }

  // 각 Command는 명확한 책임만 가짐
  private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
    const operations = [{ type: 'delete', payload: { nodeId } }];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  private async _executeDeleteText(editor: Editor, range: ContentRange): Promise<boolean> {
    const operations = [
      ...control(range.startNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: range.startOffset,
            end: range.endOffset
          }
        }
      ])
    ];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
}
```

---

### Operation Layer (model)

**책임**:
1. ✅ 순수 데이터 변경
2. ✅ Selection 매핑
3. ✅ 역연산 생성
4. ❌ 비즈니스 로직 포함하지 않음

**예시**:
```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', async (operation, context) => {
  const { nodeId, start, end } = operation.payload;
  
  // 1. DataStore 업데이트
  const deletedText = context.dataStore.range.deleteText({...});
  
  // 2. Selection 매핑
  if (context.selection?.current) {
    // context.selection.current 갱신
  }
  
  // 3. 역연산 반환
  return { ok: true, data: deletedText, inverse: {...} };
});
```

---

## Command 분리 전략

### 분리 기준

Command를 분리해야 하는 경우:

1. **다른 operation 사용**: 다른 operation을 사용하는 경우
   ```typescript
   // 분리 필요
   editor.executeCommand('deleteNode', { nodeId });      // delete operation
   editor.executeCommand('deleteText', { range });        // deleteTextRange operation
   ```

2. **다른 로직**: 다른 비즈니스 로직이 필요한 경우
   ```typescript
   // 분리 필요
   editor.executeCommand('deleteNode', { nodeId });           // 노드 전체 삭제
   editor.executeCommand('deleteCrossNode', { range });       // Cross-node 삭제
   ```

### 분리하지 않아도 되는 경우

1. **단순한 변형**: 같은 operation을 다른 파라미터로 호출하는 경우
   ```typescript
   // 분리 불필요
   editor.executeCommand('insertText', { text: 'hello' });
   editor.executeCommand('insertText', { text: 'world' });
   ```

2. **의미적으로 동일**: 사용자 관점에서 같은 동작인 경우
   ```typescript
   // 분리 불필요 (둘 다 텍스트 삭제)
   editor.executeCommand('deleteText', { range: range1 });
   editor.executeCommand('deleteText', { range: range2 });
   ```

---

## 구분: 비즈니스 로직 vs 조합 로직

### 비즈니스 로직 (View Layer)

**"무엇을 할지 결정"**
- selection 분석
- inputType 분석
- 노드 경계 처리
- 삭제 범위 계산
- `_deleteNode` 플래그 설정
- 어떤 Command를 호출할지 결정

**위치**: `InputHandler.calculateDeleteRange()`, `InputHandler.handleDelete()`

---

### 조합 로직 (Command)

**"어떻게 조합할지 결정"**
- 받은 payload의 구조를 보고 operations 조합
- 여러 operations를 순서대로 조합

**위치**: `DeleteExtension._buildDeleteOperations()`

**차이점**:
- 비즈니스 로직: "무엇을 할지" 결정 (View Layer)
- 조합 로직: "어떻게 조합할지" 결정 (Command)

---

## 다른 에디터들의 패턴

### ProseMirror

```typescript
// ProseMirror의 Command 예시
const deleteSelection = (state: EditorState, dispatch?: (tr: Transaction) => void) => {
  if (state.selection.empty) return false;
  
  if (dispatch) {
    // Command에서 직접 transaction 조작
    const tr = state.tr;
    tr.deleteSelection();  // ← Transaction에 operation 추가
    dispatch(tr);
  }
  return true;
};
```

**특징**:
- Command가 **Transaction을 직접 조작**
- Command가 **operations를 추가**
- Command가 **transaction을 dispatch**

---

### Slate.js

```typescript
// Slate의 Command 예시
const deleteBackward = (editor: Editor) => {
  const { selection } = editor;
  
  if (selection) {
    // Command에서 직접 transform 조작
    Transforms.delete(editor, {
      at: selection,
      unit: 'character',
      reverse: true
    });
  }
};
```

**특징**:
- Command가 **Transform을 직접 조작**
- Command가 **operations를 추가**

---

### Tiptap

```typescript
// Tiptap의 Command 예시
const deleteSelection = () => ({ state, dispatch }: CommandProps) => {
  if (state.selection.empty) return false;
  
  if (dispatch) {
    // Command에서 직접 transaction 조작
    const tr = state.tr;
    tr.deleteSelection();
    dispatch(tr);
  }
  return true;
};
```

**특징**:
- Command가 **Transaction을 직접 조작**
- Command가 **operations를 추가**

---

## 구현 예시

### Before: 통합 Command (문제점)

```typescript
// ❌ 하나의 Command로 여러 케이스 처리
editor.registerCommand({
  name: 'delete',
  execute: async (editor: Editor, payload: { range: ContentRange }) => {
    // 여러 케이스를 하나의 Command에서 처리
    if (range._deleteNode && range.nodeId) {
      // 노드 전체 삭제
    } else if (range.startNodeId !== range.endNodeId) {
      // Cross-node 삭제
    } else {
      // 단일 노드 삭제
    }
  }
});
```

**문제점**:
- 하나의 Command가 너무 많은 역할을 가짐
- 테스트하기 어려움 (여러 케이스를 모두 테스트해야 함)
- 이해하기 어려움 (어떤 케이스가 실행되는지 명확하지 않음)

---

### After: 분리된 Command (권장)

```typescript
// ✅ 분리된 Command들
export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // 1. 노드 전체 삭제
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: Editor, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      }
    });

    // 2. Cross-node 텍스트 삭제
    editor.registerCommand({
      name: 'deleteCrossNode',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteCrossNode(editor, payload.range);
      }
    });

    // 3. 단일 노드 텍스트 삭제
    editor.registerCommand({
      name: 'deleteText',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteText(editor, payload.range);
      }
    });
  }

  // 각 Command는 명확한 책임만 가짐
  private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
    const operations = [{ type: 'delete', payload: { nodeId } }];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  private async _executeDeleteCrossNode(editor: Editor, range: ContentRange): Promise<boolean> {
    // Cross-node operations 조합
    const operations = this._buildCrossNodeDeleteOperations(range);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  private async _executeDeleteText(editor: Editor, range: ContentRange): Promise<boolean> {
    const operations = [
      ...control(range.startNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: range.startOffset,
            end: range.endOffset
          }
        }
      ])
    ];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
}
```

**장점**:
- ✅ 각 Command가 명확한 책임을 가짐
- ✅ 테스트하기 쉬움 (각 Command를 독립적으로 테스트)
- ✅ 이해하기 쉬움 (Command 이름만 봐도 무엇을 하는지 명확)

---

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────┐
│ View Layer (editor-view-dom)           │
│ - DOM 이벤트 처리                       │
│ - 비즈니스 로직 (어떤 Command 호출할지)   │
│ - Command 호출                          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Command Layer (extensions)               │
│ - Operations 조합                        │
│ - Transaction 실행                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Transaction Layer (model)                │
│ - Operations 실행                        │
│ - History 관리                          │
│ - Rollback 지원                         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Operation Layer (model)                 │
│ - 순수 데이터 변경                       │
│ - Selection 매핑                        │
│ - 역연산 (inverse) 생성                 │
└─────────────────────────────────────────┘
```

---

## 정리

### Command의 책임

1. ✅ **Operations 조합**: 받은 payload를 보고 operations를 조합
2. ✅ **Transaction 실행**: `transaction(editor, operations).commit()`
3. ❌ **비즈니스 로직**: "무엇을 할지 결정"은 Command의 책임이 아님

### View Layer의 책임

1. ✅ **비즈니스 로직**: "무엇을 할지 결정"
2. ✅ **Command 호출**: 적절한 Command를 적절한 payload로 호출
3. ❌ **Operations 조합**: View Layer의 책임이 아님

### Command 분리 원칙

1. ✅ **명확한 책임**: 각 Command는 하나의 명확한 작업만 수행
2. ✅ **독립적 테스트**: 각 Command를 독립적으로 테스트 가능
3. ✅ **이해하기 쉬움**: Command 이름만 봐도 무엇을 하는지 명확

---

## 참고 문서

- `packages/extensions/docs/text-input-command-migration.md`: 텍스트 입력 Command 마이그레이션 계획
- `packages/editor-view-dom/docs/input-delete-flow-summary.md`: 입력 및 삭제 플로우 요약

