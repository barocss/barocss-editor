# Comparison of Deletion Handling Methods in Other Editors

## Approaches of Major Editors

### 1. ProseMirror
**Approach**: Model-First
- `preventDefault()` in `beforeinput` or `keydown`
- Change model first (`Transaction`)
- Update DOM based on changed model
- Calculate selection based on model and apply to DOM

**Deletion handling**:
```typescript
// 1. preventDefault() in beforeinput/keydown
// 2. Calculate deletion range in model
const tr = state.tr.delete(selection.from, selection.to);
// 3. Execute Transaction → DOM update
dispatch(tr);
// 4. Selection automatically applied from Transaction's selectionAfter
```

**Characteristics:**
- Model is always "source of truth"
- DOM is just representation of model
- Selection also based on model

---

### 2. Slate.js
**Approach**: Model-First
- `preventDefault()` in `beforeinput`
- Change model first (`Editor.operations`)
- Update DOM based on changed model
- Calculate selection based on model

**Deletion handling**:
```typescript
// 1. preventDefault() in beforeinput
// 2. Delete in model
Transforms.delete(editor, { at: selection });
// 3. DOM update via React rendering
// 4. Selection automatically synchronized based on model
```

**Characteristics:**
- React-based, so model change → re-render → DOM update
- Selection managed as model state

---

### 3. Lexical
**Approach**: Model-First
- `preventDefault()` in `beforeinput`
- Change Lexical node model first
- Update DOM based on changed model
- Calculate selection based on model

**Deletion handling**:
```typescript
// 1. preventDefault() in beforeinput
// 2. Delete in model
editor.update(() => {
  const selection = $getSelection();
  selection.removeText();
});
// 3. DOM update (handled internally)
// 4. Selection automatically synchronized based on model
```

**Characteristics:**
- Model is always "source of truth"
- DOM is representation of model

---

### 4. Quill
**Approach**: Hybrid
- Some use `beforeinput`
- Some use MutationObserver
- Delta model-centered

---

## Our Editor's Current Approach

**Approach**: DOM-First (MutationObserver-based)
- Do not `preventDefault()` in `beforeinput` (for deletion)
- Browser automatically changes DOM
- MutationObserver detects DOM changes
- Analyze DOM changes to update model

**Deletion handling**:
```typescript
// 1. keydown: Allow browser default behavior
// 2. Browser deletes text from DOM
// 3. MutationObserver detects DOM change
// 4. Analyze DOM change to update model
dataStore.range.deleteText(contentRange);
// 5. Read DOM selection to update model selection
```

**Characteristics:**
- Leverages browser default behavior
- Natural for IME input
- But synchronization between model and DOM is complex

---

## Problem: Selection Synchronization

### Current Problems
1. **Only DOM → model direction handled**: Read DOM selection to update model selection
2. **Model → DOM direction not handled**: After model deletion, do not set DOM selection based on model
3. **Timing issues**: Reading selection after DOM change but before model update gives incorrect value

### Solution
**When model is deleted**:
1. Calculate **model selection** based on deleted range
   - Move selection to deletion start position
2. Convert calculated **model selection to DOM selection**
3. **Apply DOM selection**

---

## Recommended Approach

### Option 1: Calculate Selection Based on Model (Recommended)
```typescript
// After deletion
const deletedRange = contentRange;
const modelSelection = {
  type: 'range',
  startNodeId: deletedRange.startNodeId,
  startOffset: deletedRange.startOffset,
  endNodeId: deletedRange.startNodeId,
  endOffset: deletedRange.startOffset,
  collapsed: true
};

// Convert model selection to DOM selection and apply
this.editorViewDOM.convertModelSelectionToDOM(modelSelection);
```

### Option 2: Maintain Browser Selection (Current Approach)
```typescript
// After deletion, read DOM selection to update model selection
const domSelection = window.getSelection();
const modelSelection = convertDOMSelectionToModel(domSelection);
this.editor.emit('editor:selection.change', { selection: modelSelection });
```

**Problems:**
- DOM selection may reflect state before model change
- Possible mismatch between model and DOM

---

## Conclusion

**Other editors:**
- Most use **Model-First** approach
- Change model first, then update DOM accordingly
- Calculate selection based on model and apply to DOM

**Our editor:**
- Currently uses **DOM-First** approach (MutationObserver-based)
- But **when model is deleted, should calculate selection based on model and apply to DOM**

**Recommendations:**
- Calculate selection based on model after deletion
- Convert calculated model selection to DOM selection and apply
- This maintains consistency between model and DOM
