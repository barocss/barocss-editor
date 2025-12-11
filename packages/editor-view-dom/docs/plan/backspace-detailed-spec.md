# Backspace Key Processing Detailed Specification

## Overview

This document defines in detail all cases that must be handled when Backspace key is pressed.

---

## 1. Basic Processing Flow

```
User Backspace key input
    ↓
1. keydown event occurs
    ↓
2. Check isComposing
    ↓
3. IF isComposing === true:
      Allow browser default behavior (IME composition in progress)
      RETURN
    ↓
4. preventDefault() (Model-First)
    ↓
5. Convert DOM Selection → Model Selection
    ↓
6. Calculate deletion range
    ↓
7. Execute Command (deleteText)
    ↓
8. Apply selectionAfter after Transaction completes
```

---

## 2. Case-by-Case Processing

### 2.1 Backspace During Composing State

**Situation (Diagram):**
```
Before:
┌─────────────────────────────┐
│ IME composition in progress (e.g., "ㅎ" → "하") │
└─────────────────────────────┘
           ↑
     Backspace keydown

After (when we don't intervene):
┌──────────────────────────────┐
│ Browser: Cancel composition character     │
│ Model: No change              │
│ Selection: Managed by IME       │
└──────────────────────────────┘

Conditions:
- event.isComposing === true
- Or internal flag _isComposing === true
```

**Processing Method:**
```
IF isComposing:
  Do not preventDefault()
  Allow browser default behavior
  RETURN
```

**Reason:**
- Browser manages composition characters during IME composition
- Backspace during composition cancels composition character
- Our intervention can break IME behavior

**Example:**
```
User input: "ㅎ" → "하" (composing)
Backspace input: Cancel composition → "ㅎ" or empty state
```

**Implementation Location:**
```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
private handleKeydown(event: KeyboardEvent): void {
  // Allow browser default behavior if IME composing
  if (this._isComposing && event.key === 'Backspace') {
    return; // Do not preventDefault()
  }
  
  // Model-First processing
  if (event.key === 'Backspace') {
    event.preventDefault();
    this.handleBackspaceKey();
  }
}
```

---

### 2.2 Backspace at Offset 0

**Situation:**
- Cursor at start position of text node (offset 0)
- `modelSelection.startOffset === 0`

**Processing Strategy:**
1. Delete last character of previous node (priority)
2. If previous node is empty, merge nodes (Phase 2)
3. If previous node has no `.text` field, delete entire node

**Processing Flow Diagram:**

```
Backspace at Offset 0
    ↓
Previous node exists?
    ├─ NO → Do nothing
    └─ YES
        ↓
Sibling of same parent?
    ├─ NO → Do nothing (block boundary)
    └─ YES
        ↓
Check previous node type
    ├─ Has .text field (inline-text)
    │   ├─ Text length > 0
    │   │   └─ Delete last character (deleteText operation)
    │   └─ Text length === 0 (empty node)
    │       └─ Merge nodes (mergeTextNodes operation) [Phase 2]
    └─ No .text field (inline-image, etc.)
        └─ Delete entire node (deleteNode operation)
```

#### 2.2.1 Case Classification

**Case A: Delete Last Character of Previous Node**

**Situation (Diagram):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0)

After Backspace:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hell"     │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0)

Operation:
- deleteText({ startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 })
```

**Implementation:**
```typescript
if (prevNode?.text !== undefined && typeof prevNode.text === 'string') {
  const prevTextLength = prevNode.text.length;
  if (prevTextLength > 0) {
    const deleteRange: ModelSelection = {
      type: 'range',
      startNodeId: prevNodeId,
      startOffset: prevTextLength - 1,
      endNodeId: prevNodeId,
      endOffset: prevTextLength,
      collapsed: false,
      direction: 'forward'
    };
    
    this.editor.executeCommand('deleteText', { range: deleteRange });
    return;
  }
}
```

**Required Operation:**
- ✅ `deleteTextRange` operation (already implemented)

---

**Case B: Merge Empty Node**

**Situation (Diagram):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0)

After Backspace:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ Cursor (text-1 offset 0)

Operation:
- mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })
  - text-2 deleted
  - text-1's text changed to "World"
```

