# Operation에서 Selection 처리 방법

## 질문

1. **`defineOperation`에서 selection에 대한 처리를 안 해도 되는가?**
2. **Transaction의 `selectionAfter`에서는 어떻게 selection을 처리하는가?**

---

## 현재 구현 상태

### 1. `defineOperation`의 Selection 처리 옵션

```typescript
// packages/model/src/operations/define-operation.ts

export function defineOperation<T extends any>(
  name: string, 
  executor: (operation: T, context: TransactionContext) => Promise<void | INode>,
  selectionMapper?: (operation: T, context: TransactionContext) => any  // ← 옵션
): void {
  globalOperationRegistry.register(name, { 
    name, 
    execute: executor as any,
    mapSelection: selectionMapper as any  // ← 등록되지만 실제로 사용되지 않음
  });
}
```

**현재 상태:**
- `selectionMapper` 옵션이 있지만 **실제로 사용되지 않음**
- TransactionManager에서 `mapSelection`을 호출하는 코드가 없음

---

### 2. `TransactionContext`의 Selection

```typescript
// packages/model/src/types.ts

export interface TransactionContext {
  dataStore: DataStore;
  selectionManager: SelectionManager;  // ← SelectionManager 인스턴스
  selection?: ModelSelection;           // ← 현재 selection 스냅샷
  schema?: any;
}
```

**현재 상태:**
- `selectionManager`: Selection을 변경할 수 있는 인스턴스
- `selection`: 트랜잭션 시작 시점의 selection 스냅샷 (읽기 전용)

---

### 3. Operation에서 Selection 처리 방법

#### 방법 1: 직접 `selectionManager` 사용 (현재 사용 중)

```typescript
// packages/model/src/operations/delete.ts

defineOperation('delete', 
  async (operation: any, context: TransactionContext) => {
    // ...
    
    // 선택된 노드 삭제 시 selection 클리어
    const currentSel = context.selectionManager.getCurrentSelection?.();
    if (currentSel && (currentSel.anchorId === nodeId || currentSel.focusId === nodeId)) {
      context.selectionManager.clearSelection();  // ← 직접 변경
    }
    
    // ...
  }
);
```

**문제점:**
- Operation이 직접 `selectionManager`를 변경
- Transaction 중간에 selection이 변경됨
- `selectionAfter`가 명시적으로 계산되지 않음

---

#### 방법 2: Selection 매핑 사용 (문서에는 있지만 미구현)

```typescript
// paper/selection-mapping-spec.md

// Operation Guidelines
- deleteTextRange(nodeId, start, end)
  - 동일 nodeId에서 offset∈[start,end) → start로 클램프, offset≥end → offset-= (end-start)
```

**의도:**
- Operation이 selection 매핑 규칙을 반환
- TransactionManager가 모든 매핑을 적용하여 `selectionAfter` 계산

**현재 상태:**
- 문서에는 명시되어 있지만 **실제 구현은 없음**

---

### 4. Transaction의 `selectionAfter` 처리

#### 현재 구현

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // ...
  
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),  // ← SelectionManager 클론
    this._schema!
  );
  
  // Operations 실행
  for (const operation of operations) {
    await this._executeOperation(operation, context);
  }
  
  // ...
  
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations
    // ← selectionAfter가 없음!
  };
}
```

**문제점:**
- `TransactionResult`에 `selectionAfter`가 없음
- Selection 변경이 Operation에서 직접 이루어짐
- Transaction 완료 후 selection 상태를 명시적으로 반환하지 않음

---

## 권장 구조

### 1. Operation에서 Selection 처리 방법

#### 옵션 A: Selection 매핑 규칙 반환 (권장)

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;
    
    // 1. DataStore 업데이트
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2. Selection 매핑 규칙 반환 (직접 변경하지 않음)
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } },
      // Selection 매핑 규칙
      selectionMapping: {
        // 같은 노드에서 삭제 범위 내의 offset → start로 클램프
        // 삭제 범위 이후의 offset → offset - (end - start)
        mapOffset: (targetNodeId: string, targetOffset: number) => {
          if (targetNodeId !== nodeId) return { nodeId: targetNodeId, offset: targetOffset };
          if (targetOffset >= start && targetOffset < end) {
            return { nodeId, offset: start };  // 클램프
          }
          if (targetOffset >= end) {
            return { nodeId, offset: targetOffset - (end - start) };  // 시프트
          }
          return { nodeId, offset: targetOffset };  // 변경 없음
        }
      }
    };
  }
);
```

