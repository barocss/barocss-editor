# Selection Processing Algorithm

## Overview

This document explains algorithms and data structures for synchronizing Selection between Editor's Model and DOM. It particularly covers text node splitting, offset mapping, and selection conversion algorithms.

## 1. Text Management Architecture

### 1.1 Model-Level Text Representation

**Single Continuous String (Flat Text Model)**

Model manages text as a single continuous string:

```
Model Text: "bold and italic"
            └─ offset: 0 ──────────────── 15 ─┘
```

**Characteristics:**
- Single text string per node
- Offset is continuous integer starting from 0
- Marks expressed as text range `[start, end)`

### 1.2 DOM-Level Text Representation

**Split Text Nodes (Fragmented Text DOM)**

In DOM, text is split into multiple text nodes due to marks/decorators:

```
DOM Structure:
<span data-bc-sid="text-1">
  <b>bold</b>           ← Text Node 1: "bold" (DOM offset 0-4)
  <span> and </span>    ← Text Node 2: " and " (DOM offset 0-5)
  <i>italic</i>         ← Text Node 3: "italic" (DOM offset 0-6)
</span>
```

**Characteristics:**
- Each text node has independent offset space
- Structure is nested due to mark wrappers
- Decorators only handle visual representation (excluded from selection calculation)

### 1.3 Mapping Problem

**Problem:**
- Which DOM text node and which offset does Model offset `10` correspond to?
- What is the Model offset for DOM text node offset `3`?

**Solution:**
- Use Text Run Index for bidirectional mapping
- Record Model offset range for each text node

## 2. Text Run Index Algorithm

### 2.1 Data Structure

```
TextRun {
  domTextNode: Text        // Reference to actual DOM text node
  start: number           // Model offset start (inclusive)
  end: number             // Model offset end (exclusive)
}

ContainerRuns {
  runs: TextRun[]         // Array sorted by text node order
  total: number          // Total text length (last run's end)
  byNode: Map<Text, {start, end}>  // Reverse lookup map (optional)
}
```

### 2.2 Text Run Index Generation Algorithm

**Input:**
- `container`: Container element with `data-bc-sid` attribute
- `excludePredicate`: Function to determine elements to exclude (decorators, etc.)

**Algorithm:**

```
1. runs = []
2. total = 0
3. 
4. FOR EACH child IN container.childNodes:
5.   IF child IS Text Node:
6.     text = child.textContent
7.     length = text.length
8.     runs.append({
9.       domTextNode: child,
10.      start: total,
11.      end: total + length
12.    })
13.    total = total + length
14.    
15.  ELSE IF child IS Element:
16.    IF excludePredicate(child) IS TRUE:
17.      CONTINUE  // Exclude decorators, etc.
18.    
19.    // Collect all text nodes inside using TreeWalker
20.    walker = createTreeWalker(child, SHOW_TEXT, {
21.      acceptNode: (node) => {
22.        IF decorator exists among node's parents:
23.          RETURN REJECT
24.        RETURN ACCEPT
25.      }
26.    })
27.    
28.    WHILE textNode = walker.nextNode():
29.      text = textNode.textContent
30.      length = text.length
31.      runs.append({
32.        domTextNode: textNode,
33.        start: total,
34.        end: total + length
35.      })
36.      total = total + length
37.
38. RETURN { runs, total, byNode }
```

**Time Complexity:** O(n) where n = number of text nodes

**Space Complexity:** O(n)

### 2.3 Model Offset → DOM Offset Conversion Algorithm

**Input:**
- `runs`: TextRun array (sorted by start)
- `modelOffset`: Model offset value

**Algorithm:**

```
1. IF modelOffset < 0 OR modelOffset > runs.total:
2.   RETURN null  // Out of range
3.
4. IF modelOffset == runs.total:
5.   lastRun = runs[runs.length - 1]
6.   RETURN {
7.     node: lastRun.domTextNode,
8.     offset: lastRun.domTextNode.textContent.length
9.   }
10.
11. // Find appropriate run using Binary Search
12. runIndex = binarySearchRun(runs, modelOffset)
13. IF runIndex == -1:
14.   RETURN null
15.
16. run = runs[runIndex]
17. localOffset = modelOffset - run.start
18.
19. RETURN {
20.   node: run.domTextNode,
21.   offset: min(localOffset, run.domTextNode.textContent.length)
22. }
```

