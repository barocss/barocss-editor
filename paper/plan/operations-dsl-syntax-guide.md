# Operations DSL Syntax Guide

## Overview

The Barocss Editor Operations DSL is a domain-specific language that lets you perform editor actions declaratively. This guide summarizes the syntax and usage of every DSL function.

## Table of Contents

1. [Basic Structure](#1-basic-structure)
2. [Node Creation DSL](#2-node-creation-dsl)
3. [Node Manipulation DSL](#3-node-manipulation-dsl)
4. [Text Manipulation DSL](#4-text-manipulation-dsl)
5. [Mark Manipulation DSL](#5-mark-manipulation-dsl)
6. [Structure Manipulation DSL](#6-structure-manipulation-dsl)
7. [Selection DSL](#7-selection-dsl)
8. [Control DSL](#8-control-dsl)
9. [Examples](#9-examples)

## 1. Basic Structure

### 1.1 Use inside a Transaction

```typescript
const result = await transaction(editor, [
  // DSL operations here
]).commit();
```

### 1.2 DSL Function Categories

- **Direct call**: `operationName(params)` — supported by all DSL functions
- **Control chain**: `control(target, [operationName(params)])` — supported by only some DSL functions

### 1.3 Control Chain Support

**DSL that support control chains:**
- Node manipulation: `moveNode`, `copyNode`, `cloneNodeWithChildren`
- Text manipulation: `insertText`, `replaceText`, `deleteTextRange`, `wrap`, `unwrap`, `indent`, `outdent`
- Mark manipulation: `applyMark`, `removeMark`, `toggleMark`, `updateMark`
- Structure manipulation: `addChild`, `removeChild`, `removeChildren`, `reorderChildren`, `moveChildren`
- Selection: `selectRange`, `selectNode`

**DSL that do not support control chains:**
- Node creation: `create`, `deleteOp` — creates or deletes nodes; not tied to an existing node target
- Selection: `clearSelection` — clears selection globally, not per node

## 2. Node Creation DSL

### 2.1 `create(node, options?)`

**Purpose**: create a new node

**Syntax**:
```typescript
create(node: INode, options?: any)
```

**Parameters**:
- `node`: node object to create
- `options`: optional settings

**Notes**:
- Does **not** support `control` chains (direct call only)
- Creates a new node, so there is no existing target node

**Examples**:
```typescript
// Basic
create(textNode('inline-text', 'Hello World'))

// With options
create(textNode('inline-text', 'Hello'), { autoFocus: true })
```

### 2.2 `deleteOp(nodeId)`

**Purpose**: delete a node

**Syntax**:
```typescript
deleteOp(nodeId: string)
```

**Parameters**:
- `nodeId`: ID of the node to delete

**Notes**:
- Does **not** support `control` chains (direct call only)
- You must specify the node ID to delete

**Example**:
```typescript
deleteOp('node-123')
```

## 3. Node Manipulation DSL

### 3.1 `moveNode(nodeId, newParentId, position?)`

**Purpose**: move a node to another parent

**Syntax**:
```typescript
moveNode(nodeId: string, newParentId: string, position?: number)
```

**Parameters**:
- `nodeId`: node to move
- `newParentId`: target parent node ID
- `position`: insert position (optional)

**Examples**:
```typescript
// Control chain: move child-sid under new-parent-sid
control('child-sid', [moveNode('new-parent-sid', 0)])

// Direct call: move node-123 under parent-456
moveNode('node-123', 'parent-456', 2)
```

### 3.2 `copyNode(nodeId, newParentId?)`

**Purpose**: copy a node

**Syntax**:
```typescript
copyNode(nodeId: string, newParentId?: string)
```

**Parameters**:
- `nodeId`: node to copy
- `newParentId`: new parent ID (optional)

**Examples**:
```typescript
// Control chain: copy source-node-sid and append to target-parent-sid
control('source-node-sid', [copyNode('target-parent-sid')])

// Direct call: copy node-123 into parent-456
copyNode('node-123', 'parent-456')
```

### 3.3 `cloneNodeWithChildren(nodeId, newParentId?)`

**Purpose**: copy a node and all its children

**Syntax**:
```typescript
cloneNodeWithChildren(nodeId: string, newParentId?: string)
```

**Parameters**:
- `nodeId`: node to clone
- `newParentId`: new parent ID (optional)

**Examples**:
```typescript
// Control chain: clone source-node-sid with children to target-parent-sid
control('source-node-sid', [cloneNodeWithChildren('target-parent-sid')])

// Direct call: clone node-123 with children into parent-456
cloneNodeWithChildren('node-123', 'parent-456')
```

## 4. Text Manipulation DSL

### 4.1 `insertText(pos, text)` / `insertText(nodeId, pos, text)`

**Purpose**: insert text

**Syntax**:
```typescript
// In control chain
insertText(pos: number, text: string)

// Direct call
insertText(nodeId: string, pos: number, text: string)
```

**Parameters**:
- `pos`: insert position
- `text`: text to insert
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [insertText(5, 'Hello')])

// Direct call
insertText('node-123', 5, 'Hello')
```

### 4.2 `replaceText(start, end, newText)` / `replaceText(nodeId, start, end, newText)`

**Purpose**: replace text

**Syntax**:
```typescript
// In control chain
replaceText(start: number, end: number, newText: string)

// Direct call
replaceText(nodeId: string, start: number, end: number, newText: string)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `newText`: replacement text
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [replaceText(0, 5, 'Hello')])

// Direct call
replaceText('node-123', 0, 5, 'Hello')
```

### 4.3 `deleteTextRange(start, end)` / `deleteTextRange(nodeId, start, end)`

**Purpose**: delete a text range

**Syntax**:
```typescript
// In control chain
deleteTextRange(start: number, end: number)

// Direct call
deleteTextRange(nodeId: string, start: number, end: number)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [deleteTextRange(0, 5)])

// Direct call
deleteTextRange('node-123', 0, 5)
```

### 4.4 `wrap(start, end, prefix, suffix)` / `wrap(nodeId, start, end, prefix, suffix)`

**Purpose**: wrap text with prefix/suffix strings

**Syntax**:
```typescript
// In control chain
wrap(start: number, end: number, prefix: string, suffix: string)

// Direct call
wrap(nodeId: string, start: number, end: number, prefix: string, suffix: string)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `prefix`: prefix string
- `suffix`: suffix string
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [wrap(0, 5, '**', '**')])

// Direct call
wrap('node-123', 0, 5, '**', '**')
```

### 4.5 `unwrap(start, end, prefix, suffix)` / `unwrap(nodeId, start, end, prefix, suffix)`

**Purpose**: remove prefix/suffix strings from text

**Syntax**:
```typescript
// In control chain
unwrap(start: number, end: number, prefix: string, suffix: string)

// Direct call
unwrap(nodeId: string, start: number, end: number, prefix: string, suffix: string)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `prefix`: prefix to remove
- `suffix`: suffix to remove
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [unwrap(0, 7, '**', '**')])

// Direct call
unwrap('node-123', 0, 7, '**', '**')
```

### 4.6 `indent(start, end, indentStr?)` / `indent(nodeId, start, end, indentStr?)`

**Purpose**: indent text

**Syntax**:
```typescript
// In control chain
indent(start: number, end: number, indentStr?: string)

// Direct call
indent(nodeId: string, start: number, end: number, indentStr?: string)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `indentStr`: indent string (default `'  ')
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [indent(0, 10, '  ')])

// Direct call
indent('node-123', 0, 10, '  ')
```

### 4.7 `outdent(start, end, indentStr?)` / `outdent(nodeId, start, end, indentStr?)`

**Purpose**: outdent text

**Syntax**:
```typescript
// In control chain
outdent(start: number, end: number, indentStr?: string)

// Direct call
outdent(nodeId: string, start: number, end: number, indentStr?: string)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `indentStr`: indent string to remove (default `'  ')
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [outdent(0, 10, '  ')])

// Direct call
outdent('node-123', 0, 10, '  ')
```

## 5. Mark Manipulation DSL

### 5.1 `applyMark(start, end, markType, attrs?)` / `applyMark(nodeId, start, end, markType, attrs?)`

**Purpose**: apply a mark to text

**Syntax**:
```typescript
// In control chain
applyMark(start: number, end: number, markType: string, attrs?: any)

// Direct call
applyMark(nodeId: string, start: number, end: number, markType: string, attrs?: any)
```

**Parameters**:
- `start`: start position
- `end`: end position
- `markType`: mark type
- `attrs`: mark attributes (optional)
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [applyMark(0, 5, 'bold', { weight: 'bold' })])

// Direct call
applyMark('node-123', 0, 5, 'bold', { weight: 'bold' })
```

### 5.2 `removeMark(markType, range)` / `removeMark(nodeId, markType, range)`

**Purpose**: remove a mark from text

**Syntax**:
```typescript
// In control chain
removeMark(markType: string, range: { start: number; end: number })

// Direct call
removeMark(nodeId: string, markType: string, range: { start: number; end: number })
```

**Parameters**:
- `markType`: mark type to remove
- `range`: removal range
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [removeMark('bold', { start: 0, end: 5 })])

// Direct call
removeMark('node-123', 'bold', { start: 0, end: 5 })
```

### 5.3 `toggleMark(markType, range, attrs?)` / `toggleMark(nodeId, markType, range, attrs?)`

**Purpose**: toggle a mark (add if missing, remove if present)

**Syntax**:
```typescript
// In control chain
toggleMark(markType: string, range: { start: number; end: number }, attrs?: any)

// Direct call
toggleMark(nodeId: string, markType: string, range: { start: number; end: number }, attrs?: any)
```

**Parameters**:
- `markType`: mark type to toggle
- `range`: toggle range
- `attrs`: mark attributes (optional)
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [toggleMark('bold', { start: 0, end: 5 })])

// Direct call
toggleMark('node-123', 'bold', { start: 0, end: 5 })
```

### 5.4 `updateMark(markType, range, newAttrs)` / `updateMark(nodeId, markType, range, newAttrs)`

**Purpose**: update attributes of an existing mark

**Syntax**:
```typescript
// In control chain
updateMark(markType: string, range: { start: number; end: number }, newAttrs: any)

// Direct call
updateMark(nodeId: string, markType: string, range: { start: number; end: number }, newAttrs: any)
```

**Parameters**:
- `markType`: mark type to update
- `range`: mark range
- `newAttrs`: new attributes
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [updateMark('bold', { start: 0, end: 5 }, { weight: 'bolder' })])

// Direct call
updateMark('node-123', 'bold', { start: 0, end: 5 }, { weight: 'bolder' })
```

## 6. Structure Manipulation DSL

### 6.1 `addChild(child, position?)` / `addChild(parentId, child, position?)`

**Purpose**: add a child node

**Syntax**:
```typescript
// In control chain
addChild(child: INode, position?: number)

// Direct call
addChild(parentId: string, child: INode, position?: number)
```

**Parameters**:
- `child`: child node to add
- `position`: insert position (optional)
- `parentId`: parent node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('parent-sid', [addChild(textNode('inline-text', 'New child'), 0)])

// Direct call
addChild('parent-123', textNode('inline-text', 'New child'), 0)
```

### 6.2 `removeChild(childId)` / `removeChild(parentId, childId)`

**Purpose**: remove a child node

**Syntax**:
```typescript
// In control chain
removeChild(childId: string)

// Direct call
removeChild(parentId: string, childId: string)
```

**Parameters**:
- `childId`: ID of child to remove
- `parentId`: parent node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('parent-sid', [removeChild('child-123')])

// Direct call
removeChild('parent-123', 'child-123')
```

### 6.3 `removeChildren(childIds)` / `removeChildren(parentId, childIds)`

**Purpose**: remove multiple child nodes

**Syntax**:
```typescript
// In control chain
removeChildren(childIds: string[])

// Direct call
removeChildren(parentId: string, childIds: string[])
```

**Parameters**:
- `childIds`: array of child IDs to remove
- `parentId`: parent node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('parent-sid', [removeChildren(['child-1', 'child-2', 'child-3'])])

// Direct call
removeChildren('parent-123', ['child-1', 'child-2', 'child-3'])
```

### 6.4 `reorderChildren(childIds)` / `reorderChildren(parentId, childIds)`

**Purpose**: reorder children

**Syntax**:
```typescript
// In control chain
reorderChildren(childIds: string[])

// Direct call
reorderChildren(parentId: string, childIds: string[])
```

**Parameters**:
- `childIds`: array of child IDs in the new order
- `parentId`: parent node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('parent-sid', [reorderChildren(['child-3', 'child-1', 'child-2'])])

// Direct call
reorderChildren('parent-123', ['child-3', 'child-1', 'child-2'])
```

### 6.5 `moveChildren(toParentId, childIds, position?)` / `moveChildren(fromParentId, toParentId, childIds, position?)`

**Purpose**: move children to another parent

**Syntax**:
```typescript
// In control chain
moveChildren(toParentId: string, childIds: string[], position?: number)

// Direct call
moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number)
```

**Parameters**:
- `toParentId`: target parent ID
- `childIds`: array of child IDs to move
- `position`: insert position (optional)
- `fromParentId`: original parent ID (for direct call)

**Examples**:
```typescript
// Control chain
control('from-parent-sid', [moveChildren('to-parent-sid', ['child-1', 'child-2'], 0)])

