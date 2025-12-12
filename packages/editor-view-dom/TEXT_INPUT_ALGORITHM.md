# Text Input Algorithm Summary

## Core principles

### Problem

- MutationObserver detects changes to **individual text nodes** (`oldValue`, `newValue`)
- But we need to compare by **sid** (schema ID)
- Because one `inline-text` node can be **split into multiple text nodes** by marks/decorators

### Solution

1. **Compare text by sid**
   - Model: `modelNode.text` (full text by sid)
   - DOM: **sum of all text nodes** under the sid

2. **Normalize Selection offset**
   - Convert DOM selection offset → Model offset
   - Use `convertDOMToModelPosition()`

3. **Detect change point**
   - Find change location by Model offset
   - Compare common prefix/suffix or use selection

## Algorithm flow

```
MutationObserver detects (individual text node change)
    ↓
handleTextContentChange(oldValue, newValue, target)
    ↓
1. Extract sid (resolveModelTextNodeId)
    ↓
2. Get model text (oldModelText = modelNode.text)
    ↓
3. Reconstruct full text by sid from DOM
   - Collect all text nodes with buildTextRunIndex()
   - Merge with reconstructModelTextFromRuns()
   - newText = sum of all text node textContent
    ↓
4. Compare oldModelText vs newText
   - If same → no change → return
   - If different → edit occurred
    ↓
5. Normalize Selection offset to Model offset
   - Use convertDOMToModelPosition()
   - DOM textNode + DOM offset → Model offset
    ↓
6. Find edit position
   - Selection-based (preferred)
   - Common prefix comparison (fallback)
    ↓
7. Adjust Marks/Decorators ranges
   - Auto-adjust by editPosition
    ↓
8. Execute transaction
```

## Current code issues

### Issue 1: Individual text node comparison

**Current code** (`handleTextContentChange`):
```typescript
if (oldText === newText) {
  console.log('[Input] SKIP: no text change');
  return;
}
```

**Problem:**
- `oldText`/`newText` are individual text node values
- Meaningless when split by marks/decorators

**Solution:**
- Remove this check, or
- Change to sid-based full text comparison

### Issue 2: Using MutationObserver's oldValue/newValue

**Current code** (`handleEfficientEdit`):
```typescript
export function handleEfficientEdit(
  textNode: Text,
  oldValue: string | null,  // ❌ Individual text node value
  newValue: string | null,  // ❌ Individual text node value
  oldModelText: string,      // ✅ Full text by sid
  ...
)
```

**Problem:**
- `oldValue`/`newValue` are not used (noted in comments)
- Full text is reconstructed with `reconstructModelTextFromRuns()`

**Solution:**
- Remove or ignore `oldValue`/`newValue` parameters
- Always reconstruct full text by sid

## Correct algorithm

### Step 1: Extract sid and get model text

```typescript
// Extract sid
const textNodeId = this.resolveModelTextNodeId(target);
if (!textNodeId) return;

// Get model text (by sid)
const modelNode = this.editor.dataStore.getNode(textNodeId);
const oldModelText = modelNode.text || '';
```

### Step 2: Reconstruct full text by sid from DOM

```typescript
// Find inline-text node
const inlineTextNode = findInlineTextNode(textNode);
const nodeId = inlineTextNode.getAttribute('data-bc-sid');

// Build Text Run Index (collect all text nodes)
const runs = buildTextRunIndex(inlineTextNode, nodeId, {
  buildReverseMap: true,
  normalizeWhitespace: false
});

// Reconstruct by merging all text node text
const newText = reconstructModelTextFromRuns(runs);
// Or
const newText = runs.runs
  .map(run => run.domTextNode.textContent || '')
  .join('');
```

### Step 3: Compare text by sid

```typescript
// Compare full text by sid, not individual text nodes
if (newText === oldModelText) {
  return; // No change
}
```

### Step 4: Normalize Selection offset to Model offset

```typescript
const selection = window.getSelection();
let editPosition: number | undefined;

if (selection && selection.rangeCount > 0) {
  const range = selection.getRangeAt(0);
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const domPosition: DOMEditPosition = {
      textNode: range.startContainer as Text,
      offset: range.startOffset  // DOM offset
    };
    
    // Convert DOM offset → Model offset
    const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
    if (modelPos) {
      editPosition = modelPos.offset;  // Model offset
    }
  }
}
```

**Conversion process:**
1. Find inline-text node with `findInlineTextNode()`
2. Build Text Run Index with `buildTextRunIndex()`
3. Convert with `convertDOMOffsetToModelOffset()`
   - Find run containing textNode
   - run.start + domOffset = modelOffset

### Step 5: Find edit position

```typescript
// Selection-based (preferred)
if (editPosition === undefined) {
  // Common prefix comparison (fallback)
  editPosition = findCommonPrefix(oldModelText, newText);
}
```

### Step 6: Adjust Marks/Decorators ranges

```typescript
const editInfo: TextEdit = {
  nodeId,
  oldText: oldModelText,  // Full text by sid
  newText: newText,       // Full text by sid
  editPosition,           // Model offset
  ...
};

// Adjust ranges by Model offset
const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
```

## Key points

1. **Always compare by sid**
   - Ignore individual text node `oldValue`/`newValue`
   - Always reconstruct full text

2. **Normalize Selection offset**
   - Must convert DOM offset → Model offset
   - Use `convertDOMToModelPosition()`

3. **Use Text Run Index**
   - Collect all text nodes and merge in order
   - Convert DOM offset to Model offset

4. **Detect change point**
   - Find change location by Model offset
   - Compare common prefix/suffix or use selection

## Example

### Scenario: Input into text with marks

**Initial state:**
```
Model: "Hello World" (marks: [{type: 'bold', range: [6, 11]}])
DOM: 
  <span data-bc-sid="text-1">
    "Hello " (text node 1)
    <strong>"World"</strong> (text node 2)
  </span>
```

**User types "Beautiful " after "Hello "**:
```
MutationObserver detects:
  - text node 1 changed: "Hello " → "Hello Beautiful "
  - oldValue: "Hello "
  - newValue: "Hello Beautiful "
```

**Algorithm execution:**
1. Extract sid: `text-1`
2. Model text: `oldModelText = "Hello World"`
3. Reconstruct DOM text:
   - text node 1: "Hello Beautiful "
   - text node 2: "World"
   - `newText = "Hello Beautiful World"`
4. Compare: `"Hello World" !== "Hello Beautiful World"` → change detected
5. Normalize Selection offset:
   - DOM: text node 1, offset 16 (end of "Hello Beautiful ")
   - Model: offset 6 (original end of "Hello ")
6. Edit position: Model offset 6
7. Adjust marks:
   - Original: `[{type: 'bold', range: [6, 11]}]`
   - Adjusted: `[{type: 'bold', range: [16, 21]}]` (+10 offset)

## Improvement direction

1. Remove individual text node comparison in `handleTextContentChange`
2. Remove or ignore `oldValue`/`newValue` parameters in `handleEfficientEdit`
3. Always reconstruct and compare full text by sid
4. Strengthen Selection offset normalization
