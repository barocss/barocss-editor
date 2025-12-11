# EditorViewDOM Text Input Flow

## End-to-end overview

```
User keyboard input
    ↓
Browser events fire (input, beforeinput, compositionstart/update/end)
    ↓
EditorViewDOM event handlers (handleInput, handleCompositionStart, ...)
    ↓
Browser applies text change to DOM
    ↓
MutationObserver detects DOM change
    ↓
InputHandler.handleTextContentChange() runs
    ↓
handleEfficientEdit() analyzes text change and adjusts marks/decorators
    ↓
Editor.executeTransaction() updates the model
    ↓
Editor emits 'editor:content.change'
    ↓
EditorViewDOM calls render() and re-renders
```

## Step-by-step details

### 1. Event listener setup (init)

**Location**: `setupEventListeners()` (line 244-290)

```typescript
// Input events
this.contentEditableElement.addEventListener('input', this.handleInput.bind(this));
this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));

// Composition events (IME: Korean, Japanese, Chinese input)
this.contentEditableElement.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
this.contentEditableElement.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
this.contentEditableElement.addEventListener('compositionend', this.handleCompositionEnd.bind(this));

// Re-render on content change
this.editor.on('editor:content.change', (e: any) => {
  if (this._isComposing) return; // skip during IME composition
  this.render();
  this.applyModelSelectionWithRetry();
});
```

**MutationObserver setup** (line 95):
```typescript
this.mutationObserverManager.setup(this.contentEditableElement);
```

### 2. Detect user input

#### 2-1. Plain text input (Latin letters, numbers, etc.)

**Flow:**
1. User types
2. Browser fires `input`
3. `handleInput()` runs (line 344-346)
   ```typescript
   handleInput(event: InputEvent): void {
     this.inputHandler.handleInput(event); // logging only
   }
   ```
4. Browser applies the text change to the DOM

#### 2-2. IME input (Korean, Japanese, Chinese)

**Flow:**
1. `compositionstart` → `handleCompositionStart()` (line 352-356)
   - set `_isComposing = true`
   - block model updates while composing

2. `compositionupdate` → `handleCompositionUpdate()` (line 358-361)
   - intermediate states (e.g., "ㅎㅏㄴ" → "han")
   - do not update the model yet

3. `compositionend` → `handleCompositionEnd()` (line 363-370)
   - set `_isComposing = false`
   - commit pending changes
   - re-render and restore selection

### 3. DOM change detection (MutationObserver)

**Location**: `mutation-observer-manager.ts`

```typescript
// MutationObserver detects DOM change
onTextChange: (event: any) => {
  // Forward to InputHandler
  this.inputHandler.handleTextContentChange(
    event.oldText,
    event.newText,
    event.target
  );
}
```

**Key points:**
- Fires **after** the browser applies DOM changes
- Compares `oldText` vs `newText` to find changes
- Uses `data-bc-sid` on `target` to identify the model node (logging; actual extraction happens in InputHandler)

**Log example:**
```
[MO] onTextChange {
  oldText: "Hello",
  newText: "HelloW",
  nodeId: "text-7",        // logging
  nodeType: "inline-text"  // logging
}
```

### 4. Text change handling (InputHandler)

**Location**: `event-handlers/input-handler.ts` → `handleTextContentChange()` (line 74-239)

#### 4-1. Pre-checks (sequential guards)

```typescript
// 1. filler <br> check (cursor stabilization)
if (target.nodeType === Node.ELEMENT_NODE) {
  const el = target as Element;
  const hasFiller = el.querySelector('br[data-bc-filler="true"]');
  if (hasFiller) {
    console.log('[Input] SKIP: filler <br> detected');
    return;
  }
}

// 2. No text change
if (oldText === newText) {
  console.log('[Input] SKIP: no text change');
  return;
}

// 3. Ensure model node ID (using closest('[data-bc-sid]'))
const textNodeId = this.resolveModelTextNodeId(target);
if (!textNodeId) {
  console.log('[Input] SKIP: untracked text (no nodeId)');
  return; // not trackable
}

// 4. Check IME composition state
if (this.isComposing) {
  console.log('[Input] SKIP: composition in progress, storing pending');
  // store pending and process later
  this.pendingTextNodeId = textNodeId;
  this.pendingOldText = oldText;
  this.pendingNewText = newText;
  // fallback commit if compositionend is missed
  this.pendingTimer = setTimeout(() => this.commitPendingImmediate(), 400);
  return;
}

// 5. Only handle collapsed selections
if (selection.length !== 0) {
  console.log('[Input] SKIP: range selection (not collapsed)');
  return;
}

// 6. Verify active text node (avoid cursor jumping)
// if activeTextNodeId is null, skip this check (initial input)
if (this.activeTextNodeId && textNodeId && textNodeId !== this.activeTextNodeId) {
  console.log('[Input] SKIP: inactive node');
  return;
}
```

