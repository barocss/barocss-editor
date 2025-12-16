# Before Hooks 안전성 분석

## 현재 Transaction 구조

### 1. Transaction 생성 흐름

```typescript
// 1. Command에서 operations 배열 생성
const ops = [
  ...control(nodeId, [toggleMark('bold', [0, 5])])
];

// 2. TransactionBuilder 생성 (operations 배열 보관)
const builder = transaction(editor, ops);

// 3. commit() 호출 시 TransactionManager.execute() 실행
const result = await builder.commit();
```

### 2. TransactionManager.execute() 구조

```typescript
async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // 1. Lock 획득
  // 2. Transaction 시작
  // 3. DataStore overlay 시작
  // 4. Operations 실행 (복사본 사용: JSON.parse(JSON.stringify))
  // 5. Commit
  // 6. History 기록
  // 7. 이벤트 emit
}
```

**중요**: Operations는 실행 시점에 복사됨 (`JSON.parse(JSON.stringify(operation))`)

---

## Before Hooks 구현 위치

### 옵션 1: TransactionBuilder.commit() 전 (권장)

```typescript
// transaction-dsl.ts
class TransactionBuilderImpl {
  async commit(): Promise<TransactionResult> {
    // Before hooks 호출 (operations 수정 가능)
    let finalOps = this.ops;
    
    for (const ext of editor.extensions) {
      if (ext.onBeforeTransaction) {
        // Transaction 객체 생성 (operations 포함)
        const tx = { operations: finalOps, ... };
        const result = ext.onBeforeTransaction(editor, tx);
        
        if (result === null) {
          // 취소
          return { success: false, errors: ['Cancelled by extension'] };
        }
        
        if (result && result.operations) {
          // 수정된 operations 사용
          finalOps = result.operations;
        }
      }
    }
    
    // 수정된 operations로 실행
    const tm = new TransactionManager(this.editor);
    return tm.execute(finalOps);
  }
}
```

**장점**:
- Operations 배열 수정 가능
- Transaction 실행 전에 가로채기
- 여러 Extension이 순차적으로 처리 가능

**단점**:
- Transaction 객체를 임시로 생성해야 함

---

### 옵션 2: TransactionManager.execute() 내부

```typescript
async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // Before hooks 호출
  let finalOps = operations;
  
  for (const ext of this._editor.extensions) {
    if (ext.onBeforeTransaction) {
      const tx = { operations: finalOps, ... };
      const result = ext.onBeforeTransaction(this._editor, tx);
      
      if (result === null) {
        return { success: false, errors: ['Cancelled'] };
      }
      
      if (result && result.operations) {
        finalOps = result.operations;
      }
    }
  }
  
  // 이후 로직 계속...
}
```

**장점**:
- Lock 획득 전에 가로채기 가능
- 더 일찍 취소 가능

**단점**:
- Lock 획득 전이라 일부 검증 불가

---

## 안전성 고려사항

### 1. Immutability (불변성)

**문제**: Transaction이 mutable하면 여러 Extension이 동시에 수정할 때 충돌 가능

**해결**: 
- Operations 배열을 복사해서 전달
- Extension이 반환하는 새로운 배열 사용
- 원본 배열은 변경하지 않음

```typescript
// ✅ 안전한 방식
onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
  // 원본 operations 복사
  const newOps = [...transaction.operations];
  
  // 수정
  newOps.push(additionalOp);
  
  // 새로운 Transaction 반환
  return { ...transaction, operations: newOps };
}

// ❌ 위험한 방식
onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
  // 원본 배열 직접 수정 (다른 Extension에 영향)
  transaction.operations.push(additionalOp);
  return transaction;
}
```

---

### 2. Extension 실행 순서

**문제**: 여러 Extension이 동시에 수정하면 순서에 따라 결과가 달라질 수 있음

**해결**: Priority 기반 순차 실행

```typescript
// Extension들을 priority 순으로 정렬
const sortedExtensions = editor.extensions.sort((a, b) => 
  (a.priority || 100) - (b.priority || 100)
);

let finalOps = operations;

for (const ext of sortedExtensions) {
  if (ext.onBeforeTransaction) {
    const tx = { operations: finalOps, ... };
    const result = ext.onBeforeTransaction(editor, tx);
    
    if (result === null) return null; // 즉시 취소
    if (result && result.operations) {
      finalOps = result.operations; // 다음 Extension에 전달
    }
  }
}
```

**예시**:
```
Extension A (priority: 10): operations [1, 2] → [1, 2, 3]
Extension B (priority: 20): operations [1, 2, 3] → [1, 2, 3, 4]
Extension C (priority: 30): operations [1, 2, 3, 4] → 취소 (null)
결과: Transaction 취소
```

---

### 3. Transaction 취소 시점

**문제**: 언제 취소해야 하는가?

**해결**: 
- `null` 반환 시 즉시 취소
- 이후 Extension은 호출되지 않음
- Lock 획득 전에 취소하면 성능상 이점

```typescript
onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
  if (shouldCancel(transaction)) {
    return null; // 즉시 취소, 이후 Extension 호출 안 됨
  }
  return transaction; // 계속 진행
}
```

