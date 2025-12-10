# Droppable Node Specification

## Overview

This document clearly defines the definition, purpose, and criteria for "Droppable Node". Droppable Node is a node that can be a **drop target** in the drag and drop system.

---

## 1. What is a Droppable Node?

**Droppable Node** is a **node that can receive other nodes**. That is, a node where users can drag and drop nodes.

### Core Concepts

- **Drop target**: Node that can receive other nodes
- **content-based**: Determines which nodes can be received based on schema's `content` definition
- **Opposite side of drag and drop**: draggable is "what to drag", droppable is "where to drop"

### Important Distinction: Draggable vs Droppable

#### Draggable Node (Drag Source)
- **What to drag**: Node that can be dragged
- **Basically all nodes are draggable** (except document)
- Not draggable if explicitly set to `draggable: false`

#### Droppable Node (Drop Target)
- **Where to drop**: Node that can be dropped on
- **Only nodes with content defined are droppable** (basically)
- Not droppable if explicitly set to `droppable: false`
- Determines which nodes can be received based on schema's `content` definition

### Relationship

- **Draggable Node**: Node that can be dragged (most nodes)
- **Droppable Node**: Node that can be dropped on (nodes with content)
- **Some nodes can be both**: paragraph is both draggable and droppable (can drag itself and receive other nodes)

---

## 2. Droppable Node Criteria

### 2.1 Priority-Based Determination

The `_isDroppableNode(nodeId)` function determines in the following order:

#### Step 1: Check Schema droppable Attribute (Highest Priority)

```typescript
// Check node type's droppable attribute from schema
const nodeType = schema.getNodeType(node.stype);

// If droppable attribute is explicitly false, not droppable
if (nodeType.droppable === false) {
  return false;
}
```

#### Step 2: Check Schema content

```typescript
// If has content, droppable (default)
if (nodeType.content) {
  return true;
}

// If no content, not droppable (default)
return false;
```

**Examples:**
- `document` (content: 'block+') → **Droppable**
- `paragraph` (content: 'inline*') → **Droppable**
- `heading` (content: 'inline*') → **Droppable**
- `inline-text` (no content) → **Not droppable**
- `inline-image` (no content, atom: true) → **Not droppable**
- `fixedBlock` (content: 'inline*', droppable: false) → **Not droppable**

#### Step 3: Check Node content Field (Fallback)

```typescript
// If no schema info, check node's content field
if (node.content !== undefined) {
  // If has content field, droppable
  return true;
}
```

#### Step 4: Default (Safely false)

```typescript
// Otherwise not droppable (safely false)
return false;
```

---

## 3. Check if Specific Node Can Be Dropped

### 3.1 canDropNode Function

The `canDropNode(targetNodeId, draggedNodeId)` function checks if a specific node can be dropped on a drop target.

**Determination order:**

1. **Check if drop target is droppable**
   ```typescript
   if (!_isDroppableNode(targetNodeId)) {
     return false;
   }
   ```

2. **Check if dragged node is draggable**
   ```typescript
   if (!_isDraggableNode(draggedNodeId)) {
     return false;
   }
   ```

3. **Check schema's content definition**
   ```typescript
   const targetNodeType = schema.getNodeType(targetNode.stype);
   const draggedNodeType = schema.getNodeType(draggedNode.stype);
   
   const contentModel = targetNodeType.content;
   const draggedGroup = draggedNodeType.group;
   const draggedStype = draggedNode.stype;
   
   // Check if draggedNode's group or stype is allowed in content model
   if (contentModel.includes(draggedGroup) || contentModel.includes(draggedStype)) {
     return true;
   }
   ```

**Examples:**

```typescript
// Can drop block node on document
canDropNode('document-1', 'paragraph-1') // true (document's content: 'block+')

// Can drop inline node on paragraph
canDropNode('paragraph-1', 'inline-text-1') // true (paragraph's content: 'inline*')
canDropNode('paragraph-1', 'inline-image-1') // true (paragraph's content: 'inline*')

// Cannot drop block node on inline node
canDropNode('inline-text-1', 'paragraph-1') // false (inline-text has no content)

// Cannot drop on node with droppable: false
canDropNode('nonDroppableBlock-1', 'paragraph-1') // false
```

---

## 4. Types of Droppable Nodes

### 4.1 Document Node

**Criteria:**
- `group: 'document'` (checked from schema)
- `content: 'block+'` (checked from schema)
- Droppable if not `droppable: false`

**Characteristics:**
- Can receive block nodes
- Top-level container
- Can be parent of other nodes