**Binary Search Algorithm:**

```
binarySearchRun(runs, offset):
1. lo = 0
2. hi = runs.length - 1
3. ans = -1
4.
5. WHILE lo <= hi:
6.   mid = (lo + hi) / 2
7.   run = runs[mid]
8.   
9.   IF offset < run.start:
10.    hi = mid - 1
11.  ELSE IF offset >= run.end:
12.    lo = mid + 1
13.  ELSE:
14.    ans = mid
15.    BREAK
16.
17. RETURN ans
```

**Time Complexity:** O(log n)

### 2.4 DOM Offset → Model Offset Conversion Algorithm

**Input:**
- `runs`: TextRun array
- `textNode`: DOM text node
- `domOffset`: Offset within DOM text node

**Algorithm:**

```
1. // Use reverse map (O(1))
2. IF runs.byNode EXISTS:
3.   runInfo = runs.byNode.get(textNode)
4.   IF runInfo EXISTS:
5.     RETURN runInfo.start + min(domOffset, runInfo.end - runInfo.start)
6.
7. // Linear search if reverse map doesn't exist (O(n))
8. FOR EACH run IN runs:
9.   IF run.domTextNode == textNode:
10.    localOffset = min(domOffset, run.end - run.start)
11.    RETURN run.start + localOffset
12.
13. RETURN 0  // Not found
```

**Time Complexity:** O(1) (using reverse map) or O(n) (linear search)

## 3. Selection Conversion Algorithm

### 3.1 Model Selection → DOM Selection Conversion

**Input:**
- `modelSelection`: `{ startNodeId, startOffset, endNodeId, endOffset, type: 'range' }`

**Algorithm:**

```
1. // 1. Find container elements
2. startContainer = findElementBySid(modelSelection.startNodeId)
3. endContainer = findElementBySid(modelSelection.endNodeId)
4. 
5. IF startContainer == null OR endContainer == null:
6.   RETURN FAILURE
7.
8. // 2. Find text containers (search upward)
9. startTextContainer = findBestContainer(startContainer)
10. endTextContainer = findBestContainer(endContainer)
11.
12. IF startTextContainer == null OR endTextContainer == null:
13.   RETURN FAILURE
14.
15. // 3. Generate Text Run Index
16. startRuns = buildTextRunIndex(startTextContainer)
17. endRuns = buildTextRunIndex(endTextContainer)
18.
19. // 4. Convert Model offset → DOM offset
20. startDOMRange = findDOMRangeFromModelOffset(startRuns, modelSelection.startOffset)
21. endDOMRange = findDOMRangeFromModelOffset(endRuns, modelSelection.endOffset)
22.
23. IF startDOMRange == null OR endDOMRange == null:
24.   RETURN FAILURE
25.
26. // 5. Set DOM Selection
27. selection = window.getSelection()
28. selection.removeAllRanges()
29. 
30. range = document.createRange()
31. range.setStart(startDOMRange.node, startDOMRange.offset)
32. range.setEnd(endDOMRange.node, endDOMRange.offset)
33. 
34. selection.addRange(range)
35. RETURN SUCCESS
```

**findBestContainer Algorithm:**

```
findBestContainer(element):
1. current = element
2. 
3. // Find text container by going upward
4. WHILE current != null:
5.   IF current IS text container:
6.     RETURN current
7.   current = current.parentElement.closest('[data-bc-sid]')
8.
9. // Return original element if no text container found
10. IF element.getAttribute('data-bc-sid') != null:
11.   RETURN element
12.
13. RETURN null
```

### 3.2 DOM Selection → Model Selection Conversion

**Input:**
- `domSelection`: Browser Selection object

