# Delete Command Architecture Decision

## Question

When Backspace is pressed:
1) A Core Extension command runs
2) The command calls a transaction
3) During the transaction, operations run, history is recorded, and rollback is possible

**At that point, delete behavior differs by selection (block vs inline vs text):**

- **Should this logic live inside the Command?**
- **Or inside the Transaction/Operation?**

---

## Architecture principles

### Layer separation

```
┌─────────────────────────────────────────┐
│ View Layer (editor-view-dom)           │
│ - Handles DOM events                   │
│ - DOM ↔ Model conversion               │
│ - Calls commands                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Command Layer (extensions)             │
│ - Interprets user intent               │
│ - Analyzes selection                   │
│ - Decides what action to take          │
│ - Builds operations                    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Transaction Layer (model)              │
│ - Executes operations                  │
│ - Manages history                      │
│ - Supports rollback                    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Operation Layer (model)                │
│ - Pure data mutation                   │
│ - Selection mapping                    │
│ - Builds inverse                       │
└─────────────────────────────────────────┘
```

---

## Answer: **Implement inside the Command**

### Why

1) **Selection analysis = user intent interpretation**
   - “What did the user select?” is the command’s job
   - Deciding if it’s block/inline/text is the command’s job

2) **Operation should only mutate data**
   - Operation handles “how to change data”
   - Command decides “what to change”

3) **Transaction is just an execution container**
   - Runs operations and manages history
   - Selection analysis does not belong in the transaction

---

## Current structure analysis

### Current flow

```
1. InputHandler.handleDelete (View Layer)
   ↓
2. calculateDeleteRange (View Layer) ← Problem: lives in View Layer
   ↓
3. editor.executeCommand('delete', { range }) (Command Layer)
   ↓
4. DeleteExtension._executeDelete (Command Layer)
   ↓
5. transaction(editor, operations).commit() (Transaction Layer)
   ↓
6. deleteTextRange / delete operations run (Operation Layer)
```

### Issues

- `calculateDeleteRange` is in the **View Layer**
- Selection analysis lives in the **View Layer**
- Command simply uses the incoming `range` as-is

---

## Recommended structure

### Improved flow

```
1. InputHandler.handleDelete (View Layer)
   - Convert DOM selection → Model selection
   - Call Command (passing selection info)
   ↓
2. DeleteExtension._executeDelete (Command Layer)
   - Analyze selection (block/inline/text)
   - Compute delete range
   - Build operations
   ↓
3. transaction(editor, operations).commit() (Transaction Layer)
   ↓
4. deleteTextRange / delete operations run (Operation Layer)
```

---

## Implementation approach

### 1) Analyze selection inside the Command