**Example:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
  // Schema definition: { group: 'document', content: 'block+' }
}
// When user drops paragraph on document:
// moveNode({ nodeId: 'paragraph-1', newParentId: 'document-1', position: 2 })
```

### 4.2 Block Node

**Criteria:**
- `group: 'block'` (checked from schema)
- Has `content` definition (checked from schema)
- Droppable if not `droppable: false`

**Characteristics:**
- Generally can receive inline nodes
- Entire block becomes drop target

**Example:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // Schema definition: { group: 'block', content: 'inline*' }
}
// When user drops inline-text on paragraph:
// moveNode({ nodeId: 'text-1', newParentId: 'paragraph-2', position: 1 })
```

### 4.3 Non-Droppable Nodes

**Criteria:**
- No `content` definition
- Explicitly set to `droppable: false`

**Characteristics:**
- Cannot be drop target
- Atom nodes, text nodes, etc.

**Example:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // Schema definition: { group: 'inline' } (no content)
}
// inline-text is not droppable
```

---

## 5. Use Cases

### 5.1 Check Drop Target

**Scenario**: User drags node and hovers over another node

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ dragging
         ↑ hover (check if droppable)

Behavior:
if (dataStore.isDroppableNode('paragraph-2')) {
  // Mark as drop target (e.g., change background color)
  element.classList.add('droppable');
} else {
  // Mark as not droppable (e.g., change cursor)
  element.classList.add('no-drop');
}
```

**Behavior:**
```typescript
// When user drags node and hovers over another node
function handleDragOver(targetNodeId: string) {
  if (dataStore.isDroppableNode(targetNodeId)) {
    // Mark as drop target
    event.preventDefault(); // Allow drop
    element.classList.add('droppable');
  } else {
    // Mark as not droppable
    element.classList.add('no-drop');
  }
}
```

### 5.2 Check if Specific Node Can Be Dropped

**Scenario**: User drags paragraph and attempts to drop on another paragraph

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ dragging
         ↑ drop attempt

Behavior:
if (dataStore.canDropNode('paragraph-2', 'paragraph-1')) {
  // Droppable: execute moveNode
} else {
  // Not droppable: block drop
}
```

**Behavior:**
```typescript
// When user drops node
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // Check if specific node can be dropped
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
  } else {
    // Not droppable: block drop
    event.preventDefault();
    // Provide visual feedback
  }
}
```

### 5.3 Query Droppable Node List

**Scenario**: Provide visual feedback only to droppable nodes while dragging

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
[inline-text-1: "Foo"]
         ↑ dragging

Behavior:
const droppableNodes = dataStore.getDroppableNodes();
// Only includes paragraph-1, paragraph-2 (excludes inline-text-1)
droppableNodes.forEach(node => {
  highlightDroppableArea(node.sid);
});
```

**Behavior:**
```typescript
// When user starts dragging node
function handleDragStart(draggedNodeId: string) {
  // Provide visual feedback to all droppable nodes
  const droppableNodes = dataStore.getDroppableNodes();
  droppableNodes.forEach(node => {
    const element = document.querySelector(`[data-bc-sid="${node.sid}"]`);
    if (element) {
      element.classList.add('droppable-target');
    }
  });
}

// Remove feedback when drag ends
function handleDragEnd() {
  const droppableNodes = dataStore.getDroppableNodes();
  droppableNodes.forEach(node => {
    const element = document.querySelector(`[data-bc-sid="${node.sid}"]`);
    if (element) {
      element.classList.remove('droppable-target');
    }
  });
}
```

---

## 6. Detailed Determination Logic

### 6.1 _isDroppableNode Implementation

```typescript
private _isDroppableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }
  
  // 1. Check content and droppable from schema (highest priority)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        // If droppable attribute is explicitly false, not droppable
        if (nodeType.droppable === false) {
          return false;
        }
        
        // If has content, droppable (default)
        if (nodeType.content) {
          return true;
        }
        
        // If no content, not droppable (default)
        return false;
      }
    } catch (error) {
      // Continue if schema lookup fails
    }
  }
  
  // 2. If no schema info, check node's content field
  if (node.content !== undefined) {
    // If has content field, droppable
    return true;
  }
  
  // 3. Otherwise not droppable (safely false)
  return false;
}
```

### 6.2 canDropNode Implementation

