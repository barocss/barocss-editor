# How to Handle Selection in Operations

## Questions

1. **Do we not need to handle selection in `defineOperation`?**
2. **How is selection handled in Transaction's `selectionAfter`?**

---

## Current Implementation Status

### 1. Selection Handling Option in `defineOperation`

```typescript
// packages/model/src/operations/define-operation.ts

export function defineOperation<T extends any>(
  name: string, 
  executor: (operation: T, context: TransactionContext) => Promise<void | INode>,
  selectionMapper?: (operation: T, context: TransactionContext) => any  // ← option
): void {
  globalOperationRegistry.register(name, { 
    name, 
    execute: executor as any,
    mapSelection: selectionMapper as any  // ← registered but not actually used
  });
}
```

**Current status:**
- `selectionMapper` option exists but **not actually used**
- No code in TransactionManager calls `mapSelection`

---

### 2. Selection in `TransactionContext`

```typescript
// packages/model/src/types.ts

export interface TransactionContext {
  dataStore: DataStore;
  selectionManager: SelectionManager;  // ← SelectionManager instance
  selection?: ModelSelection;           // ← current selection snapshot
  schema?: any;
}
```

**Current status:**
- `selectionManager`: instance that can change Selection
- `selection`: selection snapshot at transaction start (read-only)

---

### 3. How to Handle Selection in Operations

#### Method 1: Direct `selectionManager` Usage (Currently Used)

```typescript
// packages/model/src/operations/delete.ts

defineOperation('delete', 
  async (operation: any, context: TransactionContext) => {
    // ...
    
    // Clear selection when selected node is deleted
    const currentSel = context.selectionManager.getCurrentSelection?.();
    if (currentSel && (currentSel.anchorId === nodeId || currentSel.focusId === nodeId)) {
      context.selectionManager.clearSelection();  // ← direct change
    }
    
    // ...
  }
);
```

**Problems:**
- Operation directly changes `selectionManager`
- Selection changes in the middle of transaction
- `selectionAfter` is not explicitly calculated

---

#### Method 2: Use Selection Mapping (Documented but Not Implemented)

```typescript
// paper/selection-mapping-spec.md

// Operation Guidelines
- deleteTextRange(nodeId, start, end)
  - In same nodeId, offset∈[start,end) → clamp to start, offset≥end → offset-= (end-start)
```

**Intent:**
- Operation returns selection mapping rules
- TransactionManager applies all mappings to calculate `selectionAfter`

**Current status:**
- Documented but **not actually implemented**

---

### 4. `selectionAfter` Handling in Transaction

#### Current Implementation

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // ...
  
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),  // ← Clone SelectionManager
    this._schema!
  );
  
  // Execute operations
  for (const operation of operations) {
    await this._executeOperation(operation, context);
  }
  
  // ...
  
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations
    // ← selectionAfter is missing!
  };
}
```

**Problems:**
- `TransactionResult` does not have `selectionAfter`
- Selection changes happen directly in Operation
- Selection state is not explicitly returned after transaction completion

---

## Recommended Structure

### 1. How to Handle Selection in Operations

#### Option A: Return Selection Mapping Rules (Recommended)

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;
    
    // 1. Update DataStore
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2. Return selection mapping rules (do not change directly)
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } },
      // Selection mapping rules
      selectionMapping: {
        // Offset in delete range in same node → clamp to start
        // Offset after delete range → offset - (end - start)
        mapOffset: (targetNodeId: string, targetOffset: number) => {
          if (targetNodeId !== nodeId) return { nodeId: targetNodeId, offset: targetOffset };
          if (targetOffset >= start && targetOffset < end) {
            return { nodeId, offset: start };  // clamp
          }
          if (targetOffset >= end) {
            return { nodeId, offset: targetOffset - (end - start) };  // shift
          }
          return { nodeId, offset: targetOffset };  // no change
        }
      }
    };
  }
);
```

