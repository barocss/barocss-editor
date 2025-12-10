# Delete Complexity Analysis

## Problem

Delete looks simple but is actually quite complex:

1. **Direction**: Backspace (backward) vs Delete (forward)
2. **What to remove**: text, node, block
3. **Selection span**: block selection vs inline selection

---

## Delete scenario taxonomy

### 1. By direction

#### 1-1. Backspace (`deleteContentBackward`)
- Direction: backward (previous char/node)
- Action: delete content before the caret

#### 1-2. Delete (`deleteContentForward`)
- Direction: forward (next char/node)
- Action: delete content after the caret

---

### 2. By selection type

#### 2-1. Collapsed selection (caret only)
- `selection.collapsed === true`
- Handling:
  - Delete the character at the current position
  - At node boundaries, handle previous/next node

#### 2-2. Range selection (text selected)
- `selection.collapsed === false`
- Handling: delete the full selected range

#### 2-3. Block selection (whole block selected)
- Whole block is selected
- Handling: delete entire block or just contents?

#### 2-4. Inline selection (inline node selected)
- Inline node is selected
- Handling: delete entire inline node or just text?

---

### 3. By target

#### 3-1. Text delete
- Condition: delete characters within the same node
- Example: `"Hello"` → `"Hllo"` (remove `e`)

#### 3-2. Whole-node delete
- Conditions:
  - Inline node with no `.text` (e.g., inline-image)
  - Empty node
- Example: `[image-1]` → delete it

#### 3-3. Block delete
- Condition: whole block is selected
- Example: `[paragraph-1]` → delete it

#### 3-4. Cross-node delete
- Condition: selection spans multiple nodes
- Example: `[text-1: "Hello"] [text-2: "World"]` → `[text-1: "He"] [text-2: "ld"]`

---

## How ProseMirror handles it

### ProseMirror `baseKeymap` delete behavior

```typescript
{
  "Backspace": deleteSelection | joinBackward,
  "Delete": deleteSelection | joinForward
}
```

**Behavior**:
1. If there is a selection: `deleteSelection` (delete the range)
2. If collapsed:
   - Backspace → `joinBackward` (merge with previous block or delete previous char)
   - Delete → `joinForward` (merge with next block or delete next char)

**Characteristics**:
- Supports block merge (`joinBackward` / `joinForward`)
- Prioritizes selection if present
- Behavior differs by direction

---

## Our current implementation

### Current `calculateDeleteRange`

```typescript
private calculateDeleteRange(modelSelection: any, inputType: string, currentNodeId: string): any | null {
  // 1. Range selection: delete selected range
  if (!collapsed) {
    return { startNodeId, startOffset, endNodeId, endOffset };
  }

  // 2. Collapsed selection: branch by direction
  switch (inputType) {
    case 'deleteContentBackward': // Backspace
      if (startOffset > 0) {
        // same node: delete previous char
        return { startNodeId, startOffset: startOffset - 1, endNodeId, endOffset: startOffset };
      } else {
        // node boundary: handle previous node
        return calculateCrossNodeDeleteRange(startNodeId, 'backward', dataStore);
      }

    case 'deleteContentForward': // Delete
      if (startOffset < textLength) {
        // same node: delete next char
        return { startNodeId, startOffset, endNodeId, endOffset: startOffset + 1 };
      } else {
        // node boundary: handle next node
        return calculateCrossNodeDeleteRange(startNodeId, 'forward', dataStore);
      }
  }
}
```

### Current `calculateCrossNodeDeleteRange`

```typescript
private calculateCrossNodeDeleteRange(
  currentNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): any | null {
  // 1. Find sibling nodes
  // 2. Check block nodes (if block, return null)
  // 3. Check .text field
  //    - if exists: delete character
  //    - if absent: delete whole node ({ _deleteNode: true })
}
```

---

## Gaps to address

### 1. Block selection handling

**Current**: Treat block selection as a simple range delete

**Open questions**:
- Delete the whole block?
- Or only delete contents and keep the block?

**Example**:
```
[paragraph-1 > text-1: "Hello"]
↑ whole block selected
```

**Options**:
- Option A: delete entire block
- Option B: delete text only, keep block

---

### 2. Inline selection handling

**Current**: Range delete when inline node selected

**Open questions**:
- Delete the entire inline node?
- Or delete text only?

**Example**:
```
[text-1: "Hello"] [image-1] [text-2: "World"]
                  ↑ inline image selected
```

**Options**:
- Option A: delete entire inline node (recommended)
- Option B: delete selected range (but atom inline has no range)

---

### 3. Direction-specific behaviors

**Current**: Backspace and Delete mostly identical

**Missing**:
- Block merge (`joinBackward` / `joinForward`)
- Handling empty-node merges

**Example**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: ""]  ← empty paragraph
↑ caret at start of paragraph-2
```

**Backspace expectation**:
- Current: does nothing
- Desired: remove paragraph-2 or merge with paragraph-1

---

## Recommended improvements

### 1. Refine delete-range computation

```typescript
private calculateDeleteRange(
  modelSelection: any,
  inputType: string,
  currentNodeId: string
): DeleteRange | null {
  // 1) If there is a range
  if (!modelSelection.collapsed) {
    return this._calculateRangeDelete(modelSelection);
  }

  // 2) Directional handling
  if (inputType === 'deleteContentBackward') {
    return this._calculateBackwardDelete(modelSelection, currentNodeId);
  } else if (inputType === 'deleteContentForward') {
    return this._calculateForwardDelete(modelSelection, currentNodeId);
  }

  return null;
}