**Implementation:**
```typescript
if (prevTextLength === 0) {
  // Merge nodes
  this.editor.executeCommand('mergeTextNodes', {
    leftNodeId: prevNodeId,
    rightNodeId: modelSelection.startNodeId
  });
  return;
}
```

**Required Operation:**
- ✅ `mergeTextNodes` operation (already implemented)
- ⚠️ Need to expose as Command (add to `deleteText` extension)

**Considerations when merging:**
- Merge marks: Must combine marks from both nodes
- Merge decorators: Must combine decorators from both nodes
- Selection position: Need to adjust cursor position after merge

---

**Case C: Delete Entire Previous Node (No `.text` Field)**

**Situation (Diagram + Schema):**
```
Schema:
- inline-image:
  - group: 'inline'
  - atom: true
  - text: none
- inline-text:
  - group: 'inline'
  - text: string

Before:
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ inline-image       │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                               ↑ Cursor (text-2 offset 0)

After Backspace:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0)

Operation:
- deleteNode({ nodeId: "image-1" })
```

**Implementation:**
```typescript
if (prevNode?.text === undefined) {
  // Delete entire node
  this.editor.executeCommand('deleteNode', { nodeId: prevNodeId });
  return;
}
```

**Required Operation:**
- ⚠️ `deleteNode` operation (need to implement or verify)

---

**Case D: Previous Node Has Different Parent (Block Merge)**  

**Situation (Diagram):**
```
Before:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌──────────────────────┐  │
│   │ text-1: "Hello"      │  │
│   └──────────────────────┘  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ paragraph-2                 │
│   ┌──────────────────────┐  │
│   │ text-2: "World"      │  │
│   └──────────────────────┘  │
│         ↑ Cursor (offset 0)   │  // Start of second block
└─────────────────────────────┘

After Backspace:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌────────────────────────┐│
│   │ text-1: "HelloWorld"   ││  // or "Hello World"
│   └────────────────────────┘│
└─────────────────────────────┘
// paragraph-2 deleted or removed when empty

Operation (Concept):
- Cross-block range deletion + merge
  - range:
    - startNodeId: Last inline text node ID of paragraph-1
    - startOffset: That text length
    - endNodeId: First inline text node ID of paragraph-2
    - endOffset: 0
  - dataStore.range.deleteText(range)
  - Or separate mergeBlockNodes({ leftBlockId: "paragraph-1", rightBlockId: "paragraph-2" })
```

---

**Case E: No Previous Node**

**Situation (Diagram):**
```
Before:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ Cursor (offset 0, start of document)

After Backspace:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ Cursor (offset 0, no change)

Operation:
- None (no previous node, so no deletion/merge target)
```

**Implementation:**
```typescript
// Skip block nodes and find "previous editable node" based on cursor.
const prevEditableNodeId = dataStore.getPreviousEditableNode(modelSelection.startNodeId);
if (!prevEditableNodeId) {
  // No previous editable node
  return;
}
```

---

### 2.3 General Backspace (offset > 0)

**Situation (Diagram):**
```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│              ↑ Cursor (5)    │  // After 'o' (before space)
└────────────────────────────┘

After Backspace:
┌────────────────────────────┐
│ text-1: "Hell World"       │
│             ↑ Cursor (4)     │  // Deleted position
└────────────────────────────┘

Deletion range:
- { startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 }
```

**Implementation:**
```typescript
if (modelSelection.startOffset > 0) {
  const deleteRange: ModelSelection = {
    type: 'range',
    startNodeId: modelSelection.startNodeId,
    startOffset: modelSelection.startOffset - 1,
    endNodeId: modelSelection.startNodeId,
    endOffset: modelSelection.startOffset,
    collapsed: false,
    direction: 'forward'
  };
  
  this.editor.executeCommand('deleteText', { range: deleteRange });
  return;
}
```

---

### 2.4 Backspace with Range Selection

**Situation (Diagram):**
```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│    ↑── Selected range ──↑       │  // "ell" (offset 1-4)
└────────────────────────────┘

After Backspace:
┌────────────────────────────┐
│ text-1: "Ho World"         │
│      ↑ Cursor (offset 1)     │  // Deleted position
└────────────────────────────┘

Deletion range:
- { startNodeId: "text-1", startOffset: 1, endNodeId: "text-1", endOffset: 4 }
```

