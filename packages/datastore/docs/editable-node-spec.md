# Editable Node Specification

## Overview

This document clearly defines the definition, purpose, and criteria for "Editable Node".

---

## 1. What is an Editable Node?

**Editable Node** is a **node that can be navigated with cursor**. That is, a node where previous/next nodes can be found with edit commands like Backspace, Delete, arrow keys, etc.

### Core Concepts

- **Navigable with cursor**: Can find previous/next nodes with `getPreviousEditableNode` / `getNextEditableNode`
- **Edit commands apply**: Nodes where edit commands like Backspace, Delete, arrow keys apply
- **Selection target**: Can be the target of Range Selection or Node Selection

### Important Distinction: Editable vs Selectable

#### Editable Node (navigable with cursor)
- **Text node**: Node with `.text` field (can move cursor based on offset)
- **Inline node**: Node with `group: 'inline'` (including atom nodes)
- **Characteristics**: Navigable with Backspace/Delete/arrow keys

#### Selectable Node (selectable by clicking)
- **Block node**: paragraph, heading, table, etc.
- **Characteristics**: 
  - Can be selected as Node Selection when clicked
  - But not navigable with Backspace/Delete/arrow keys (not editable node)
  - Block node itself cannot be navigated with edit commands, only internal inline nodes can be navigated

### Differences in Selection Methods

Editable Node uses different selection methods depending on node type:

#### Text Nodes
- **Range Selection**: Can place cursor based on offset
- Example: `{ type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5 }`

#### Inline Atomic Nodes
- **Node Selection**: Select entire node (no offset)
- Example: `{ type: 'node', nodeId: 'image-1' }`

### What is Not an Editable Node

- **Block node**: `paragraph`, `heading`, `table`, `codeBlock`, etc.
  - Can be selected when clicked, but cannot be navigated with edit commands
  - Internal inline nodes are editable, but block node itself is not editable
- **Document node**: Top-level container (not an editing target)

---

## 2. Editable Node Criteria

### 2.1 Priority-Based Determination

The `_isEditableNode(nodeId)` function determines in the following order:

#### Step 1: Check Schema Group (Highest Priority)

```typescript
// Check node type's group from schema
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// Editable Block: editable if block but editable=true
if (group === 'block' && nodeType.editable === true) {
  // Must have .text field to be editable
  if (node.text !== undefined && typeof node.text === 'string') {
    return true; // Editable block
  }
  return false;
}

if (group === 'block' || group === 'document') {
  return false; // Not editable
}
if (group === 'inline') {
  return true; // Editable
}
```

**Examples:**
- `paragraph` (group: 'block') → **Not editable**
- `codeBlock` (group: 'block', editable: true, has .text field) → **Editable**
- Node with `.text` field (group: 'inline') → **Editable**
- Node with `group: 'inline'` → **Editable**

#### Step 2: Check stype Prefix (Fallback)

```typescript
// If has 'inline-' prefix, treat as inline node
if (node.stype && node.stype.startsWith('inline-')) {
  return true; // Editable
}
```

**Examples:**
- Node with `stype` starting with `'inline-'` prefix → **Editable**
- Fallback logic when schema info is not available

#### Step 3: Estimate Block Node (Fallback)

```typescript
// If has content and no text field, treat as block
if (node.content && node.text === undefined) {
  return false; // Not editable
}
```

#### Step 4: Check .text Field

```typescript
// If has .text field and is string type, it's a text node
// Note: Even if has .text field like codeBlock, if group is 'block', already returned false in step 1
if (node.text !== undefined && typeof node.text === 'string') {
  return true; // Editable
}
```

**Examples:**
- Node with `.text` field and string type → **Editable**
- Even if has `.text` field like `codeBlock`, if `group: 'block'`, already returned false in step 1

#### Step 5: Default (Safely true)

```typescript
// Otherwise treat as editable node (safely true)
return true;
```

---

## 3. Types of Editable Nodes