**Advantages:**
- Operation performs only pure data changes
- Selection mapping is explicitly returned
- TransactionManager can apply all mappings to calculate `selectionAfter`

---

#### Option B: Directly Modify `context.selection` (Current Method, Needs Improvement)

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;
    
    // 1. Update DataStore
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2. Selection mapping (directly modify context.selection)
    if (context.selection) {
      const newSelection = this._mapSelectionAfterDelete(
        context.selection,
        nodeId,
        start,
        end
      );
      // Need method to update context.selection
      // Currently uses selectionManager directly, but this is problematic
    }
    
    return {
      ok: true,
      data: deletedText,
      inverse: { type: 'insertText', payload: { nodeId, pos: start, text: deletedText } }
    };
  }
);
```

**Problems:**
- `context.selection` is a read-only snapshot
- Directly changing `selectionManager` changes selection in the middle of transaction

---

### 2. Calculate `selectionAfter` in TransactionManager

#### Improved Structure

```typescript
// packages/model/src/transaction.ts

async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
  // 1. Selection snapshot
  const selectionBefore = this._editor.selectionManager.getCurrentSelection();
  let selectionAfter = { ...selectionBefore };  // local copy
  
  const context = createTransactionContext(
    this._dataStore, 
    this._editor.selectionManager.clone(),
    this._schema!
  );
  
  // 2. Execute operations and collect selection mappings
  const selectionMappings: SelectionMapping[] = [];
  
  for (const operation of operations) {
    const result = await this._executeOperation(operation, context);
    
    // Collect selection mapping rules
    if (result?.result?.selectionMapping) {
      selectionMappings.push(result.result.selectionMapping);
    }
  }
  
  // 3. Apply all selection mappings to calculate selectionAfter
  for (const mapping of selectionMappings) {
    selectionAfter = this._applySelectionMapping(selectionAfter, mapping);
  }
  
  // 4. Return result
  return {
    success: true,
    errors: [],
    transactionId: this._currentTransaction!.sid,
    operations: executedOperations,
    selectionBefore,      // ← added
    selectionAfter        // ← added
  };
}
```

---

## Conclusion

### Current Status

1. **Selection handling in `defineOperation`:**
   - ❌ `selectionMapper` option exists but **not used**
   - ✅ Operations use `context.selectionManager` directly (problematic)

2. **`selectionAfter` in Transaction:**
   - ❌ `TransactionResult` does not have **`selectionAfter`**
   - ❌ Selection changes happen directly in Operation

---

### Recommended Approach

1. **Return selection mapping rules from Operation:**
   ```typescript
   return {
     ok: true,
     data: deletedText,
     selectionMapping: { ... }  // ← return mapping rules
   };
   ```

2. **Calculate `selectionAfter` in TransactionManager:**
   ```typescript
   // Collect all operation selectionMappings
   // Apply sequentially to calculate selectionAfter
   ```

3. **Add `selectionAfter` to `TransactionResult`:**
   ```typescript
   interface TransactionResult {
     success: boolean;
     selectionBefore?: ModelSelection;  // ← added
     selectionAfter?: ModelSelection;   // ← added
     // ...
   }
   ```

---

## Implementation Priority

### Phase 1: Basic Structure (Current)
- ✅ Operations use `context.selectionManager` directly
- ❌ No explicit `selectionAfter` calculation

### Phase 2: Introduce Selection Mapping (Recommended)
- ⏳ Operations return selection mapping rules
- ⏳ TransactionManager applies all mappings to calculate `selectionAfter`
- ⏳ Add `selectionBefore`/`selectionAfter` to `TransactionResult`

---

## References

- `paper/selection-mapping-spec.md`: Selection mapping spec (document only, not implemented)
- `packages/model/src/operations/delete.ts`: current example of direct `selectionManager` usage
- `packages/model/src/operations/deleteTextRange.ts`: no selection mapping (only comments)