**Algorithm:**

```
1. range = domSelection.getRangeAt(0)
2. 
3. // 1. Find container elements
4. startContainer = findBestContainer(range.startContainer)
5. endContainer = findBestContainer(range.endContainer)
6. 
7. IF startContainer == null OR endContainer == null:
8.   RETURN { type: 'none' }
9.
10. startNodeId = startContainer.getAttribute('data-bc-sid')
11. endNodeId = endContainer.getAttribute('data-bc-sid')
12.
13. IF startNodeId == null OR endNodeId == null:
14.   RETURN { type: 'none' }
15.
16. // 2. Generate Text Run Index
17. startRuns = buildTextRunIndex(startContainer)
18. endRuns = (startContainer == endContainer) ? startRuns : buildTextRunIndex(endContainer)
19.
20. // 3. Convert DOM offset → Model offset
21. startModelOffset = convertDOMOffsetToModelOffset(
22.   startContainer, 
23.   range.startContainer, 
24.   range.startOffset, 
25.   startRuns
26. )
27. endModelOffset = convertDOMOffsetToModelOffset(
28.   endContainer,
29.   range.endContainer,
30.   range.endOffset,
31.   endRuns
32. )
33.
34. // 4. Determine selection direction
35. direction = determineSelectionDirection(domSelection, startContainer, endContainer, startModelOffset, endModelOffset)
36.
37. // 5. Normalize to unified ModelSelection format
38. modelSelection = normalizeSelection(startNodeId, startModelOffset, endNodeId, endModelOffset)
39.
40. RETURN {
41.   type: 'range',
42.   ...modelSelection,
43.   direction
44. }
```

**convertDOMOffsetToModelOffset Algorithm:**

```
convertDOMOffsetToModelOffset(container, domNode, domOffset, runs):
1. IF domNode IS Text Node:
2.   // Use reverse map
3.   runInfo = runs.byNode.get(domNode)
4.   IF runInfo EXISTS:
5.     localOffset = clamp(domOffset, 0, runInfo.end - runInfo.start)
6.     RETURN runInfo.start + localOffset
7.   
8.   // Binary search if reverse map doesn't exist
9.   // (This path is rarely used as byNode map is always created)
10.  RETURN binarySearchAndConvert(runs, domNode, domOffset)
11.
12. ELSE IF domNode IS Element:
13.   // Find boundary text node using element's child index
14.   boundaryText = findTextAtElementBoundary(container, domNode, domOffset)
15.   IF boundaryText != null:
16.     runInfo = runs.byNode.get(boundaryText)
17.     RETURN runInfo.start  // or runInfo.end (depending on boundary)
18.
19. RETURN 0
```

## 4. Text Node Splitting Rules

### 4.1 Splitting Due to Marks

**Rules:**
- Each mark creates independent wrapper element
- Overlapping marks create nested structure
- Text nodes inside each wrapper are managed independently

**Example:**

```
Model: "bold and italic" (marks: bold[0-14], italic[0-14])

DOM:
<span data-bc-sid="text-1">
  <b>
    <i>bold and italic</i>  ← single text node
  </b>
</span>
```

**Nested Case:**

```
Model: "bold and italic" (marks: bold[0-9], italic[9-14])

DOM:
<span data-bc-sid="text-1">
  <b>bold</b>              ← text node 1
  <i>italic</i>            ← text node 2
</span>
```

### 4.2 Splitting Due to Decorators

**Rules:**
- Decorators only handle visual representation
- Excluded from selection calculation
- Don't collect text nodes under decorators

**Example:**

```
<span data-bc-sid="text-1">
  <span data-decorator-sid="dec-1">decorator</span>  ← excluded
  <b>bold</b>                                         ← included
</span>
```

### 4.3 Considerations When Generating Text Run Index

**Include:**
- Text nodes that are direct children of `data-bc-sid`
- Text nodes inside mark wrappers
- All text nodes in nested mark structures

**Exclude:**
- Text nodes under decorators
- Elements with `data-bc-decorator` attribute and their children
- Elements with `data-decorator-sid` attribute and their children