**Implementation:**
```typescript
if (!modelSelection.collapsed) {
  // Delete selected range
  this.editor.executeCommand('deleteText', {
    range: modelSelection
  });
  return;
}
```

---

## 3. Processing Priority and Pseudocode

### 3.1 Overall Processing Flow Diagram

```
Backspace key input
    ↓
[1] Check isComposing
    ├─ YES → Allow browser default behavior → RETURN
    └─ NO
        ↓
[2] Convert DOM Selection → Model Selection
    ↓
[3] Check Range Selection
    ├─ YES → Delete selected range → RETURN
    └─ NO
        ↓
[4] Check Offset 0
    ├─ YES → Handle Offset 0 (see section 3.2)
    └─ NO
        ↓
[5] General Backspace processing (offset > 0)
    └─ Delete one character to left → RETURN
```

### 3.2 Detailed Offset 0 Processing Flow

```
Backspace at Offset 0
    ↓
[4-1] Query previous "editable" node (getPreviousEditableNode)
    ├─ None → [Case E] RETURN (do nothing)
    └─ Exists (prevEditableNode)
        ↓
[4-2] Check parent node
    ├─ Different parent → [Case D] Block merge
    │   └─ Only mergeBlockNodes when previous/current block types are same
    └─ Same parent
        ↓
[4-3] Check previous node type
    ├─ Has .text field (text node)
    │   ├─ Text length > 0
    │   │   └─ [Case A] Delete last character
    │   │       └─ deleteText operation
    │   └─ Text length === 0
    │       └─ [Case B] Merge nodes
    │           └─ mergeTextNodes operation
    └─ No .text field (inline-image, etc. atom/inline)
        └─ [Case C] Delete entire previous node
            └─ deleteNode operation
```

### 3.3 Pseudocode

```typescript
handleBackspaceKey():
  // [1] Check Composing state (highest priority)
  IF isComposing:
    RETURN (allow browser default behavior)
  
  // [2] Convert DOM Selection → Model Selection
  domSelection = window.getSelection()
  modelSelection = convertDOMSelectionToModel(domSelection)
  
  IF !modelSelection OR modelSelection.type === 'none':
    WARN("Failed to convert DOM selection")
    RETURN
  
  // [3] Handle Range Selection
  IF !modelSelection.collapsed:
    executeCommand('deleteText', { range: modelSelection })
    RETURN
  
  // [4] Handle Offset 0
  IF modelSelection.startOffset === 0:
    prevNodeId = dataStore.getPreviousNode(modelSelection.startNodeId)
    
    // [4-1] No previous node
    IF !prevNodeId:
      RETURN
    
    prevNode = dataStore.getNode(prevNodeId)
    prevParent = dataStore.getParent(prevNodeId)
    currentParent = dataStore.getParent(modelSelection.startNodeId)
    
    // [4-2] Different parent (block boundary)
    IF prevParent?.sid !== currentParent?.sid:
      RETURN
    
    // [4-3] Check previous node type
    IF prevNode?.text !== undefined AND typeof prevNode.text === 'string':
      // inline-text node
      prevTextLength = prevNode.text.length
      
      IF prevTextLength > 0:
        // [Case A] Delete last character
        deleteRange = {
          startNodeId: prevNodeId,
          startOffset: prevTextLength - 1,
          endNodeId: prevNodeId,
          endOffset: prevTextLength
        }
        executeCommand('deleteText', { range: deleteRange })
        RETURN
      ELSE:
        // [Case B] Merge empty node
        executeCommand('mergeTextNodes', {
          leftNodeId: prevNodeId,
          rightNodeId: modelSelection.startNodeId
        })
        RETURN
    ELSE:
      // [Case C] No .text field (inline-image, etc.)
      executeCommand('deleteNode', { nodeId: prevNodeId })
      RETURN
  
  // [5] General Backspace processing (offset > 0)
  IF modelSelection.startOffset > 0:
    deleteRange = {
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset - 1,
      endNodeId: modelSelection.startNodeId,
      endOffset: modelSelection.startOffset
    }
    executeCommand('deleteText', { range: deleteRange })
    RETURN
  
  // Unsupported case
  WARN("Unsupported selection")
```

