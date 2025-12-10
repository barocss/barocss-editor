# Selectable Node Specification

## Overview

This document clearly defines the definition, purpose, and criteria for "Selectable Node".

---

## 1. What is a Selectable Node?

**Selectable Node** is a **node that can be selected by clicking**. That is, a node that users can select with mouse click, drag, or keyboard shortcuts.

### Core Concepts

- **Selectable by clicking**: When user clicks a node, it is selected as Node Selection or Range Selection
- **Selection target**: Can be the target of Node Selection or Range Selection
- **Independent of edit commands**: Separate concept from Editable Node (can be selectable but not editable)

### Important Distinction: Editable vs Selectable

#### Editable Node (navigable with cursor)
- **Text node**: Node with `.text` field
- **Inline node**: Node with `group: 'inline'`
- **Editable Block**: `group: 'block'` + `editable: true` + has `.text` field
- **Characteristics**: Navigable with Backspace/Delete/arrow keys

#### Selectable Node (selectable by clicking)
- **Block node**: paragraph, heading, table, etc.
- **Inline node**: inline-image, inline-link, etc.
- **Text node**: inline-text, etc.
- **Characteristics**: 
  - Can be selected as Node Selection or Range Selection when clicked
  - Separate from Editable Node (block nodes are selectable but not editable)

### Differences in Selection Methods

Selectable Node uses different selection methods depending on node type:

#### Block Node
- **Node Selection**: Select entire node
- Example: `{ type: 'node', nodeId: 'paragraph-1' }`
- When user clicks block, selected as Node Selection

#### Inline Atom Node
- **Node Selection**: Select entire node (no offset)
- Example: `{ type: 'node', nodeId: 'image-1' }`
- When user clicks inline-image, selected as Node Selection

#### Text Node
- **Range Selection**: Can place cursor based on offset
- Example: `{ type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5 }`
- When user clicks text, selected as Range Selection (cursor)
- Or when entire text is selected, selected as Range Selection (range)

---

## 2. Selectable Node Criteria

### 2.1 Priority-Based Determination

The `_isSelectableNode(nodeId)` function determines in the following order:

#### Step 1: Check Schema Group (Highest Priority)

```typescript
// Check node type's group from schema
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// document node is always not selectable
if (group === 'document') {
  return false;
}

// If selectable attribute is explicitly false, not selectable
if (nodeType.selectable === false) {
  return false;
}

// Otherwise selectable (default true)
return true;
```

**Examples:**
- `paragraph` (group: 'block') → **Selectable**
- `inline-image` (group: 'inline') → **Selectable**
- `inline-text` (group: 'inline') → **Selectable**
- `document` (group: 'document') → **Not selectable**
- `hiddenBlock` (group: 'block', selectable: false) → **Not selectable**

#### Step 2: Check stype (Fallback)

```typescript
// If stype is 'document', not selectable
if (node.stype === 'document') {
  return false;
}
```

#### Step 3: Default (Safely true)

```typescript
// Otherwise selectable (safely true)
return true;
```

---

## 3. Types of Selectable Nodes

### 3.1 Block Node

**Criteria:**
- `group: 'block'` (checked from schema)
- Selectable if not `selectable: false`

**Characteristics:**
- Selected as Node Selection when clicked
- Entire block is selected (block itself, not internal text)
- Not Editable Node (not navigable with edit commands)

**Example:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // Schema definition: { group: 'block' }
}
// When user clicks paragraph:
// { type: 'node', nodeId: 'paragraph-1' }
```

**Use cases:**
- Select entire block
- Delete block
- Move/copy block

### 3.2 Inline Atom Node

**Criteria:**
- `group: 'inline'` (checked from schema)
- `atom: true` (checked from schema)
- No `.text` field
- Selectable if not `selectable: false`

**Characteristics:**
- Selected as Node Selection when clicked
- Entire node is selected (no offset)
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'inline-image',
  attributes: { src: 'image.jpg', alt: 'Image' }
  // Schema definition: { group: 'inline', atom: true }
}
// When user clicks inline-image:
// { type: 'node', nodeId: 'image-1' }
```

