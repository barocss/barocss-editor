# Transaction 기반 삭제 처리 전환 계획

## 현재 상태

### 현재 구현 (직접 DataStore 호출)

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts
private handleDelete(event: InputEvent): void {
  // ...
  
  // 텍스트 삭제
  dataStore.range.deleteText(contentRange);
  
  // 노드 삭제
  dataStore.deleteNode(nodeId);
  
  // ...
}
```

**특징**:
- `dataStore.range.deleteText()` 직접 호출
- `dataStore.deleteNode()` 직접 호출
- Transaction 시스템을 거치지 않음
- History/Undo-Redo와 통합되지 않음

---

## Transaction 시스템 개요

### Transaction Manager

```typescript
// packages/model/src/transaction.ts
export class TransactionManager {
  async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult>;
}
```

### 사용 가능한 Operations

1. **`deleteTextRange`**: 단일 노드 내 텍스트 범위 삭제
   ```typescript
   { type: 'deleteTextRange', payload: { nodeId, start, end } }
   ```

2. **`delete`**: 노드 전체 삭제
   ```typescript
   { type: 'delete', payload: { nodeId } }
   ```

3. **`replaceText`**: 텍스트 교체 (삭제 + 삽입)
   ```typescript
   { type: 'replaceText', payload: { nodeId, start, end, newText } }
   ```

### DSL 사용법

```typescript
import { transaction, control } from '@barocss/model';

// 단일 노드 텍스트 삭제
await transaction(editor, [
  ...control(nodeId, [
    { type: 'deleteTextRange', payload: { start, end } }
  ])
]).commit();

