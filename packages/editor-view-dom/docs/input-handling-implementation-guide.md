## Input Handling Implementation Guide (Event → DOM → Model Integration)

This document organizes how to apply the following two design documents to actual code.

- `input-event-editing-plan.md`  
- `dom-to-model-sync-cases.md`

Goals:
- Clearly specify which **package / class / function** to use to implement the `browser input → DOM → MutationObserver → DataStore → render` flow.

---

## 1. Global Architecture Overview

### 1.1 Responsibilities by Layer

- `apps/editor-test/src/main.ts`
  - Demo/test app bootstrap, create `Editor` + `EditorViewDOM`.

- `packages/editor-core`
  - `Editor` (command/History/event hub)
  - `DataStore` (document/marks/decorators/RangeOperations)
  - `Command`/`Extension` system

- `packages/editor-view-dom`
  - `EditorViewDOM` (DOM-based view + event layer)
  - `InputHandlerImpl` (input events → DOM/model sync)
  - SelectionManager (DOM selection ↔ model selection)
  - MutationObserver wrapper (`mutation-observer-manager.ts`)
  - Keymap/KeyBinding (key event handling)

- `packages/dom-observer`
  - Low-level `MutationObserver` helper (collects browser DOM changes)

- `packages/datastore`
  - `RangeOperations.replaceText` / `deleteText` / DecoratorOperations
  - mark operations/normalization

Rendering/reconciliation is already implemented, so we focus on "**input → DOM → model patch → render trigger**" here.

---

## 2. Input Event Layer Implementation (EditorViewDOM)

### 2.1 Core Class: `EditorViewDOM`

Location:
- `packages/editor-view-dom/src/editor-view-dom.ts`

Role:
- Registers event listeners on actual DOM node (`contenteditable` root).
- Creates/connects `InputHandlerImpl`, SelectionManager, KeymapManager.
- Receives `editor.emit('editor:content.change', ...)` and triggers render.

Required implementation/cleanup points:

1. **Event Listener Registration**
   - Register the following on DOM root inside `setupEventListeners()`:
     - `beforeinput`
     - `keydown`
     - `selectionchange` (usually on `document`)
   - Each event is passed to `InputHandlerImpl` or KeyBindingManager.

2. **SelectionManager Integration**
   - On DOM selection change:
     - Convert DOM → model selection (use existing selection utils)
     - `editor.selectionManager.setSelection(modelSelection)`
     - `editor.emit('editor:selection.change', { selection })`

3. **MutationObserverManager Integration**
   - Create `MutationObserverManager` instance when `EditorViewDOM` is created,
   - Connect with content root to pass DOM-origin changes to `InputHandlerImpl`.

---

## 3. InputHandler Implementation (Browser Events → DOM/Model)

### 3.1 Class: `InputHandlerImpl`

Location:
- `packages/editor-view-dom/src/event-handlers/input-handler.ts`

Role:
- Receives all three sources: `beforeinput` / `keydown` / MutationObserver,  
  and executes the pipeline defined in `input-event-editing-plan.md`.

Recommended interface (partially exists):

```ts
export class InputHandlerImpl {
  constructor(
    private readonly editor: Editor,
    private readonly view: EditorViewDOM,
    private readonly dataStore: DataStore,
  ) {}

  handleBeforeInput(event: InputEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
  handleDomMutations(mutations: MutationRecord[]): void;
}
```

### 3.2 `handleBeforeInput` Implementation Guidelines

Reference: `input-event-editing-plan.md` chapters 4, 6

- Handles:
  - Only **structure changes/history** like `insertParagraph`, `insertLineBreak`, `historyUndo`, `historyRedo`.
- Steps:
  1. Switch on `event.inputType`:
     - If structure change, `event.preventDefault()`
     - For text input/deletion, **do not prevent** and let browser handle.
  2. Get latest model selection from SelectionManager.
  3. Call DataStore/Command:
     - `insertParagraph` → ParagraphExtension/Block-related command (`editor.executeCommand('insertParagraph')`)  
       or directly `dataStore.range.splitNode(...)`.
     - `insertLineBreak` → `dataStore.range.insertText(..., '\n')` or insert line-break node.
     - `historyUndo/Redo` → `editor.history.undo()/redo()`.
  4. `editor.render()` + restore selection.

### 3.3 `handleKeyDown` Implementation Guidelines

- Role:
  - Handle shortcuts (Commands) via `KeyBindingManager` (Bold/Italic/Undo/Redo, etc.).
  - Generate string key with `getKeyString(event)` → `keyBindingManager.getBindings(key)`.
- Implementation location:
  - Key parsing: `getKeyString` util inside `EditorViewDOM` or separate util.
  - Binding lookup/execution: delegate to `KeyBindingManager` when implemented.

### 3.4 `handleDomMutations` Implementation Guidelines

Reference: `dom-to-model-sync-cases.md`

- Role:
  - Classify DOM-origin changes (C1~C4 + 8.x cases),  
    and call corresponding DataStore operations (`replaceText`, `deleteText`, marks/decorators adjustment, etc.).