---

## 4. Edge Cases

### 4.1 Range Selection Spanning Multiple Nodes

**Situation (Diagram):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
       ↑──── Selection ────↑        (e.g., "ello Wor")

After Backspace:
┌────────────────────┐
│ text-1: "Hd"       │  // Result may vary by implementation (merge/split)
└────────────────────┘
// Or other form merging text-1/text-2 (according to Cross-node delete policy)

Operation (DataStore level):
- dataStore.range.deleteText(range)
  - Cross-node range where range.startNodeId !== range.endNodeId
```

**Implementation:**
```typescript
// Handle in DeleteExtension
if (range.startNodeId !== range.endNodeId) {
  // Use DataStore's range.deleteText for Cross-node range
  dataStore.range.deleteText(range);
  return true;
}
```

---

### 4.2 Deletion in Text with Marks

**Situation (Diagram):**
```
Before:
Text: "bold and italic"
Marks:
- [0, 4)   : bold
- [5, 8)   : italic
Cursor: After "and" (e.g., offset 8)

Backspace:
- Delete character in offset 7~8 range

After Backspace:
Text: "bold an italic"
Marks:
- bold/italic ranges automatically adjusted to text reduced by one character

Operation:
- deleteText(range)  // Mark range adjustment inside RangeOperations.deleteText
```

**Implementation:**
- `deleteTextRange` operation automatically adjusts Mark ranges
- Handled in `RangeOperations.deleteText`

---

### 4.3 Backspace During Hangul Composition

**Situation (Diagram):**
```
Before:
┌─────────────────────────────┐
│ IME composition in progress (e.g., "ㅎ" → "하") │
└─────────────────────────────┘
           ↑
     Backspace keydown

After:
┌──────────────────────────────┐
│ Browser: Cancel composition character     │
│ Model: No change              │
│ Selection: Managed by IME       │
└──────────────────────────────┘

Conditions / Processing:
- Do not call preventDefault() if isComposing === true
- Handle composition cancellation with browser default behavior
```

---

### 4.4 Backspace in Empty Text Node

**Situation (Diagram):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0)

After Backspace (Phase 1 - Current Implementation):
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ Cursor (text-2 offset 0, no change)

After Backspace (Phase 2 - Future Implementation Idea):
┌────────────────────┐
│ text-1: "World"    │   // Merge text-2 then delete text-2
└────────────────────┘
↑ Cursor (text-1 offset 0)

Operation (Phase 2 Concept):
- deleteNode(text-1) or combination of mergeTextNodes/autoMergeTextNodes
```

---

## 5. Required Operations

### 5.1 Currently Used Operations

#### 5.1.1 `deleteTextRange` Operation
- **Purpose**: Delete text range
- **Use Cases**: 
  - General Backspace (offset > 0)
  - Range Selection deletion
  - Delete last character of previous node at Offset 0 (Case A)
- **Status**: ✅ Already implemented
- **Location**: `packages/model/src/operations/deleteTextRange.ts`

#### 5.1.2 `mergeTextNodes` Operation
- **Purpose**: Merge two adjacent text nodes
- **Use Cases**: 
  - When previous node is empty at Offset 0 (Case B)
- **Status**: ✅ Operation implemented, ⚠️ Need to expose as Command
- **Location**: `packages/model/src/operations/mergeTextNodes.ts`
- **Required Tasks**:
  - Add `mergeTextNodes` command to `DeleteExtension`
  - Or create separate `MergeExtension`

**Operation Signature:**
```typescript
mergeTextNodes({ leftNodeId: string, rightNodeId: string })
```

**Processing When Merging:**
- Left node's text + right node's text
- Merge marks: Combine marks from both nodes
- Merge decorators: Combine decorators from both nodes
- Delete right node
- Adjust Selection position

### 5.2 Operations Needing Implementation

