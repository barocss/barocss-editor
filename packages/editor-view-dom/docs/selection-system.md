# Selection System Specification

## Overview

This document provides a comprehensive specification for Barocss Editor's Selection system. It covers the differences between Node Selection and Range Selection, communication with ComponentManager, Selection UI rendering, Model ↔ DOM Selection conversion, and troubleshooting methods.

---

## 1. Selection Type Definitions

### 1.1 Range Selection (`type: 'range'`)

**Purpose**: Text range selection (offset-based)

**Structure**:
```typescript
interface ModelRangeSelection {
  type: 'range';
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed: boolean;        // true if cursor (startOffset === endOffset)
  direction?: 'forward' | 'backward';
}
```

**Use Cases**:
- Select specific range within text node
- Cross-node text selection (selection spanning multiple nodes)
- Collapsed selection (cursor, `startOffset === endOffset`)

**Examples**:
```typescript
// Text range selection
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 10,
  collapsed: false
}

// Cursor (collapsed)
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 5,
  collapsed: true
}
```

### 1.2 Node Selection (`type: 'node'`)

**Purpose**: Select entire node (no offset)

**Structure**:
```typescript
interface ModelNodeSelection {
  type: 'node';
  nodeId: string;
}
```

**Use Cases**:
- **Atom nodes**: Nodes without `.text` field (e.g., `inline-image`, `inline-video`)
- **Block elements**: Block group nodes like `paragraph`, `heading`
- **When user clicks node to select**

**Examples**:
```typescript
// Inline-image selection
{
  type: 'node',
  nodeId: 'image-1'
}

// Paragraph selection
{
  type: 'node',
  nodeId: 'paragraph-1'
}
```

### 1.3 Multi-Node Selection (`type: 'multi-node'`)

**Purpose**: Pick several nodes at once, much like selecting multiple files in an OS (Ctrl/Cmd + click).

**Structure**:
```typescript
interface ModelMultiNodeSelection {
  type: 'multi-node';
  nodeIds: string[];          // IDs of all selected nodes
  primaryNodeId?: string;     // Main node (the last one you clicked)
}
```

**Use Cases (plain examples)**:
- Select several images at once (Ctrl/Cmd + click)
- Select several blocks at once (multiple paragraphs or headings)
- Mixed selection (image + block elements together)

```typescript
// Multiple images
{
  type: 'multi-node',
  nodeIds: ['image-1', 'image-2', 'image-3'],
  primaryNodeId: 'image-3'   // last clicked
}

// Multiple blocks
{
  type: 'multi-node',
  nodeIds: ['paragraph-1', 'paragraph-2', 'heading-1'],
  primaryNodeId: 'heading-1'
}

// Mixed (images + paragraph)
{
  type: 'multi-node',
  nodeIds: ['image-1', 'paragraph-1', 'image-2'],
  primaryNodeId: 'image-2'
}
```

**How to select** (for non-coders, like desktop selection):
- **Ctrl/Cmd + click**: add/remove a node from the selection list
- **Shift + click**: select a range from the first node to the last node you click
- **Drag**: lasso/drag to select multiple nodes

### 1.4 Rules to Decide Selection Type

#### Rule 1: Text node → Range Selection
- If the node has a `.text` field and `typeof node.text === 'string'`
- Always use `type: 'range'`

#### Rule 2: Atom node → Node Selection
- If the node has no `.text` field (e.g., `inline-image`, `inline-video`)
- Always use `type: 'node'`

#### Rule 3: Block element → Node Selection (optional)
- Block group nodes (e.g., `paragraph`, `heading`)
- If the user clicks the block itself: `type: 'node'`
- If the user highlights text inside the block: `type: 'range'`

### 1.5 Converting Between Node Selection and Range Selection

#### Converting Node Selection → Range Selection

**When it can convert** (plain language):
- If it’s a text node: turn the Node Selection into a Range Selection that covers the entire text of that node.
- If it’s a block element: turn it into a Range Selection that starts at the very first text node inside the block and ends at the very last text node inside the block.

**How to convert (step-by-step idea)**:
```typescript
function convertNodeToRange(
  nodeSelection: ModelNodeSelection,
  dataStore: DataStore
): ModelRangeSelection | null {
  const node = dataStore.getNode(nodeSelection.nodeId);
  if (!node) return null;
  
  // If it is a text node, cover the whole text
  if (typeof node.text === 'string') {
    return {
      type: 'range',
      startNodeId: nodeSelection.nodeId,
      startOffset: 0,
      endNodeId: nodeSelection.nodeId,
      endOffset: node.text.length,
      collapsed: false
    };
  }
  
  // If it is a block element: find all text nodes inside
  if (node.content && Array.isArray(node.content)) {
    // Find the first and last text nodes
    const textNodes: string[] = [];
    
    // Recursively collect text nodes
    const findTextNodes = (nodeId: string) => {
      const n = dataStore.getNode(nodeId);
      if (!n) return;
      
      if (typeof n.text === 'string') {
        textNodes.push(nodeId);
      } else if (n.content && Array.isArray(n.content)) {
        n.content.forEach(childId => findTextNodes(childId));
      }
    };
    
    findTextNodes(nodeSelection.nodeId);
    
    if (textNodes.length === 0) return null;
    
    const firstNode = dataStore.getNode(textNodes[0]);
    const lastNode = dataStore.getNode(textNodes[textNodes.length - 1]);
    
    if (!firstNode || !lastNode) return null;
    
    return {
      type: 'range',
      startNodeId: textNodes[0],
      startOffset: 0,
      endNodeId: textNodes[textNodes.length - 1],
      endOffset: typeof lastNode.text === 'string' ? lastNode.text.length : 0,
      collapsed: false
    };
  }
  
  // Atom nodes (e.g., inline-image) cannot convert to a range
  return null;
}
```

