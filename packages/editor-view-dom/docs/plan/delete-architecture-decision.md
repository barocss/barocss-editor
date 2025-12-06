# 삭제 처리 아키텍처 결정

## 핵심 질문

1. Command → Transaction → DataStore 레이어가 맞는가?
2. Operations 조합을 어디서 해야 하는가?
3. History/Undo-Redo는 누가 관리하는가?
4. Command를 사용해야 하는가, 아니면 Operations를 바로 호출해야 하는가?

---

## 현재 구조 분석

### 1. TransactionManager의 History 통합

```typescript
// packages/model/src/transaction.ts
async execute(operations: ...): Promise<TransactionResult> {
  // ...
  
  // 7. 히스토리에 추가 (성공한 경우에만)
  if (executedOperations.length > 0 && this._shouldAddToHistory(executedOperations)) {
    this._editor.historyManager.push({
      operations: executedOperations,
      inverseOperations: inverseOperations.reverse(),
      description: this._currentTransaction?.description
    });
  }
  
  // ...
}
```

**발견**:
- ✅ **TransactionManager가 자동으로 HistoryManager에 추가**
- ✅ `_shouldAddToHistory()`로 undo/redo 중인지 체크
- ✅ History는 `TransactionOperation[]` 기반

### 2. Undo/Redo 동작

```typescript
// packages/editor-core/src/editor.ts
Editor.prototype.undo = async function(): Promise<boolean> {
  const entry = this._historyManager.undo();
  if (!entry) return false;
  
  this._transactionManager._isUndoRedoOperation = true;
  const result = await this._transactionManager.execute(entry.inverseOperations);
  this._transactionManager._isUndoRedoOperation = false;
  
  return result.success;
};
```

**발견**:
- ✅ Undo/Redo는 HistoryManager에서 `inverseOperations`를 가져와서 실행
- ✅ TransactionManager가 History를 관리하는 주체

### 3. Extension 패턴

```typescript
// packages/editor-core/src/extensions/bold.ts
onCreate(_editor: Editor): void {
  _editor.registerCommand({
    name: 'toggleBold',
    execute: async (editor: Editor) => {
      // Command 내부에서 Transaction 사용
      const tm = new TransactionManager(editor.dataStore);
      const transaction = tm.createBuilder('bold_toggle');
      // ...
      return await transaction.commit();
    }
  });
}
```

**발견**:
- ✅ Extension이 Command를 등록
- ✅ Command 내부에서 Transaction 사용
- ⚠️ 하지만 `BoldExtension`은 구식 TransactionBuilder 사용 (새로운 `transaction()` DSL 아님)

---

## 아키텍처 옵션 비교

### 옵션 1: Command 패턴 (Extension 기반) ✅ (권장)

**구조**:
```
handleDelete (View)
  ↓
editor.executeCommand('delete', { range })
  ↓
deleteCommand.execute() (Extension에서 정의)
  ↓
transaction(editor, operations).commit()
  ↓
TransactionManager.execute()
  ↓ (자동)
HistoryManager.push()
  ↓
DataStore 변경
```

**장점**:
- ✅ **History 자동 관리**: TransactionManager가 자동으로 HistoryManager에 추가
- ✅ **레이어 분리**: View는 Command만 호출
- ✅ **재사용성**: 다른 곳에서도 동일한 Command 사용
- ✅ **일관성**: Extension 패턴과 일치
- ✅ **확장성**: Extension에서 Command 정의

**단점**:
- ⚠️ Extension 등록 필요

**구현**:
```typescript
// packages/editor-core/src/extensions/delete.ts
export class DeleteExtension implements Extension {
  name = 'delete';
  
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'delete',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        const operations = this._buildDeleteOperations(payload.range);
        const result = await transaction(editor, operations).commit();
        return result.success;
      }
    });
  }
  
  private _buildDeleteOperations(range: ContentRange): any[] {
    // Operations 조합 로직
  }
}
```

---

### 옵션 2: Operations 직접 호출 (Command 없음)

**구조**:
```
handleDelete (View)
  ↓
operations = buildDeleteOperations(range)
  ↓
transaction(editor, operations).commit()
  ↓
TransactionManager.execute()
  ↓ (자동)
HistoryManager.push()
  ↓
DataStore 변경
```

**장점**:
- ✅ **단순함**: Command 레이어 없음
- ✅ **History 자동 관리**: TransactionManager가 자동으로 처리
- ✅ **직접적**: 불필요한 레이어 제거

**단점**:
- ❌ **재사용성 낮음**: 다른 곳에서 사용 시 중복 코드
- ❌ **테스트 어려움**: View 레이어에 비즈니스 로직 포함
- ❌ **일관성 부족**: 다른 기능(Bold, Italic 등)은 Command 사용

**구현**:
```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts
private async handleDelete(event: InputEvent): Promise<void> {
  const contentRange = this.calculateDeleteRange(...);
  const operations = this._buildDeleteOperations(contentRange);
  const result = await transaction(this.editor, operations).commit();
  // ...
}
```

---