#### 4-1-1. resolveModelTextNodeId() - extract nodeId

**Location**: `event-handlers/input-handler.ts` → `resolveModelTextNodeId()` (line 349-371)

```typescript
private resolveModelTextNodeId(target: Node): string | null {
  // If Text node, use parentElement; if Element, use as-is
  let el: Element | null = null;
  if (target.nodeType === Node.TEXT_NODE) {
    el = (target.parentElement as Element | null);
  } else if (target.nodeType === Node.ELEMENT_NODE) {
    el = target as Element;
  }
  
  if (!el) return null;
  
  // Use closest() to find nearest element with data-bc-sid
  const foundEl = el.closest('[data-bc-sid]');
  if (foundEl) {
    return foundEl.getAttribute('data-bc-sid');
  }
  
  return null;
}
```

**Key points:**
- Uses `closest('[data-bc-sid]')` to walk up parents and find the first element with `data-bc-sid`
- No `data-bc-stype` check, only `data-bc-sid`
- Simple and efficient via native DOM API

#### 4-2. Fetch model data

```typescript
// Fetch current node info from the model
const modelNode = (this.editor as any).dataStore?.getNode?.(textNodeId);
if (!modelNode) {
  console.log('[Input] SKIP: model node not found');
  return;
}

const oldModelText = modelNode.text || '';
const modelMarks = modelNode.marks || [];
const decorators = (this.editor as any).getDecorators?.() || [];

console.log('[Input] model data retrieved', {
  oldModelText: oldModelText.slice(0, 20),
  modelMarksCount: modelMarks.length,
  decoratorsCount: decorators.length
});
```

**Key points:**
- Lookup via `dataStore.getNode(textNodeId)`
- Early return if missing
- Collect text, marks, decorators

#### 4-3. Efficient edit handling

**Location**: `utils/efficient-edit-handler.ts` → `handleEfficientEdit()`

```typescript
const editResult = handleEfficientEdit(
  textNode,        // DOM text node
  oldText,         // text before DOM change
  newText,         // text after DOM change
  oldModelText,    // original model text
  modelMarks,      // model marks
  decorators       // model decorators
);
```

**Behavior:**
1. Reconstruct full text from the DOM text node
2. Detect change region (common prefix/suffix)
3. Auto-adjust mark ranges on insert/delete
4. Auto-adjust decorator ranges on insert/delete
5. Return new text, adjusted marks/decorators

**Return value:**
```typescript
{
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
}
```

#### 4-4. Model update (transaction)

```typescript
// Efficient mark change detection (faster than JSON.stringify)
const marksChanged = marksChangedEfficient(modelMarks, editResult.adjustedMarks);

console.log('[Input] executing transaction', {
  nodeId: textNodeId,
  textLength: editResult.newText.length,
  marksChanged
});

// Update text and marks together
this.editor.executeTransaction({
  type: 'text_replace',
  nodeId: textNodeId,
  start: 0,
  end: oldModelText.length,
  text: editResult.newText,
  ...(marksChanged ? { marks: editResult.adjustedMarks } : {})
});

// Update decorators if changed
const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
if (decoratorsChanged && (this.editor as any).updateDecorators) {
  console.log('[Input] updating decorators', { count: editResult.adjustedDecorators.length });
  (this.editor as any).updateDecorators(editResult.adjustedDecorators);
}

console.log('[Input] handleTextContentChange END - transaction executed');
```

**Key points:**
- `marksChangedEfficient()` detects mark changes without heavy stringify
- Include marks in the transaction only when changed
- Decorators update is separate and conditional

### 5. Editor transaction handling

**Location**: `packages/editor-core/src/editor.ts` → `executeTransaction()`

```typescript
executeTransaction(transaction: Transaction): void {
  // 1. Apply changes to the model
  this._applyBasicTransaction(transaction);
  
  // 2. Add to history
  this._addToHistory(this._document);
  
  // 3. Emit events
  this.emit('transactionExecuted', { transaction });
  this.emit('editor:content.change', { content: this.document, transaction });
  
  // 4. Emit selection change when provided
  if (transaction.selectionAfter) {
    this.emit('editor:selection.model', transaction.selectionAfter);
  }
}
```