### 3.1 Text Nodes

**Criteria:**
- Has `.text` field and `typeof node.text === 'string'`
- `group: 'inline'` (or fallback logic when schema info is not available)

**Characteristics:**
- Can place cursor inside text
- Can edit text (insert, delete)
- Uses Range Selection (offset-based)

**Example:**
```typescript
{
  stype: 'inline-text', // stype is not important
  text: 'Hello World'   // If has .text field, treated as text node
}
// Or
{
  stype: 'custom-text-node', // Even different stype
  text: 'Hello World'         // If has .text field, it's a text node
}
```

**Use cases:**
- Text input
- Delete characters with Backspace/Delete
- Move cursor with arrow keys

### 3.2 Inline Atom Nodes

**Criteria:**
- `group: 'inline'` (checked from schema)
- `atom: true` (checked from schema)
- No `.text` field

**Characteristics:**
- Atomic node, cannot edit internally
- Can select/delete entire node
- Uses Node Selection (no offset)

**Example:**
```typescript
{
  stype: 'inline-image', // stype is not important
  attributes: { src: 'image.jpg', alt: 'Image' }
  // No .text field
  // Schema definition: { group: 'inline', atom: true }
}
// Or
{
  stype: 'custom-atom-node', // Even different stype
  attributes: { ... }
  // If schema definition is { group: 'inline', atom: true }, it's an atom node
}
```

**Use cases:**
- Delete entire node with Backspace
- Skip node and move with arrow keys
- Select node (Node Selection)

### 3.3 Other Inline Nodes

**Criteria:**
- `group: 'inline'` (checked from schema)
- No `.text` field
- `atom: false` or no `atom` attribute

**Characteristics:**
- Inline node but neither text node nor atom node
- Links, mentions, buttons, etc.

**Example:**
```typescript
{
  stype: 'inline-link', // Or other inline node
  attributes: { href: 'https://example.com' }
  // Schema: { group: 'inline' }
}
```

**Use cases:**
- Delete node with Backspace/Delete
- Navigate with arrow keys

---

## 4. What is Not an Editable Node

### 4.1 Block Node

**Characteristics:**
- `group: 'block'`
- Contains inline nodes internally
- Cannot place cursor directly (cursor only possible in internal inline nodes)

**Example:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2'] // Internal text nodes are editable
}
```

**Behavior:**
- **Skipped** in `getPreviousEditableNode` / `getNextEditableNode`
- Finds and returns internal inline nodes

### 4.2 Document Node

**Characteristics:**
- `group: 'document'`
- Top-level container
- Not an editing target

**Example:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
```

### 4.3 Special Case: Editable Block (codeBlock, mathBlock, etc.)

**Concept:**
- `group: 'block'` but can have `.text` field
- If `editableBlock: true` attribute is set, becomes **editable** block node

**Example:**
```typescript
// Schema definition
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true,  // Editable block
    content: 'text*',
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  }
}

// Node instance
{
  stype: 'codeBlock',
  text: 'const x = 1;', // Has .text field and
  // editable: true so editable
}
```

**Determination logic:**
1. Check `group: 'block'` in step 1 (Schema Group check)
2. If `editable: true` and has `.text` field → **Editable**
3. Otherwise → **Not editable**

**Use cases:**
- `codeBlock`: Code editing
- `mathBlock`: Formula editing
- `formula`: Excel style formula editing

**Details:**
- For edit state management, advanced editor integration, etc., refer to `block-text-editing-strategies.md`

---

## 5. Use Cases

### 5.1 Backspace Key Handling

**Purpose:** Find previous editable node and handle

**Behavior:**
```typescript
// Backspace at offset 0
const prevEditableNodeId = dataStore.getPreviousEditableNode(currentNodeId);

if (prevEditableNodeId) {
  // Handle previous editable node
  // - Text node: Delete last character or merge
  // - Inline atom node: Delete entire node
}
```

