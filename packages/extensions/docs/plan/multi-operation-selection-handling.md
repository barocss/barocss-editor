# Handling Selection Across Multiple Operations

## Problem

**Operations can run in a transaction as a list. Each operation can change selection, but how do we manage selection consistently?**

---

## Current structure analysis

### 1) Multiple operations in a transaction

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),  // selection manager clone
    this._schema!
  );
  
  // run multiple ops sequentially
  for (const operation of operations) {
    await this._executeOperation(operation, context);
    // each op can mutate context.selectionManager
  }
  
  // but selectionAfter is not returned!
  return { success: true, operations: executedOperations };
}
```

**Current state:**
- Uses `context.selectionManager.clone()`
- Each op can mutate `context.selectionManager`
- But no explicit `selectionAfter` is returned

---

### 2) Selection changes inside operations

```typescript
// packages/model/src/operations/delete.ts

defineOperation('delete', 
  async (operation: any, context: TransactionContext) => {
    // ...
    // clear selection if deleted node was selected
    const currentSel = context.selectionManager.getCurrentSelection?.();
    if (currentSel && (currentSel.anchorId === nodeId || currentSel.focusId === nodeId)) {
      context.selectionManager.clearSelection();  // direct mutation
    }
    // ...
  }
);
```

**Issues:**
- Each op mutates `context.selectionManager` directly
- Transaction doesn’t know final selection
- `selectionAfter` is not explicitly computed/returned

---

## Intended design (`selection-mapping-spec.md`)

### Target structure

```typescript
// TransactionManager
const before = editor.selection.clone();
const current = { ...before };
const selection = makeSelectionContext(before, current, dataStore);

for (const op of ops) {
  await def.execute(op, { dataStore, schema, selection });
  // each op updates selection.current via selection.set*
}

return { selectionBefore: before, selectionAfter: current };
```

**Key points:**
- `context.selection` holds `before` and `current`
- Ops call `selection.set*` to update `current`
- TransactionManager returns final `current` as `selectionAfter`

---

## Solution

### Option 1: Local SelectionContext (spec-aligned, recommended)

#### 1. Add `selection` to `TransactionContext`

```typescript
// packages/model/src/types.ts

export interface SelectionContext {
  before: ModelSelection;   // snapshot at transaction start
  current: ModelSelection;  // mutable; becomes selectionAfter
  setSelection(next: ModelSelection): void;
  setCaret(nodeId: string, offset: number): void;
  setRange(aId: string, aOff: number, fId: string, fOff: number): void;
}

export interface TransactionContext {
  dataStore: DataStore;
  selectionManager: SelectionManager;
  selection: SelectionContext;  // ← new
  schema?: any;
}
```

#### 2. Update `createTransactionContext`

```typescript
// packages/model/src/create-transaction-context.ts

export function createTransactionContext(
  dataStore: DataStore,
  selectionManager: SelectionManager,
  schema: Schema
): TransactionContext {
  const before = selectionManager.getCurrentSelection() || null;
  const current = before ? { ...before } : null;
  
  const selection: SelectionContext = {
    before: before!,
    current: current!,
    setSelection: (next: ModelSelection) => {
      if (current) Object.assign(current, next);
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
  
  return { dataStore, selectionManager, selection, schema };
}
```

#### 3. Ops use `context.selection`

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // Update selection offsets
    if (context.selection?.current) {
      const sel = context.selection.current;
      if (sel.anchorId === nodeId) {
        if (sel.anchorOffset >= start && sel.anchorOffset < end) sel.anchorOffset = start;
        else if (sel.anchorOffset >= end) sel.anchorOffset -= (end - start);
      }
      if (sel.focusId === nodeId) {
        if (sel.focusOffset >= start && sel.focusOffset < end) sel.focusOffset = start;
        else if (sel.focusOffset >= end) sel.focusOffset -= (end - start);
      }
      sel.collapsed = sel.anchorId === sel.focusId && sel.anchorOffset === sel.focusOffset;
    }
    
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } }
    };
  }
);
```

#### 4. TransactionManager returns `selectionAfter`

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),
    this._schema!
  );
  const selectionBefore = context.selection.before;

  for (const operation of operations) {
    await this._executeOperation(operation, context);
  }

  const selectionAfter = context.selection.current;

  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,
    selectionAfter
  };
}
```

---

### Option 2: Clone SelectionManager (improved current approach)

```typescript
async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  const selectionBefore = this._editor.selectionManager.getCurrentSelection();
  const clonedSelectionManager = this._editor.selectionManager.clone();

  const context = createTransactionContext(
    this._dataStore, 
    clonedSelectionManager,
    this._schema!
  );

  for (const operation of operations) {
    await this._executeOperation(operation, context);
  }

  const selectionAfter = clonedSelectionManager.getCurrentSelection();

  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,
    selectionAfter
  };
}
```

**Pros**:
- Minimal change; uses existing SelectionManager API

**Cons**:
- Depends on `SelectionManager.clone()` correctness
- Selection mutations are not explicit

---

## Recommendation: Option 1 (local SelectionContext)

### Reasons

1) **Spec alignment**
   - Matches `selection-mapping-spec.md` intent
   - Clear `before`/`current` structure

2) **Explicit selection management**
   - Ops call `selection.set*` to update `current`
   - TransactionManager returns final `current` cleanly

3) **Testability**
   - `selectionBefore`/`selectionAfter` can be asserted directly
   - Selection changes per op are traceable

---

## Example: selection across multiple operations

```typescript
// Example: deleteTextRange + insertText
await transaction(editor, [
  control('text-1', [
    { type: 'deleteTextRange', payload: { start: 5, end: 10 } }
  ]),
  control('text-1', [
    { type: 'insertText', payload: { pos: 5, text: 'new' } }
  ])
]).commit();

// Processing order:
// 1. deleteTextRange: adjust selection offsets
//    - if offset in [5,10): clamp to 5
//    - if offset >= 10: shift by -(10-5)
// 2. insertText: adjust selection offsets
//    - if offset >= 5: shift by +3
// 3. Final selectionAfter = selection.current
```

---

## Summary

### Current issues
- ❌ No explicit `selectionAfter`
- ❌ Selection mutations per op aren’t tracked
- ❌ `TransactionResult` lacks `selectionBefore`/`selectionAfter`

### Fixes
- ✅ Add `selection: SelectionContext` to `TransactionContext`
- ✅ Ops update `current` via `selection.set*`
- ✅ TransactionManager returns `selectionBefore`/`selectionAfter`
- ✅ Add these to `TransactionResult`

---

## Next steps

1) Define `SelectionContext` interface
2) Update `createTransactionContext`
3) Update operations (`deleteTextRange`, `insertText`, `delete`, etc.)
4) Update TransactionManager
5) Update `TransactionResult` type
