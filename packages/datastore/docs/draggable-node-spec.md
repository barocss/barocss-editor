# Draggable Node Specification

## Overview

This document clearly defines the definition, purpose, and criteria for "Draggable Node".

---

## 1. What is a Draggable Node?

**Draggable Node** is a **node that can be moved via drag and drop**. That is, a node that users can drag with mouse to move to a different location.

### Core Concepts

- **Drag and drop possible**: Users can drag node to move to different location
- **Node movement**: Change node's parent or position via `moveNode` operation
- **Independent of edit commands**: Separate concept from Editable Node, Selectable Node

### Important Distinction: Editable vs Selectable vs Draggable

#### Editable Node (navigable with cursor)
- **Text node**: Node with `.text` field
- **Inline node**: Node with `group: 'inline'`
- **Editable Block**: `group: 'block'` + `editable: true` + has `.text` field
- **Characteristics**: Navigable with Backspace/Delete/arrow keys

#### Selectable Node (selectable by clicking)
- **Block node**: paragraph, heading, table, etc.
- **Inline node**: inline-image, inline-link, etc.
- **Text node**: inline-text, etc.
- **Characteristics**: Can be selected as Node Selection or Range Selection when clicked

#### Draggable Node (movable by dragging)
- **Block node**: paragraph, heading, table, etc. (draggable by default)
- **Inline node**: inline-image, inline-link, etc. (draggable by default)
- **Text node**: inline-text, etc. (draggable by default)
- **Characteristics**: 
  - Can move node via drag and drop
  - Not draggable if explicitly set to `draggable: false`
  - Separate from Editable Node, Selectable Node (can be draggable but not selectable)

---

## 2. Draggable Node Criteria

### 2.1 Priority-Based Determination

The `_isDraggableNode(nodeId)` function determines in the following order:

#### Step 1: Check Schema Group (Highest Priority)

```typescript
// Check node type's group from schema
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// document node is always not draggable
if (group === 'document') {
  return false;
}

// If draggable attribute is explicitly false, not draggable
if (nodeType.draggable === false) {
  return false;
}

// Otherwise draggable (default true)
return true;
```

**Examples:**
- `paragraph` (group: 'block') → **Draggable**
- `inline-image` (group: 'inline') → **Draggable**
- `inline-text` (group: 'inline') → **Draggable**
- `document` (group: 'document') → **Not draggable**
- `fixedBlock` (group: 'block', draggable: false) → **Not draggable**

#### Step 2: Check stype (Fallback)

```typescript
// If stype is 'document', not draggable
if (node.stype === 'document') {
  return false;
}
```

#### Step 3: Default (Safely true)

```typescript
// Otherwise draggable (safely true)
return true;
```

---

## 3. Types of Draggable Nodes

### 3.1 Block Node

**Criteria:**
- `group: 'block'` (checked from schema)
- Draggable if not `draggable: false`

**Characteristics:**
- Can move to different location via drag and drop
- Entire block moves (including internal nodes)
- Not Editable Node (not navigable with edit commands)

**Example:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // Schema definition: { group: 'block' }
}
// When user drags paragraph:
// moveNode({ nodeId: 'paragraph-1', newParentId: 'document', position: 2 })
```

**Use cases:**
- Change block order
- Move block to different parent
- Copy and move block

### 3.2 Inline Atom Node

**Criteria:**
- `group: 'inline'` (checked from schema)
- `atom: true` (checked from schema)
- No `.text` field
- Draggable if not `draggable: false`

**Characteristics:**
- Can move to different location via drag and drop
- Entire node moves (no offset)
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'inline-image',
  attributes: { src: 'image.jpg', alt: 'Image' }
  // Schema definition: { group: 'inline', atom: true }
}
// When user drags inline-image:
// moveNode({ nodeId: 'image-1', newParentId: 'paragraph-2', position: 1 })
```

**Use cases:**
- Change image position
- Move image to different paragraph
- Copy and move image

### 3.3 Text Node

**Criteria:**
- Has `.text` field and `typeof node.text === 'string'`
- `group: 'inline'` (checked from schema)
- Draggable if not `draggable: false`

