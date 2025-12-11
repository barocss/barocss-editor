# Cross-Node Deletion Handling

## Overview

When handling deletion (Backspace/Delete) at node boundaries, interaction with previous/next nodes is needed, not just within the current node.

---

## Scenarios

### Scenario 1: Backspace at Node Start Position

**Situation**: 
- Cursor is at start position (offset 0) of `inline-text` node
- User presses Backspace key

**Example**:
```
[text-1: "Hello"] [text-2: "World"]
                    ↑ cursor (offset 0)
```

**Processing Method**:
1. **If previous node is a sibling with same parent and has `.text` field**:
   - Delete last character of previous node
   - If previous node is empty, delete previous node and merge with current node (optional)

2. **If previous node is an inline node without `.text` field**:
   - Delete entire previous node (e.g., inline-image)

3. **If previous node is a block node or has different parent**:
   - Do nothing

**Implementation Logic**:
```typescript
if (startOffset === 0) {
  const prevNodeId = dataStore.getPreviousNode(startNodeId);
  if (prevNodeId) {
    const prevNode = dataStore.getNode(prevNodeId);
    const prevParent = dataStore.getParent(prevNodeId);
    const currentParent = dataStore.getParent(startNodeId);
    
    // Check if sibling with same parent
    if (prevParent?.sid === currentParent?.sid) {
      // If has .text field: delete character
      if (prevNode?.text !== undefined && typeof prevNode.text === 'string') {
        const prevTextLength = prevNode.text.length;
        if (prevTextLength > 0) {
          return {
            startNodeId: prevNodeId,
            startOffset: prevTextLength - 1,
            endNodeId: prevNodeId,
            endOffset: prevTextLength
          };
        }
        // If previous node is empty, merge (optional)
        // TODO: Implement node merge
      } else {
        // If no .text field: delete entire node
        return { _deleteNode: true, nodeId: prevNodeId };
      }
    }
  }
  // No previous node or condition not met: do nothing
  return null;
}
```

---

### Scenario 2: Delete at Node End Position

**Situation**:
- Cursor is at end position (offset === text.length) of `inline-text` node
- User presses Delete key

**Example**:
```
[text-1: "Hello"] [text-2: "World"]
         ↑ cursor (offset 5, text.length === 5)
```

**Processing Method**:
1. **If next node is a sibling with same parent and has `.text` field**:
   - Delete first character of next node
   - If next node is empty, delete next node and merge with current node (optional)

2. **If next node is an inline node without `.text` field**:
   - Delete entire next node (e.g., inline-image)

3. **If next node is a block node or has different parent**:
   - Do nothing

**Implementation Logic**:
```typescript
const node = dataStore.getNode(startNodeId);
const textLength = node?.text?.length || 0;
if (startOffset >= textLength) {
  const nextNodeId = dataStore.getNextNode(startNodeId);
  if (nextNodeId) {
    const nextNode = dataStore.getNode(nextNodeId);
    const nextParent = dataStore.getParent(nextNodeId);
    const currentParent = dataStore.getParent(startNodeId);
    
    // Check if sibling with same parent
    if (nextParent?.sid === currentParent?.sid) {
      // If has .text field: delete character
      if (nextNode?.text !== undefined && typeof nextNode.text === 'string') {
        if (nextNode.text.length > 0) {
          return {
            startNodeId: nextNodeId,
            startOffset: 0,
            endNodeId: nextNodeId,
            endOffset: 1
          };
        }
        // If next node is empty, merge (optional)
        // TODO: Implement node merge
      } else {
        // If no .text field: delete entire node
        return { _deleteNode: true, nodeId: nextNodeId };
      }
    }
  }
  // No next node or condition not met: do nothing
  return null;
}
```

---

## Rule Summary

### 1. Sibling Node Verification

**Conditions**:
- Previous/next node must have same parent
- Previous/next node must not be a block node

**Reason**:
- Nodes with different parents are different blocks and should not be merged
- Block nodes are block boundaries and not deletion targets

### 2. Deletion Priority

1. **Delete character from previous/next node** (priority)
   - If sibling with same parent and has `.text` field
   - If node is not empty