## 5. Selection Synchronization Timing

### 5.1 Model → DOM Synchronization Timing

**Problem:**
- Applying selection before rendering completes means DOM not yet updated
- Text Run Index may be generated based on stale DOM

**Solution:**

```
1. Model change occurs
   ↓
2. Execute transaction
   ↓
3. Calculate selectionAfter
   ↓
4. editor.updateSelection(selectionAfter)
   ↓
5. Store in _pendingModelSelection
   ↓
6. Call render()
   ↓
7. Execute reconcile() (DOM update)
   ↓
8. Call reconcile completion callback
   ↓
9. Execute applyModelSelectionWithRetry()
   ↓
10. Generate Text Run Index (based on latest DOM)
    ↓
11. Apply DOM Selection
```

**Core:** Apply selection only after rendering completes

### 5.2 DOM → Model Synchronization Timing

**Problem:**
- Programmatic selection changes also trigger `selectionchange` event
- Need to prevent infinite loop

**Solution:**

```
1. DOM Selection changes
   ↓
2. selectionchange event occurs
   ↓
3. Check _isProgrammaticChange flag
   ↓
4. IF _isProgrammaticChange == true:
      RETURN  // Ignore
   ↓
5. convertDOMSelectionToModel()
   ↓
6. editor.updateSelection(modelSelection)
   ↓
7. _isProgrammaticChange = false (in next event loop)
```

**Core:** Distinguish programmatic changes from user changes

## 6. Performance Optimization

### 6.1 Text Run Index Generation Strategy

**Current Strategy: Generate new each time without cache**

**Reasons:**
- Text Run Index must be invalidated when DOM changes
- Cache invalidation logic is complex (need to track which elements changed)
- Text Run Index generation cost is not high:
  - Generally a few text runs per inline-text node
  - TreeWalker traversal is O(n) where n = number of text nodes
  - Selection conversion only occurs at user input time, so frequency is not high

**Implementation:**

```
getTextRunsForContainer(container):
  containerId = container.getAttribute('data-bc-sid')
  
  // Generate new each time (no cache)
  runs = buildTextRunIndex(container, containerId, {
    buildReverseMap: true,      // Generate reverse map
    excludePredicate: isDecorator,
    normalizeWhitespace: false
  })
  
  RETURN runs
```

**Performance Analysis:**
- Text Run Index generation: O(n) where n = number of text nodes
- Typical inline-text node: about 1~5 text runs
- Selection conversion frequency: Only occurs at user input time (low)
- Conclusion: Fast enough without cache

**If Considering Caching:**
- Invalidate cache only for changed elements at reconcile completion
- Integrate with MutationObserver for automatic invalidation on DOM changes
- But currently not using cache as benefits don't outweigh complexity

### 6.2 Reverse Map Usage

**Strategy:**
- Map text node → Model offset range
- O(1) lookup possible (vs linear search O(n))

**Implementation:**

```
byNode = Map<Text, { start: number, end: number }>()

// On creation
FOR EACH run IN runs:
  byNode.set(run.domTextNode, { start: run.start, end: run.end })

// On lookup
convertDOMOffsetToModelOffset(textNode, domOffset):
  runInfo = byNode.get(textNode)  // O(1)
  IF runInfo:
    RETURN runInfo.start + clamp(domOffset, 0, runInfo.end - runInfo.start)
```

**Current Implementation Status:**
- ✅ Generated with `buildReverseMap: true` option
- ✅ Always generates reverse map in `getTextRunsForContainer`
- ✅ Used in `convertDOMOffsetToModelOffset`

**Performance Comparison:**
- Reverse map usage: O(1)
- Linear search: O(n) where n = number of text runs
- Binary Search: O(log n) (for Model offset → DOM offset conversion)

### 6.3 Binary Search Utilization

**Strategy:**
- TextRun array is sorted by start
- O(log n) for Model offset → DOM offset conversion

**Implementation:**