// 노드 삭제
await transaction(editor, [
  { type: 'delete', payload: { nodeId } }
]).commit();
```

---

## 전환 계획

### 옵션 1: 완전 전환 (권장)

**장점**:
- History/Undo-Redo 자동 지원
- 원자성 보장 (락 시스템)
- 일관된 에러 처리
- 다른 에디터들과 유사한 패턴

**단점**:
- `deleteTextRange`는 단일 노드만 지원 (cross-node 범위는 직접 처리 필요)
- 비동기 처리 필요 (`async/await`)
- 약간의 오버헤드 (락 획득 등)

**구현**:
```typescript
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  const operations: any[] = [];
  
  // 텍스트 삭제 (단일 노드)
  if (contentRange.startNodeId === contentRange.endNodeId) {
    operations.push(
      ...control(contentRange.startNodeId, [
        { type: 'deleteTextRange', payload: { 
          start: contentRange.startOffset, 
          end: contentRange.endOffset 
        } }
      ])
    );
  } else {
    // Cross-node 범위: 직접 처리 또는 새로운 operation 필요
    // TODO: multi-node deleteTextRange operation 추가
    dataStore.range.deleteText(contentRange);
  }
  
  // 노드 삭제
  if (contentRange._deleteNode) {
    operations.push({
      type: 'delete',
      payload: { nodeId: contentRange.nodeId }
    });
  }
  
  // Transaction 실행
  if (operations.length > 0) {
    const result = await transaction(this.editor, operations).commit();
    if (!result.success) {
      console.error('[InputHandler] handleDelete: transaction failed', result.errors);
      return;
    }
  }
  
  // ...
}
```

---

### 옵션 2: 하이브리드 (점진적 전환)

**장점**:
- 기존 코드와 호환
- 점진적 전환 가능
- Cross-node 범위는 직접 처리

**단점**:
- 일관성 부족
- History/Undo-Redo 부분 지원

**구현**:
```typescript
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  // 단일 노드 텍스트 삭제: Transaction 사용
  if (contentRange.startNodeId === contentRange.endNodeId && !contentRange._deleteNode) {
    const result = await transaction(this.editor, [
      ...control(contentRange.startNodeId, [
        { type: 'deleteTextRange', payload: { 
          start: contentRange.startOffset, 
          end: contentRange.endOffset 
        } }
      ])
    ]).commit();
    
    if (!result.success) {
      console.error('[InputHandler] handleDelete: transaction failed', result.errors);
      return;
    }
  }
  // Cross-node 범위 또는 노드 삭제: 직접 처리
  else {
    if (contentRange._deleteNode) {
      dataStore.deleteNode(contentRange.nodeId);
    } else {
      dataStore.range.deleteText(contentRange);
    }
  }
  
  // ...
}
```

---

### 옵션 3: 현재 유지 + 향후 전환

**장점**:
- 즉시 변경 불필요
- 안정성 유지

**단점**:
- History/Undo-Redo 미지원
- 일관성 부족

---

## 권장 사항

### 단기 (지금부터)

**옵션 2: 하이브리드 접근** 권장

**이유**:
1. **단일 노드 삭제**: Transaction 사용
   - History/Undo-Redo 자동 지원
   - 대부분의 삭제 케이스 커버

2. **Cross-node 범위**: 직접 처리 유지
   - `deleteTextRange`는 단일 노드만 지원
   - 새로운 `deleteTextRangeMulti` operation 추가 전까지 직접 처리

3. **노드 삭제**: Transaction 사용
   - `delete` operation 활용
   - History/Undo-Redo 자동 지원

### 중기 (향후)

1. **Multi-node `deleteTextRange` operation 추가**
   ```typescript
   defineOperation('deleteTextRangeMulti', async (operation, context) => {
     const { startNodeId, startOffset, endNodeId, endOffset } = operation.payload;
     return context.dataStore.range.deleteText({
       startNodeId, startOffset, endNodeId, endOffset
     });
   });
   ```

2. **모든 삭제를 Transaction으로 전환**
   - Cross-node 범위도 Transaction 사용
   - 완전한 History/Undo-Redo 지원

---

## 구현 체크리스트

### Phase 1: 기본 전환 (현재)

- [ ] `handleDelete`를 `async`로 변경
- [ ] 단일 노드 텍스트 삭제를 Transaction으로 전환
- [ ] 노드 삭제를 Transaction으로 전환
- [ ] Cross-node 범위는 직접 처리 유지
- [ ] 에러 처리 추가

### Phase 2: Multi-node 지원 (향후)

- [ ] `deleteTextRangeMulti` operation 추가
- [ ] Cross-node 범위도 Transaction으로 전환
- [ ] 모든 삭제 케이스 Transaction 사용

---

## 고려사항

### 1. 비동기 처리

**현재**: 동기 처리
```typescript
dataStore.range.deleteText(contentRange);
```

**전환 후**: 비동기 처리
```typescript
await transaction(editor, operations).commit();
```

**영향**:
- `handleDelete`를 `async`로 변경 필요
- `handleBeforeInput`에서 `await` 필요

### 2. 에러 처리

**현재**: try-catch로 에러 처리
```typescript
try {
  dataStore.range.deleteText(contentRange);
} catch (error) {
  console.error('Failed to delete', error);
}
```

**전환 후**: TransactionResult 확인
```typescript
const result = await transaction(editor, operations).commit();
if (!result.success) {
  console.error('Transaction failed', result.errors);
  return;
}
```

### 3. Selection 업데이트

**현재**: 직접 계산 및 적용
```typescript
const newModelSelection = { ... };
this.editor.emit('editor:selection.change', { selection: newModelSelection });
```

**전환 후**: Transaction 내에서 처리하거나 별도 처리
- Transaction은 모델 변경만 담당
- Selection은 별도로 처리 (현재와 동일)

### 4. History/Undo-Redo

**현재**: 미지원

**전환 후**: 자동 지원
- Transaction의 `inverse` operation 활용
- History Manager와 통합 필요

---

## 결론

**지금부터 Transaction 기반으로 전환하는 것을 권장합니다.**

**이유**:
1. **History/Undo-Redo 자동 지원**: 사용자 경험 향상
2. **원자성 보장**: 락 시스템으로 일관성 유지
3. **일관된 패턴**: 다른 에디터들과 유사한 구조
4. **확장성**: 새로운 operation 추가 용이

**전환 전략**:
- **Phase 1**: 하이브리드 접근 (단일 노드/노드 삭제는 Transaction, Cross-node는 직접 처리)
- **Phase 2**: 완전 전환 (Multi-node operation 추가 후)