**Use cases:**
- Select image
- Delete image
- Edit image attributes

### 3.3 Text Node

**Criteria:**
- Has `.text` field and `typeof node.text === 'string'`
- `group: 'inline'` (checked from schema)
- Selectable if not `selectable: false`

**Characteristics:**
- Selected as Range Selection (cursor) when clicked
- When text range is dragged, selected as Range Selection (range)
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // Schema definition: { group: 'inline' }
}
// When user clicks text:
// { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
```

**Use cases:**
- Edit text
- Select text range
- Move cursor

### 3.4 Editable Block Node

**Criteria:**
- `group: 'block'` (checked from schema)
- `editable: true` (checked from schema)
- Has `.text` field
- Selectable if not `selectable: false`

**Characteristics:**
- Can be selected as Node Selection or Range Selection when clicked
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'codeBlock',
  text: 'const x = 1;'
  // Schema definition: { group: 'block', editable: true }
}
// When user clicks codeBlock:
// { type: 'node', nodeId: 'codeBlock-1' } or
// { type: 'range', startNodeId: 'codeBlock-1', startOffset: 0, ... }
```

---

## 4. What is Not a Selectable Node

### 4.1 Document Node

**Characteristics:**
- `group: 'document'`
- Top-level container
- Not a selection target

**Example:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
// document node is not selectable
```

### 4.2 Node with selectable: false

**Characteristics:**
- Explicitly set to `selectable: false` in schema
- Not selected even when clicked
- Used for UI elements or hidden nodes

**Example:**
```typescript
// Schema definition
{
  'hiddenBlock': {
    name: 'hiddenBlock',
    group: 'block',
    selectable: false  // Not selectable
  }
}
```

---

## 5. Use Cases

### 5.1 Select Node by Clicking

**Scenario**: User clicks paragraph

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ click

After:
[paragraph-1: "Hello"]
[paragraph-2: "World"] (selected)

Selection: { type: 'node', nodeId: 'paragraph-2' }
```

**Behavior:**
```typescript
// User clicks paragraph
if (dataStore.isSelectableNode('paragraph-2')) {
  // Select as Node Selection
  editor.updateSelection({
    type: 'node',
    nodeId: 'paragraph-2'
  });
}
```

### 5.2 Select Image by Clicking

**Scenario**: User clicks inline-image

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ click

After:
[text-1: "Hello"] [image-1 (selected)] [text-2: "World"]

Selection: { type: 'node', nodeId: 'image-1' }
```

**Behavior:**
```typescript
// User clicks inline-image
if (dataStore.isSelectableNode('image-1')) {
  // Select as Node Selection
  editor.updateSelection({
    type: 'node',
    nodeId: 'image-1'
  });
  
  // Pass select event to ComponentManager
  componentManager.emit('select', 'image-1', { ... });
}
```

### 5.3 Move Cursor by Clicking Text

**Scenario**: User clicks text

```
Before:
[text-1: "Hello World"]
         ↑ click (offset 5)

After:
[text-1: "Hello World"]
     ↑ cursor (offset 5)