```
binarySearchRun(runs, modelOffset):
  lo = 0
  hi = runs.length - 1
  
  WHILE lo <= hi:
    mid = (lo + hi) / 2
    run = runs[mid]
    
    IF modelOffset < run.start:
      hi = mid - 1
    ELSE IF modelOffset >= run.end:
      lo = mid + 1
    ELSE:
      RETURN mid  // Found
  
  RETURN -1  // Not found
```

**Current Implementation Status:**
- ✅ `binarySearchRun` function implemented
- ✅ Used in `findDOMRangeFromModelOffset`

**Performance Comparison:**
- Binary Search: O(log n)
- Linear search: O(n)

### 6.2 Additional Optimization Approaches

#### 6.2.1 Lazy Text Run Index Generation

**Strategy:**
- Generate only when selection conversion needed
- Prevent unnecessary generation

**Current Status:**
- ✅ Already implemented (generate on demand)

#### 6.2.2 Incremental Update (Future Improvement)

**Strategy:**
- Incremental update instead of full regeneration for small DOM changes
- Currently using full regeneration due to high complexity

**Future Improvement Approaches:**
- Detect only text node additions/deletions and update only that run
- Keep full regeneration for structure changes due to mark changes
- But currently generation cost is low, so full regeneration is sufficient

## 7. Edge Case Handling

### 7.1 Empty Text Nodes

**Handling:**
- Skip text nodes where `textContent.length == 0`
- Don't include in runs

### 7.2 Out-of-Range Offset

**Handling:**
- `modelOffset < 0`: Clamp to first run's start
- `modelOffset > total`: Clamp to last run's end

### 7.3 Selection Spanning Multiple Nodes

**Handling:**
- When startNodeId and endNodeId differ
- Generate Text Run Index independently for each
- Convert Model offset → DOM offset for each

### 7.4 Collapsed Selection (Cursor)

**Handling:**
- When `startOffset == endOffset`
- Convert start and end to same DOM position
- Set `range.collapsed = true`

## 8. Data Flow Diagrams

### 8.1 Complete Flow

```
┌─────────────┐
│   Model     │
│  Selection  │
└──────┬──────┘
       │
       │ updateSelection()
       ↓
┌──────────────────┐
│ SelectionManager │
└──────┬───────────┘
       │
       │ editor:selection.model
       ↓
┌──────────────────┐
│  EditorViewDOM   │
│ _pendingSelection │
└──────┬───────────┘
       │
       │ After render() completes
       ↓
┌──────────────────┐
│ Text Run Index   │
│    Generation    │
└──────┬───────────┘
       │
       │ Model offset → DOM offset
       ↓
┌──────────────────┐
│  DOM Selection   │
│     Applied      │
└──────────────────┘
```

### 8.2 Reverse Flow

```
┌──────────────────┐
│  DOM Selection   │
│  (User Change)   │
└──────┬───────────┘
       │
       │ selectionchange
       ↓
┌──────────────────┐
│ SelectionHandler │
└──────┬───────────┘
       │
       │ Generate Text Run Index
       ↓
┌──────────────────┐
│ DOM offset →     │
│ Model offset     │
└──────┬───────────┘
       │
       │ fromDOMSelection()
       ↓
┌─────────────┐
│   Model     │
│  Selection  │
└─────────────┘
```

## 9. Core Principles

### 9.1 Single Source of Truth

- **Model is source of truth**: All selection state stored in Model
- **DOM is representation**: DOM selection is just visual representation of Model selection

### 9.2 Consistency Guarantee

- **Unified format**: All selections use `{ startNodeId, startOffset, endNodeId, endOffset }` format
- **Bidirectional conversion**: Model ↔ DOM conversion must always be possible

### 9.3 Timing Management

- **Apply after rendering completes**: Apply selection only after DOM is updated
- **Distinguish programmatic changes**: Prevent infinite loop

### 9.4 Accuracy First

- **Don't use trim()**: Match actual DOM offset exactly
- **Collect all text nodes**: Include all text nodes split by marks/decorators

