# Model Operation DSL API

DSL (Domain-Specific Language) helpers provide a simple, declarative API for defining operations. They return `{ type, payload }` objects that are used in transactions.

## Overview

DSL helpers are defined using `defineOperationDSL()` and are used with `control()` to create transaction operations.

## Usage Pattern

```typescript
import { insertText, control, transaction } from '@barocss/model';

// DSL helper returns { type, payload }
const op = insertText(5, 'Hello');
// { type: 'insertText', payload: { pos: 5, text: 'Hello' } }

// With control (injects nodeId)
const ops = control('text-1', [
  insertText(5, 'Hello')
]);
// [{ type: 'insertText', payload: { nodeId: 'text-1', pos: 5, text: 'Hello' } }]

// Use in transaction
const result = await transaction(editor, ops).commit();
```

## Control Function

The `control()` function injects a `nodeId` into operation payloads:

```typescript
control(nodeId, [
  insertText(5, 'Hello'),
  toggleMark('bold', [0, 5])
])

// Becomes:
[
  { type: 'insertText', payload: { nodeId, pos: 5, text: 'Hello' } },
  { type: 'toggleMark', payload: { nodeId, markType: 'bold', range: [0, 5] } }
]
```

---

## Text Operations

### `insertText`

Inserts text at a position.

**Signature**:
```typescript
insertText(pos: number, text: string): DSLOperationDescriptor
insertText(nodeId: string, pos: number, text: string): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'insertText';
  payload: { pos: number; text: string; nodeId?: string };
}
```

**Example**:
```typescript
// In control chain
control('text-1', [
  insertText(5, 'Hello')
])

// Direct call
insertText('text-1', 5, 'Hello')
```

### `deleteTextRange`

Deletes text in a range.

**Signature**:
```typescript
deleteTextRange(startPosition: number, endPosition: number): DSLOperationDescriptor
deleteTextRange(nodeId: string, startPosition: number, endPosition: number): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'deleteTextRange';
  payload: { startPosition: number; endPosition: number; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  deleteTextRange(0, 5)
])
```

### `replaceText`

Replaces text in a range.

**Signature**:
```typescript
replaceText(newText: string): DSLOperationDescriptor
replaceText(nodeId: string, newText: string): DSLOperationDescriptor
replaceText(nodeId: string, startPosition: number, endPosition: number, newText: string): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'replaceText';
  payload: { newText: string; nodeId?: string; startPosition?: number; endPosition?: number };
}
```

**Example**:
```typescript
control('text-1', [
  replaceText('New text')
])

// Or with range
replaceText('text-1', 0, 5, 'New text')
```

---

## Node Operations

### `create`

Creates a node with children.

**Signature**:
```typescript
create(stype: string, attributes?: Record<string, any>, content?: INode[]): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'create';
  payload: { node: INode; options?: any };
}
```

**Example**:
```typescript
// Create paragraph with text
create('paragraph', {}, [
  { stype: 'inline-text', text: 'Hello' }
])

// Create heading
create('heading', { level: 1 }, [
  { stype: 'inline-text', text: 'Title' }
])
```

### `delete`

Deletes a node.

**Signature**:
```typescript
delete(): DSLOperationDescriptor
delete(nodeId: string): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'delete';
  payload: { nodeId?: string };
}
```

**Example**:
```typescript
// In control chain
control('node-1', [
  delete()
])

// Direct call
delete('node-1')
```

### `update`

Updates a node with partial changes.

**Signature**:
```typescript
update(updates: Partial<INode>): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'update';
  payload: { updates: Partial<INode>; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  update({ text: 'Updated text' })
])

control('node-1', [
  update({ attributes: { level: 2 } })
])
```

---

## Content Operations

### `addChild`

Adds a child to a parent.

**Signature**:
```typescript
addChild(child: INode | string, position?: number): DSLOperationDescriptor
addChild(nodeId: string, child: INode | string, position?: number): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'addChild';
  payload: { child: INode | string; position?: number; nodeId?: string };
}
```