**Example of use**:
```typescript
// Convert Node Selection to Range Selection
const nodeSelection: ModelNodeSelection = {
  type: 'node',
  nodeId: 'paragraph-1'
};

const rangeSelection = convertNodeToRange(nodeSelection, editor.dataStore);
if (rangeSelection) {
  // Do your work as a Range Selection
  editor.selectionManager.setSelection(rangeSelection);
}
```

#### Converting Range Selection → Node Selection

**When it can convert**:
- If `startNodeId` and `endNodeId` are the same atom node.
- If the range covers the entire text of a node (startOffset: 0, endOffset: full text length).

**How to convert**:
```typescript
function convertRangeToNode(
  rangeSelection: ModelRangeSelection,
  dataStore: DataStore
): ModelNodeSelection | null {
  // Same node?
  if (rangeSelection.startNodeId === rangeSelection.endNodeId) {
    const node = dataStore.getNode(rangeSelection.startNodeId);
    if (!node) return null;
    
    // Atom node (no text field)
    if (typeof node.text !== 'string') {
      return {
        type: 'node',
        nodeId: rangeSelection.startNodeId
      };
    }
    
    // Selecting the entire text node
    const textLength = node.text ? node.text.length : 0;
    if (rangeSelection.startOffset === 0 && 
        rangeSelection.endOffset === textLength) {
      // Do not turn text nodes into Node Selection (keep it as Range)
      // But for block elements, convert to Node Selection if possible
      const parent = findBlockParent(node, dataStore);
      if (parent) {
        return {
          type: 'node',
          nodeId: parent.sid
        };
      }
    }
  }
  
  return null;
}

// Find block parent
function findBlockParent(node: INode, dataStore: DataStore): INode | null {
  // Find the parent and check if it’s a block group (implementation omitted)
  return null;
}
```

**Example of use**:
```typescript
// Convert Range Selection to Node Selection
const rangeSelection: ModelRangeSelection = {
  type: 'range',
  startNodeId: 'image-1',
  startOffset: 0,
  endNodeId: 'image-1',
  endOffset: 0,
  collapsed: true
};

const nodeSelection = convertRangeToNode(rangeSelection, editor.dataStore);
if (nodeSelection) {
  // Do your work as a Node Selection
  editor.selectionManager.setSelection(nodeSelection);
}
```

#### Situations where conversion helps (in everyday terms)

1) **Editing text: Node → Range**  
User clicks a paragraph (Node Selection) → we switch to a Range Selection so they can type/edit inside the text.

2) **Deleting a node: Range → Node**  
Cursor is just before an inline-image (Range Selection) → Backspace converts it to a Node Selection so the image node can be deleted cleanly.

3) **Selecting an entire block: Range → Node**  
User highlights all text inside a paragraph (Range Selection) → convert to Node Selection of the whole paragraph → now you can delete or move the paragraph as one unit.

#### Things to watch out for

1. **Atom nodes cannot become a Range**  
   - `inline-image`, `inline-video` have no text field → cannot become Range Selection → keep Node Selection.

2. **Do not turn text nodes into Node Selection**  
   - Text nodes always stay as Range Selection. Only block elements become Node Selection.

3. **If conversion fails, keep the original Selection**  
   - Return `null` when you cannot convert and leave the selection as-is.

4. **Selection change events fire**  
   - After conversion, `editor:selection.model` fires and the UI updates automatically.

---

## 2. Talking to the ComponentManager (how selection events reach components)

### 2.1 Where the ComponentManager lives

**It is created inside `DOMRenderer`:**

```
DOMRenderer (packages/renderer-dom/src/dom-renderer.ts)
  └── constructor()
      └── componentManager = new ComponentManager()
      └── this.componentManager = componentManager
```

**Creation flow (for reference):**
```typescript
// packages/renderer-dom/src/dom-renderer.ts
export class DOMRenderer {
  private componentManager: ComponentManager;
  
  constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
    // Create ComponentManager
    const componentManager = new ComponentManager();
    this.componentManager = componentManager;
    
    // Pass to VNodeBuilder and Reconciler
    this.builder = new VNodeBuilder(registry, {
      componentStateProvider: componentManager,
      componentManager: componentManager,
      // ...
    });
    this.reconciler = new Reconciler(/* ... */, this.componentManager, /* ... */);
  }
  
  // Accessor
  getComponentManager(): ComponentManager {
    return this.componentManager;
  }
}
```

**How EditorViewDOM reaches it:**

