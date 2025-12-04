# 여러 Operations에서 Selection 처리 방법

## 문제 상황

**Operations는 여러 개가 transaction 안에서 수행될 수 있어서, 개별 operation마다 selection을 지정할 수 있도록 한 것인데, 우리는 어떻게 해야 하는가?**

---

## 현재 구조 분석

### 1. Transaction 내 여러 Operations 실행

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),  // ← SelectionManager 클론
    this._schema!
  );
  
  // 여러 operations 순차 실행
  for (const operation of operations) {
    await this._executeOperation(operation, context);
    // 각 operation이 context.selectionManager를 변경할 수 있음
  }
  
  // 하지만 selectionAfter를 반환하지 않음!
  return { success: true, operations: executedOperations };
}
```

**현재 상태:**
- `context.selectionManager.clone()`을 사용하여 SelectionManager 클론
- 각 operation이 `context.selectionManager`를 직접 변경 가능
- 하지만 `selectionAfter`가 명시적으로 계산/반환되지 않음

---

### 2. 각 Operation에서 Selection 변경

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
- 각 operation이 `context.selectionManager`를 직접 변경
- Transaction 완료 후 최종 selection 상태를 알 수 없음
- `selectionAfter`가 명시적으로 계산되지 않음

---

## 문서 스펙 (`selection-mapping-spec.md`)

### 의도된 구조

```typescript
// TransactionManager
const before = editor.selection.clone();
const current = { ...before };
const selection = makeSelectionContext(before, current, dataStore);

for (const op of ops) {
  await def.execute(op, { dataStore, schema, selection });
  // 각 operation이 context.selection.set*으로 current를 갱신
}

return { selectionBefore: before, selectionAfter: current };
```

**핵심:**
- `context.selection`에 `before`와 `current`를 제공
- 각 operation이 `context.selection.set*`으로 `current`를 갱신
- TransactionManager가 최종 `current`를 `selectionAfter`로 반환

---

## 해결 방안

### 방안 1: 로컬 Selection 방식 (문서 스펙 준수, 권장)

#### 1. `TransactionContext`에 `selection` 추가

```typescript
// packages/model/src/types.ts

export interface SelectionContext {
  // 트랜잭션 시작 시점의 스냅샷
  before: ModelSelection;
  // 오퍼레이션들이 갱신하는 현재 값(최종 SelectionAfter)
  current: ModelSelection;
  // 유틸: 안전 보정 메서드
  setSelection(next: ModelSelection): void;
  setCaret(nodeId: string, offset: number): void;
  setRange(aId: string, aOff: number, fId: string, fOff: number): void;
}

export interface TransactionContext {
  dataStore: DataStore;
  selectionManager: SelectionManager;
  selection: SelectionContext;  // ← 추가
  schema?: any;
}
```

#### 2. `createTransactionContext` 수정

```typescript
// packages/model/src/create-transaction-context.ts

export function createTransactionContext(
  dataStore: DataStore,
  selectionManager: SelectionManager,
  schema: Schema
): TransactionContext {
  // Selection 스냅샷
  const before = selectionManager.getCurrentSelection() || null;
  const current = before ? { ...before } : null;
  
  // SelectionContext 생성
  const selection: SelectionContext = {
    before: before!,
    current: current!,
    setSelection: (next: ModelSelection) => {
      if (current) {
        Object.assign(current, next);
      }
    },
    setCaret: (nodeId: string, offset: number) => {
      if (current) {
        current.anchorId = nodeId;
        current.anchorOffset = offset;
        current.focusId = nodeId;
        current.focusOffset = offset;
        current.collapsed = true;
      }
    },
    setRange: (aId: string, aOff: number, fId: string, fOff: number) => {
      if (current) {
        current.anchorId = aId;
        current.anchorOffset = aOff;
        current.focusId = fId;
        current.focusOffset = fOff;
        current.collapsed = aId === fId && aOff === fOff;
      }
    }
  };
  
  return {
    dataStore,
    selectionManager,
    selection,  // ← 추가
    schema
  };
}
```

#### 3. Operation에서 `context.selection` 사용

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
    
    // 2. Selection 매핑 (context.selection.current 직접 수정)
    if (context.selection?.current) {
      const sel = context.selection.current;
      
      // anchor 처리
      if (sel.anchorId === nodeId) {
        if (sel.anchorOffset >= start && sel.anchorOffset < end) {
          // 삭제 범위 내 → start로 클램프
          sel.anchorOffset = start;
        } else if (sel.anchorOffset >= end) {
          // 삭제 범위 이후 → 시프트
          sel.anchorOffset -= (end - start);
        }
      }
      
      // focus 처리 (동일한 로직)
      if (sel.focusId === nodeId) {
        if (sel.focusOffset >= start && sel.focusOffset < end) {
          sel.focusOffset = start;
        } else if (sel.focusOffset >= end) {
          sel.focusOffset -= (end - start);
        }
      }
      
      // Collapsed 상태 업데이트
      sel.collapsed = sel.anchorId === sel.focusId && 
                      sel.anchorOffset === sel.focusOffset;
    }
    
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } }
    };
  }
);
```