```typescript
canDropNode(targetNodeId: string, draggedNodeId: string): boolean {
  // 1. Check if drop target is droppable
  if (!this._isDroppableNode(targetNodeId)) {
    return false;
  }
  
  // 2. Check if dragged node is draggable
  if (!this._isDraggableNode(draggedNodeId)) {
    return false;
  }
  
  // 3. Check schema's content definition
  const schema = this.dataStore.getActiveSchema();
  if (!schema) {
    return true; // If no schema, allow by default
  }
  
  const targetNode = this.dataStore.getNode(targetNodeId);
  const draggedNode = this.dataStore.getNode(draggedNodeId);
  
  if (!targetNode || !draggedNode) {
    return false;
  }
  
  const targetNodeType = schema.getNodeType(targetNode.stype);
  const draggedNodeType = schema.getNodeType(draggedNode.stype);
  
  if (!targetNodeType || !draggedNodeType) {
    return false;
  }
  
  const contentModel = targetNodeType.content;
  if (!contentModel) {
    return false; // If no content, not droppable
  }
  
  // Check if draggedNode's group or stype is allowed in content model
  const draggedGroup = draggedNodeType.group;
  const draggedStype = draggedNode.stype;
  
  const contentModelLower = contentModel.toLowerCase();
  
  // Check based on group
  if (draggedGroup && contentModelLower.includes(draggedGroup)) {
    return true;
  }
  
  // Check based on stype
  if (contentModelLower.includes(draggedStype)) {
    return true;
  }
  
  return false;
}
```

---

## 7. Draggable vs Droppable Comparison

### 7.1 Core Distinction

| Distinction | Draggable Node | Droppable Node |
|-------------|---------------|----------------|
| **Meaning** | Node that can be dragged (drag source) | Node that can be dropped on (drop target) |
| **Criteria** | Basically all nodes (except document) | Only nodes with content |
| **Control** | Explicitly set with `draggable: false` | Explicitly set with `droppable: false` |
| **Examples** | paragraph, inline-text, inline-image | document, paragraph, heading |

### 7.2 Relationship

**Venn Diagram:**
```
Draggable Node (most nodes)
  ├── Droppable Node (nodes with content)
  │     └── Both possible (paragraph, heading, etc.)
  └── Non-Droppable Draggable (nodes without content)
        └── inline-text, inline-image, etc.
```

**Examples:**
- **Both possible**: paragraph, heading, document
  - Can drag and can receive other nodes
- **Only Draggable**: inline-text, inline-image
  - Can drag but cannot receive other nodes
- **Neither**: Nodes with draggable: false, droppable: false

---

## 8. Main Usage

### 8.1 Drag and Drop Event Handling

```typescript
// When user drags node and hovers over another node
function handleDragOver(targetNodeId: string, draggedNodeId: string) {
  // Check if drop target is droppable
  if (dataStore.isDroppableNode(targetNodeId)) {
    // Check if specific node can be dropped
    if (dataStore.canDropNode(targetNodeId, draggedNodeId)) {
      // Droppable: allow drop
      event.preventDefault();
      element.classList.add('droppable');
    } else {
      // Not droppable: block drop
      element.classList.add('no-drop');
    }
  }
}

// When user drops node
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // Check if droppable
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

### 8.2 Query Droppable Node List

```typescript
// Query all droppable nodes in document
const droppableNodes = dataStore.getDroppableNodes();

// Query only block nodes
const blockNodes = dataStore.getDroppableNodes({
  includeBlocks: true,
  includeInline: false,
  includeDocument: false
});
```

### 8.3 Check Droppability

```typescript
// Check if specific node can be drop target
if (dataStore.isDroppableNode(nodeId)) {
  // Enable drop UI (e.g., show drop area)
  element.setAttribute('data-droppable', 'true');
} else {
  // Disable drop UI
  element.setAttribute('data-droppable', 'false');
}
```

---

## 9. Summary

### Definition of Droppable Node

1. **Node that can be a drop target** (can receive other nodes)
2. **Node with content defined** (droppable by default)
3. **Determines which nodes can be received based on schema's content definition**

### Core Distinction

- **Draggable Node**: Node that can be dragged (most nodes)
- **Droppable Node**: Node that can be dropped on (nodes with content)
- **canDropNode**: Check if specific node can be dropped on drop target

### Criteria (Priority)

1. **Schema droppable attribute** (highest priority)
   - `droppable: false` → Not droppable
2. **Check schema content**
   - Has `content` → Droppable (default)
   - No `content` → Not droppable (default)
3. **Check node content field** (fallback)
   - Has `content` field → Droppable
4. **Default**
   - Otherwise not droppable (safely false)

### Main Usage

- Drag and drop event handling: Check drop target and droppability
- moveNode operation: Only droppable nodes can be moved to
- Drop UI: Show drop area only on droppable nodes

---

## 10. References

- `packages/datastore/src/operations/utility-operations.ts`: `_isDroppableNode`, `canDropNode` implementation
- `packages/datastore/test/get-editable-node.test.ts`: Test cases
- `packages/datastore/docs/draggable-node-spec.md`: Draggable Node specification
- `packages/model/src/operations/moveNode.ts`: moveNode operation implementation
- `packages/schema/src/validators.ts`: Content model validation logic