```
EditorViewDOM (packages/editor-view-dom/src/editor-view-dom.ts)
  └── private _domRenderer?: DOMRenderer
      └── _domRenderer.getComponentManager()
          └── ComponentManager
```

```typescript
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;  // DOMRenderer for the content layer
  
  private getComponentManager(): ComponentManager | undefined {
    return this._domRenderer?.getComponentManager();
  }
}
```

**Important reminders:**
- ComponentManager is created inside `renderer-dom`’s `DOMRenderer`.
- `EditorViewDOM` only accesses it through `DOMRenderer`.
- Each `DOMRenderer` instance has its own ComponentManager.
- The content-layer `_domRenderer` is the main one you use.

### 2.1.1 Access pattern

**Structure:**
```
EditorViewDOM
  └── _domRenderer?: DOMRenderer
      └── getComponentManager() → ComponentManager
```

**Why this pattern helps even non-coders:**
- Keep the “manager” close to the renderer that needs it.
- Each layer stays independent (one manager per DOMRenderer).
- No leaking of DOMRenderer internals.
- Same pattern for other renderer features.
- Minimal changes needed if DOMRenderer internals change.

**Snippet:**
```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;  // DOMRenderer for content layer
  
  private getComponentManager(): ComponentManager | undefined {
    return this._domRenderer?.getComponentManager();
  }
  
  // Usage example
  private handleSelectionChange(selection: ModelSelection): void {
    const componentManager = this.getComponentManager();
    if (!componentManager) {
      console.warn('[EditorViewDOM] ComponentManager not available');
      return;
    }
    
    // Emit events to components
    componentManager.emit('select', sid, data);
  }
}
```

### 2.2 How a selection change travels (simple mental model)

```
Selection changes
    ↓
editor:selection.model event fires (from EditorCore)
    ↓
EditorViewDOM receives it
    ↓
getComponentManager() fetches ComponentManager
    ↓
Decide selection type (Node vs Range vs Multi-node)
    ↓
Emit select/deselect to ComponentManager
    ↓
Components hear it and update UI
```

### 2.3 Implementation Location and Code

**Location**: `packages/editor-view-dom/src/editor-view-dom.ts`

**Guided example:**

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;
  private _lastSelectedNodes: string[] = [];  // track previously selected nodes
  
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // ... init ...
    // listen for selection changes
    this.setupSelectionEventListeners();
  }
  
  private setupSelectionEventListeners(): void {
    // listen to editor:selection.model
    this.editor.on('editor:selection.model', (selection: ModelSelection) => {
      this.handleSelectionChange(selection);
    });
  }
  
  private handleSelectionChange(selection: ModelSelection): void {
    // Get ComponentManager
    const componentManager = this.getComponentManager();
    if (!componentManager) {
      console.warn('[EditorViewDOM] ComponentManager not available');
      return;
    }
    
    // 1) Deselect old nodes
    if (this._lastSelectedNodes.length > 0) {
      this._lastSelectedNodes.forEach(sid => {
        componentManager.emit('deselect', sid, {
          selection: null,
          nodeId: sid
        });
      });
    }
    
    // 2) Collect new nodes
    const selectedNodes: string[] = [];
    
    if (selection.type === 'node') {
      // Node selection: use nodeId directly
      selectedNodes.push(selection.nodeId);
    } else if (selection.type === 'range') {
      // If range hits atom nodes, treat them as selected
      const startNode = this.editor.dataStore.getNode(selection.startNodeId);
      const endNode = this.editor.dataStore.getNode(selection.endNodeId);
      
      // Atom nodes (e.g., inline-image) → treat as node selection
      if (startNode && typeof startNode.text !== 'string') {
        selectedNodes.push(selection.startNodeId);
      } else if (endNode && typeof endNode.text !== 'string') {
        selectedNodes.push(selection.endNodeId);
      }
      // Pure text ranges: no ComponentManager events (unless you choose to add some)
    } else if (selection.type === 'multi-node') {
      // Multi-node: emit for all nodeIds
      selectedNodes.push(...selection.nodeIds);
    }
    
    // 3) Emit select for new nodes
    this._lastSelectedNodes = selectedNodes;
    selectedNodes.forEach(sid => {
      componentManager.emit('select', sid, {
        selection,
        nodeId: sid
      });
    });
  }
}
```

**Notes for non-coders:**
- Before `render()`, `_domRenderer` may be undefined → always null-check.
- `_lastSelectedNodes` stores what was selected last time; deselect them first, then select the new ones.
- Selection types:
  - `node`: use `nodeId`.
  - `range`: only emit if it includes atom nodes; plain text doesn’t emit.
  - `multi-node`: emit for every `nodeId`.

### 2.4 ComponentManager events in plain words

```typescript
class ComponentManager {
  on(event: string, handler: (sid: string, data: any) => void): void;
  off(event: string, handler?: (sid: string, data: any) => void): void;
  emit(event: string, sid: string, data: any): void;
}
```

Events:
- `'select'`: a node became selected  
  - `sid`: node id  
  - `data`: `{ selection: ModelSelection, nodeId: string }`
- `'deselect'`: a node was unselected  
  - `sid`: node id  
  - `data`: `{ selection: null, nodeId: string }`

### 2.5 How a component listens (human-friendly)

```typescript
// When your component mounts
componentManager.on('select', (sid, data) => {
  if (sid === this.nodeId) {
    this.setState({ isSelected: true });
    this.updateSelectionUI(true);  // e.g., border, resize handles
  }
});