**Example**:
```typescript
// Add existing node
control('parent-1', [
  addChild('child-1', 0)
])

// Create and add new node
control('parent-1', [
  addChild({ stype: 'paragraph', text: 'New' }, 0)
])
```

### `removeChild`

Removes a child from parent.

**Signature**:
```typescript
removeChild(childId: string): DSLOperationDescriptor
removeChild(nodeId: string, childId: string): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'removeChild';
  payload: { childId: string; nodeId?: string };
}
```

**Example**:
```typescript
control('parent-1', [
  removeChild('child-1')
])
```

### `moveNode`

Moves a node to a new parent.

**Signature**:
```typescript
moveNode(newParentId: string, position?: number): DSLOperationDescriptor
moveNode(nodeId: string, newParentId: string, position?: number): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'moveNode';
  payload: { newParentId: string; position?: number; nodeId?: string };
}
```

**Example**:
```typescript
control('node-1', [
  moveNode('new-parent-1', 0)
])
```

### `reorderChildren`

Reorders children in a parent.

**Signature**:
```typescript
reorderChildren(childIds: string[]): DSLOperationDescriptor
reorderChildren(nodeId: string, childIds: string[]): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'reorderChildren';
  payload: { childIds: string[]; nodeId?: string };
}
```

**Example**:
```typescript
control('parent-1', [
  reorderChildren(['child-3', 'child-1', 'child-2'])
])
```

---

## Mark Operations

### `applyMark`

Applies a mark to a range.

**Signature**:
```typescript
applyMark(markType: string, range: [number, number], attrs?: Record<string, any>): DSLOperationDescriptor
applyMark(nodeId: string, markType: string, range: [number, number], attrs?: Record<string, any>): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'applyMark';
  payload: { markType: string; range: [number, number]; attrs?: Record<string, any>; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  applyMark('bold', [0, 5]),
  applyMark('link', [0, 5], { href: 'https://example.com' })
])
```

### `removeMark`

Removes a mark from a range.

**Signature**:
```typescript
removeMark(markType: string, range?: [number, number]): DSLOperationDescriptor
removeMark(nodeId: string, markType: string, range?: [number, number]): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'removeMark';
  payload: { markType: string; range?: [number, number]; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  removeMark('bold', [0, 5])
])
```

### `toggleMark`

Toggles a mark on/off.

**Signature**:
```typescript
toggleMark(markType: string, range: [number, number], attrs?: Record<string, any>): DSLOperationDescriptor
toggleMark(nodeId: string, markType: string, range: [number, number], attrs?: Record<string, any>): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'toggleMark';
  payload: { markType: string; range: [number, number]; attrs?: Record<string, any>; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  toggleMark('bold', [0, 5])
])
```

---

## Split/Merge Operations

### `splitTextNode`

Splits a text node at a position.

**Signature**:
```typescript
splitTextNode(splitPosition: number): DSLOperationDescriptor
splitTextNode(nodeId: string, splitPosition: number): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'splitTextNode';
  payload: { splitPosition: number; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  splitTextNode(5)
])
```

### `mergeTextNodes`

Merges two adjacent text nodes.

**Signature**:
```typescript
mergeTextNodes(rightNodeId: string): DSLOperationDescriptor
mergeTextNodes(nodeId: string, rightNodeId: string): DSLOperationDescriptor
```

**Returns**:
```typescript
{
  type: 'mergeTextNodes';
  payload: { rightNodeId: string; nodeId?: string };
}
```

**Example**:
```typescript
control('text-1', [
  mergeTextNodes('text-2')
])
```

### `splitBlockNode`

Splits a block node at a position.

**Signature**:
```typescript
splitBlockNode(splitPosition: number): DSLOperationDescriptor
splitBlockNode(nodeId: string, splitPosition: number): DSLOperationDescriptor
```

**Example**:
```typescript
control('block-1', [
  splitBlockNode(2)
])
```

### `mergeBlockNodes`

Merges two adjacent block nodes.

