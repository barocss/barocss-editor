## Keyboard Navigation & Selectable Node Spec (Model / editor-view-dom)

This doc defines how to use `editable` / `selectable` / `block` info when moving selection with the keyboard.

- Backspace / DeleteForward behaviors are already defined via `DeleteExtension` + `DataStore`.
- Here we focus on what happens when pressing Arrow keys (← → ↑ ↓) and Tab:
  - Moving the text cursor (RangeSelection)
  - Moving to select whole nodes (NodeSelection)

---

## 1. Core concepts

### 1.1 Editable vs Selectable (summary)

- **Editable Node**
  - `DataStore.isEditableNode(nodeId) === true`
  - The cursor can enter with Backspace / DeleteForward / Arrow keys
  - Examples:
    - Text nodes (`typeof node.text === 'string'`)
    - Blocks with `editable: true` (e.g., codeBlock) where inner text is editable

- **Selectable Node**
  - `DataStore.isSelectableNode(nodeId) === true`
  - The entire node can be selected via click or keyboard move
  - Examples:
    - Inline image (`group: 'inline', atom: true, no text`)
    - Table block, widget block (`group: 'block', selectable: true`)

### 1.2 Selection types

- **ModelRangeSelection**
  - Text range or caret position
  - `type: 'range'`, `startNodeId`, `startOffset`, `endNodeId`, `endOffset`, `collapsed`

- **ModelNodeSelection**
  - Whole-node selection
  - `type: 'node'`, `nodeId`

editor-view-dom uses `DOMSelectionHandler` to convert:

- DOM Selection ↔ ModelRangeSelection / ModelNodeSelection

### 1.3 Shift / Multi-node selection: staged goals

- **Phase 1 (current goal)**:
  - Keyboard moves (Arrow, Backspace, DeleteForward) are handled only as **ModelRangeSelection**.
  - Shift + Arrow only extends RangeSelection; no MultiNodeSelection / NodeSelection + Shift yet.
  - NodeSelection / MultiNodeSelection is primarily mouse + modifier (Ctrl/Cmd + click).
- **Phase 2 (later)**:
  - Define rules to build MultiNodeSelection via keyboard (e.g., from NodeSelection, Shift + Arrow adds adjacent nodes).
  - Needs coordination with toolbar / component manager / selection-system; handle in a later spec.

---

## 2. Role of editor-view-dom

### 2.1 Common pattern (same as Backspace / Delete)

editor-view-dom does not interpret key semantics directly. It always:

1. **Convert DOM Selection → Model Selection**
   - `this.selectionHandler.convertDOMSelectionToModel(domSelection)`
2. **Dispatch the appropriate command**
   - Backspace: `editor.executeCommand('backspace', { selection: modelSelection })`
   - Delete: `editor.executeCommand('deleteForward', { selection: modelSelection })`
   - Arrows/Tab:
     - `editor.executeCommand('moveCursorLeft',  { selection: modelSelection })`
     - `editor.executeCommand('moveCursorRight', { selection: modelSelection })`
     - `editor.executeCommand('moveCursorUp',    { selection: modelSelection })`
     - `editor.executeCommand('moveCursorDown',  { selection: modelSelection })`

> Principle: editor-view-dom only handles DOM↔Model selection conversion and command dispatch. Deciding where to move/what to select is owned by the Extension or core command.

### 2.2 Applying the selection

When a command decides on ModelSelection or ModelNodeSelection:

1. `SelectionManager` updates internal selection state.
2. editor-view-dom `SelectionHandler` reflects it into DOM Selection:
   - RangeSelection → text caret/range
   - NodeSelection → highlight/select the entire node DOM (e.g., wrapper div)

---

## 3. MoveSelectionExtension (working name)

Keyboard moves are handled in a separate Extension, here called **MoveSelectionExtension**.

### 3.1 Responsibilities

MoveSelectionExtension registers and implements:

- `moveCursorLeft`
- `moveCursorRight`
- `moveCursorUp`
- `moveCursorDown`

Each command:

1. Receives the current selection (range / node).
2. Uses `DataStore` helpers to decide the next target:
   - `getPreviousEditableNode`, `getNextEditableNode`
   - `isSelectableNode`, `isEditableNode`
   - `getParent`, `getChildren`
3. Builds the final ModelSelection / ModelNodeSelection and passes it to `SelectionManager`.

### 3.2 Horizontal moves (Left / Right)

#### 3.2.1 When in RangeSelection (cursor/range inside text)

**Case 1: Simple move inside the same text node**

- Within the same text node, reuse selection-handler’s **text offset algorithm**.
  - If `startOffset > 0`:
    - Left: `startOffset - 1`
  - If `startOffset < textLength`:
    - Right: `startOffset + 1`

**Case 2: At text boundary, move to adjacent node**

- Left, at `startOffset === 0`:
  1. `const prevEditable = dataStore.getPreviousEditableNode(startNodeId)`
  2. If `prevEditable` is:
     - **editable** → move RangeSelection to the **last text offset** of that node
     - **not editable but selectable** → switch to `ModelNodeSelection` (`{ type: 'node', nodeId: prevEditable }`)

- Right, at `startOffset === textLength`:
  1. `const nextEditable = dataStore.getNextEditableNode(startNodeId)`
  2. If `nextEditable` is:
     - editable → move RangeSelection to **offset 0** of that node
     - not editable but selectable → switch to `ModelNodeSelection`

> Check “not editable but selectable” via `!isEditableNode(nextId) && isSelectableNode(nextId)`.