**장점:**
- Operation이 순수하게 데이터 변경만 수행
- Selection 매핑이 명시적으로 반환됨
- TransactionManager가 모든 매핑을 적용하여 `selectionAfter` 계산 가능

---

#### 옵션 B: `context.selection` 직접 수정 (현재 방식, 개선 필요)

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;
    
    // 1. DataStore 업데이트
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2. Selection 매핑 (context.selection 직접 수정)
    if (context.selection) {
      const newSelection = this._mapSelectionAfterDelete(
        context.selection,
        nodeId,
        start,
        end
      );
      // context.selection을 업데이트하는 방법 필요
      // 현재는 selectionManager를 직접 사용하지만, 이는 문제가 있음
    }
    
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } }
    };
  }
);
```

**문제점:**
- `context.selection`은 읽기 전용 스냅샷
- `selectionManager`를 직접 변경하면 Transaction 중간에 selection이 변경됨

---

### 2. TransactionManager에서 `selectionAfter` 계산

#### 개선된 구조

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // 1. Selection 스냅샷
  const selectionBefore = this._editor.selectionManager.getCurrentSelection();
  let selectionAfter = { ...selectionBefore };  // 로컬 복사본
  
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),
    this._schema!
  );
  
  // 2. Operations 실행 및 Selection 매핑 수집
  const selectionMappings: SelectionMapping[] = [];
  
  for (const operation of operations) {
    const result = await this._executeOperation(operation, context);
    
    // Selection 매핑 규칙 수집
    if (result?.result?.selectionMapping) {
      selectionMappings.push(result.result.selectionMapping);
    }
  }
  
  // 3. 모든 Selection 매핑 적용하여 selectionAfter 계산
  for (const mapping of selectionMappings) {
    selectionAfter = this._applySelectionMapping(selectionAfter, mapping);
  }
  
  // 4. 결과 반환
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,      // ← 추가
    selectionAfter        // ← 추가
  };
}
```

---

## 결론

### 현재 상태

1. **`defineOperation`에서 selection 처리:**
   - ❌ `selectionMapper` 옵션이 있지만 **사용되지 않음**
   - ✅ Operation에서 `context.selectionManager`를 직접 사용 (문제 있음)

2. **Transaction의 `selectionAfter`:**
   - ❌ `TransactionResult`에 `selectionAfter`가 **없음**
   - ❌ Selection 변경이 Operation에서 직접 이루어짐

---

### 권장 방안

1. **Operation에서 Selection 매핑 규칙 반환:**
   ```typescript
   return {
     ok: true,
     data: deletedText,
     selectionMapping: { ... }  // ← 매핑 규칙 반환
   };
   ```

2. **TransactionManager에서 `selectionAfter` 계산:**
   ```typescript
   // 모든 operation의 selectionMapping을 수집
   // 순차적으로 적용하여 selectionAfter 계산
   ```

3. **`TransactionResult`에 `selectionAfter` 추가:**
   ```typescript
   interface TransactionResult {
     success: boolean;
     selectionBefore?: ModelSelection;  // ← 추가
     selectionAfter?: ModelSelection;   // ← 추가
     // ...
   }
   ```

---

## 구현 우선순위

### Phase 1: 기본 구조 (현재)
- ✅ Operation에서 `context.selectionManager` 직접 사용
- ❌ `selectionAfter` 명시적 계산 없음

### Phase 2: Selection 매핑 도입 (권장)
- ⏳ Operation이 selection 매핑 규칙 반환
- ⏳ TransactionManager가 모든 매핑을 적용하여 `selectionAfter` 계산
- ⏳ `TransactionResult`에 `selectionBefore`/`selectionAfter` 추가

---

## 참고

- `paper/selection-mapping-spec.md`: Selection 매핑 스펙 (문서만 있음, 구현 없음)
- `packages/model/src/operations/delete.ts`: 현재 `selectionManager` 직접 사용 예시
- `packages/model/src/operations/deleteTextRange.ts`: Selection 매핑 없음 (주석만 있음)

