# Delete Command Design

## Overview

Following the command-separation strategy, delete behavior is split into clear, single-responsibility commands.

---

## Required commands

### 1. `deleteNode` — delete an entire node

**Responsibility**: delete a single node entirely.

**Use cases**:
- Delete an inline node (e.g., `inline-image`)
- Delete inline nodes without a `.text` field
- At node boundaries when the previous/next node has no `.text`

**Payload**:
```typescript
{
  nodeId: string  // node to delete
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

### 2. `deleteText` — delete text in a single node

**Responsibility**: delete a text range within one node.

**Use cases**:
- Delete characters within the same node
- Delete a character at a collapsed selection
- Delete a range within the same node

**Payload**:
```typescript
{
  range: {
    startNodeId: string,
    startOffset: number,
    endNodeId: string,      // must equal startNodeId
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

### 3. `deleteCrossNode` — delete text across nodes

**Responsibility**: delete a text range spanning multiple nodes.

**Use cases**:
- Range selection that spans multiple nodes
- Deletes that cross node boundaries

**Payload**:
```typescript
{
  range: {
    startNodeId: string,
    startOffset: number,
    endNodeId: string,      // different from startNodeId
    endOffset: number
  }
}
```

**Operations** (current: direct call; future: operation-based):
```typescript
// Current: dataStore.range.deleteText(range)
// Future: composed from multiple deleteTextRange operations
[
  ...control(range.startNodeId, [
    { type: 'deleteTextRange', payload: { start: range.startOffset, end: node1TextLength } }
  ]),
  // delete all middle nodes
  ...middleNodeIds.map(nodeId => ({ type: 'delete', payload: { nodeId } })),
  ...control(range.endNodeId, [
    { type: 'deleteTextRange', payload: { start: 0, end: range.endOffset } }
  ])
]
```

---

## Choosing commands in the View Layer

### InputHandler.handleDelete()

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  // 1) Business logic: compute delete range
  const contentRange = this.calculateDeleteRange(modelSelection, inputType, currentNodeId);
  if (!contentRange) {
    return;
  }

  // 2) Business logic: pick which command to call
  let success = false;
  
  if (contentRange._deleteNode && contentRange.nodeId) {
    // Delete entire node
    success = await this.editor.executeCommand('deleteNode', { 
      nodeId: contentRange.nodeId 
    });
  } else if (contentRange.startNodeId !== contentRange.endNodeId) {
    // Cross-node delete
    success = await this.editor.executeCommand('deleteCrossNode', { 
      range: contentRange 
    });
  } else {
    // Single-node text delete
    success = await this.editor.executeCommand('deleteText', { 
      range: contentRange 
    });
  }

  if (!success) {
    console.warn('[InputHandler] handleDelete: command failed');
    return;
  }

  // 3) Update selection and render
  // ...
}
```

---

## DeleteExtension structure

### Command registration

```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  onCreate(editor: Editor): void {
    // 1) Delete entire node
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: Editor, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.nodeId != null;
      }
    });

    // 2) Cross-node text delete
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

    // 3) Single-node text delete
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

### Command implementations

```typescript
// packages/extensions/src/delete.ts

/**
 * Delete an entire node
 */
private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
  const operations = this._buildDeleteNodeOperations(nodeId);
  const result = await transaction(editor, operations).commit();
  return result.success;
}

/**
 * Cross-node text delete
 *
 * Current: direct call to dataStore.range.deleteText
 * Future: convert to transaction operations
 */
private async _executeDeleteCrossNode(editor: Editor, range: ContentRange): Promise<boolean> {
  const dataStore = (editor as any).dataStore;
  if (!dataStore) {
    console.error('[DeleteExtension] dataStore not found');
    return false;
  }

  // Current: direct call
  // TODO: switch to transaction operations
  try {
    dataStore.range.deleteText(range);
    return true;
  } catch (error) {
    console.error('[DeleteExtension] deleteCrossNode failed', error);
    return false;
  }
}

/**
 * Single-node text delete
 */
private async _executeDeleteText(editor: Editor, range: ContentRange): Promise<boolean> {
  const operations = this._buildDeleteTextOperations(range);
  const result = await transaction(editor, operations).commit();
  return result.success;
}
```