// Direct call
moveChildren('from-parent-123', 'to-parent-456', ['child-1', 'child-2'], 0)
```

## 7. Selection DSL

### 7.1 `selectRange(anchor, focus)` / `selectRange(nodeId, anchor, focus)`

**Purpose**: select a text range

**Syntax**:
```typescript
// In control chain
selectRange(anchor: { nodeId: string; offset: number }, focus: { nodeId: string; offset: number })

// Direct call
selectRange(nodeId: string, anchor: { nodeId: string; offset: number }, focus: { nodeId: string; offset: number })
```

**Parameters**:
- `anchor`: selection start
- `focus`: selection end
- `nodeId`: target node ID (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [selectRange(
  { nodeId: 'node-1', offset: 0 },
  { nodeId: 'node-1', offset: 5 }
)])

// Direct call
selectRange('node-123', 
  { nodeId: 'node-1', offset: 0 },
  { nodeId: 'node-1', offset: 5 }
)
```

### 7.2 `selectNode()` / `selectNode(nodeId)`

**Purpose**: select an entire node

**Syntax**:
```typescript
// In control chain
selectNode()

// Direct call
selectNode(nodeId: string)
```

**Parameters**:
- `nodeId`: node to select (for direct call)

**Examples**:
```typescript
// Control chain
control('node-sid', [selectNode()])

// Direct call
selectNode('node-123')
```