Selection: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
```

**Behavior:**
```typescript
// User clicks text
if (dataStore.isSelectableNode('text-1')) {
  // Select as Range Selection (cursor)
  editor.updateSelection({
    type: 'range',
    startNodeId: 'text-1',
    startOffset: 5,
    endNodeId: 'text-1',
    endOffset: 5,
    collapsed: true
  });
}
```

---

## 6. Detailed Determination Logic

### 6.1 _isSelectableNode Implementation

```typescript
private _isSelectableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }
  
  // 1. Check group from schema (highest priority)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        const group = nodeType.group;
        
        // document node is always not selectable
        if (group === 'document') {
          return false;
        }
        
        // If selectable attribute is explicitly false, not selectable
        if (nodeType.selectable === false) {
          return false;
        }
        
        // Otherwise selectable (default true)
        return true;
      }
    } catch (error) {
      // Continue if schema lookup fails
    }
  }
  
  // 2. If no schema info, selectable by default (except document)
  if (node.stype === 'document') {
    return false;
  }
  
  // 3. Otherwise selectable (safely true)
  return true;
}
```

### 6.2 Importance of Determination Order

**Why check Schema Group first?**

1. **Accuracy**: Schema definition is the most accurate information
2. **Explicit control**: Can explicitly control with `selectable: false`
3. **Consistency**: Ensures consistent behavior based on schema

---

## 7. Editable vs Selectable Comparison

### 7.1 Core Distinction

| Distinction | Editable Node | Selectable Node |
|-------------|---------------|-----------------|
| **Navigation method** | Navigate with cursor (Backspace/Delete/arrow keys) | Select by clicking |
| **Edit commands** | Navigable with `getPreviousEditableNode` / `getNextEditableNode` | Not navigable (if not editable node) |
| **Selection** | Range or Node Selection | Node Selection or Range Selection |
| **Examples** | Nodes with `.text` field, nodes with `group: 'inline'`, blocks with `editable: true` | Nodes with `group: 'block'`, nodes with `group: 'inline'`, all nodes (except document) |

### 7.2 Relationship

**Editable Node is a subset of Selectable Node:**
- All Editable Nodes are Selectable Nodes
- But not all Selectable Nodes are Editable Nodes
- Example: `paragraph` is Selectable but not Editable

**Venn Diagram:**
```
Selectable Node
  ├── Editable Node (text, inline, editable block)
  └── Non-Editable Selectable (regular block nodes)
```

---

## 8. Main Usage

### 8.1 Click Event Handling

```typescript
// When user clicks a node
function handleNodeClick(nodeId: string) {
  if (dataStore.isSelectableNode(nodeId)) {
    // Select as Node Selection or Range Selection
    const node = dataStore.getNode(nodeId);
    if (node.text !== undefined) {
      // Text node: Range Selection
      editor.updateSelection({
        type: 'range',
        startNodeId: nodeId,
        startOffset: 0,
        endNodeId: nodeId,
        endOffset: node.text.length,
        collapsed: false
      });
    } else {
      // Atom node or Block: Node Selection
      editor.updateSelection({
        type: 'node',
        nodeId: nodeId
      });
    }
  }
}
```

### 8.2 ComponentManager Events

```typescript
// When Node Selection occurs
function handleNodeSelection(selection: ModelNodeSelection) {
  if (dataStore.isSelectableNode(selection.nodeId)) {
    // Pass select event to ComponentManager
    componentManager.emit('select', selection.nodeId, {
      selection: selection
    });
  }
}
```

### 8.3 Query Selectable Node List

```typescript
// Query all selectable nodes in document
const selectableNodes = dataStore.getSelectableNodes();

// Query only block nodes
const blockNodes = dataStore.getSelectableNodes({
  includeBlocks: true,
  includeInline: false,
  includeEditable: false
});
```

---

## 9. Summary

### Definition of Selectable Node

1. **Node selectable by clicking** (mouse click, drag, keyboard shortcuts)
2. **Node that can be the target of Node Selection or Range Selection**
3. **Node that is not a document node** (basically all nodes are selectable)

### Core Distinction

- **Editable Node**: Navigable with cursor (text, inline, editable block)
- **Selectable Node**: Selectable by clicking (all blocks, inline, text)
- **Relationship**: Editable Node is a subset of Selectable Node

### Criteria (Priority)

1. **Schema Group** (highest priority)
   - `group: 'document'` → Not selectable
   - `selectable: false` → Not selectable
   - Otherwise → Selectable (default true)
2. **stype check** (fallback)
   - `stype === 'document'` → Not selectable
3. **Default**
   - Otherwise selectable (safely true)

### Main Usage

- Click event handling: Check if node is selectable when node is clicked
- Selection management: Target nodes for Node Selection or Range Selection
- ComponentManager events: Pass events for selected nodes

---

## 10. References

- `packages/datastore/src/operations/utility-operations.ts`: `_isSelectableNode` implementation
- `packages/datastore/test/get-editable-node.test.ts`: Test cases
- `packages/datastore/docs/editable-node-spec.md`: Editable Node specification
- `packages/editor-view-dom/docs/selection-system.md`: Selection System specification
