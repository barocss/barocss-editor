# Command Architecture Guide

## Overview

This document is a comprehensive guide on Command responsibilities, structure, and implementation strategies.

---

## Core Principles

### 1. Commands Compose Operations

**It is correct for Commands to compose operations.**

- ✅ Commands have responsibility for "interpreting user intent" + "composing operations"
- ✅ Other editors (ProseMirror, Slate, Tiptap) use the same pattern
- ✅ Commands are defined in Extensions and compose operations to execute transactions

### 2. Business Logic is in the View Layer

**Commands should focus on composing already-defined operations well.**

- ✅ Business logic: handled in View Layer (which range to delete, which Command to call)
- ✅ Composition logic: handled in Command (compose operations based on received payload)
- ❌ Do not include business logic in Command

### 3. Commands Have Clear Responsibilities

**It's better for each Command to have a clear responsibility than to give one Command too many roles**

- ✅ Easy to understand
- ✅ Easy to test
- ✅ Easy to maintain

---

## Responsibilities by Layer

### View Layer (editor-view-dom)

**Responsibilities**:
1. ✅ Handle business logic (which range to delete, which Command to call)
2. ✅ Handle DOM events
3. ✅ DOM ↔ Model conversion
4. ✅ Call Commands
5. ❌ Do not compose operations

**Example**:
```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  // 1. Business logic: calculate delete range
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, currentNodeId);
  
  // 2. Business logic: decide which Command to call
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

**Responsibilities**:
1. ✅ Compose operations (compose operations based on received payload)
2. ✅ Execute transactions
3. ❌ Do not include business logic

**Example**:
```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // Separated Commands
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

  // Each Command has only clear responsibilities
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

**Responsibilities**:
1. ✅ Pure data changes
2. ✅ Selection mapping
3. ✅ Inverse operation generation
4. ❌ Do not include business logic

**Example**:
```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', async (operation, context) => {
  const { nodeId, start, end } = operation.payload;
  
  // 1. Update DataStore
  const deletedText = context.dataStore.range.deleteText({...});
  
  // 2. Selection mapping
  if (context.selection?.current) {
    // Update context.selection.current
  }
  
  // 3. Return inverse operation
  return { ok: true, data: deletedText, inverse: {...} };
});
```

---

## Command Separation Strategy

### Separation Criteria

Separate Commands when:

1. **Different operations used**: when different operations are used
   ```typescript
   // Separation needed
   editor.executeCommand('deleteNode', { nodeId });      // delete operation
   editor.executeCommand('deleteText', { range });        // deleteTextRange operation
   ```

2. **Different logic**: when different business logic is needed
   ```typescript
   // Separation needed
   editor.executeCommand('deleteNode', { nodeId });           // delete entire node
   editor.executeCommand('deleteCrossNode', { range });       // Cross-node deletion
   ```

### Cases Where Separation is Not Needed

1. **Simple variations**: when calling the same operation with different parameters
   ```typescript
   // Separation not needed
   editor.executeCommand('insertText', { text: 'hello' });
   editor.executeCommand('insertText', { text: 'world' });
   ```

2. **Semantically identical**: when the same action from user perspective
   ```typescript
   // Separation not needed (both delete text)
   editor.executeCommand('deleteText', { range: range1 });
   editor.executeCommand('deleteText', { range: range2 });
   ```

---

## Distinction: Business Logic vs Composition Logic

### Business Logic (View Layer)

**"Decide what to do"**
- Selection analysis
- inputType analysis
- Node boundary handling
- Delete range calculation
- `_deleteNode` flag setting
- Decide which Command to call

**Location**: `InputHandler.calculateDeleteRange()`, `InputHandler.handleDelete()`

---

### Composition Logic (Command)

**"Decide how to compose"**
- Compose operations based on received payload structure
- Compose multiple operations in order

**Location**: `DeleteExtension._buildDeleteOperations()`

**Difference**:
- Business logic: "decide what to do" (View Layer)
- Composition logic: "decide how to compose" (Command)

---

## Patterns in Other Editors

### ProseMirror