```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  // ...

  private async _executeDelete(
    editor: Editor,
    payload: { 
      selection: ModelSelection,  // pass selection instead of range
      inputType?: string          // direction info (backward/forward)
    }
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      return false;
    }

    // 1) Analyze selection
    const selectionType = this._analyzeSelection(payload.selection, dataStore);
    
    // 2) Compute delete range by selection type
    let deleteRange: DeleteRange | null = null;
    
    switch (selectionType) {
      case 'block':
        deleteRange = this._calculateBlockDelete(payload.selection, dataStore);
        break;
      case 'inline':
        deleteRange = this._calculateInlineDelete(payload.selection, dataStore);
        break;
      case 'text':
        deleteRange = this._calculateTextDelete(
          payload.selection, 
          payload.inputType,
          dataStore
        );
        break;
      case 'collapsed':
        deleteRange = this._calculateCollapsedDelete(
          payload.selection,
          payload.inputType,
          dataStore
        );
        break;
    }

    if (!deleteRange) {
      return false;
    }

    // 3) Build and run operations
    const operations = this._buildDeleteOperations(deleteRange);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Determine selection type
   */
  private _analyzeSelection(
    selection: ModelSelection,
    dataStore: any
  ): 'block' | 'inline' | 'text' | 'collapsed' {
    // Collapsed selection
    if (selection.collapsed) {
      return 'collapsed';
    }

    // Range selection: decide block/inline/text
    const startNode = dataStore.getNode(selection.startNodeId);
    const endNode = dataStore.getNode(selection.endNodeId);
    
    // Block selection?
    if (this._isBlockSelection(selection, dataStore)) {
      return 'block';
    }

    // Inline node selection?
    if (this._isInlineNodeSelection(selection, dataStore)) {
      return 'inline';
    }

    // Default: text selection
    return 'text';
  }

  /** Block selection? */
  private _isBlockSelection(
    selection: ModelSelection,
    dataStore: any
  ): boolean {
    const startNode = dataStore.getNode(selection.startNodeId);
    const endNode = dataStore.getNode(selection.endNodeId);
    
    // If selection spans first-to-last child of a block, consider it block selection
    // TODO: implement precise logic
    return false;
  }

  /** Inline node selection? */
  private _isInlineNodeSelection(
    selection: ModelSelection,
    dataStore: any
  ): boolean {
    if (selection.startNodeId === selection.endNodeId) {
      const node = dataStore.getNode(selection.startNodeId);
      const schema = (dataStore as any).schema;
      if (schema) {
        const nodeSpec = schema.getNodeType?.(node.type || node.stype);
        return nodeSpec?.group === 'inline';
      }
    }
    return false;
  }

  /** Block delete range */
  private _calculateBlockDelete(
    selection: ModelSelection,
    dataStore: any
  ): DeleteRange | null {
    const blockId = this._getBlockId(selection, dataStore);
    if (!blockId) return null;
    return {
      _deleteNode: true,
      nodeId: blockId
    };
  }

  /** Inline delete range */
  private _calculateInlineDelete(
    selection: ModelSelection,
    dataStore: any
  ): DeleteRange | null {
    return {
      _deleteNode: true,
      nodeId: selection.startNodeId
    };
  }

  /** Text delete range */
  private _calculateTextDelete(
    selection: ModelSelection,
    inputType: string | undefined,
    dataStore: any
  ): DeleteRange | null {
    return {
      startNodeId: selection.startNodeId,
      startOffset: selection.startOffset,
      endNodeId: selection.endNodeId,
      endOffset: selection.endOffset
    };
  }

  /** Collapsed delete range */
  private _calculateCollapsedDelete(
    selection: ModelSelection,
    inputType: string | undefined,
    dataStore: any
  ): DeleteRange | null {
    const { startNodeId, startOffset } = selection;
    
    if (inputType === 'deleteContentBackward') {
      // Backspace
      if (startOffset > 0) {
        return {
          startNodeId,
          startOffset: startOffset - 1,
          endNodeId: startNodeId,
          endOffset: startOffset
        };
      }
      // Node boundary: handle previous node
      return this._calculateCrossNodeDelete(startNodeId, 'backward', dataStore);
    } else if (inputType === 'deleteContentForward') {
      // Delete
      const node = dataStore.getNode(startNodeId);
      const textLength = node?.text?.length || 0;
      if (startOffset < textLength) {
        return {
          startNodeId,
          startOffset,
          endNodeId: startNodeId,
          endOffset: startOffset + 1
        };
      }
      // Node boundary: handle next node
      return this._calculateCrossNodeDelete(startNodeId, 'forward', dataStore);
    }
    
    return null;
  }

  /** Cross-node delete range (migrate existing calculateCrossNodeDeleteRange) */
  private _calculateCrossNodeDelete(
    currentNodeId: string,
    direction: 'backward' | 'forward',
    dataStore: any
  ): DeleteRange | null {
    // Move the previous calculateCrossNodeDeleteRange logic here
    return null;
  }
}
```

---

## View Layer changes

### Update InputHandler

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  const inputType = event.inputType;

  // 1) Convert DOM selection → Model selection
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) {
    return;
  }

  let modelSelection: any = null;
  try {
    modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(domSelection);
  } catch (error) {
    console.warn('[InputHandler] handleDelete: failed to convert DOM selection to model', { error });
    return;
  }

  if (!modelSelection || modelSelection.type !== 'range') {
    return;
  }

  // 2) Call command (pass selection + inputType)
  // Command handles selection analysis and delete range computation
  try {
    const success = await this.editor.executeCommand('delete', {
      selection: modelSelection,
      inputType: inputType
    });
    
    if (!success) {
      console.warn('[InputHandler] handleDelete: command failed');
      return;
    }
  } catch (error) {
    console.error('[InputHandler] handleDelete: command execution failed', { error });
    return;
  }

  // 3) Selection update comes from transaction’s selectionAfter
  // (not handled inside the command)
}
```

---

## Operation stays pure data mutation

### `deleteTextRange` operation

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;

    // 1) Update DataStore (pure data change)
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2) Selection mapping (automatic)
    // SelectionManager adjusts selection automatically
    
    // 3) Return inverse
    return { 
      ok: true, 
      data: deletedText, 
      inverse: { 
        type: 'insertText', 
        payload: { nodeId, pos: start, text: deletedText } 
      } 
    };
  }
);
```

**Operation should:**
- ✅ Only mutate data using the payload
- ✅ Not analyze selection
- ✅ Not decide the action

---

## Summary

### Command responsibilities
1. ✅ Analyze selection (block/inline/text/collapsed)
2. ✅ Compute delete range (decide what to delete)
3. ✅ Build operations (decide what to run)
4. ✅ Execute transaction

### Operation responsibilities
1. ✅ Pure data mutation (use payload)
2. ✅ Selection mapping (handled automatically)
3. ✅ Build inverse (for undo)

### Transaction responsibilities
1. ✅ Execute operations (in sequence)
2. ✅ Manage history (undo/redo)
3. ✅ Manage selection (selectionBefore/selectionAfter)

---

## Conclusion

**Selection analysis and delete-range computation belong in the Command.**

Reasons:
- Selection analysis is user-intent interpretation → Command responsibility
- Operation handles pure data mutation
- Transaction is just the container running operations

**Current issue:**
- `calculateDeleteRange` lives in the View Layer
- Command simply uses the passed-in range

**Fix:**
- Move `calculateDeleteRange` logic into the Command
- View Layer only converts DOM selection → Model selection
- Command performs selection analysis and delete-range computation