### 6. Re-render (EditorViewDOM)

**Location**: `editor-view-dom.ts` → `render()` (line 803-1022)

**Trigger**: `editor:content.change` (line 274-283)

```typescript
this.editor.on('editor:content.change', (e: any) => {
  if (this._isComposing) {
    // skip re-render during IME composition
    return;
  }
  
  // Full re-render (diff-based)
  this.render();
  
  // Restore selection
  this.applyModelSelectionWithRetry();
});
```

**render() behavior:**
1. Fetch model data (`editor.getDocumentProxy()`)
2. Collect decorators (local + remote + generator)
3. Collect selection info (for preservation)
4. Render content layer (sync)
5. Render other layers (async, requestAnimationFrame)

## Special cases

### IME composition

**Problem:** Browser mutates DOM multiple times during IME; only the final composed text should update the model.

**Solution:**
1. Set `_isComposing = true` at `compositionstart`
2. In `handleTextContentChange`, store pending while composing
3. At `compositionend`, call `commitPendingImmediate()` to apply final text
4. In the `editor:content.change` handler, skip re-render when `_isComposing`

### Range selection

**Problem:** If text is selected, typing deletes the selection and inserts new text.

**Solution:**
```typescript
// Handle only collapsed selections
if (selection.length !== 0) {
  this.editor.emit('editor:input.skip_range_selection', selection);
  return;
}
```

**Note:** Range delete/insert is handled in `NativeCommands`.

### Auto-adjusting marks/decorators

**Problem:** Insert/delete in the middle shifts mark/decorator ranges.

**Solution:** `handleEfficientEdit()`
1. Detect change region (common prefix/suffix)
2. Adjust mark ranges by inserted length
3. Adjust decorator ranges by inserted length

**Example:**
```
Original: "Hello [bold]World[/bold]"
      (marks: [{type: 'bold', start: 6, end: 11}])

Insert "Beautiful " after "Hello "
→ "Hello Beautiful [bold]World[/bold]"
→ marks: [{type: 'bold', start: 16, end: 21}]  // +10 offset
```

## Key takeaways

1. **Avoid double handling**: `input` is logging only; MutationObserver drives processing.
2. **Node ID extraction**: `closest('[data-bc-sid]')` is simple and fast.
3. **IME support**: Block model updates during composition; commit only when done.
4. **Efficient edit detection**: Uses LCP/LCS-style detection for precise ranges.
5. **Auto adjustment**: Marks and decorators shift automatically; no manual fixes.
6. **Render optimization**: Skip re-render while composing to avoid churn.
7. **Verbose logging**: Stepwise logs make debugging straightforward.

## Log flow (normal case)

```
1. [MO] onTextChange {oldText, newText, nodeId, nodeType}
   ↓
2. [Input] handleTextContentChange START {oldText, newText, ...}
   ↓
3. [Input] resolved textNodeId {textNodeId, selectionLength, ...}
   ↓
4. [Input] model data retrieved {oldModelText, modelMarksCount, ...}
   ↓
5. [Input] edit result {newText, marksChanged, marksCount, ...}
   ↓
6. [Input] executing transaction {nodeId, textLength, marksChanged}
   ↓
7. [Editor] executeTransaction {type: 'text_replace'}
   ↓
8. [EditorViewDOM] content.change event received {isComposing, willRender, ...}
   ↓
9. [EditorViewDOM] content.change -> render with diff
   ↓
10. [EditorViewDOM.render] START rendering content
   ↓
11. [Input] handleTextContentChange END - transaction executed
```

## Debug checklist

If a log is missing, the issue is at that stage:

- ❌ No `[MO] onTextChange` → MutationObserver not set or not firing
- ❌ `textNodeId: null` in `[Input] resolved textNodeId` → missing `data-bc-sid`
- ❌ `[Input] SKIP: composition in progress` → IME (expected; stored pending)
- ❌ `[Input] SKIP: range selection` → range input path (expected; handled by NativeCommands)
- ❌ `[Input] SKIP: inactive node` → `activeTextNodeId` not matching
- ❌ No `[Input] executing transaction` → hit one of the SKIP guards
- ❌ No `[EditorViewDOM] content.change` → transaction did not execute