```typescript
// ProseMirror Command example
const deleteSelection = (state: EditorState, dispatch?: (tr: Transaction) => void) => {
  if (state.selection.empty) return false;
  
  if (dispatch) {
    // Command directly manipulates transaction
    const tr = state.tr;
    tr.deleteSelection();  // ← Add operation to Transaction
    dispatch(tr);
  }
  return true;
};
```

**Features**:
- Command **directly manipulates Transaction**
- Command **adds operations**
- Command **dispatches transaction**

---

### Slate.js

```typescript
// Slate Command example
const deleteBackward = (editor: Editor) => {
  const { selection } = editor;
  
  if (selection) {
    // Command directly manipulates transform
    Transforms.delete(editor, {
      at: selection,
      unit: 'character',
      reverse: true
    });
  }
};
```

**Features**:
- Command **directly manipulates Transform**
- Command **adds operations**

---

### Tiptap

```typescript
// Tiptap Command example
const deleteSelection = () => ({ state, dispatch }: CommandProps) => {
  if (state.selection.empty) return false;
  
  if (dispatch) {
    // Command directly manipulates transaction
    const tr = state.tr;
    tr.deleteSelection();
    dispatch(tr);
  }
  return true;
};
```

**Features**:
- Command **directly manipulates Transaction**
- Command **adds operations**

---

## Implementation Examples

### Before: Unified Command (Problems)

```typescript
// ❌ One Command handles multiple cases
editor.registerCommand({
  name: 'delete',
  execute: async (editor: Editor, payload: { range: ContentRange }) => {
    // Handle multiple cases in one Command
    if (range._deleteNode && range.nodeId) {
      // Delete entire node
    } else if (range.startNodeId !== range.endNodeId) {
      // Cross-node deletion
    } else {
      // Single node deletion
    }
  }
});
```

**Problems**:
- One Command has too many roles
- Hard to test (must test all cases)
- Hard to understand (unclear which case executes)

---

### After: Separated Commands (Recommended)

```typescript
// ✅ Separated Commands
export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // 1. Delete entire node
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: Editor, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      }
    });

    // 2. Cross-node text deletion
    editor.registerCommand({
      name: 'deleteCrossNode',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteCrossNode(editor, payload.range);
      }
    });

    // 3. Single node text deletion
    editor.registerCommand({
      name: 'deleteText',
      execute: async (editor: Editor, payload: { range: ContentRange }) => {
        return await this._executeDeleteText(editor, payload.range);
      }
    });
  }

  // Each Command has only clear responsibilities
  private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
    const operations = [{ type: 'delete', payload: { nodeId } }];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  private async _executeDeleteCrossNode(editor: Editor, range: ContentRange): Promise<boolean> {
    // Compose Cross-node operations
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

**Advantages**:
- ✅ Each Command has clear responsibilities
- ✅ Easy to test (test each Command independently)
- ✅ Easy to understand (clear what each Command does from name)

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│ View Layer (editor-view-dom)           │
│ - DOM event handling                    │
│ - Business logic (which Command to call)│
│ - Command invocation                    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Command Layer (extensions)               │
│ - Compose operations                    │
│ - Execute transactions                  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Transaction Layer (model)                │
│ - Execute operations                    │
│ - History management                    │
│ - Rollback support                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Operation Layer (model)                 │
│ - Pure data changes                     │
│ - Selection mapping                     │
│ - Inverse operation generation          │
└─────────────────────────────────────────┘
```

---

## Summary

### Command Responsibilities

1. ✅ **Compose operations**: compose operations based on received payload
2. ✅ **Execute transactions**: `transaction(editor, operations).commit()`
3. ❌ **Business logic**: "decide what to do" is not Command's responsibility

### View Layer Responsibilities

1. ✅ **Business logic**: "decide what to do"
2. ✅ **Command invocation**: call appropriate Command with appropriate payload
3. ❌ **Compose operations**: not View Layer's responsibility

### Command Separation Principles

1. ✅ **Clear responsibilities**: each Command performs only one clear task
2. ✅ **Independent testing**: each Command can be tested independently
3. ✅ **Easy to understand**: clear what each Command does from name

---

## References

- `packages/extensions/docs/text-input-command-migration.md`: text input Command migration plan
- `packages/editor-view-dom/docs/input-delete-flow-summary.md`: input and delete flow summary