#### 5.2.1 `deleteNode` Operation
- **Purpose**: Delete entire node
- **Use Cases**: 
  - When previous node has no `.text` field at Offset 0 (Case C)
- **Status**: ⚠️ Need to verify (may already exist)
- **Required Tasks**:
  - Verify if Operation exists
  - Implement or add to `DeleteExtension` if not

---

## 6. Implementation Checklist

### Phase 1: Basic Implementation (Current)

- [x] Check Composing state
- [x] General Backspace processing (offset > 0)
- [x] Range Selection processing
- [ ] Delete previous node character at Offset 0 (Case A)
- [ ] Delete entire previous node at Offset 0 (Case C)

### Phase 2: Node Merge Implementation

- [ ] Add `mergeTextNodes` Command (`DeleteExtension` or separate Extension)
- [ ] Merge empty node at Offset 0 (Case B)
- [ ] Verify mark merge logic
- [ ] Verify decorator merge logic
- [ ] Verify Selection position adjustment

### Phase 3: Optimization and Verification

- [ ] Optimize Range Selection spanning multiple nodes
- [ ] Verify Mark range adjustment
- [ ] Performance testing

---

## 7. Test Scenarios

### Test 1: Backspace During Composing State
```
Initial state:
Text: "안녕" (composing: "ㅎ" → "하" input in progress)
Cursor: Composing

Action: Backspace input

Expected result:
- Composition cancelled (browser default behavior)
- No model change
```

---

### Test 2: Backspace at Offset 0 (Case A - Delete Previous Node Character)
```
Initial state:
[text-1: "Hello"] [text-2: "World"]
                    ↑ Cursor (text-2 offset 0)

Action: Backspace input

Expected result:
[text-1: "Hell"] [text-2: "World"]
                 ↑ Cursor (text-2 offset 0 maintained)

Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endOffset: 5 })
```

---

### Test 3: Backspace at Offset 0 (Case B - Merge Empty Node)
```
Initial state:
[text-1: ""] [text-2: "World"]
             ↑ Cursor (text-2 offset 0)

Action: Backspace input

Expected result:
[text-1: "World"]
↑ Cursor (text-1 offset 0)

Operation: mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })

Verification:
- text-2 node deleted
- text-1's text changed to "World"
- Verify mark merge
- Verify decorator merge
```

---

### Test 4: Backspace at Offset 0 (Case C - Delete Entire Previous Node)
```
Initial state:
[text-1: "Hello"] [image-1] [text-2: "World"]
                    ↑ Cursor (text-2 offset 0)

Action: Backspace input

Expected result:
[text-1: "Hello"] [text-2: "World"]
                 ↑ Cursor (text-2 offset 0 maintained)

Operation: deleteNode({ nodeId: "image-1" })
```

---

### Test 5: Backspace at Offset 0 (Case D - Different Parent)
```
Initial state:
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ Cursor (text-2 offset 0)

Action: Backspace input

Expected result:
No change (block boundary)

Operation: None
```

---

### Test 6: Backspace at Offset 0 (Case E - No Previous Node)
```
Initial state:
[text-1: "World"]
↑ Cursor (offset 0)

Action: Backspace input

Expected result:
No change

Operation: None
```

---

### Test 7: General Backspace (offset > 0)
```
Initial state:
Text: "Hello World"
Cursor: offset 5 (after "o")

Action: Backspace input

Expected result:
Text: "Hell World"
Cursor: offset 4 (after "l")

Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endOffset: 5 })
```

---

### Test 8: Backspace with Range Selection
```
Initial state:
Text: "Hello World"
Selection: "ell" (offset 1-4)

Action: Backspace input

Expected result:
Text: "Ho World"
Cursor: offset 1 (deleted position)

Operation: deleteText({ startNodeId: "text-1", startOffset: 1, endOffset: 4 })
```

---

### Test 9: Backspace in Text with Marks
```
Initial state:
Text: "bold and italic" (bold+italic mark, entire)
Cursor: After "and" (offset 9)

Action: Backspace input

Expected result:
Text: "bold nd italic"
Mark: Automatically adjusted (not separated)
Cursor: offset 8

Verification:
- Mark ranges correctly adjusted
- Marks not separated
```

---

