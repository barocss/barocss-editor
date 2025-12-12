# Text Input Data Change Flow

## Overall flow

```
User input (keyboard)
    ↓
DOM change (ContentEditable)
    ↓
MutationObserver detects
    ↓
InputHandler.handleTextContentChange()
    ↓
handleEfficientEdit() - text analysis & mark/decorator adjustment
    ↓
Editor.executeTransaction() - execute transaction
    ↓
_applyBasicTransaction() - actual model update
    ↓
editor:content.change event fires
    ↓
EditorViewDOM.render() - re-render
```

## Step-by-step details

### Step 1: MutationObserver detects DOM change

**File**: `packages/editor-view-dom/src/mutation-observer/mutation-observer-manager.ts`

```typescript
onTextChange: (event: any) => {
  // Detect text change from DOM
  const info = {
    oldText: event.oldText,      // Text before change (individual text node)
    newText: event.newText,      // Text after change (individual text node)
    nodeId: (t && t.getAttribute && t.getAttribute('data-bc-sid')) || ...,
    nodeType: (t && t.getAttribute && t.getAttribute('data-bc-stype')) || ...
  };
  console.log('[MO] onTextChange', info);
  
  // Forward to InputHandler
  this.inputHandler.handleTextContentChange(event.oldText, event.newText, event.target);
}
```

**Important**: `oldText`/`newText` are values of **individual text nodes**. But actual comparison must use **full text** by `sid`.

---

### Step 2: InputHandler processes change

**File**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

#### 2-1. Basic validation and filtering

```typescript
handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): void {
  // 1. Check for filler <br> (cursor stabilization)
  if (target.nodeType === Node.ELEMENT_NODE) {
    const el = target as Element;
    const hasFiller = el.querySelector('br[data-bc-filler="true"]');
    if (hasFiller) return; // skip
  }

  // 2. Extract textNodeId (data-bc-sid)
  const textNodeId = this.resolveModelTextNodeId(target);
  if (!textNodeId) return; // untrackable text

  // 3. Check if IME composing
  if (this.isComposing) {
    // Store in pending during composition for later processing
    this.pendingTextNodeId = textNodeId;
    this.pendingOldText = oldValue || '';
    this.pendingNewText = newValue || '';
    return;
  }

  // 4. Check Range selection (only handle collapsed)
  if (selection.length !== 0) return;

  // 5. Check active node (prevent cursor jumping)
  if (this.activeTextNodeId && textNodeId !== this.activeTextNodeId) return;
}
```

#### 2-2. Get model data

```typescript
  // Get current node info from model
  const modelNode = (this.editor as any).dataStore?.getNode?.(textNodeId);
  if (!modelNode) return;

  const oldModelText = modelNode.text || '';  // Model's full text
  
  // Normalize Marks (IMark → MarkRange conversion)
  const rawMarks = modelNode.marks || [];
  const modelMarks: MarkRange[] = rawMarks
    .filter((mark: any) => mark && (mark.type || mark.stype))
    .map((mark: any) => {
      const markType = mark.type || mark.stype; // IMark uses stype, MarkRange uses type
      // If range is missing, set to full text range
      if (!mark.range || !Array.isArray(mark.range) || mark.range.length !== 2) {
        return {
          type: markType,
          range: [0, oldModelText.length] as [number, number],
          attrs: mark.attrs || mark.attributes || {}
        };
      }
      return {
        type: markType,
        range: mark.range as [number, number],
        attrs: mark.attrs || mark.attributes || {}
      };
    });
  
  const decorators = (this.editor as any).getDecorators?.() || [];
```

**Important:**
- `oldModelText` is the **model's full text** (by sid).
- `oldValue`/`newValue` are **individual text node** values, so not used for comparison.

---

### Step 3: Analyze text with handleEfficientEdit

**File**: `packages/editor-view-dom/src/utils/efficient-edit-handler.ts`

#### 3-1. Reconstruct full text from DOM

```typescript
export function handleEfficientEdit(
  textNode: Text,
  oldModelText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[]
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  // 1. Find inline-text node (extract sid)
  const inlineTextNode = findInlineTextNode(textNode);
  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  
  // 2. Build Text Run Index
  // Collect all text nodes under sid
  const runs = buildTextRunIndex(inlineTextNode, nodeId, {
    buildReverseMap: true,
    normalizeWhitespace: false
  });
  
  // 3. Reconstruct full text by sid from DOM
  // Reconstruct by merging all text nodes
  const newText = reconstructModelTextFromRuns(runs);
  
  // 4. Compare text by sid
  if (newText === oldModelText) {
    return null; // No change
  }
```

**Key:**
- `oldModelText`: Model's full text (comparison target)
- `newText`: Full text reconstructed from DOM (after change)
- **Compare using full text, not individual text nodes**.