componentManager.on('deselect', (sid, data) => {
  if (sid === this.nodeId) {
    this.setState({ isSelected: false });
    this.updateSelectionUI(false);
  }
});
```

---

## 3. Rendering the Selection UI (what users actually see)

### 3.1 Range Selection UI (text highlight)

**How it renders**: use the browser’s built-in text selection.

```
Text: "Hello World"
      ↑---highlight---↑
```

**Key points**:
- Uses the browser’s default highlight.
- Managed via `window.getSelection()`.
- Can customize with CSS `::selection`.

**Implementation hooks**:
- `convertModelSelectionToDOM()`: converts Model Selection → DOM Selection.
- Browser handles the visual highlight automatically.

### 3.2 Node Selection UI (custom outlines)

**How it renders**: the component itself draws the selection UI.

**Example: Inline image selection UI**
```
┌─────────────────────┐
│  [Image]            │  ← selected state
│  ┌───────────────┐  │
│  │   Border      │  │  ← selection UI (border)
│  │  ┌─────────┐  │  │
│  │  │ Image   │  │  │
│  │  └─────────┘  │  │
│  │ [resize handles]│ ← selection UI (resize handles)
│  └───────────────┘  │
└─────────────────────┘
```

**Implementation idea**:
```typescript
// Component renders its own selection UI
updateSelectionUI(isSelected: boolean): void {
  const element = this.domElement; // the component's DOM element
  
  if (isSelected) {
    // Add selection UI
    element.classList.add('selected');
    element.style.border = '2px solid #0066ff';
    element.style.outline = 'none';
    
    // Add resize handles (e.g., inline-image)
    if (this.nodeType === 'inline-image') {
      this.addResizeHandlers(element);
    }
  } else {
    // Remove selection UI
    element.classList.remove('selected');
    element.style.border = '';
    element.style.outline = '';
    
    // Remove resize handles
    this.removeResizeHandlers(element);
  }
}
```

**CSS example**:
```css
/* Node Selection style */
[data-bc-sid].selected {
  border: 2px solid #0066ff !important;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.2);
}

/* When an inline-image is selected */
[data-bc-sid="image-1"].selected {
  position: relative;
}

[data-bc-sid="image-1"].selected::after {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border: 2px solid #0066ff;
  pointer-events: none;
}
```

### 3.3 Block Selection UI (whole block outline)

**How it renders**: draw selection around the whole block element.

**Example: Paragraph selection UI**
```
┌─────────────────────────────┐
│ paragraph-1 (selected)      │ ← selected state
│ ┌─────────────────────────┐ │
│ │ [selection border]      │ │ ← selection UI (border)
│ │                         │ │
│ │ text-1: "Hello World"   │ │
│ │                         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**Implementation idea**:
```typescript
// Block element selection UI
updateBlockSelectionUI(isSelected: boolean): void {
  const blockElement = this.domElement;
  
  if (isSelected) {
    blockElement.classList.add('block-selected');
    blockElement.style.borderLeft = '3px solid #0066ff';
    blockElement.style.backgroundColor = 'rgba(0, 102, 255, 0.05)';
  } else {
    blockElement.classList.remove('block-selected');
    blockElement.style.borderLeft = '';
    blockElement.style.backgroundColor = '';
  }
}
```

---

## 4. Model ↔ DOM Selection Conversion

### 4.1 How text is represented (Model vs DOM)

#### In the Model (flat text)

**Single continuous string (Flat Text Model)**

Model stores text as one continuous string:

```
Model Text: "bold and italic"
            └─ offset: 0 ──────────────── 15 ─┘
```

**Characteristics:**
- One text string per node
- Offsets are continuous integers starting at 0
- Marks are ranges `[start, end)`

#### In the DOM (split into many text nodes)

**Fragmented Text DOM**

In the DOM, marks/decorators split text into multiple text nodes:

```
DOM Structure:
<span data-bc-sid="text-1">
  <b>bold</b>           ← Text Node 1: "bold" (DOM offset 0-4)
  <span> and </span>    ← Text Node 2: " and " (DOM offset 0-5)
  <i>italic</i>         ← Text Node 3: "italic" (DOM offset 0-6)
</span>
```

**Characteristics:**
- Each text node has its own offset space
- Nested structure due to mark wrappers
- Decorators are visual only (ignored for selection math)

#### The mapping problem

- Which DOM text node/offset matches Model offset `10`?
- Which Model offset matches DOM text node offset `3`?

**Solution:**
- Use a Text Run Index to map both ways
- Record the Model offset range for each text node

### 4.2 Text Run Index algorithm (bridge between Model offsets and DOM offsets)

#### Data structures

```typescript
interface TextRun {
  domTextNode: Text;        // actual DOM text node
  start: number;            // Model offset start (inclusive)
  end: number;              // Model offset end (exclusive)
}

interface ContainerRuns {
  runs: TextRun[];          // sorted by text node order
  total: number;            // total text length (end of last run)
  byNode?: Map<Text, { start: number; end: number }>;  // reverse lookup (optional)
}
```

