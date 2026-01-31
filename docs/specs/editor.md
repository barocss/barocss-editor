# Editor-Wide Specification

This document states the **editor-wide behavior and guarantees**: document model, selection semantics, and operation semantics that span model, extensions, and view. Package-level details live in each package’s `SPEC.md` or in linked architecture docs.

---

## 1. Document model

### 1.1 Tree structure

- The document is a **tree of nodes**. Each node has an identity (e.g. `sid`), a type (`stype`), and optional content (children or text).
- **Block nodes**: contain a list of child nodes (e.g. paragraph contains inline nodes). Blocks are the unit of “line” or “block” in the UI.
- **Text nodes**: leaf nodes that hold a string. Editable text lives only in text nodes.
- **Marks**: applied to ranges of text (e.g. bold, italic). Stored and applied per range; operations (e.g. insertText, deleteTextRange) preserve or transform marks as defined per operation.

Schema (e.g. `@barocss/schema`) defines allowed node types, groups (block vs inline), and attributes. The datastore stores nodes; the model applies operations and resolves selection.

### 1.2 Data flow (high level)

```
User input / Command → Editor (transaction) → Model operations → Datastore (overlay → commit)
                                                      ↓
                                              selectionAfter
                                                      ↓
                              Editor Core (updateSelection) → View (DOM/React selection)
```

- **Transaction**: one or more operations run in a single transaction; content changes are committed together; one **selectionAfter** is produced and applied to the view when `applySelectionToView !== false`.
- **Selection resolution**: after all operations run, the model resolves the final selection (e.g. from `context.selection.current` or from “new block” rules). That result is `selectionAfter`. See `docs/transaction-selection.md` and `docs/selection-application-flow.md`.

---

## 2. Selection semantics

### 2.1 Model selection

- **ModelSelection**: identifies a range in the document (e.g. `type: 'range'`, `startNodeId`, `startOffset`, `endNodeId`, `endOffset`). Collapsed selection (caret) is a range with start equals end.
- **selectionAfter**: the selection that the model outputs after a transaction. It is applied to the view (Editor Core → DOM/React) when `applySelectionToView !== false`.

### 2.2 Invariants (guarantees)

- **selectionAfter** must reference **valid nodes and offsets** after the transaction (e.g. node ids exist, offsets within node bounds).
- For operations that create or focus a new block (e.g. insertParagraph), **selectionAfter** must place the caret in a **text node** when the document has editable text there (so that subsequent typing targets the correct node). Concretely: `selectionAfter.nodeId` (or the start node of the range) should refer to a text node when the intent is “caret in that block’s text”. See `packages/model/SPEC.md` and operation exec tests.

### 2.3 When selection is applied

- Selection is **resolved once per transaction**, after all operations run and before commit. Only the result (`selectionAfter`) is passed to the editor and then to the view. See `docs/transaction-selection.md`.

---

## 3. Operation semantics (editor-wide)

Operations are defined in `@barocss/model`; their concrete inputs/outputs and invariants are in `packages/model/SPEC.md` and in `packages/model/test/operations/*.exec.test.ts`. This section states **high-level, cross-layer** guarantees that the editor relies on.

### 3.1 insertParagraph

- **Input**: current selection (from transaction context); optional payload (e.g. `blockType`, `selectionAlias`).
- **Behavior**: Inserts a new block (paragraph or same type as current) at a position derived from the selection (block end, block start, or split at caret). The caret is moved to the new block (or the start of the split).
- **Guarantee**: After the transaction, **selectionAfter** places the caret in a **text node** of the new or focused block (so that the next keypress goes into that text). The exec tests assert this (e.g. `selectionAfter.nodeId` is a text node id, `firstTextNodeId` is defined).

### 3.2 insertText

- **Input**: current selection; text to insert; optional marks.
- **Behavior**: Inserts the given text at the selection; may merge/split text nodes. Selection is updated to the end of the inserted text.
- **Guarantee**: **selectionAfter** is a valid range in a text node (the inserted or adjacent text).

### 3.3 deleteTextRange / deleteContentBackward

- **Behavior**: Removes content in the given range or backward from the caret. Selection is updated to the resulting position.
- **Guarantee**: **selectionAfter** is valid and points into a text node when the resulting block still has text.

### 3.4 List operations (bullet / ordered list)

- **Schema**: The editor schema may define `list` (content: listItem+, attrs: type = "bullet" | "ordered") and `listItem` (content: block+). When present, list blocks are the unit of bullet/numbered list in the UI.
- **toggleList / wrapInList** (or equivalent): Wrap the current block(s) in a list (bullet or ordered), or unwrap if the selection is already inside a list. Input: list type (bullet | ordered); selection from context. Output: document change; **selectionAfter** in a text node of the focused list item.
- **splitListItem**: When the caret is inside a list item (e.g. in its paragraph’s text), create a new list item after the current one (with an empty paragraph or block), and move the caret into that new item’s first text node. Behavior is analogous to insertParagraph but in list context. **Guarantee**: **selectionAfter** places the caret in a **text node** of the new list item (so that the next keypress goes into that text). Exec tests must assert this (e.g. selectionAfter.nodeId is a text node id).

If the schema does not define list/listItem, these operations are not applicable; the implementation checklist should add schema nodes when the app schema is extended for lists.

### 3.5 Other operations

- **toggleMark**, **setNode**, **transformNode**, etc.: each has inputs/outputs and invariants defined in the model package. Extension commands compose these operations; the view maps input events to commands. For each operation, the model’s exec tests and `packages/model/SPEC.md` are the source of truth.

---

## 4. User-visible behavior (summary)

- **Typing**: Input events (e.g. insertText, deleteContentBackward) are mapped to model operations by the editor-view; the model updates the document and produces **selectionAfter**; the view applies the selection to the DOM so the caret is in the right place.
- **Enter (insert paragraph)**: Command runs insertParagraph (or equivalent); a new block is inserted and the caret moves into its text node so that typing continues there.
- **Enter (in list item)**: When the caret is inside a list item, the command runs splitListItem (or equivalent); a new list item is created and the caret moves into its text node.
- **Block type / list / marks**: Commands run the corresponding model operations (setNode, toggleList, toggleMark, etc.); the document and selection are updated; the view re-renders and applies selection.

E2E tests (e.g. `apps/editor-react/tests/`) assert this behavior in the browser. When changing semantics, update the editor spec, the model spec (or operation spec), and the tests together.

---

## 5. References

- **Transaction and selection resolution**: `docs/transaction-selection.md`, `docs/selection-application-flow.md`
- **Model operations and invariants**: `packages/model/SPEC.md`, `packages/model/test/operations/*.exec.test.ts`
- **Architecture and package roles**: `docs/architecture-package-relationships.md`, `docs/README.md`
- **Portal (renderer-dom)**: `docs/dom/portal-system-spec.md`