#### 3-2. Normalize Selection offset

```typescript
  // 5. Normalize Selection offset to Model offset
  const selection = window.getSelection();
  let selectionOffset: number = 0;
  let selectionLength: number = 0;
  
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
        selectionOffset = modelPos.offset;  // Model offset (normalized)
      }
    }
  }
```

**Key**: DOM `offset` may differ from model `offset` due to marks/decorators, so **normalize using Text Run Index**.

#### 3-3. Analyze text changes (LCP/LCS algorithm)

```typescript
  // 6. Use text-analyzer's analyzeTextChanges
  const textChanges = analyzeTextChanges({
    oldText: oldModelText,
    newText: newText,
    selectionOffset: selectionOffset,
    selectionLength: selectionLength
  });
  
  if (textChanges.length === 0) {
    return null; // No changes
  }
  
  // Convert first TextChange to TextEdit
  const firstChange = textChanges[0];
  return createEditInfoFromTextChange(
    nodeId,
    oldModelText,
    newText,
    inlineTextNode,
    modelMarks,
    decorators,
    firstChange
  );
}
```

**Key**: Uses `@barocss/text-analyzer` package's `analyzeTextChanges` function to:
- Compute precise change ranges with LCP/LCS algorithm
- Reflect user intent with Selection biasing
- Normalize Unicode (NFC)
- Safe character splitting

#### 3-4. Adjust Mark/Decorator ranges

```typescript
function createEditInfoFromTextChange(
  nodeId: string,
  oldText: string,
  newText: string,
  inlineTextNode: Element,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[],
  textChange: TextChange
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} {
  // Convert TextChange to TextEdit
  const editInfo: TextEdit = {
    nodeId,
    oldText,
    newText,
    editPosition: textChange.start,  // Precise start position
    editType: textChange.type,       // 'insert' | 'delete' | 'replace'
    insertedLength: textChange.text.length,
    deletedLength: textChange.end - textChange.start
  };
  
  // Adjust Mark ranges (auto-adjust by edit position)
  const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
  
  // Adjust Decorator ranges
  const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
  
  return {
    newText,
    adjustedMarks,
    adjustedDecorators,
    editInfo
  };
}
```

**Key:**
- **Auto-adjust marks and decorators ranges** based on text edits.
- Example: In "Hello **World**", typing "New " before "World" moves bold mark range from `[6, 11]` → `[10, 15]`.

---

### Step 4: Execute Editor transaction

**File**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
  // Text and Marks update transaction (handled together)
  const marksChanged = marksChangedEfficient(modelMarks, editResult.adjustedMarks);
  
  // Full text replace approach (start=0, end=fullLength, text=newText)
  this.editor.executeTransaction({
    type: 'text_replace',
    nodeId: textNodeId,
    start: 0,
    end: oldModelText.length,  // Full text length
    text: editResult.newText,  // New full text
    // Include marks only if changed
    ...(marksChanged ? { marks: editResult.adjustedMarks } : {})
  } as any);

  // Update Decorators (only if changed)
  const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
  if (decoratorsChanged && (this.editor as any).updateDecorators) {
    (this.editor as any).updateDecorators(editResult.adjustedDecorators);
  }