#### Building the Text Run Index

**Inputs:**
- `container`: element with `data-bc-sid`
- `excludePredicate`: function to skip elements (decorators, etc.)

**Algorithm (step-by-step):**

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
17.      CONTINUE  // skip decorators, etc.
18.    
19.    // Use TreeWalker to gather inner text nodes
20.    walker = createTreeWalker(child, SHOW_TEXT, {
21.      acceptNode: (node) => {
22.        IF any ancestor is a decorator:
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

**Time:** O(n) where n = #text nodes  
**Space:** O(n)

#### Model Offset → DOM Offset (binary search)

**Algorithm:**

```
1. IF modelOffset < 0 OR modelOffset > runs.total:
2.   RETURN null  // out of range
3.
4. IF modelOffset == runs.total:
5.   lastRun = runs[runs.length - 1]
6.   RETURN {
7.     node: lastRun.domTextNode,
8.     offset: lastRun.domTextNode.textContent.length
9.   }
10.
11. // Binary Search to find the run
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

**Time:** O(log n)

#### DOM Offset → Model Offset

**Algorithm:**

```
1. // Use reverse map if available (O(1))
2. IF runs.byNode EXISTS:
3.   runInfo = runs.byNode.get(textNode)
4.   IF runInfo EXISTS:
5.     RETURN runInfo.start + min(domOffset, runInfo.end - runInfo.start)
6.
7. // Otherwise linear scan (O(n))
8. FOR EACH run IN runs:
9.   IF run.domTextNode == textNode:
10.    localOffset = min(domOffset, run.end - run.start)
11.    RETURN run.start + localOffset
12.
13. RETURN 0  // not found (fallback)
```

**Time:** O(1) with reverse map, otherwise O(n)

### 4.3 Model Selection → DOM Selection

**Input:**
- `modelSelection`: `{ startNodeId, startOffset, endNodeId, endOffset, type: 'range' }`

**Algorithm (conceptual steps):**

```
1. // Find container elements
2. startContainer = findElementBySid(modelSelection.startNodeId)
3. endContainer = findElementBySid(modelSelection.endNodeId)
4. 
5. IF startContainer == null OR endContainer == null:
6.   RETURN FAILURE
7.
8. // Find the best text containers by climbing up
9. startTextContainer = findBestContainer(startContainer)
10. endTextContainer = findBestContainer(endContainer)
11.
12. IF startTextContainer == null OR endTextContainer == null:
13.   RETURN FAILURE
14.
15. // Build Text Run Index
16. startRuns = buildTextRunIndex(startTextContainer)
17. endRuns = buildTextRunIndex(endTextContainer)
18.
19. // Convert Model offset → DOM offset
20. startDOMRange = findDOMRangeFromModelOffset(startRuns, modelSelection.startOffset)
21. endDOMRange = findDOMRangeFromModelOffset(endRuns, modelSelection.endOffset)
22.
23. IF startDOMRange == null OR endDOMRange == null:
24.   RETURN FAILURE
25.
26. // Set DOM Selection
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

### 4.4 DOM Selection → Model Selection

**Input:**
- `domSelection`: browser Selection object

**Algorithm (conceptual steps):**

```
1. range = domSelection.getRangeAt(0)
2. 
3. // Find container elements
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
16. // Build Text Run Index
17. startRuns = buildTextRunIndex(startContainer)
18. endRuns = (startContainer == endContainer) ? startRuns : buildTextRunIndex(endContainer)
19.
20. // Convert DOM offset → Model offset
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
34. // Determine selection direction
35. direction = determineSelectionDirection(domSelection, startContainer, endContainer, startModelOffset, endModelOffset)
36.
37. // Normalize to unified ModelSelection format
38. modelSelection = normalizeSelection(startNodeId, startModelOffset, endNodeId, endModelOffset)
39.
40. RETURN {
41.   type: 'range',
42.   ...modelSelection,
43.   direction
44. }
```

### 4.5 Selection sync timing (Model → DOM and DOM → Model)

#### Model → DOM sync

**Problem:**
- If you apply selection before render finishes, the DOM isn’t updated yet.
- Text Run Index might be built from stale DOM.

**Solution (high-level flow):**

```
1. Model change occurs
   ↓
2. Transaction execution
   ↓
3. selectionAfter calculation
   ↓
4. editor.updateSelection(selectionAfter)
   ↓
5. Store in _pendingModelSelection
   ↓
6. render() call
   ↓
7. reconcile() execution (DOM update)
   ↓
8. reconcile completion callback called
   ↓
9. applyModelSelectionWithRetry() execution
   ↓
10. Text Run Index creation (based on latest DOM)
    ↓
11. DOM Selection application
```

#### DOM → Model sync

**Problem:**
- User changes selection in the DOM; it must mirror into the Model.
- If the DOM is mid-update, conversion may need to be delayed.

**Solution (simple flow):**

```
1. selectionchange event occurs
   ↓
2. handleSelectionChange() call
   ↓
3. convertDOMSelectionToModel(selection)
   ↓
4. editor.updateSelection(modelSelection)
   ↓
5. editor:selection.model event fires
```

### 4.6 How text nodes get split (marks vs decorators)

#### Splits caused by Marks

**Rules:**
- Each mark creates its own wrapper.
- Overlapping marks become nested.
- Text nodes inside each wrapper are independent.

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

**Nested case:**

```
Model: "bold and italic" (marks: bold[0-9], italic[9-14])

DOM:
<span data-bc-sid="text-1">
  <b>bold</b>              ← text node 1
  <i>italic</i>            ← text node 2
</span>
```

#### Splits caused by Decorators

**Rules:**
- Decorators are visual-only.
- Exclude them from selection calculation.
- Do not collect text nodes under decorators.

**Example:**

```
<span data-bc-sid="text-1">
  <span data-decorator-sid="dec-1">decorator</span>  ← excluded
  <b>bold</b>                                         ← included
</span>
```

#### What to include/exclude when building Text Run Index

**Include:**
- Text nodes directly under `data-bc-sid`
- Text nodes inside mark wrappers
- All text nodes in nested mark structures

**Exclude:**
- Text under decorators
- Under elements with `data-bc-decorator`
- Under elements with `data-decorator-sid`

---

## 5. Selection change scenarios (practical, easy to visualize)

### 5.1 Range → Node Selection

**Scenario**: Press Backspace, text disappears, inline-image becomes selected.
```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ cursor (text-2 offset 0)

After Backspace:
[text-1: "Hello"] [image-1]
                   ↑ image-1 is now selected

Selection change:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
- After:  { type: 'node', nodeId: 'image-1' }

ComponentManager events:
1) deselect('text-2', { ... })
2) select('image-1', { selection: { type: 'node', nodeId: 'image-1' } })

UI changes:
1) Remove text highlight
2) Show selection border on image-1
```

### 5.2 Node → Range Selection

**Scenario**: Image is selected, user clicks text.
```
Before:
[text-1: "Hello"] [image-1 (selected)] [text-2: "World"]
                                              ↑ click

After:
[text-1: "Hello"] [image-1] [text-2: "World"]
                                              ↑ cursor

Selection change:
- Before: { type: 'node', nodeId: 'image-1' }
- After:  { type: 'range', startNodeId: 'text-2', startOffset: 0, collapsed: true }

ComponentManager events:
1) deselect('image-1', { ... })

UI changes:
1) Remove image-1 border
2) Show cursor in text-2
```

### 5.3 Range → Range Selection (just moving the highlight)

**Scenario**: User changes the highlighted text range.
```
Before:
Text: "Hello World"
      ↑---selected---↑

After:
Text: "Hello World"
        ↑---selected---↑

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 0, endOffset: 5, ... }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 2, endOffset: 7, ... }

ComponentManager events:
- None (pure text range does not emit ComponentManager events)

UI changes:
1) Browser updates the highlight automatically
```

### 5.4 Conversions between Node and Range (common situations)

#### Scenario 1: Node → Range (to edit text)
User clicks a paragraph (Node Selection), then starts typing.
```
Before:
[paragraph-1 (selected)]
  └─ text-1: "Hello World"

User starts typing:
[paragraph-1]
  └─ text-1: "Hello World"
              ↑ cursor (Range Selection)

Conversion:
- Before: { type: 'node', nodeId: 'paragraph-1' }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 0, collapsed: true }

Why convert:
- Typing needs a Range Selection
- Node Selection alone cannot edit text
```

#### Scenario 2: Range → Node (select an atom node to delete)
Cursor is before an inline-image, Backspace is pressed.
```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ cursor (text-2 offset 0, Range Selection)

After Backspace:
[text-1: "Hello"] [image-1]
                   ↑ image-1 selected (Node Selection)

Conversion:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
- After:  { type: 'node', nodeId: 'image-1' }

Why convert:
- Atom nodes have no text field, cannot be Range
- Convert to Node to delete the node cleanly
```

#### Scenario 3: Range → Node (select entire block)
User selects all text inside a paragraph, then deletes the block.
```
Before:
[paragraph-1]
  └─ text-1: "Hello World"
      ↑---all selected---↑ (Range)

User action: delete block
[paragraph-1 (selected)] (Node Selection)

Conversion:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 0, endOffset: 11, ... }
- After:  { type: 'node', nodeId: 'paragraph-1' }

Why convert:
- Block-level actions (delete/move) fit Node Selection better
- Range Selection is for text editing
```

#### Scenario 4: Conversion fails (Atom → Range not allowed)
User selects inline-image, tries to type text.
```
Before:
[image-1 (selected)] (Node Selection)

User typing:
→ Conversion fails (atom nodes cannot become Range)
→ Keep Node Selection
→ Ignore input or show warning

Reason:
- Atom node has no text field
- Cannot convert to Range
- Only Node Selection is possible
```

### 5.5 Selection changes for common user actions

#### Scenario 1: Typing text
```
Before:
[text-1: "Hello"]
           ↑ cursor (offset 5)

User types: " World"

After:
[text-1: "Hello World"]
                    ↑ cursor (offset 11)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 11, endOffset: 11, collapsed: true }

Flow:
1. MutationObserver detects DOM change
2. InputHandler runs transaction (insertText)
3. After transaction, selectionAfter is computed
4. editor.updateSelection(selectionAfter)
5. editor:selection.model event fires
6. EditorViewDOM updates DOM Selection

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 2: Delete key
```
Before:
[text-1: "Hello World"]
           ↑ cursor (offset 5)

Delete key pressed

After:
[text-1: "Hello orld"]
           ↑ cursor (offset 5)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- (Cursor stays, text is shorter)

Flow:
1. keydown (Delete)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection
4. Compute delete range (offset 5, length 1)
5. Execute command (deleteText)
6. After transaction, apply selectionAfter (cursor stays)

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 3: Arrow keys move selection
```
Before:
[text-1: "Hello World"]
           ↑ cursor (offset 5)

→ ArrowRight

After:
[text-1: "Hello World"]
            ↑ cursor (offset 6)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 6, endOffset: 6, collapsed: true }

Flow:
1. keydown (ArrowRight)
2. Browser moves DOM Selection
3. selectionchange fires
4. handleSelectionChange() runs
5. convertDOMSelectionToModel() → Model Selection
6. editor.updateSelection(modelSelection)
7. editor:selection.model event fires

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 4: Click to move selection

- **Click text**  
```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                 ↑ cursor (text-1 offset 5)

User clicks: text-2 offset 2

After:
[text-1: "Hello"] [image-1] [text-2: "World"]
                                      ↑ cursor (text-2 offset 2)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-2', startOffset: 2, endOffset: 2, collapsed: true }

Flow:
1. click event
2. Browser sets DOM Selection
3. selectionchange fires
4. handleSelectionChange()
5. convertDOMSelectionToModel()
6. editor.updateSelection(modelSelection)
7. editor:selection.model event fires

ComponentManager events:
- None (text ranges don’t emit)
```

- **Click atom node (inline-image)**  
```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ cursor (text-1 offset 5)

User clicks: image-1

After:
[text-1: "Hello"] [image-1 (selected)] [text-2: "World"]

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'node', nodeId: 'image-1' }

Flow:
1. click event
2. Detect clicked element is atom node
3. Convert to Node Selection
4. editor.updateSelection({ type: 'node', nodeId: 'image-1' })
5. editor:selection.model event fires

ComponentManager events:
1) deselect('text-1', { ... })
2) select('image-1', { selection: { type: 'node', nodeId: 'image-1' } })
```

#### Scenario 5: Drag to select
```
Before:
[text-1: "Hello World"]
           ↑ cursor (offset 5)