### 7.3 `clearSelection()`

**Purpose**: clear selection

**Syntax**:
```typescript
clearSelection()
```

**Parameters**: none

**Notes**:
- Does **not** support `control` chains (direct call only)
- Global selection clear; no specific node target

**Example**:
```typescript
clearSelection()
```

## 8. Control DSL

### 8.1 `control(target, actions)`

**Purpose**: run multiple actions sequentially on a specific node

**Syntax**:
```typescript
control(target: string, actions: Array<{ type: string; payload?: any }>)
```

**Parameters**:
- `target`: target node ID
- `actions`: list of actions to execute

**Examples**:
```typescript
// Run multiple actions at once
control('node-sid', [
  setText('New text'),
  setAttrs({ color: 'red' }),
  applyMark(0, 5, 'bold')
])

// Complex action chain
control('parent-sid', [
  addChild(textNode('inline-text', 'New child'), 0),
  removeChild('old-child-sid'),
  reorderChildren(['child-1', 'child-2', 'child-3'])
])
```

## 9. Examples

### 9.1 Basic text editing

```typescript
const result = await transaction(editor, [
  // Insert text
  insertText('node-123', 5, 'Hello'),
  
  // Replace text
  replaceText('node-123', 0, 5, 'Hi'),
  
  // Apply mark
  applyMark('node-123', 0, 2, 'bold', { weight: 'bold' })
]).commit();
```