2. **Delete entire previous/next node**
   - If sibling with same parent but no `.text` field (e.g., inline-image)
   - Delete entire node

3. **Node merge** (optional, Phase 2)
   - If previous/next node is empty
   - Merge with current node

4. **Do nothing** (fallback)
   - No previous/next node or condition not met
   - If block node

### 3. Node Merge vs Character Deletion

**Why prioritize character deletion**:
- User expectation: "I want to delete characters from previous/next node"
- Node merge has large side effects (marks, decorators, etc.)

**When node merge is needed**:
- When previous/next node is already empty
- When user explicitly wants node merge (e.g., delete empty line)

---

## Implementation Plan

### Phase 1: Basic Implementation (Current)

1. ✅ Backspace at node start: Delete last character of previous node
2. ✅ Delete at node end: Delete first character of next node
3. ✅ Sibling node verification logic
4. ✅ Fallback when condition not met (do nothing)

### Phase 2: Node Merge (Future)

1. Merge when previous/next node is empty
2. Handle marks, decorators during merge
3. Adjust selection position after merge

---

## Exception Cases

### Case 1: Previous/Next Node is Different Type

#### 1-1. Single inline node like inline-image

**Example**:
```
[text-1: "Hello"] [image-1] [text-2: "World"]
                    ↑ cursor (text-2 offset 0)
```

**Processing**: 
- Backspace: Delete entire `image-1` node
- Delete: Delete entire `image-1` node (from text-1 end)

**Implementation**:
- `calculateCrossNodeDeleteRange` returns `{ _deleteNode: true, nodeId: 'image-1' }`
- `handleDelete` calls `dataStore.deleteNode('image-1')`

#### 1-2. Block node

**Example**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ cursor (paragraph-2 text-2 start)
```

**Processing**: Do nothing (block boundary)

### Case 2: Previous/Next Node Has Different Parent

**Example**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ cursor (paragraph-2 text-2 start)
```

**Processing**: Do nothing (different block, should not merge)

### Case 3: Previous/Next Node is Empty

**Example**:
```
[text-1: ""] [text-2: "World"]
              ↑ cursor
```

**Processing**: 
- Phase 1: Do nothing
- Phase 2: Node merge (future implementation)

---

## Test Scenarios

### Test 1: Basic Backspace (Node Start)
```
Initial: [text-1: "Hello"] [text-2: "World"]
Cursor: text-2 offset 0
Action: Backspace
Expected: [text-1: "Hell"] [text-2: "World"]
```

### Test 2: Basic Delete (Node End)
```
Initial: [text-1: "Hello"] [text-2: "World"]
Cursor: text-1 offset 5 (end)
Action: Delete
Expected: [text-1: "Hello"] [text-2: "orld"]
```

### Test 3: Previous Node is Different Type
```
Initial: [text-1: "Hello"] [image-1] [text-2: "World"]
Cursor: text-2 offset 0
Action: Backspace
Expected: No change
```

### Test 4: Previous Node Has Different Parent
```
Initial: [paragraph-1 > text-1: "Hello"]
      [paragraph-2 > text-2: "World"]
Cursor: text-2 offset 0
Action: Backspace
Expected: No change
```

### Test 5: Previous Node is Empty
```
Initial: [text-1: ""] [text-2: "World"]
Cursor: text-2 offset 0
Action: Backspace
Expected: Phase 1 - No change, Phase 2 - Node merge
```

---

## Implementation Approaches in Other Editors

### 1. ProseMirror

**Approach**: Model-First, Transaction-based

**Cross-node deletion handling**:
- Detect `deleteContentBackward`/`deleteContentForward` in `beforeinput`
- `preventDefault()` then change model with Transaction
- ProseMirror's `delete` command automatically handles node boundaries:
  - Delete last character of previous node
  - Automatically merge empty nodes
  - Do nothing at block boundaries

**Implementation Example**:
```typescript
// ProseMirror automatically handles node boundaries internally
const tr = state.tr.delete(selection.from, selection.to);
// delete command automatically:
// - Deletes characters from previous/next nodes
// - Merges empty nodes
// - Handles block boundaries
dispatch(tr);
```