- Flow:
  1. Iterate `mutations` and organize around `characterData` / `childList`.
  2. For each mutation:
     - Find which model node corresponds via target node's `data-bc-sid`.
     - Combine with DOM selection/previous selection info to determine which case (C1/C2/C3/C4/8.x).
  3. By case:
     - C1/C2 → `dataStore.range.replaceText(contentRange, newText)`
     - C3 → Try to recognize command pattern (`insertParagraph`, `mergeBlock`, etc.), otherwise fallback to text absorption.
     - C4 → Map styles/tags to marks/decorators.
  4. After model patch:
     - Call `editor.render()` if needed
     - Sync selection via SelectionManager.

---

## 4. Core APIs for DOM → Model Synchronization

### 4.1 DataStore: Text/Mark/Decorator Operations

Location:
- `packages/datastore/src/operations/range-operations.ts`

Core functions:
- `range.replaceText(contentRange, newText)`
  - Handles most text changes (C1/C2/IME final result, paste, auto-correction) with this one.
  - Internally:
    - Adjusts/merges mark ranges (`mark-operations`)
    - Adjusts decorator ranges (`DecoratorOperations`)
    - Cleans duplicate/empty marks with normalize option
- `range.deleteText(contentRange)`
  - Used for some C2/C3 cases like Backspace/Delete/word deletion.

### 4.2 SelectionManager

Location:
- `packages/editor-core` (Selection state)
- `packages/editor-view-dom` (DOM ↔ model conversion utils)

Role:
- Converts DOM selection → model selection on `selectionchange`
- Restores model selection → DOM selection after render
- Serves as the basis for `contentRange` calculation when determining C2/C3/C4.

### 4.3 dom-observer (Low-level MutationObserver)

Location:
- `packages/dom-observer`
- `packages/editor-view-dom/src/mutation-observer/mutation-observer-manager.ts`

Role:
- Creates actual `MutationObserver` and passes changes to registered callbacks.
- `EditorViewDOM` / `InputHandlerImpl` receive this callback and call `handleDomMutations`.

---

## 5. Where to Place Case Classification Logic

Reference:
- Case definitions: `dom-to-model-sync-cases.md` (C1~C4, 8.x)

Implementation location proposal:

1. **Add Helper Module**
   - Example file: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts`
   - Responsibility:
     - `classifyDomChange(mutations, selection, modelSnapshot) → { type: 'C1' | 'C2' | 'C3' | 'C4' | 'AUTO_LINK' | ... , payload }`
     - InputHandler only looks at this result and calls DataStore/Command.

2. **Use in InputHandlerImpl**
   - Inside `handleDomMutations`:

   ```ts
   const classification = classifyDomChange(mutations, selectionManager.current, dataStoreSnapshot);

   switch (classification.type) {
     case 'C1':
     case 'C2':
       dataStore.range.replaceText(classification.contentRange, classification.newText);
       break;
     case 'C3':
       // Execute commands like insertParagraph / mergeBlock
       break;
     case 'C4':
       // Update marks/decorators
       break;
     // ...
   }
   ```

This way, the connection point between case definitions (document) and actual implementation can be managed in one file.

---

## 6. Connection with IME/Korean Input

References:
- `input-event-editing-plan.md` chapter 7 (IME input handling strategy)
- `input-rendering-race-condition.md`
- `dom-to-model-sync-cases.md` 8.5

Implementation points:

1. Composition events are not used, but:
   - Use `beforeinput`'s `insertCompositionText` / `insertText` only as hints for "composing/composition complete".
2. In MutationObserver:
   - Ignore or defer intermediate changes during composition.
   - Only sync final DOM text at composition completion via C1/C2 path with `replaceText`.
3. SelectionManager:
   - After composition completes, move selection accurately to model selection,
   - Restore to DOM selection after render.

Key point:
- **Do not interfere with IME intermediate state as much as possible**,  
  and only synchronize final results from DOM → model.

---

## 7. Implementation Order (Practical Checklist)

1. Organize event/MutationObserver/SelectionManager connection structure in `EditorViewDOM`
2. In `InputHandlerImpl`:
   - Organize 3 entry points: `handleBeforeInput`, `handleKeyDown`, `handleDomMutations`
3. Add `dom-change-classifier.ts` (or similar module):
   - Implement C1~C4 + 8.x case classification helper
4. Verify DataStore operation paths:
   - `range.replaceText`, `deleteText`, marks/decorators normalization
5. Test from simple scenarios:
   - C1: single inline text input/deletion
   - C2: wide selection + overwrite
   - C3: paragraph split/merge via Enter/Backspace (`beforeinput` path)
   - C4: paste + basic mark conversion
6. Sequentially verify edge cases: IME/Korean input, auto-correction/links, DnD, etc.

This guide serves as a "bridge document" to connect design documents (`input-event-editing-plan.md`, `dom-to-model-sync-cases.md`) with actual code structure into one flow.