private _calculateRangeDelete(modelSelection: any): DeleteRange {
  // Delete selected range
  const isBlockSelection = this._isBlockSelection(modelSelection);
  
  if (isBlockSelection) {
    // Option A: delete entire block (recommended) or Option B: delete contents only
    return this._calculateBlockDelete(modelSelection);
  } else {
    // Inline/text range delete
    return {
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset,
      endNodeId: modelSelection.endNodeId,
      endOffset: modelSelection.endOffset
    };
  }
}

private _calculateBackwardDelete(modelSelection: any, currentNodeId: string): DeleteRange | null {
  const { startNodeId, startOffset } = modelSelection;
  
  // Same node
  if (startOffset > 0) {
    return {
      startNodeId,
      startOffset: startOffset - 1,
      endNodeId: startNodeId,
      endOffset: startOffset
    };
  }

  // Node boundary: previous node
  return this.calculateCrossNodeDeleteRange(startNodeId, 'backward', dataStore);
}

private _calculateForwardDelete(modelSelection: any, currentNodeId: string): DeleteRange | null {
  const { startNodeId, startOffset } = modelSelection;
  const node = dataStore.getNode(startNodeId);
  const textLength = node?.text?.length || 0;
  
  // Same node
  if (startOffset < textLength) {
    return {
      startNodeId,
      startOffset,
      endNodeId: startNodeId,
      endOffset: startOffset + 1
    };
  }

  // Node boundary: next node
  return this.calculateCrossNodeDeleteRange(startNodeId, 'forward', dataStore);
}
```

---

### 2. Distinguish block vs inline selections

```typescript
private _isBlockSelection(modelSelection: any): boolean {
  // Determine if selection covers an entire block
  const startNode = dataStore.getNode(modelSelection.startNodeId);
  const endNode = dataStore.getNode(modelSelection.endNodeId);
  
  // If selection spans first-to-last child of a block, treat as block selection
  // TODO: implement precise logic
  return false;
}

private _calculateBlockDelete(modelSelection: any): DeleteRange {
  // Option A: delete entire block
  const blockId = this._getBlockId(modelSelection);
  return { _deleteNode: true, nodeId: blockId };
  
  // Option B: delete contents only (keep block)
  // return {
  //   startNodeId: modelSelection.startNodeId,
  //   startOffset: modelSelection.startOffset,
  //   endNodeId: modelSelection.endNodeId,
  //   endOffset: modelSelection.endOffset
  // };
}
```

---

### 3. Add node-merge logic

```typescript
private calculateCrossNodeDeleteRange(
  currentNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): DeleteRange | null {
  // ... existing logic ...

  // Empty node handling
  if (targetTextLength === 0) {
    // Option A: merge nodes
    return this._mergeNodes(currentNodeId, targetNodeId, direction, dataStore);
    
    // Option B: delete empty node
    return { _deleteNode: true, nodeId: targetNodeId };
  }

  // ... existing logic ...
}

private _mergeNodes(
  currentNodeId: string,
  targetNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): DeleteRange | null {
  // Merge logic:
  // 1) Merge targetNode content into currentNode
  // 2) Delete targetNode
  // 3) Handle marks, decorators
  // TODO: implement
  return null;
}
```

---

## Open decisions

### 1. Behavior on block selection

**Question**: delete the whole block or only contents?

**Options**:
- **Option A**: delete the entire block (recommended)
  - User expectation: “I selected the block to remove it.”
  - Implementation: `{ _deleteNode: true, nodeId: blockId }`

- **Option B**: delete only contents, keep block
  - User expectation: “Keep the block, clear its contents.”
  - Implementation: range delete

---

### 2. Behavior on inline node selection

**Question**: delete the inline node entirely?

**Options**:
- **Option A**: delete entire inline node (recommended)
  - Example: `[image-1]` selected → remove `image-1`
  - Implementation: `{ _deleteNode: true, nodeId: inlineNodeId }`

- **Option B**: delete only the range
  - Atom inline nodes have no range; not feasible

---

### 3. Empty node merge

**Question**: when deleting an empty node, merge?

**Options**:
- **Option A**: delete empty node (current)
  - Implementation: `{ _deleteNode: true, nodeId: emptyNodeId }`

- **Option B**: merge with previous/next
  - Implementation: `_mergeNodes()`
  - Adds complexity

---

## Recommendations

### ✅ Block selection: delete entire block

```typescript
if (isBlockSelection) {
  return { _deleteNode: true, nodeId: blockId };
}
```

### ✅ Inline node selection: delete node

```typescript
if (isInlineNodeSelection) {
  return { _deleteNode: true, nodeId: inlineNodeId };
}
```

### ✅ Empty node: delete node (merge in Phase 2)

```typescript
if (targetTextLength === 0) {
  return { _deleteNode: true, nodeId: targetNodeId };
}
```

---

## Implementation priorities

### Phase 1: baseline (now)
- ✅ Collapsed selection delete
- ✅ Range selection delete
- ✅ Cross-node delete
- ✅ Direction handling (Backspace/Delete)

### Phase 2: enhancements (later)
- ⏳ Block selection handling
- ⏳ Inline node selection handling
- ⏳ Empty-node merge
- ⏳ Block merge (`joinBackward` / `joinForward`)