```

**Key:**
- Update text and marks together with `text_replace` transaction.
- Update decorators separately.

---

### Step 5: Actual model update

**File**: `packages/editor-core/src/editor.ts`

#### 5-1. executeTransaction

```typescript
executeTransaction(transaction: Transaction): void {
  console.log('[Editor] executeTransaction', { type: (transaction as any)?.type });
  try {
    // Lightweight model mutation bridge for demo
    this._applyBasicTransaction(transaction as any);
    
    // Add to history on document change
    this._addToHistory(this._document);
    
    this.emit('transactionExecuted', { transaction });
    // Emit content change event
    this.emit('editor:content.change', { content: this.document, transaction });
    
    // If model selection is included in transaction
    const selAfter = (transaction as any)?.selectionAfter;
    if (selAfter) {
      this.emit('editor:selection.model', selAfter as any);
    }
  } catch (error) {
    console.error('Transaction execution failed:', error);
    this.emit('transactionError', { transaction, error });
  }
}
```

#### 5-2. _applyBasicTransaction (actual data change)

```typescript
private _applyBasicTransaction(tx: any): void {
  if (!tx || !tx.type) return;
  
  if (tx.type === 'text_replace') {
    const nodeId = tx.nodeId;
    const node = this._dataStore?.getNode?.(nodeId);
    if (!node) return;
    
    const oldText: string = (node as any).text || '';
    const start: number = tx.start ?? 0;
    const end: number = tx.end ?? start;
    const insertText: string = tx.text ?? '';
    
    // Compute text replacement
    // input-handler sends start=0, end=fullLength, text=newText, so
    // actually full replacement: oldText.slice(0, 0) + newText + oldText.slice(fullLength) = newText
    const newText = oldText.slice(0, start) + insertText + oldText.slice(end);
    
    // Update node (text + marks)
    const updatedNode: any = {
      ...node,
      text: newText,
      metadata: { ...(node as any).metadata, updatedAt: new Date() }
    };
    
    // Update Marks (if provided)
    if (tx.marks !== undefined) {
      // Store MarkRange format as-is (DataStore handles normalization)
      updatedNode.marks = tx.marks;
    }
    
    // Save to DataStore
    this._dataStore?.setNode?.(updatedNode);
  }
}
```

**Key:**
- Update entire node (text + marks) with `dataStore.setNode()`
- `tx.marks` is stored as `MarkRange[]` format (DataStore normalizes if needed)
- `MarkRange` (uses type) is stored as-is, but DataStore may convert to `IMark` (uses stype) when reading

---

### Step 6: Re-render

**File**: `packages/editor-view-dom/src/editor-view-dom.ts`

```typescript
// editor:content.change event handler
this.editor.on('editor:content.change' as any, (e: any) => {
  if (this._isComposing) {
    console.log('[EditorViewDOM] content.change (composing=true) skip render');
    return;
  }
  console.log('[EditorViewDOM] content.change -> render with diff');
  this.render();
  // Try to reapply selection after render
  this.applyModelSelectionWithRetry();
});
```

**Key:**
- Call `render()` when `editor:content.change` event fires
- Skip re-render during IME composition (let browser handle)

---

## Data structure conversion summary

### 1. IMark (DataStore) ↔ MarkRange (EditorViewDOM)

```typescript
// IMark (DataStore)
interface IMark {
  stype: string;              // ← uses stype, not type
  attrs?: Record<string, any>;
  range?: [number, number];   // ← optional
}

// MarkRange (EditorViewDOM)
interface MarkRange {
  type: string;                // ← uses type, not stype
  range: [number, number];    // ← required
  attrs?: Record<string, any>;
}

// Conversion logic (input-handler.ts)
const modelMarks: MarkRange[] = rawMarks
  .filter((mark: any) => mark && (mark.type || mark.stype))
  .map((mark: any) => {
    const markType = mark.type || mark.stype; // IMark uses stype, MarkRange uses type
    return {
      type: markType,
      range: mark.range || [0, oldModelText.length],
      attrs: mark.attrs || mark.attributes || {}
    };
  });
```

### 2. Reverse conversion on transaction execution

```typescript
// In _applyBasicTransaction
if (tx.marks !== undefined) {
  const marks = tx.marks.map((m: any) => ({
    stype: m.type,  // MarkRange.type → IMark.stype
    range: m.range,
    attrs: m.attrs
  }));
  this._dataStore?.marks?.setMarks?.(nodeId, marks, { normalize: true });
}
```

---

## Example scenario

### Scenario: Type "New " before "World" in "Hello **World**"

1. **MutationObserver detects**
   - `oldText`: "World"
   - `newText`: "New World"
   - `target`: Text Node inside `<span class="mark-bold">World</span>`

2. **InputHandler processes**
   - `textNodeId`: "text-bold" (inline-text's sid)
   - `oldModelText`: "Hello World" (model's full text)
   - `modelMarks`: `[{ type: 'bold', range: [6, 11] }]`

3. **handleEfficientEdit analyzes**
   - `newText`: "Hello New World" (reconstructed from DOM)
   - `textChanges`: `[{ type: 'insert', start: 6, end: 6, text: 'New ' }]`
   - `adjustedMarks`: `[{ type: 'bold', range: [10, 15] }]` (ranges auto-adjusted)

4. **Execute transaction**
   ```typescript
   editor.executeTransaction({
     type: 'text_replace',
     nodeId: 'text-bold',
     start: 0,
     end: 11,
     text: 'Hello New World',
     marks: [{ type: 'bold', range: [10, 15] }]
   });
   ```

5. **Model update**
   - `dataStore.updateNode('text-bold', { text: 'Hello New World' })`
   - `dataStore.marks.setMarks('text-bold', [{ stype: 'bold', range: [10, 15] }])`

6. **Re-render**
   - `editor:content.change` event fires
   - `EditorViewDOM.render()` called
   - DOM updates to new model state

---

## Core principles

1. **Compare full text by sid**: Compare by `sid`-based full text, not individual text nodes
2. **Normalize Selection offset**: Convert DOM offset to Model offset
3. **Auto-adjust ranges**: Auto-adjust marks/decorators ranges based on text edits
4. **LCP/LCS algorithm**: Compute precise change ranges
5. **IME handling**: Store in pending during composition and process later