### 옵션 3: Command 타입만 editor-core, 정의는 Extension

**구조**:
```
editor-core: Command 인터페이스만 정의
  ↓
Extension: Command 구현 및 등록
  ↓
View: Command 호출
```

**장점**:
- ✅ **관심사 분리**: editor-core는 타입만, Extension은 구현
- ✅ **확장성**: 각 Extension이 자신의 Command 정의
- ✅ **일관성**: 현재 Extension 패턴과 일치

**단점**:
- ⚠️ Extension 등록 필요

**구현**:
```typescript
// packages/editor-core/src/types.ts
export interface Command {
  name: string;
  execute: (editor: Editor, payload?: any) => Promise<boolean>;
  // ...
}

// packages/editor-core/src/extensions/delete.ts
export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'delete',
      execute: async (editor, payload) => {
        // 구현
      }
    });
  }
}
```

---

## 권장 사항

### ✅ 옵션 1: Command 패턴 (Extension 기반)

**이유**:

1. **History 자동 관리**
   - TransactionManager가 자동으로 HistoryManager에 추가
   - Command는 History를 신경 쓸 필요 없음
   - `_shouldAddToHistory()`로 undo/redo 중 체크

2. **레이어 분리**
   ```
   View Layer (editor-view-dom)
     → Command 호출만
   
   Command Layer (Extension)
     → Operations 조합
   
   Transaction Layer (model)
     → History 자동 관리
     → DataStore 변경
   ```

3. **일관성**
   - Bold, Italic, Heading 등도 Extension으로 Command 등록
   - 동일한 패턴 사용

4. **확장성**
   - 각 Extension이 자신의 Command 정의
   - editor-core는 Command 타입만 제공

---

## 구현 계획

### 1. DeleteExtension 생성

**위치**: `packages/editor-core/src/extensions/delete.ts`

```typescript
import { Extension } from '../types';
import { transaction, control } from '@barocss/model';

export class DeleteExtension implements Extension {
  name = 'delete';
  priority = 100;
  
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'delete',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDelete(editor, payload.range);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null;
      }
    });
  }
  
  private async _executeDelete(editor: Editor, range: ContentRange): Promise<boolean> {
    const operations = this._buildDeleteOperations(range, editor);
    
    // Cross-node 범위는 직접 처리 (향후 operation 추가)
    if (range.startNodeId !== range.endNodeId && !range._deleteNode) {
      editor.dataStore.range.deleteText(range);
      return true;
    }
    
    // Transaction 실행 (History 자동 관리)
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
  
  private _buildDeleteOperations(range: ContentRange, editor: Editor): any[] {
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
    
    return operations;
  }
}
```

### 2. Extension 등록

**위치**: `apps/editor-test/src/main.ts` 또는 Editor 초기화 시

```typescript
import { DeleteExtension } from '@barocss/editor-core/extensions/delete';

const editor = new Editor({
  extensions: [
    new DeleteExtension(),
    // ... 다른 extensions
  ]
});
```

### 3. View에서 Command 호출

**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
private async handleDelete(event: InputEvent): Promise<void> {
  // ...
  
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, modelSelection.startNodeId);
  if (!contentRange) return;
  
  // Command 호출 (History는 TransactionManager가 자동 관리)
  const success = await this.editor.executeCommand('delete', { range: contentRange });
  if (!success) {
    console.error('[InputHandler] handleDelete: command failed');
    return;
  }
  
  // Selection 업데이트 등 후처리
  // ...
}
```

---

## History 관리 흐름

### 정상 실행

```
1. handleDelete() 호출
2. editor.executeCommand('delete', { range })
3. deleteCommand.execute() 실행
4. transaction(editor, operations).commit()
5. TransactionManager.execute()
   - Operations 실행
   - Inverse operations 수집
   - HistoryManager.push() 자동 호출 ✅
6. DataStore 변경
```

### Undo 실행

```
1. editor.undo() 호출
2. HistoryManager.undo() → inverseOperations 반환
3. TransactionManager.execute(inverseOperations)
   - _isUndoRedoOperation = true
   - _shouldAddToHistory() → false (History에 추가 안 함) ✅
4. DataStore 변경
```

---

## 결론

### ✅ Command 패턴 사용 (Extension 기반)

**핵심 포인트**:

1. **History는 TransactionManager가 자동 관리**
   - Command는 History를 신경 쓸 필요 없음
   - `transaction().commit()`만 호출하면 됨

2. **Operations 조합은 Extension에서**
   - `DeleteExtension`에서 `_buildDeleteOperations()` 구현
   - View는 Command만 호출

3. **editor-core는 Command 타입만 제공**
   - Extension이 Command 구현 및 등록
   - 일관된 패턴 유지

4. **레이어 구조**
   ```
   View (editor-view-dom)
     → Command 호출
   
   Extension (editor-core/extensions)
     → Operations 조합
     → Transaction 실행
   
   TransactionManager (model)
     → History 자동 관리
     → DataStore 변경
   ```

이 구조가 가장 깔끔하고 확장 가능합니다.