---

### Operation builders

```typescript
// packages/extensions/src/delete.ts

/**
 * Build operations for deleting an entire node
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
 * Build operations for deleting text within one node
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
 * Build operations for cross-node text delete (future)
 *
 * Current: direct dataStore.range.deleteText call
 * Future: compose multiple operations in a transaction
 */
private _buildCrossNodeDeleteOperations(range: ContentRange): any[] {
  // TODO: compose multi-node delete operations
  // 1) Delete part of start node
  // 2) Delete all middle nodes
  // 3) Delete part of end node
  return [];
}
```

---

## Command mapping by scenario

### Scenario 1: Collapsed selection + Backspace

Caret in the middle of a node

```
[text-1: "Hello|World"]  // | = caret
```

**Flow**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 5, endOffset: 6 }`
2. View Layer: `startNodeId === endNodeId` → call `deleteText`
3. Command: run `deleteTextRange`

---

### Scenario 2: Collapsed selection + Backspace (start of node)

Caret at start of node, previous node has no `.text` (e.g., inline image)

```
[image-1] [text-1: "|Hello"]
```

**Flow**:
1. View Layer: `calculateCrossNodeDeleteRange` → `{ _deleteNode: true, nodeId: 'image-1' }`
2. View Layer: `_deleteNode === true` → call `deleteNode`
3. Command: run `delete`

---

### Scenario 3: Collapsed selection + Backspace (start of node, previous is text)

Caret at start of node, previous node is text

```
[text-1: "Hello"] [text-2: "|World"]
```

**Flow**:
1. View Layer: `calculateCrossNodeDeleteRange` → `{ startNodeId: 'text-1', startOffset: 4, endOffset: 5 }`
2. View Layer: `startNodeId === endNodeId` → call `deleteText`
3. Command: run `deleteTextRange`

---

### Scenario 4: Range selection (single node)

Selection within the same node

```
[text-1: "He|llo|World"]  // | = selection
```

**Flow**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 2, endOffset: 5 }`
2. View Layer: `startNodeId === endNodeId` → call `deleteText`
3. Command: run `deleteTextRange`

---

### Scenario 5: Range selection (cross-node)

Selection spans multiple nodes

```
[text-1: "He|llo"] [text-2: "Wo|rld"]  // | = selection
```

**Flow**:
1. View Layer: `calculateDeleteRange` → `{ startNodeId: 'text-1', startOffset: 2, endNodeId: 'text-2', endOffset: 2 }`
2. View Layer: `startNodeId !== endNodeId` → call `deleteCrossNode`
3. Command: currently calls `dataStore.range.deleteText` directly (will switch to operation composition later)

---

## Future improvements

### 1) Turn cross-node delete into transaction operations

**Current**: direct `dataStore.range.deleteText` call

**Future**: compose multiple operations

```typescript
private _buildCrossNodeDeleteOperations(range: ContentRange): any[] {
  const operations: any[] = [];
  
  // 1) Delete part of start node
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
  
  // 2) Delete all middle nodes
  const middleNodeIds = this._getMiddleNodeIds(range);
  for (const nodeId of middleNodeIds) {
    operations.push({
      type: 'delete',
      payload: { nodeId }
    });
  }
  
  // 3) Delete part of end node
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

### 2) Add a block-delete command (future)

**Scenario**: entire block is selected

```typescript
editor.registerCommand({
  name: 'deleteBlock',
  execute: async (editor: Editor, payload: { blockId: string }) => {
    // delete the whole block
  }
});
```

---

## Summary

### Command-separation principles

1. ✅ **Clear responsibility**: each command does exactly one thing
   - `deleteNode`: delete an entire node
   - `deleteText`: delete text within one node
   - `deleteCrossNode`: delete text across nodes

2. ✅ **Independently testable**

3. ✅ **Readable at a glance**: command name explains its purpose

### View Layer responsibilities

1. ✅ **Business logic**: decide which command to call
2. ✅ **Range computation**: compute delete range and select command

### Command responsibilities

1. ✅ **Operation assembly**: build operations from payload
2. ✅ **Run transaction**: `transaction(editor, operations).commit()`