#### 3.2.1-Shift RangeSelection expansion (Shift + Left / Shift + Right)

- Principle:
  - Shift + Arrow always **extends RangeSelection only**.
  - Keyboard does not yet create NodeSelection / MultiNodeSelection.

- **Within the same node**:
  - Shift + Right: increment the focus offset (`endOffset + 1`)
  - Shift + Left: decrement the focus offset (`startOffset - 1`)

- **Crossing node boundaries**:
  - Right at end of text with Shift:
    - `getNextEditableNode(startNodeId)` to find the next text node.
    - If it exists, extend to cross-node range (e.g., `selectRangeMulti(startNodeId, startOffset, nextNodeId, 1)`).
  - Left at start of text with Shift:
    - `getPreviousEditableNode(startNodeId)` to find the previous text node.
    - Extend through that node’s last character.

- **Shift + Arrow on non-text like inline images**:
  - Do not expand to NodeSelection / MultiNodeSelection in this phase.
  - Exact UX for inline images + Shift will be defined after selection-system / multi-node-spec is finalized.

#### 3.2.1-Ctrl/Alt combos (Ctrl/Alt + Left / Right)

- **Current phase**:
  - Ctrl/Alt does not change the logic; only Shift matters.
  - `Ctrl+ArrowLeft/Right`, `Alt+ArrowLeft/Right` →
    - Without Shift: same as `moveCursorLeft/Right` (single-char move)
    - With Shift: same as `Shift+ArrowLeft/Right` (range expand)
- **Word-wise navigation**:
  - Word-boundary moves (`Ctrl+Arrow`, `Ctrl+Shift+Arrow`; on macOS `Alt+Arrow`) will be added later after DataStore word-boundary/i18n decisions.
  - Until then, Ctrl/Alt modifiers have no extra meaning in MoveSelectionExtension.

#### 3.2.2 NodeSelection state (whole node selected) – later phase

Current implementation focuses on **RangeSelection** only; keyboard does not create NodeSelection / MultiNodeSelection yet.

Future rules could include:

- From NodeSelection, Left/Right:
  - Switch to RangeSelection in previous/next editable node
  - Or move NodeSelection to adjacent selectable node
- Shift + Left/Right:
  - Build MultiNodeSelection including adjacent selectable nodes

These require a defined multi-node selection spec (toolbar, component manager, selection-system) before implementation.

---

## 4. Vertical moves (Up / Down)

Vertical moves ideally match DOM line concepts, but that’s complex.

### 4.1 Current phase: keep browser-native Up/Down

- For now, Up/Down uses **browser default caret movement**.
- editor-view-dom:
  - Left/Right, Backspace, Delete are intercepted (model-first) and dispatched as commands.
  - Up/Down is left to native behavior.
- When converting DOMSelection → ModelSelection after Up/Down:
  - Normalize to the closest possible ModelSelection,
  - Do not guarantee line-accurate positioning.

This lets us focus on horizontal moves/deletes/selectables while observing Up/Down sync issues.

### 4.2 Later phase: model-first Up/Down

Future approach:

1. Use `getBoundingClientRect()` to read caret x/y.
2. selection-handler finds the nearest text/inline position on the above/below line using that x.
3. Convert to ModelSelection and reset DOMSelection accordingly.

This will be tackled after we observe caret behavior in table/codeBlock/multi-column layouts, etc.

---

## 5. Interaction with Backspace / DeleteForward

Keyboard move and delete share these rules:

- **Editable-based search**:
  - Backspace: `getPreviousEditableNode`
  - DeleteForward: `getNextEditableNode`
  - MoveSelection: same helpers to pick the next caret position

- **Selectable handling**:
  - Delete / Backspace:
    - Selectable + editable nodes like inline-image are handled via `deleteNode / mergeTextNodes` (already implemented/tested).
  - MoveSelection:
    - When Arrow hits inline-image:
      - Move to **NodeSelection only**, no delete.
      - Pressing Delete then triggers DeleteExtension `deleteNode`.

Separation of concerns:

- MoveSelectionExtension owns “where to move / what to select”.
- DeleteExtension owns “how to remove/merge the selected target”.

---

## 6. Implementation & validation plan

1. **Lock the spec (this doc)**
   - Finalize move rules based on editable/selectable/block.

2. **Add MoveSelectionExtension skeleton (`@barocss/extensions`)**
   - Register `moveCursorLeft/Right/Up/Down` commands in `onCreate`.
   - Minimal implementation:
     - RangeSelection + intra-text moves (offset ±1 in same node)
     - At text boundary, call `getPreviousEditableNode` / `getNextEditableNode`:
       - editable → RangeSelection
       - selectable → NodeSelection

3. **Wire into editor-view-dom**
   - In `EditorViewDOM.handleArrowLeft/Right/Up/Down` (or key handler):
     - Convert DOMSelection → ModelSelection
     - Call `editor.executeCommand('moveCursorLeft', { selection })`, etc.

4. **Unit tests (extensions package)**
   - Similar to Backspace/deleteForward tests:
     - fake DataStore + mocks for `getPreviousEditableNode`, `getNextEditableNode`, `isSelectableNode`.
     - Verify selections/operations produced by MoveSelectionExtension.

5. **Integration tests (optional)**
   - At editor-view-dom level:
     - Build simple DOM + selection
     - Call handleArrowLeft/Right → ModelSelection change → DOMSelection reflection; snapshot the flow.

With this plan, MoveSelectionExtension and editor-view-dom keyboard navigation can be delivered in stages while keeping delete behaviors cleanly separated.