**Example:**
```
Before:
[paragraph-1: "Hello"] [paragraph-2: "World"]
                        ↑ cursor (text-2 offset 0 in paragraph-2)

Backspace input:
→ getPreviousEditableNode('text-2') 
→ Returns 'text-1' (last text in paragraph-1)
→ Block merge or character deletion
```

### 5.2 Delete Key Handling

**Purpose:** Find next editable node and handle

**Behavior:**
```typescript
// Delete at end of text
const nextEditableNodeId = dataStore.getNextEditableNode(currentNodeId);

if (nextEditableNodeId) {
  // Handle next editable node
}
```

### 5.3 Arrow Key Handling

**Purpose:** Move cursor to previous/next editable node

**Behavior:**
```typescript
// Left arrow key
const prevEditableNodeId = dataStore.getPreviousEditableNode(currentNodeId);
if (prevEditableNodeId) {
  // Move cursor to previous node
}

// Right arrow key
const nextEditableNodeId = dataStore.getNextEditableNode(currentNodeId);
if (nextEditableNodeId) {
  // Move cursor to next node
}
```

---

## 6. Detailed Determination Logic

### 6.1 _isEditableNode Implementation

```typescript
private _isEditableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }

  // 1. Check group from schema (high priority)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        const group = nodeType.group;
        // block or document nodes are not editable
        if (group === 'block' || group === 'document') {
          return false;
        }
        // inline nodes are editable
        if (group === 'inline') {
          return true;
        }
      }
    } catch (error) {
      // Continue if schema lookup fails
    }
  }

  // 2. Estimate from stype if no schema info
  // If has 'inline-' prefix, treat as inline node
  if (node.stype && node.stype.startsWith('inline-')) {
    return true;
  }

  // 3. Estimate block node (if has content and no text field, treat as block)
  if (node.content && node.text === undefined) {
    return false;
  }

  // 4. Text node (.text field exists, and not block)
  // Note: Even if has .text field like codeBlock, if group is 'block', already returned false above
  if (node.text !== undefined && typeof node.text === 'string') {
    return true;
  }

  // 5. Otherwise treat as editable node (safely true)
  return true;
}
```

### 6.2 Importance of Determination Order

**Why check Schema Group first?**

1. **Accuracy**: Schema definition is the most accurate information
2. **codeBlock case**: Even if has `.text` field, if `group: 'block'`, not editable
3. **Consistency**: Schema-based determination is most reliable

**Example:**
```typescript
// codeBlock has .text field but is a block node
{
  stype: 'codeBlock',
  text: 'const x = 1;',
  // group: 'block' (schema definition)
}

// Determination process:
// Step 1: group === 'block' → return false (not editable)
// Step 2: Does not reach .text field check
```

---

## 7. Edge Cases

### 7.1 Empty Block Node

**Situation:**
```typescript
{
  stype: 'paragraph',
  content: [] // Empty paragraph
}
```

**Behavior:**
- Block node so `_isEditableNode` → `false`
- Skipped in `getPreviousEditableNode` / `getNextEditableNode`
- Finds and returns previous/next editable node

### 7.2 Nested Block Structure

**Situation:**
```typescript
{
  stype: 'blockQuote',
  content: [
    {
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'Quote' } // Node with .text field
      ]
    }
  ]
}
```

**Behavior:**
- `blockQuote` (block) → skip
- `paragraph` (block) → skip
- Node with `.text` field → **Editable** (return)

### 7.3 Table Structure

**Situation:**
```typescript
{
  stype: 'table',
  content: [
    {
      stype: 'tableRow',
      content: [
        {
          stype: 'tableCell',
          content: [
            { stype: 'inline-text', text: 'Cell Text' } // Node with .text field
          ]
        }
      ]
    }
  ]
}
```

**Behavior:**
- `table` (block) → skip
- `tableRow` (block) → skip
- `tableCell` (block) → skip
- Node with `.text` field → **Editable** (return)