### 9.2 Using control chain

```typescript
const result = await transaction(editor, [
  // Run multiple actions on one node
  control('node-123', [
    setText('Updated text'),
    setAttrs({ color: 'blue', size: 'large' }),
    applyMark(0, 5, 'italic'),
    wrap(0, 5, '**', '**')
  ])
]).commit();
```

### 9.3 Structure manipulation

```typescript
const result = await transaction(editor, [
  // Create node
  create(textNode('inline-text', 'New node')),
  
  // Add children
  control('parent-123', [
    addChild(textNode('inline-text', 'Child 1'), 0),
    addChild(textNode('inline-text', 'Child 2'), 1)
  ]),
  
  // Reorder children
  control('parent-123', [
    reorderChildren(['child-2', 'child-1'])
  ])
]).commit();
```

### 9.4 Composite operations

```typescript
const result = await transaction(editor, [
  // Text editing
  control('text-node-123', [
    replaceText(0, 10, 'New content'),
    applyMark(0, 4, 'bold'),
    wrap(0, 4, '**', '**')
  ]),
  
  // Structural changes
  control('parent-456', [
    removeChild('old-child'),
    addChild(textNode('inline-text', 'New child'), 0)
  ]),
  
  // Set selection
  selectRange(
    { nodeId: 'text-node-123', offset: 0 },
    { nodeId: 'text-node-123', offset: 4 }
  )
]).commit();
```

---

This guide summarizes all Operations DSL syntax for Barocss Editor. It provides the purpose, syntax, parameters, and examples for each DSL function so developers can reference them quickly.