User drags: offset 5 → offset 11

After:
[text-1: "Hello World"]
           ↑---selected---↑

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 11, collapsed: false }

Flow:
1. mousedown (drag start)
2. mousemove (dragging)
3. Browser updates DOM Selection
4. selectionchange fires repeatedly during drag
5. Debounce (e.g., 100ms during drag, 16ms normal)
6. handleSelectionChange()
7. convertDOMSelectionToModel()
8. editor.updateSelection(modelSelection)
9. editor:selection.model event fires

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 6: Paste
```
Before:
[text-1: "Hello"]
           ↑ cursor (offset 5)

Paste: " World"

After:
[text-1: "Hello World"]
                    ↑ cursor (offset 11)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 11, endOffset: 11, collapsed: true }

Flow:
1. paste event
2. Extract text to paste
3. insertText()
4. Transaction (insertText)
5. Compute selectionAfter
6. editor.updateSelection(selectionAfter)
7. editor:selection.model event fires

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 7: Enter key creates a new paragraph
```
Before:
[paragraph-1]
  └─ text-1: "Hello"
              ↑ cursor (offset 5)

Enter key pressed

After:
[paragraph-1]
  └─ text-1: "Hello"
[paragraph-2]
  └─ text-2: ""
              ↑ cursor (offset 0)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }

Flow:
1. keydown (Enter)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection
4. Command: insertParagraph
5. Compute selectionAfter (start of new paragraph)
6. editor.updateSelection(selectionAfter)
7. editor:selection.model event fires
8. EditorViewDOM updates DOM Selection

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 8: After a transaction, apply selectionAfter
```
Before:
[text-1: "Hello"]
           ↑ cursor (offset 5)

Command: deleteText(offset 5, length 1)

Transaction:
1. Delete text in model
2. Compute selectionAfter: { startNodeId: 'text-1', startOffset: 5, ... }

After:
[text-1: "Hllo"]
           ↑ cursor (offset 5)

Selection change:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- (Cursor stays; text is shorter)

Flow:
1. Command deleteText
2. Transaction runs
3. Compute selectionAfter
4. editor.updateSelection(selectionAfter)
5. editor:selection.model event fires
6. EditorViewDOM stores _pendingModelSelection
7. render() call
8. After reconcile(), applyModelSelectionWithRetry()
9. Update DOM Selection

ComponentManager events:
- None (text ranges don’t emit)
```

#### Scenario 9: Delete a selected node
```
Before:
[text-1: "Hello"] [image-1 (selected)] [text-2: "World"]

Delete key pressed

After:
[text-1: "Hello"] [text-2: "World"]
                          ↑ cursor (text-2 offset 0)

Selection change:
- Before: { type: 'node', nodeId: 'image-1' }
- After:  { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }

Flow:
1. keydown (Delete)
2. preventDefault() (Model-First)
3. Confirm current selection is Node Selection
4. Command deleteNode
5. Transaction runs
6. Move selection to next node
7. Compute selectionAfter
8. editor.updateSelection(selectionAfter)
9. editor:selection.model event fires

ComponentManager events:
1) deselect('image-1', { ... })
2) (text-2 is a range selection, so no ComponentManager event)
```