**Characteristics:**
- Can move to different location via drag and drop
- Entire text node moves
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // Schema definition: { group: 'inline' }
}
// When user drags text node:
// moveNode({ nodeId: 'text-1', newParentId: 'paragraph-2', position: 0 })
```

**Use cases:**
- Change text node position
- Move text to different paragraph
- Copy and move text

### 3.4 Editable Block Node

**Criteria:**
- `group: 'block'` (checked from schema)
- `editable: true` (checked from schema)
- Has `.text` field
- Draggable if not `draggable: false`

**Characteristics:**
- Can move to different location via drag and drop
- Is Editable Node (navigable with edit commands)

**Example:**
```typescript
{
  stype: 'codeBlock',
  text: 'const x = 1;'
  // Schema definition: { group: 'block', editable: true }
}
// When user drags codeBlock:
// moveNode({ nodeId: 'codeBlock-1', newParentId: 'document', position: 3 })
```

---

## 4. What is Not a Draggable Node

### 4.1 Document Node

**Characteristics:**
- `group: 'document'`
- Top-level container
- Not a drag target

**Example:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
// document node is not draggable
```

### 4.2 Node with draggable: false

**Characteristics:**
- Explicitly set to `draggable: false` in schema
- Does not move even when dragged
- Used for fixed UI elements or system nodes

**Example:**
```typescript
// Schema definition
{
  'fixedBlock': {
    name: 'fixedBlock',
    group: 'block',
    draggable: false  // Not draggable
  }
}
```

---

## 5. Use Cases

### 5.1 Move Node via Drag and Drop

**Scenario**: User drags paragraph to move to different location

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
[paragraph-3: "Foo"]
         ↑ drag

After:
[paragraph-1: "Hello"]
[paragraph-3: "Foo"]
[paragraph-2: "World"]  ← moved

Operation: moveNode({ nodeId: 'paragraph-2', newParentId: 'document', position: 2 })
```

**Behavior:**
```typescript
// User drags paragraph
if (dataStore.isDraggableNode('paragraph-2')) {
  // Execute moveNode operation
  await transaction(editor, [
    {
      type: 'moveNode',
      payload: {
        nodeId: 'paragraph-2',
        newParentId: 'document',
        position: 2
      }
    }
  ]).commit();
}
```

### 5.2 Move Image via Drag and Drop

**Scenario**: User drags inline-image to move to different paragraph

```
Before:
[paragraph-1: "Hello"] [image-1] [text-2: "World"]
                        ↑ drag
[paragraph-2: "Foo"]

After:
[paragraph-1: "Hello"] [text-2: "World"]
[paragraph-2: "Foo"] [image-1]  ← moved

Operation: moveNode({ nodeId: 'image-1', newParentId: 'paragraph-2', position: 1 })
```

**Behavior:**
```typescript
// User drags inline-image
if (dataStore.isDraggableNode('image-1')) {
  // Execute moveNode operation
  await transaction(editor, [
    {
      type: 'moveNode',
      payload: {
        nodeId: 'image-1',
        newParentId: 'paragraph-2',
        position: 1
      }
    }
  ]).commit();
}
```

### 5.3 Handle Non-Draggable Node

**Scenario**: User attempts to drag node with draggable: false

```
Before:
[fixedBlock: "Fixed Content"]
         ↑ drag attempt

After:
[fixedBlock: "Fixed Content"]  ← does not move

Behavior: Ignore drag event or provide visual feedback
```

**Behavior:**
```typescript
// User attempts to drag node
function handleDragStart(nodeId: string) {
  if (!dataStore.isDraggableNode(nodeId)) {
    // Non-draggable node
    event.preventDefault();
    // Provide visual feedback (e.g., change cursor, show tooltip)
    return;
  }
  
  // Draggable node: start drag
  // ...
}
```

---

## 6. Detailed Determination Logic

### 6.1 _isDraggableNode Implementation

```typescript
private _isDraggableNode(nodeId: string): boolean {
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
        
        // document node is always not draggable
        if (group === 'document') {
          return false;
        }
        
        // If draggable attribute is explicitly false, not draggable
        if (nodeType.draggable === false) {
          return false;
        }
        
        // Otherwise draggable (default true)
        return true;
      }
    } catch (error) {
      // Continue if schema lookup fails
    }
  }
  
  // 2. If no schema info, draggable by default (except document)
  if (node.stype === 'document') {
    return false;
  }
  
  // 3. Otherwise draggable (safely true)
  return true;
}
```

### 6.2 Importance of Determination Order

**Why check Schema Group first?**

1. **Accuracy**: Schema definition is the most accurate information
2. **Explicit control**: Can explicitly control with `draggable: false`
3. **Consistency**: Ensures consistent behavior based on schema

---

## 7. Editable vs Selectable vs Draggable Comparison

### 7.1 Core Distinction

| Distinction | Editable Node | Selectable Node | Draggable Node |
|-------------|---------------|-----------------|----------------|
| **Navigation method** | Navigate with cursor (Backspace/Delete/arrow keys) | Select by clicking | Move by dragging |
| **Edit commands** | Navigable with `getPreviousEditableNode` / `getNextEditableNode` | Not navigable | Not navigable |
| **Selection** | Range or Node Selection | Node Selection or Range Selection | Independent of Selection |
| **Examples** | Nodes with `.text` field, nodes with `group: 'inline'`, blocks with `editable: true` | Nodes with `group: 'block'`, nodes with `group: 'inline'`, all nodes (except document) | All nodes (except document, `draggable: false`) |

### 7.2 Relationship

**Venn Diagram:**
```
Draggable Node (widest)
  ├── Selectable Node
  │     └── Editable Node (narrowest)
  └── Non-Selectable Draggable (draggable but not selectable)
