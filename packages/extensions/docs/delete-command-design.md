# Delete Command 설계

## 개요

Command 분리 전략에 따라 Delete 기능을 명확한 책임을 가진 여러 Command로 분리합니다.

---

## 필요한 Command들

### 1. `deleteNode` - 노드 전체 삭제

**책임**: 단일 노드 전체를 삭제

**사용 시나리오**:
- Inline 노드 전체 삭제 (예: `inline-image`)
- `.text` 필드가 없는 inline 노드 삭제
- 노드 경계에서 이전/다음 노드가 `.text` 필드가 없는 경우

**Payload**:
```typescript
{
  nodeId: string  // 삭제할 노드 ID
}
```

**Operations**:
```typescript
[
  {
    type: 'delete',
    payload: { nodeId }
  }
]
```

---

### 2. `deleteText` - 단일 노드 텍스트 삭제

**책임**: 단일 노드 내에서 텍스트 범위 삭제

**사용 시나리오**:
- 같은 노드 내에서 문자 삭제
- Collapsed selection에서 문자 삭제
- Range selection에서 같은 노드 내 범위 삭제

**Payload**:
```typescript
{
  range: {
    startNodeId: string,
    startOffset: number,
    endNodeId: string,      // startNodeId와 동일해야 함
    endOffset: number
  }
}
```

**Operations**:
```typescript
[
  ...control(range.startNodeId, [
    {
      type: 'deleteTextRange',
      payload: {
        start: range.startOffset,
        end: range.endOffset
      }
    }
  ])
]
```

---

### 3. `deleteCrossNode` - Cross-node 텍스트 삭제

**책임**: 여러 노드에 걸친 텍스트 범위 삭제

**사용 시나리오**:
- Range selection이 여러 노드에 걸친 경우
- 노드 경계를 넘어서는 삭제

**Payload**:
```typescript
{
  range: {
    startNodeId: string,
    startOffset: number,
    endNodeId: string,      // startNodeId와 다름
    endOffset: number
  }
}
```

**Operations** (현재는 `dataStore.range.deleteText` 직접 호출, 향후 operation으로 전환):
```typescript
// 현재: dataStore.range.deleteText(range) 직접 호출
// 향후: 여러 deleteTextRange operations 조합
[
  ...control(range.startNodeId, [
    { type: 'deleteTextRange', payload: { start: range.startOffset, end: node1TextLength } }
  ]),
  // 중간 노드들 전체 삭제
  ...middleNodeIds.map(nodeId => ({ type: 'delete', payload: { nodeId } })),
  ...control(range.endNodeId, [
    { type: 'deleteTextRange', payload: { start: 0, end: range.endOffset } }
  ])
]
```

---

## View Layer에서의 Command 선택

### InputHandler.handleDelete()

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  // 1. 비즈니스 로직: 삭제 범위 계산
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, currentNodeId);
  if (!contentRange) {
    return;
  }

  // 2. 비즈니스 로직: 어떤 Command를 호출할지 결정
  let success = false;
  
  if (contentRange._deleteNode && contentRange.nodeId) {
    // 노드 전체 삭제
    success = await this.editor.executeCommand('deleteNode', { 
      nodeId: contentRange.nodeId 
    });
  } else if (contentRange.startNodeId !== contentRange.endNodeId) {
    // Cross-node 삭제
    success = await this.editor.executeCommand('deleteCrossNode', { 
      range: contentRange 
    });
  } else {
    // 단일 노드 텍스트 삭제
    success = await this.editor.executeCommand('deleteText', { 
      range: contentRange 
    });
  }

  if (!success) {
    console.warn('[InputHandler] handleDelete: command failed');
    return;
  }

  // 3. Selection 업데이트 및 렌더링
  // ...
}
```

---

## DeleteExtension 구조

### Command 등록

```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // 1. 노드 전체 삭제
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: Editor, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.nodeId != null;
      }
    });

    // 2. Cross-node 텍스트 삭제
    editor.registerCommand({
      name: 'deleteCrossNode',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteCrossNode(editor, payload.range);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null && 
               payload.range.startNodeId !== payload.range.endNodeId;
      }
    });

    // 3. 단일 노드 텍스트 삭제
    editor.registerCommand({
      name: 'deleteText',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteText(editor, payload.range);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null && 
               payload.range.startNodeId === payload.range.endNodeId;
      }
    });
  }
}
```

---

### Command 구현

```typescript
// packages/extensions/src/delete.ts

/**
 * 노드 전체 삭제
 */
private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
  const operations = this._buildDeleteNodeOperations(nodeId);
  const result = await transaction(editor, operations).commit();
  return result.success;
}

/**
 * Cross-node 텍스트 삭제
 * 
 * 현재: dataStore.range.deleteText 직접 호출
 * 향후: transaction operation으로 전환
 */
private async _executeDeleteCrossNode(editor: Editor, range: ContentRange): Promise<boolean> {
  const dataStore = (editor as any).dataStore;
  if (!dataStore) {
    console.error('[DeleteExtension] dataStore not found');
    return false;
  }

  // 현재: dataStore.range.deleteText 직접 호출
  // TODO: transaction operation으로 전환
  try {
    dataStore.range.deleteText(range);
    return true;
  } catch (error) {
    console.error('[DeleteExtension] deleteCrossNode failed', error);
    return false;
  }
}

/**
 * 단일 노드 텍스트 삭제
 */
private async _executeDeleteText(editor: Editor, range: ContentRange): Promise<boolean> {
  const operations = this._buildDeleteTextOperations(range);
  const result = await transaction(editor, operations).commit();
  return result.success;
}
```

---

### Operations 조합

```typescript
// packages/extensions/src/delete.ts