### Test 10: Delete Range Selection Spanning Multiple Nodes
```
Initial state:
[text-1: "Hello"] [text-2: "World"]
     ↑---Selection---↑

Action: Backspace input

Expected result:
[text-1: "H"] [text-2: "orld"]
or
[text-1: "Horld"] (after merge)

Operation: deleteText({ startNodeId: "text-1", startOffset: 1, endNodeId: "text-2", endOffset: 1 })
or
Cross-node range deletion
```

---

## 8. Visual Diagrams by Case

### 8.1 Case A: Delete Last Character of Previous Node

**Situation:**
```
[text-1: "Hello"] [text-2: "World"]
                     ↑ Cursor (text-2 offset 0)

Processing:
1. Delete last character of previous node text-1
2. Deletion range: { startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 }
3. Result: [text-1: "Hell"] [text-2: "World"]
4. Cursor: text-2 offset 0 maintained
```

### 8.2 Case B: Merge Empty Node

**Situation:**
```
Initial state:
[text-1: ""] [text-2: "World"]
             ↑ Cursor (text-2 offset 0)

Processing:
1. Previous node text-1 is empty string
2. Operation: mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })
3. Result: [text-1: "World"] (text-2 deleted)
4. Cursor: text-1 offset 0
```

### 8.3 Case C: Delete Entire Previous Node

**Situation:**
```
Initial state:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ Cursor (text-2 offset 0)

// Schema perspective
- image-1: group: 'inline', atom: true, no text field (e.g., inline-image)
- text-1 / text-2: group: 'inline', text: string (inline-text)

Processing:
1. Previous node image-1 has no `.text` field
2. Operation: deleteNode({ nodeId: "image-1" })
3. Result: [text-1: "Hello"] [text-2: "World"]
4. Cursor: text-2 offset 0 maintained
```

### 8.4 Case D: Different Parent (Block Boundary)

**Situation:**
```
Before:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌──────────────────────┐  │
│   │ text-1: "Hello"      │  │
│   └──────────────────────┘  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ paragraph-2                 │
│   ┌──────────────────────┐  │
│   │ text-2: "World"      │  │
│   └──────────────────────┘  │
│         ↑ Cursor (offset 0)   │
└─────────────────────────────┘

After Backspace:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌────────────────────────┐│
│   │ text-1: "HelloWorld"   ││  // or "Hello World"
│   └────────────────────────┘│
└─────────────────────────────┘

Operation (Concept):
- Cross-block range deletion + merge
- Or mergeBlockNodes({ leftBlockId: "paragraph-1", rightBlockId: "paragraph-2" })
```

### 8.5 General Backspace (offset > 0)

**Situation:**
```
Text: "Hello World"
Cursor: offset 5 (before space, after 'o')

Processing:
1. Delete one character to left (character at offset 4)
2. Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 })
3. Result: "Hell World"
4. Cursor: offset 4
```

---

## 9. Node Selection vs Range Selection When Selection Changes

### 9.1 Problem Situation

When selection changes due to Backspace, the following cases can occur:

1. **Inline-image selected state**: When previous node is deleted by Backspace and cursor is positioned before inline-image
2. **Block element selected state**: When block is merged by Backspace and specific block element becomes selected
3. **Text range selection**: General text selection (existing range selection)

**Core Questions**: 
- When should `type: 'node'` selection be used?
- When should `type: 'range'` selection be used?
- What events should be given to ComponentManager?

### 9.2 Node Selection vs Range Selection Definitions

#### Range Selection (`type: 'range'`)
- **Purpose**: Text range selection (offset-based)
- **Structure**: `{ type: 'range', startNodeId, startOffset, endNodeId, endOffset, collapsed }`
- **Use Cases**:
  - Select specific range within text node
  - Cross-node text selection
  - Collapsed selection (cursor)

#### Node Selection (`type: 'node'`)
- **Purpose**: Select entire node (no offset)
- **Structure**: `{ type: 'node', nodeId }`
- **Use Cases**:
  - **Atom nodes like inline-image, inline-video**: Nodes without `.text` field
  - **Block elements**: Block group nodes like paragraph, heading
  - **When user clicks node to select**