#### Scenario 10: Merge blocks with Backspace
```
Before:
[paragraph-1]
  └─ text-1: "Hello"
              ↑ cursor (offset 5)
[paragraph-2]
  └─ text-2: "World"
              ↑ cursor (offset 0)

Backspace pressed

After:
[paragraph-1]
  └─ text-1: "HelloWorld"
                    ↑ cursor (offset 5)

Selection change:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }
- After:  { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }

Flow:
1. keydown (Backspace)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection
4. Check if previous node is a different parent (block boundary)
5. Command mergeBlockNodes
6. Transaction runs
7. Move selection to merged position
8. Compute selectionAfter
9. editor.updateSelection(selectionAfter)
10. editor:selection.model event fires

ComponentManager events:
- None (text ranges don’t emit)
```

---

## 6. Implementation checklist (quick self-audit)

### 6.1 Decide selection type
- [ ] Text nodes → Range Selection
- [ ] Atom nodes → Node Selection
- [ ] Block elements → Node Selection (optional, when clicked as a block)

### 6.2 ComponentManager communication
- [ ] Access ComponentManager via `_domRenderer.getComponentManager()`
- [ ] Listen to `editor:selection.model`
- [ ] Track previous selection (`_lastSelectedNodes`)
- [ ] Extract nodes by selection type (node, range, multi-node)
- [ ] Emit `deselect` for old nodes
- [ ] Emit `select` for new nodes
- [ ] Components listen and update UI

### 6.3 Selection UI rendering
- [ ] Range: browser default selection
- [ ] Node: component renders its own UI
- [ ] Block: block-level selection UI

### 6.4 Model ↔ DOM Selection conversion
- [ ] Implement Text Run Index builder
- [ ] Implement Model → DOM conversion
- [ ] Implement DOM → Model conversion
- [ ] Manage sync timing
- [ ] Exclude decorator subtrees
- [ ] Use `normalizeWhitespace: false`

### 6.5 Multi-Node Selection
- [ ] Ctrl/Cmd + click to add/remove nodes
- [ ] Shift + click for range
- [ ] Drag to select multiple nodes
- [ ] Render multi-node selection UI
- [ ] Show bounding box
- [ ] Indicate primary node

### 6.6 Node ↔ Range conversions
- [ ] Node → Range (text nodes, block elements)
- [ ] Range → Node (atom nodes, entire block)
- [ ] If conversion fails, keep original selection
- [ ] Ensure selection change events fire after conversion

---

## 7. How selection docs are organized (for reference)

### 7.1 Current selection-related docs

1. **`selection-system.md`** (this doc)  
   - Selection types, ComponentManager communication, UI rendering, Model ↔ DOM conversion, troubleshooting  
   - Acts as the integrated spec

2. **`selection-algorithm.md`**  
   - Range selection conversion algorithms (Text Run Index, offset mapping)

3. **`selection-handling.md`**  
   - DOM ↔ Model conversion guide, troubleshooting

4. **`selection-sync-validation.md`**  
   - Selection sync validation and tests

### 7.2 Proposed organization

**Current integrated structure** (already merged):
```
selection-system.md
├── 1. Selection types
├── 2. ComponentManager communication
├── 3. Selection UI rendering
├── 4. Model ↔ DOM conversion
│   ├── 4.1 Text representation
│   ├── 4.2 Text Run Index
│   ├── 4.3 Model → DOM selection
│   ├── 4.4 DOM → Model selection
│   ├── 4.5 Sync timing
│   └── 4.6 Text node splitting rules
├── 5. Selection change scenarios
├── 6. Node ↔ Range conversion
├── 7. Troubleshooting and notes
├── 8. Checklist
└── 9. References
```

**Merged content includes:**
- ✅ Core from `selection-algorithm.md` (Text Run Index, conversion)
- ✅ Troubleshooting from `selection-handling.md`
- ✅ Validation summary from `selection-sync-validation.md`

**Still useful separately (optional references):**
- `selection-algorithm.md`: deeper algorithm details
- `selection-handling.md`: troubleshooting guide
- `selection-sync-validation.md`: validation/tests

---

## 8. References

### 8.1 Selection docs (reference)
- [Selection Algorithm](./selection-algorithm.md) — detailed algorithms
- [Selection Handling](./selection-handling.md) — troubleshooting
- [Selection Sync Validation](./selection-sync-validation.md) — validation/tests

*(Note: Key material has been merged into `selection-system.md`; use the above only if you need deeper detail.)*

### 8.2 Related docs
- [Backspace Detailed Spec](./backspace-detailed-spec.md): selection rules after Backspace
- [Selection Spec](../../paper/selection-spec.md): selection type definitions (paper)