---

## 8. Relationship with Selection

### 8.1 Range Selection

**Within Editable Node:**
- Text node: Can select range based on offset
- Inline atom node: Select entire node (no offset)

**Example:**
```typescript
// Text node range selection
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 10
}

// Inline image node selection
{
  type: 'node',
  nodeId: 'image-1'
}
```

### 8.2 Node Selection

**Select Entire Editable Node:**
- Inline atom node: Select entire node
- Text node: Select entire text range

**Example:**
```typescript
// Inline image node selection
{
  type: 'node',
  nodeId: 'image-1'
}

// Text node entire selection (converted to Range)
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: textLength
}
```

---

## 9. Editable vs Selectable Distinction

### 9.1 Core Distinction

| Distinction | Editable Node | Selectable Node (Block) |
|-------------|---------------|------------------------|
| **Navigation method** | Navigate with cursor (Backspace/Delete/arrow keys) | Select by clicking |
| **Edit commands** | Navigable with `getPreviousEditableNode` / `getNextEditableNode` | Not navigable (only internal inline nodes can be navigated) |
| **Selection** | Range or Node Selection | Node Selection only |
| **Examples** | Nodes with `.text` field, nodes with `group: 'inline'` | Nodes with `group: 'block'` |

### 9.2 Why are Block Nodes Not Editable Nodes?

**Reason:**
- Block nodes serve as **containers**
- Actual editing targets are internal inline nodes
- Navigating block node itself with Backspace/Delete is meaningless

**Example:**
```
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ cursor (text node offset 0 in paragraph-2)

Backspace input:
→ getPreviousEditableNode('text-2')
→ Returns 'text-1' (last text in paragraph-1)
→ Block merge or character deletion

Not navigating block node itself,
but navigating internal inline nodes
```

### 9.3 What About Block Node Selection?

**Block Nodes are Selectable:**
- Can be selected as Node Selection when user clicks
- But not navigable with edit commands

**Example:**
```typescript
// User clicks paragraph
{
  type: 'node',
  nodeId: 'paragraph-1'
}

// But not navigable with Backspace/Delete/arrow keys
// → getPreviousEditableNode('paragraph-1') finds internal inline nodes
```

---

## 10. Summary

### Definition of Editable Node

1. **Node navigable with cursor** (Backspace/Delete/arrow keys)
2. **Node where previous/next nodes can be found with edit commands**
3. **Node that is not a block node** (block nodes can only edit internal inline nodes)

### Core Distinction

- **Editable Node**: Navigable with cursor (text, inline)
- **Selectable Node**: Selectable by clicking (including blocks)
- **Block Node**: Can be selected when clicked, but not navigable with edit commands

### Criteria (Priority)

1. **Schema Group** (highest priority)
   - `group: 'block'` + `editable: true` + has `.text` field → **Editable** (Editable Block)
   - `group: 'block'` or `'document'` → Not editable
   - `group: 'inline'` → Editable
2. **stype prefix** (fallback)
   - `'inline-'` prefix → Editable
3. **Block estimation** (fallback)
   - Has `content` and no `.text` → Not editable
4. **.text field**
   - If exists, editable (except if already determined as block)
5. **Default**
   - Otherwise editable (safely true)

### Main Usage

- `getPreviousEditableNode`: Backspace, left arrow key
- `getNextEditableNode`: Delete, right arrow key
- Selection management: Target nodes for Range Selection

---

## 10. References

- `packages/datastore/src/operations/utility-operations.ts`: `_isEditableNode` implementation
- `packages/datastore/test/get-editable-node.test.ts`: Test cases
- `packages/extensions/src/delete.ts`: Used in Backspace logic
- `packages/datastore/docs/block-text-editing-strategies.md`: Block node internal text editing strategies (codeBlock, mathBlock, etc.)
- `packages/datastore/docs/selectable-node-spec.md`: Selectable Node specification (nodes selectable by clicking)