---

### 4. Operation 복사 안전성

**현재 구조**: `TransactionManager._executeOperation()`에서 이미 복사함

```typescript
// transaction.ts:242
const operationCopy = JSON.parse(JSON.stringify(operation));
```

**안전성**: 
- ✅ Operations는 실행 시점에 복사되므로 Before hooks에서 수정해도 안전
- ✅ Extension이 반환한 operations도 복사됨
- ✅ 원본 operations는 변경되지 않음

---

### 5. 순환 참조 방지

**문제**: Extension A가 수정 → Extension B가 다시 수정 → 무한 루프?

**해결**: 
- Before hooks는 한 번만 실행
- 수정된 transaction은 다음 Extension에만 전달
- 재귀 호출 방지

```typescript
// ✅ 안전: 한 번만 실행
let finalOps = operations;
for (const ext of extensions) {
  const result = ext.onBeforeTransaction(editor, { operations: finalOps });
  if (result) finalOps = result.operations;
}

// ❌ 위험: 재귀 호출 가능
onBeforeTransaction(editor, transaction) {
  // 또 다른 transaction 실행 → 무한 루프 가능
  editor.executeCommand('someCommand');
}
```

---

## ProseMirror/Tiptap 비교

### ProseMirror의 방식

```typescript
// ProseMirror는 Transaction이 immutable
const newTr = oldTr.insertText('Hello');
// oldTr은 변경되지 않음, newTr은 새로운 객체

// dispatchTransaction에서 가로채기
view.dispatchTransaction = (tr) => {
  // tr을 수정하거나 취소 가능
  const modified = modifyTransaction(tr);
  view.updateState(view.state.apply(modified));
};
```

**차이점**:
- ProseMirror: Transaction이 immutable, 새로운 Transaction 반환
- Barocss: Operations 배열을 수정 가능, 새로운 배열 반환

**공통점**:
- 모두 원본을 변경하지 않고 새로운 객체/배열 반환
- 취소는 `null` 또는 빈 transaction 반환

---

## 권장 구현 방식

### 1. TransactionBuilder.commit() 전에 가로채기

```typescript
// transaction-dsl.ts
class TransactionBuilderImpl {
  async commit(): Promise<TransactionResult> {
    // Before hooks 호출
    let finalOps = this.ops;
    
    const extensions = (this.editor as any)._extensions || [];
    const sorted = extensions.sort((a: any, b: any) => 
      (a.priority || 100) - (b.priority || 100)
    );
    
    for (const ext of sorted) {
      if (ext.onBeforeTransaction) {
        // Transaction 객체 생성
        const tx: Transaction = {
          sid: `tx-${Date.now()}`,
          operations: finalOps,
          timestamp: new Date()
        };
        
        const result = ext.onBeforeTransaction(this.editor, tx);
        
        // 취소 확인
        if (result === null) {
          return {
            success: false,
            errors: [`Transaction cancelled by extension: ${ext.name}`],
            operations: []
          };
        }
        
        // 수정된 operations 사용
        if (result && result.operations) {
          finalOps = result.operations;
        }
      }
    }
    
    // 수정된 operations로 실행
    const tm = new TransactionManager(this.editor);
    return tm.execute(finalOps);
  }
}
```

### 2. Extension 인터페이스

```typescript
interface Extension {
  onBeforeTransaction?(
    editor: Editor,
    transaction: Transaction
  ): Transaction | null | void;
  // - Transaction 반환: 수정된 transaction 사용
  // - null 반환: transaction 취소
  // - void: 그대로 진행
}
```

### 3. 안전한 사용 예시

```typescript
class SanitizeExtension implements Extension {
  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    // 원본 operations 복사
    const newOps = transaction.operations.map(op => {
      if (op.type === 'insertText') {
        // 수정된 operation 반환
        return {
          ...op,
          payload: {
            ...op.payload,
            text: this.sanitize(op.payload.text)
          }
        };
      }
      return op; // 그대로
    });
    
    // 새로운 Transaction 반환
    return {
      ...transaction,
      operations: newOps
    };
  }
}
```

---

## 결론

### 안전성 평가

1. **Immutable 처리**: ✅ Operations 배열 복사 후 수정
2. **순차 실행**: ✅ Priority 기반 순차 처리
3. **취소 안전성**: ✅ `null` 반환 시 즉시 취소
4. **복사 안전성**: ✅ 실행 시점에 이미 복사됨
5. **순환 참조**: ✅ 한 번만 실행, 재귀 방지

### 권장사항

1. **TransactionBuilder.commit() 전에 가로채기** (옵션 1)
   - Lock 획득 전에 취소 가능
   - Operations 수정 가능
   - 구현이 간단

2. **Immutable 패턴 준수**
   - 원본 operations 변경 금지
   - 새로운 배열 반환
   - Extension 간 독립성 보장

3. **Priority 기반 순차 실행**
   - 예측 가능한 실행 순서
   - 디버깅 용이
   - 충돌 최소화

**결론**: Before hooks는 안전하게 구현 가능하며, ProseMirror/Tiptap과 유사한 패턴을 따르면 문제없음.