**Characteristics**:
- Transaction system automatically handles node boundaries
- Users don't need to explicitly handle node boundaries
- Node type verification based on Schema

---

### 2. Slate.js

**Approach**: Model-First, Transforms API

**Cross-node deletion handling**:
- `preventDefault()` in `beforeinput`
- `Transforms.delete()` handles node boundaries:
  - Delete characters from previous/next nodes
  - Merge empty nodes (optional)
  - Do nothing at block boundaries

**Implementation Example**:
```typescript
// Slate handles node boundaries with Transforms API
Transforms.delete(editor, {
  at: selection,
  // Internally handles previous/next nodes
  // Provides empty node merge option
});
```

**Characteristics**:
- Transforms API automatically handles node boundaries
- React-based, so automatic re-render after model change
- Node merge provided as option

---

### 3. Lexical

**Approach**: Model-First, Selection API

**Cross-node deletion handling**:
- `preventDefault()` in `beforeinput`
- `$getSelection().removeText()` handles node boundaries:
  - Delete characters from previous/next nodes
  - Merge empty nodes
  - Do nothing at block boundaries

**Implementation Example**:
```typescript
// Lexical handles node boundaries with Selection API
editor.update(() => {
  const selection = $getSelection();
  if (selection) {
    selection.removeText();
    // removeText() automatically:
    // - Deletes characters from previous/next nodes
    // - Merges empty nodes
  }
});
```

**Characteristics**:
- Selection API automatically handles node boundaries
- Internally verifies and processes node types
- React-based, so automatic re-render after model change

---

### 4. Quill

**Approach**: Hybrid (Delta model + DOM)

**Cross-node deletion handling**:
- Uses `beforeinput` for some, MutationObserver for others
- Handles node boundaries based on Delta model:
  - Delete characters from previous/next nodes
  - Merge empty nodes (optional)

**Characteristics**:
- Delta model handles node boundaries
- DOM and model synchronization can be complex

---

## Comparison Summary

| Editor | Approach | Node Boundary Handling | Empty Node Merge | Block Boundary Handling |
|--------|----------|----------------------|------------------|------------------------|
| **ProseMirror** | Model-First | Transaction auto-handling | Automatic | Do nothing |
| **Slate.js** | Model-First | Transforms API auto-handling | Option | Do nothing |
| **Lexical** | Model-First | Selection API auto-handling | Automatic | Do nothing |
| **Quill** | Hybrid | Delta model handling | Optional | Do nothing |
| **Our Editor** | Hybrid | Explicit handling (`.text` field-based) | Phase 2 planned | Schema-based verification |

---

## Common Patterns

### 1. Model-First Approach
- Most editors adopt Model-First approach
- `preventDefault()` in `beforeinput` then change model
- Update DOM after model change

### 2. Automatic Node Boundary Handling
- Most editors automatically handle node boundaries
- Users don't need to explicitly handle node boundaries
- Internal APIs handle previous/next nodes

### 3. Empty Node Merge
- Most editors support empty node merge
- ProseMirror, Lexical: Automatic merge
- Slate: Provided as option

### 4. Block Boundary Handling
- All editors do nothing at block boundaries
- Blocks are independent units, so should not be merged

### 5. Schema-based Type Verification
- Most editors verify node types through Schema
- Our editor judges by `.text` field existence (custom schema support)

---

## Our Editor's Differences

### 1. `.text` Field-based Judgment
- Other editors: Judge by node type name in Schema
- Our editor: Judge by `.text` field existence
- **Reason**: Custom schema support (inline-text, inline-image, etc. are all custom)

### 2. Explicit Node Boundary Handling
- Other editors: Internal APIs automatically handle
- Our editor: Explicit handling with `calculateCrossNodeDeleteRange`
- **Reason**: Enables finer control

### 3. Hybrid Approach
- Other editors: Mostly Model-First
- Our editor: Text input is DOM-First, deletion is Model-First
- **Reason**: IME input stability

---

## References

- `DataStore.getPreviousNode(nodeId)`: Returns previous node ID
- `DataStore.getNextNode(nodeId)`: Returns next node ID
- `DataStore.getParent(nodeId)`: Returns parent node
- `DataStore.getNode(nodeId)`: Returns node information

