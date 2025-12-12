# InputHandler and EfficientEditHandler Role Separation

## Overview

Text input processing is split into two layers:

1. **`input-handler.ts`** (InputHandlerImpl): Event handling and state management layer
2. **`efficient-edit-handler.ts`** (handleEfficientEdit): Text change analysis and range adjustment layer

## Role separation principles

### Separation of concerns

- **InputHandler**: Decides "when" and "under what conditions" to process
- **EfficientEditHandler**: Handles "how" to analyze and adjust text changes

---

## 1. `input-handler.ts` (InputHandlerImpl)

### Role: Event handling and state management

**Main responsibilities:**
1. Receive and filter DOM events
2. Manage IME composition state
3. Manage pending state (defer changes during composition)
4. Validate selection and track active nodes
5. Execute transactions and emit events

### Main methods

#### `handleTextContentChange(oldValue, newValue, target)`
**Role**: Entry point called from MutationObserver

**Processing flow:**
```
1. Pre-validation
   - Check for filler <br>
   - Extract sid (resolveModelTextNodeId)
   - Verify model node exists

2. State-based filtering
   - IME composing? → store in pending
   - Range selection? → skip
   - Inactive node? → skip

3. Collect model data
   - oldModelText (by sid)
   - modelMarks
   - decorators

4. Call EfficientEditHandler
   - Delegate change analysis to handleEfficientEdit()

5. Execute transaction
   - editor.executeTransaction()
   - Update decorators
```

**Key points:**
- `oldValue`/`newValue` are individual text node values, but not actually compared
- sid-based full text comparison is done in `handleEfficientEdit`
- State management (composing, pending, activeTextNodeId) is core

#### `handleCompositionStart/Update/End()`
**Role**: Manage IME composition state

- `compositionstart`: `isComposing = true`, reset pending
- `compositionupdate`: Do nothing (let browser handle)
- `compositionend`: `isComposing = false`, call `commitPendingImmediate()`

#### `commitPendingImmediate()`
**Role**: Process deferred changes during IME composition

- Process pending changes via `handleEfficientEdit`
- Apply only final text to model after composition completes

#### `resolveModelTextNodeId(target)`
**Role**: Extract sid from DOM node

- Use `closest('[data-bc-sid]')`
- If Text node, use parentElement; if Element, use as-is

### State variables

```typescript
private isComposing = false;              // IME composition in progress
private activeTextNodeId: string | null; // Current active text node (cursor position)
private pendingTextNodeId: string | null; // Pending node ID
private pendingOldText: string;          // Pending old text
private pendingNewText: string;          // Pending new text
private pendingTimer: any;               // Pending timer (400ms)
```

---

## 2. `efficient-edit-handler.ts` (handleEfficientEdit)

### Role: Text change analysis and range adjustment

**Main responsibilities:**
1. Reconstruct full text by sid
2. Compute precise change ranges using text-analyzer
3. Normalize Selection offset to Model offset
4. Auto-adjust Marks/Decorators ranges

### Main functions

#### `handleEfficientEdit(textNode, oldValue, newValue, oldModelText, modelMarks, decorators)`
**Role**: Analyze and adjust text changes

**Processing flow:**
```
1. Extract sid
   - Find inline-text node with findInlineTextNode()
   - Extract data-bc-sid attribute

2. Build Text Run Index
   - Collect all text nodes with buildTextRunIndex()
   - Merge multiple text nodes split by marks/decorators into one

3. Reconstruct full text by sid
   - Merge all text nodes with reconstructModelTextFromRuns()
   - Compare oldModelText vs newText

4. Normalize Selection offset
   - Convert DOM offset → Model offset
   - Use convertDOMToModelPosition()

5. Call text-analyzer
   - Compute precise change range with analyzeTextChanges()
   - Apply LCP/LCS + Selection biasing

6. Convert TextChange → TextEdit
   - Convert with createEditInfoFromTextChange()
   - Adjust marks/decorators ranges
```

**Key points:**
- `oldValue`/`newValue` are not used (reference only)
- Always compare using sid-based full text
- Leverage text-analyzer's advanced algorithms

#### `createEditInfoFromTextChange(...)`
**Role**: Convert TextChange to TextEdit

- `TextChange` (text-analyzer result) → `TextEdit` (internal system format)
- Call `adjustMarkRanges()` / `adjustDecoratorRanges()`

#### `reconstructModelTextFromRuns(runs)`
**Role**: Reconstruct full text from Text Run Index

- Merge all text node `textContent` in order
- Unify multiple text nodes split by marks/decorators into one text

---

## Data flow

```
MutationObserver detects
    ↓
InputHandler.handleTextContentChange()
    ↓
[State validation and filtering]
    - IME composing? → store pending
    - Range selection? → skip
    - Inactive node? → skip
    ↓
[Collect model data]
    - oldModelText (by sid)
    - modelMarks
    - decorators
    ↓
EfficientEditHandler.handleEfficientEdit()
    ↓
[Reconstruct full text by sid]
    - buildTextRunIndex() → collect all text nodes
    - reconstructModelTextFromRuns() → merge full text
    ↓
[Normalize Selection]
    - Convert DOM offset → Model offset
    ↓
[Call text-analyzer]
    - analyzeTextChanges() → LCP/LCS + Selection biasing
    ↓
[Adjust ranges]
    - adjustMarkRanges()
    - adjustDecoratorRanges()
    ↓
[Return result]
    - newText
    - adjustedMarks
    - adjustedDecorators
    - editInfo
    ↓
InputHandler executes transaction
    - editor.executeTransaction()
    - Update decorators
```

---

## Key differences

| Item | InputHandler | EfficientEditHandler |
|------|-------------|---------------------|
| **Responsibility** | "when", "under what conditions" | "how" to analyze and adjust |
| **Input** | DOM events, MutationObserver | sid, oldModelText, modelMarks |
| **State management** | ✅ (composing, pending, activeNodeId) | ❌ (pure function) |
| **Filtering** | ✅ (composing, Range selection, inactive node) | ❌ |
| **Text analysis** | ❌ | ✅ (LCP/LCS, Selection biasing) |
| **Range adjustment** | ❌ | ✅ (marks/decorators) |
| **Transaction execution** | ✅ | ❌ |

---

## Design principles

### 1. Single Responsibility Principle (SRP)
- **InputHandler**: Handles only event processing and state management
- **EfficientEditHandler**: Handles only text analysis and range adjustment

### 2. Separation of concerns
- **State management** vs **pure computation**
- **Condition validation** vs **data transformation**

### 3. Reusability
- `handleEfficientEdit` is designed as a pure function, reusable elsewhere
- `InputHandler` is tied to Editor instance

### 4. Testability
- `EfficientEditHandler` is a pure function, easy to unit test
- `InputHandler` has complex state logic, but each method can be tested separately

---

## Improvement points

### Current structure advantages
1. ✅ Clear responsibility separation
2. ✅ EfficientEditHandler reusability
3. ✅ Leverages text-analyzer package
4. ✅ Stable IME composition handling

### Potential improvements
1. `InputHandler` imports `analyzeTextChanges` but doesn't use it (can be removed)
2. `commitPendingImmediate` also uses `handleEfficientEdit`, maintaining consistency
3. Error handling and logging consistency can be improved

---

## Summary

- **InputHandler**: **Gatekeeper** that decides "when to process"
- **EfficientEditHandler**: **Analysis engine** that handles "how to analyze"

This separation leads to:
- Better code readability
- Easier testing
- Better maintainability
- Better reusability