```

**Examples:**
- **Editable Node**: Text node, inline node, editable block
  - All are Selectable Nodes
  - All are Draggable Nodes
- **Selectable Node (Non-Editable)**: Regular block node
  - Not Editable Node
  - Draggable Node
- **Draggable Node (Non-Selectable)**: Node that is draggable but not selectable (currently none)
  - Not Editable Node
  - Not Selectable Node

---

## 8. Main Usage

### 8.1 Drag and Drop Event Handling

```typescript
// When user starts dragging node
function handleDragStart(nodeId: string) {
  if (dataStore.isDraggableNode(nodeId)) {
    // Draggable node: start drag
    const node = dataStore.getNode(nodeId);
    event.dataTransfer.setData('text/plain', nodeId);
    // Provide drag visual feedback
  } else {
    // Non-draggable node: block drag
    event.preventDefault();
  }
}

// When user drops node
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // Check if dragged node is draggable
  if (!dataStore.isDraggableNode(draggedNodeId)) {
    return;
  }
  
  // Check if drop target is droppable and can receive specific node
  if (dataStore.canDropNode(targetNodeId, draggedNodeId)) {
    // Execute moveNode operation
    await transaction(editor, [
      {
        type: 'moveNode',
        payload: {
          nodeId: draggedNodeId,
          newParentId: targetNodeId,
          position: position
        }
      }
    ]).commit();
  }
}
```

### 8.2 Query Draggable Node List

```typescript
// Query all draggable nodes in document
const draggableNodes = dataStore.getDraggableNodes();

// Query only block nodes
const blockNodes = dataStore.getDraggableNodes({
  includeBlocks: true,
  includeInline: false,
  includeEditable: false
});
```

### 8.3 Check Draggability

```typescript
// Check if specific node is draggable
if (dataStore.isDraggableNode(nodeId)) {
  // Enable drag UI (e.g., show drag handle)
  element.setAttribute('draggable', 'true');
} else {
  // Disable drag UI
  element.setAttribute('draggable', 'false');
}
```

---

## 9. Summary

### Definition of Draggable Node

1. **Node that can be moved via drag and drop** (mouse drag)
2. **Node that can be the target of moveNode operation**
3. **Node that is not a document node** (basically all nodes are draggable)

### Core Distinction

- **Editable Node**: Navigable with cursor (text, inline, editable block)
- **Selectable Node**: Selectable by clicking (all blocks, inline, text)
- **Draggable Node**: Movable by dragging (all blocks, inline, text, except document)

### Criteria (Priority)

1. **Schema Group** (highest priority)
   - `group: 'document'` → Not draggable
   - `draggable: false` → Not draggable
   - Otherwise → Draggable (default true)
2. **stype check** (fallback)
   - `stype === 'document'` → Not draggable
3. **Default**
   - Otherwise draggable (safely true)

### Main Usage

- Drag and drop event handling: Check if node is draggable when drag starts/ends
- moveNode operation: Only draggable nodes can be moved
- Drag UI: Show drag handle only on draggable nodes

---

## 10. References

- `packages/datastore/src/operations/utility-operations.ts`: `_isDraggableNode` implementation
- `packages/datastore/test/get-editable-node.test.ts`: Test cases
- `packages/datastore/docs/editable-node-spec.md`: Editable Node specification
- `packages/datastore/docs/selectable-node-spec.md`: Selectable Node specification
- `packages/datastore/docs/droppable-node-spec.md`: Droppable Node specification (drop target)
- `packages/model/src/operations/moveNode.ts`: moveNode operation implementation