#### 4. TransactionManager에서 `selectionAfter` 반환

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // ...
  
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),
    this._schema!
  );
  
  // Selection 스냅샷
  const selectionBefore = context.selection.before;
  
  // Operations 실행
  for (const operation of operations) {
    await this._executeOperation(operation, context);
    // 각 operation이 context.selection.current를 갱신
  }
  
  // 최종 selection 상태
  const selectionAfter = context.selection.current;
  
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,  // ← 추가
    selectionAfter    // ← 추가
  };
}
```

---

### 방안 2: SelectionManager 클론 방식 (현재 구현 개선)

#### 개선된 구조

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // ...
  
  // Selection 스냅샷
  const selectionBefore = this._editor.selectionManager.getCurrentSelection();
  
  // SelectionManager 클론 (로컬 변경용)
  const clonedSelectionManager = this._editor.selectionManager.clone();
  
  const context = createTransactionContext(
    this._dataStore, 
    clonedSelectionManager,  // ← 클론 사용
    this._schema!
  );
  
  // Operations 실행
  for (const operation of operations) {
    await this._executeOperation(operation, context);
    // 각 operation이 context.selectionManager를 변경
  }
  
  // 최종 selection 상태
  const selectionAfter = clonedSelectionManager.getCurrentSelection();
  
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,  // ← 추가
    selectionAfter    // ← 추가
  };
}
```

**장점:**
- 현재 구조와 호환
- `SelectionManager`의 기존 API 활용

**단점:**
- `SelectionManager.clone()`이 제대로 구현되어 있어야 함
- Selection 변경이 명시적이지 않음

---

## 권장 방안: **방안 1 (로컬 Selection 방식)**

### 이유

1. **문서 스펙 준수**
   - `selection-mapping-spec.md`의 의도와 일치
   - 명확한 `before`/`current` 구조

2. **명시적 Selection 관리**
   - 각 operation이 `context.selection.set*`으로 명시적으로 변경
   - TransactionManager가 최종 상태를 명확히 반환

3. **테스트 용이성**
   - `selectionBefore`/`selectionAfter`를 명시적으로 확인 가능
   - 각 operation의 selection 변경을 추적 가능

---

## 구현 예시

### 여러 Operations에서 Selection 처리

```typescript
// 예시: deleteTextRange + insertText

await transaction(editor, [
  // Operation 1: 텍스트 삭제
  control('text-1', [
    { type: 'deleteTextRange', payload: { start: 5, end: 10 } }
  ]),
  // Operation 2: 텍스트 삽입
  control('text-1', [
    { type: 'insertText', payload: { pos: 5, text: 'new' } }
  ])
]).commit();

// 처리 순서:
// 1. deleteTextRange: context.selection.current의 offset 조정
//    - offset >= 5 && offset < 10 → 5로 클램프
//    - offset >= 10 → offset - 5로 시프트
// 2. insertText: context.selection.current의 offset 조정
//    - offset >= 5 → offset + 3으로 시프트
// 3. 최종 selectionAfter = context.selection.current
```

---

## 정리

### 현재 문제

1. ❌ `selectionAfter`가 명시적으로 계산되지 않음
2. ❌ 각 operation의 selection 변경이 추적되지 않음
3. ❌ `TransactionResult`에 `selectionBefore`/`selectionAfter`가 없음

### 해결 방안

1. ✅ `TransactionContext`에 `selection: SelectionContext` 추가
2. ✅ 각 operation이 `context.selection.set*`으로 `current` 갱신
3. ✅ TransactionManager가 최종 `current`를 `selectionAfter`로 반환
4. ✅ `TransactionResult`에 `selectionBefore`/`selectionAfter` 추가

---

## 다음 단계

1. `SelectionContext` 인터페이스 정의
2. `createTransactionContext` 수정
3. 각 operation 수정 (`deleteTextRange`, `insertText`, `delete` 등)
4. TransactionManager 수정
5. `TransactionResult` 타입 수정