**Signature**:
```typescript
mergeBlockNodes(rightNodeId: string): DSLOperationDescriptor
mergeBlockNodes(nodeId: string, rightNodeId: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('block-1', [
  mergeBlockNodes('block-2')
])
```

---

## Transform Operations

### `wrap`

Wraps a range with a new node.

**Signature**:
```typescript
wrap(wrapperType: string, wrapperAttrs?: Record<string, any>): DSLOperationDescriptor
wrap(nodeId: string, endNodeId: string, wrapperType: string, wrapperAttrs?: Record<string, any>): DSLOperationDescriptor
```

**Example**:
```typescript
// Wrap selection
wrap('blockquote', {})

// Or with explicit range
wrap('text-1', 'text-3', 'blockquote', {})
```

### `unwrap`

Removes wrapper node.

**Signature**:
```typescript
unwrap(): DSLOperationDescriptor
unwrap(nodeId: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('wrapper-1', [
  unwrap()
])
```

### `indentNode` / `outdentNode`

Indents or outdents a block node.

**Signature**:
```typescript
indentNode(): DSLOperationDescriptor
indentNode(nodeId: string): DSLOperationDescriptor

outdentNode(): DSLOperationDescriptor
outdentNode(nodeId: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('block-1', [
  indentNode()
])

control('block-1', [
  outdentNode()
])
```

### `indentText` / `outdentText`

Indents or outdents text.

**Signature**:
```typescript
indentText(prefix?: string): DSLOperationDescriptor
indentText(nodeId: string, prefix?: string): DSLOperationDescriptor

outdentText(prefix?: string): DSLOperationDescriptor
outdentText(nodeId: string, prefix?: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('text-1', [
  indentText('  ')
])

control('text-1', [
  outdentText('  ')
])
```

---

## Clipboard Operations

### `copy`

Copies selected content.

**Signature**:
```typescript
copy(): DSLOperationDescriptor
```

**Example**:
```typescript
// Uses current selection
const ops = [copy()];
```

### `cut`

Cuts selected content.

**Signature**:
```typescript
cut(): DSLOperationDescriptor
```

**Example**:
```typescript
// Uses current selection
const ops = [cut()];
```

### `paste`

Pastes content at selection.

**Signature**:
```typescript
paste(content?: INode[]): DSLOperationDescriptor
```

**Example**:
```typescript
// Paste from clipboard
const ops = [paste()];

// Paste specific content
const ops = [paste([
  { stype: 'paragraph', text: 'Pasted' }
])];
```

---

## Utility Operations

### `autoMergeTextNodes`

Automatically merges adjacent text nodes.

**Signature**:
```typescript
autoMergeTextNodes(): DSLOperationDescriptor
autoMergeTextNodes(nodeId: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('text-1', [
  autoMergeTextNodes()
])
```

### `cloneNodeWithChildren`

Clones a node with all its children.

**Signature**:
```typescript
cloneNodeWithChildren(newParentId?: string): DSLOperationDescriptor
cloneNodeWithChildren(nodeId: string, newParentId?: string): DSLOperationDescriptor
```

**Example**:
```typescript
control('node-1', [
  cloneNodeWithChildren('new-parent-1')
])
```

---

## Complete Example

```typescript
import { transaction, control, insertText, toggleMark, create } from '@barocss/model';

// Complex transaction with multiple operations
const result = await transaction(editor, [
  // Create new paragraph
  create('paragraph', {}, [
    { stype: 'inline-text', text: 'Hello' }
  ]),
  
  // Insert text and apply mark
  ...control('text-1', [
    insertText(5, ' World'),
    toggleMark('bold', [0, 11])
  ]),
  
  // Move node
  ...control('node-1', [
    moveNode('new-parent-1', 0)
  ])
]).commit();
```

---

## Related

- [Operations Overview](./operations-overview) - Understanding the operation hierarchy
- [DataStore Operations API](./datastore-operations) - DataStore layer operations
- [Model Operations API](./model-operations) - Model layer operations
- [Operation Selection Guide](./operation-selection-guide) - How to choose operations