/**
 * 노드 전체 삭제 operations 생성
 */
private _buildDeleteNodeOperations(nodeId: string): any[] {
  return [
    {
      type: 'delete',
      payload: { nodeId }
    }
  ];
}

/**
 * 단일 노드 텍스트 삭제 operations 생성
 */
private _buildDeleteTextOperations(range: ContentRange): any[] {
  return [
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
}

/**
 * Cross-node 텍스트 삭제 operations 생성 (향후 구현)
 * 
 * 현재는 dataStore.range.deleteText 직접 호출
 * 향후 여러 operations를 조합하여 transaction으로 처리
 */
private _buildCrossNodeDeleteOperations(range: ContentRange): any[] {
  // TODO: 여러 노드에 걸친 삭제 operations 조합
  // 1. 시작 노드의 일부 삭제
  // 2. 중간 노드들 전체 삭제
  // 3. 끝 노드의 일부 삭제
  return [];
}
```

---

## 시나리오별 Command 매핑

### 시나리오 1: Collapsed Selection + Backspace

**상황**: 커서가 노드 중간에 있음

```
[text-1: "Hello|World"]  // | = 커서
```

**처리**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 5, endOffset: 6 }`
2. View Layer: `startNodeId === endNodeId` → `deleteText` Command 호출
3. Command: `deleteTextRange` operation 실행

---

### 시나리오 2: Collapsed Selection + Backspace (노드 시작)

**상황**: 커서가 노드 시작 위치에 있고, 이전 노드가 `.text` 필드가 없는 inline 노드

```
[image-1] [text-1: "|Hello"]
```

**처리**:
1. View Layer: `calculateCrossNodeDeleteRange` → `{ _deleteNode: true, nodeId: 'image-1' }`
2. View Layer: `_deleteNode === true` → `deleteNode` Command 호출
3. Command: `delete` operation 실행

---

### 시나리오 3: Collapsed Selection + Backspace (노드 시작, 이전 노드 텍스트)

**상황**: 커서가 노드 시작 위치에 있고, 이전 노드가 텍스트 노드

```
[text-1: "Hello"] [text-2: "|World"]
```

**처리**:
1. View Layer: `calculateCrossNodeDeleteRange` → `{ startNodeId: 'text-1', startOffset: 4, endOffset: 5 }`
2. View Layer: `startNodeId === endNodeId` → `deleteText` Command 호출
3. Command: `deleteTextRange` operation 실행

---

### 시나리오 4: Range Selection (단일 노드)

**상황**: 같은 노드 내에서 텍스트 선택

```
[text-1: "He|llo|World"]  // | = 선택 범위
```

**처리**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 2, endOffset: 5 }`
2. View Layer: `startNodeId === endNodeId` → `deleteText` Command 호출
3. Command: `deleteTextRange` operation 실행

---

### 시나리오 5: Range Selection (Cross-node)

**상황**: 여러 노드에 걸친 텍스트 선택

```
[text-1: "He|llo"] [text-2: "Wo|rld"]  // | = 선택 범위
```

**처리**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 2, endNodeId: 'text-2', endOffset: 2 }`
2. View Layer: `startNodeId !== endNodeId` → `deleteCrossNode` Command 호출
3. Command: `dataStore.range.deleteText` 직접 호출 (향후 operations 조합으로 전환)

---

## 향후 개선 사항

### 1. Cross-node 삭제를 Transaction Operation으로 전환

**현재**: `dataStore.range.deleteText` 직접 호출

**향후**: 여러 operations 조합

```typescript
private _buildCrossNodeDeleteOperations(range: ContentRange): any[] {
  const operations: any[] = [];
  
  // 1. 시작 노드의 일부 삭제
  const startNode = dataStore.getNode(range.startNodeId);
  const startNodeTextLength = startNode?.text?.length || 0;
  if (range.startOffset < startNodeTextLength) {
    operations.push(
      ...control(range.startNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: range.startOffset,
            end: startNodeTextLength
          }
        }
      ])
    );
  }
  
  // 2. 중간 노드들 전체 삭제
  const middleNodeIds = this._getMiddleNodeIds(range);
  for (const nodeId of middleNodeIds) {
    operations.push({
      type: 'delete',
      payload: { nodeId }
    });
  }
  
  // 3. 끝 노드의 일부 삭제
  if (range.endOffset > 0) {
    operations.push(
      ...control(range.endNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: 0,
            end: range.endOffset
          }
        }
      ])
    );
  }
  
  return operations;
}
```

---

### 2. Block 삭제 Command 추가 (향후)

**시나리오**: 전체 블록이 선택된 경우

```typescript
editor.registerCommand({
  name: 'deleteBlock',
  execute: async (editor: Editor, payload: { blockId: string }) => {
    // 블록 전체 삭제
  }
});
```

---

## 정리

### Command 분리 원칙

1. ✅ **명확한 책임**: 각 Command는 하나의 명확한 작업만 수행
   - `deleteNode`: 노드 전체 삭제
   - `deleteText`: 단일 노드 텍스트 삭제
   - `deleteCrossNode`: Cross-node 텍스트 삭제

2. ✅ **독립적 테스트**: 각 Command를 독립적으로 테스트 가능

3. ✅ **이해하기 쉬움**: Command 이름만 봐도 무엇을 하는지 명확

### View Layer 책임

1. ✅ **비즈니스 로직**: 어떤 Command를 호출할지 결정
2. ✅ **범위 계산**: 삭제 범위 계산 및 Command 선택

### Command 책임

1. ✅ **Operations 조합**: 받은 payload를 보고 operations 조합
2. ✅ **Transaction 실행**: `transaction(editor, operations).commit()`