### 9.3 Selection Change Rules After Backspace

#### Rule 1: Move to Text Node → Range Selection
```
Before Backspace:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ Cursor (text-2 offset 0)

After Backspace (image-1 deleted):
[text-1: "Hello"] [text-2: "World"]
                 ↑ Cursor (text-2 offset 0)

Selection: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
```

#### Rule 2: Move to Atom Node (e.g., inline-image) → Node Selection
```
Before Backspace:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ Cursor (text-2 offset 0)

After Backspace (specific case):
[text-1: "Hello"] [image-1]
                   ↑ image-1 selected state

Selection: { type: 'node', nodeId: 'image-1' }
```

**Decision Criteria**:
- Is `startNodeId` of `selectionAfter` a node without `.text` field?
- → YES: Convert to `type: 'node'` selection
- → NO: Maintain `type: 'range'` selection

#### Rule 3: Move to Block Element → Node Selection
```
Before Backspace:
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ Cursor (text-2 offset 0)

After Backspace (after block merge):
[paragraph-1 > text-1: "HelloWorld"]
                    ↑ paragraph-1 selected state?

Selection: { type: 'node', nodeId: 'paragraph-1' }
or
Selection: { type: 'range', startNodeId: 'text-1', startOffset: 5, ... }
```

**Decision Criteria**:
- Should block element be selected? (e.g., user clicked block)
- → YES: `type: 'node'` selection
- → NO: Range selection to text node inside block

### 9.4 ComponentManager Event Handling

#### Current State
- ComponentManager has `select`/`deselect` event system
- But does not automatically emit events when selection changes

#### Proposal: ComponentManager Events on Selection Change

**Location**: Handle in `EditorViewDOM` or `DOMRenderer`

```typescript
// When receiving editor:selection.model event
this.editor.on('editor:selection.model', (selection: ModelSelection) => {
  // 1. Deselect previously selected nodes
  if (this._lastSelectedNodes) {
    this._lastSelectedNodes.forEach(sid => {
      this.componentManager.emit('deselect', sid, {});
    });
  }
  
  // 2. Extract selected nodes from new selection
  const selectedNodes: string[] = [];
  
  if (selection.type === 'node') {
    // Node selection: use nodeId directly
    selectedNodes.push(selection.nodeId);
  } else if (selection.type === 'range') {
    // Range selection: check startNodeId and endNodeId
    // Convert to node selection if node has no .text field
    const startNode = this.editor.dataStore.getNode(selection.startNodeId);
    const endNode = this.editor.dataStore.getNode(selection.endNodeId);
    
    if (startNode && typeof startNode.text !== 'string') {
      // Atom node (e.g., inline-image)
      selectedNodes.push(selection.startNodeId);
    } else if (endNode && typeof endNode.text !== 'string') {
      // Atom node
      selectedNodes.push(selection.endNodeId);
    } else {
      // Text node: maintain range selection (no ComponentManager event)
      // Or can also display text node as selected state
    }
  }
  
  // 3. Emit select event to selected nodes
  this._lastSelectedNodes = selectedNodes;
  selectedNodes.forEach(sid => {
    this.componentManager.emit('select', sid, {
      selection,
      nodeId: sid
    });
  });
});
```

### 9.5 Implementation Checklist

- [ ] Implement logic to determine Node Selection vs Range Selection when selection changes
- [ ] Atom node detection logic (no `.text` field)
- [ ] Node Selection conversion logic when block element is selected
- [ ] Automatically emit ComponentManager `select`/`deselect` events
- [ ] Automatically convert to node selection in selectionAfter after Backspace

### 9.6 Reference Documents

- [Selection Algorithm](./selection-algorithm.md): Range selection conversion algorithm
- [Selection Handling](./selection-handling.md): DOM ↔ Model selection conversion
- [Selection Spec](../../paper/selection-spec.md): Selection type definitions

---

## 10. References

- [Cross-Node Deletion Handling](./cross-node-deletion-handling.md)
- [Input Delete Flow Summary](./input-delete-flow-summary.md)
- [Delete Test Scenarios](./delete-test-scenarios.md)
- [Selection Algorithm](./selection-algorithm.md)

