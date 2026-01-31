# Model Package Specification

This document states the **contract and behavior** of `@barocss/model`: transaction execution, operation semantics, and selection resolution. Implementations and tests must satisfy these guarantees.

---

## 1. Role

- **Transaction**: run a list of operations in a single atomic unit (lock, overlay, commit). Produce one **TransactionResult** per execution (success, errors, selectionBefore, selectionAfter).
- **Operations**: each operation is defined with `defineOperation`; it receives payload and **TransactionContext** (dataStore, schema, selection). It may read/update context (e.g. selection, lastCreatedBlock) and must return a result (ok, error, optional selectionAfter per op).
- **Selection resolution**: after all operations run, the model resolves the final selection from context (e.g. lastCreatedBlock or context.selection.current). That value becomes **selectionAfter** in the result and is applied to the view when `applySelectionToView !== false`.

---

## 2. Transaction

### 2.1 Execution flow

1. Acquire lock, begin transaction, begin datastore overlay.
2. Create context (selection snapshot, schema).
3. Run each operation in order; each may update context (selection, lastCreatedBlock).
4. Resolve **selectionAfter** (after all ops): if context.lastCreatedBlock is set, selectionAfter = caret at start of that block’s first text node; else selectionAfter = context.selection.current.
5. End overlay, commit. Return TransactionResult (success, selectionBefore, selectionAfter, etc.).
6. If options.applySelectionToView !== false, call editor.updateSelection(selectionAfter).

### 2.2 TransactionResult

- **selectionBefore**: snapshot at start of transaction.
- **selectionAfter**: resolved after all operations; valid range (nodeIds exist, offsets in bounds). When the intent is “caret in a block’s text”, selectionAfter must reference a **text node** (so that view/typing target the correct node).

### 2.3 Options

- **applySelectionToView**: when true (default), selectionAfter is applied to the editor/view. When false, selection is not applied (e.g. remote sync, programmatic change).

---

## 3. Operations

### 3.1 Contract

- Each operation is registered with a type name and an execute function.
- **Input**: payload (from DSL or caller) and **TransactionContext** (dataStore, schema, selection, lastCreatedBlock, etc.).
- **Output**: result with at least `ok: boolean`; optional `error`, `selectionAfter` (per-op hint), `inverse` (for undo).
- Operations must use only datastore API and context; they must not call other operations directly. Content changes go through the overlay; selection updates go through context.selection.

### 3.2 Selection invariants (operations that create or focus a block)

- For operations that create a new block or move focus to a block (e.g. **insertParagraph**, **addChild**), the transaction’s **selectionAfter** must place the caret in a **text node** of that block when the block has editable text. So: selectionAfter.nodeId (or startNodeId) must be a text node id when the block contains text. This is asserted in exec tests (e.g. selectionAfter.nodeId is a text node id, firstTextNodeId is defined).

### 3.3 Concrete spec per operation

- **insertParagraph**: payload (blockType?, selectionAlias?). Behavior: insert new block at position derived from selection (end, start, or split); set lastCreatedBlock so selectionAfter is caret in the new block’s first text node. Exec tests: `packages/model/test/operations/insertParagraph.exec.test.ts`.
- **insertText**, **deleteTextRange**, **toggleMark**, **setNode**, etc.: each has an exec test under `packages/model/test/operations/<name>.exec.test.ts`. Those tests are the **concrete spec** for inputs, outputs, and invariants.

When adding or changing an operation: update its exec test to assert the new behavior, then update this SPEC (and `docs/specs/editor.md` if user-visible semantics change).

---

## 4. Selection resolution (summary)

- **During ops**: only content operations (e.g. insertText, deleteTextRange, setSelection) may update context.selection.current. Block-creation ops (e.g. insertParagraph, addChild) set context.lastCreatedBlock; they do not set selection directly.
- **After ops**: selectionAfter = caret at start of lastCreatedBlock’s first text node if lastCreatedBlock is set; else selectionAfter = context.selection.current.
- **View**: selectionAfter is applied to the view only when applySelectionToView !== false.

See `docs/transaction-selection.md` and `docs/selection-application-flow.md` for full flow.

---

## 5. References

- **Editor-wide semantics**: `docs/specs/editor.md`
- **Transaction and selection flow**: `docs/transaction-selection.md`, `docs/selection-application-flow.md`
- **Exec tests**: `packages/model/test/operations/*.exec.test.ts`
- **Operation definitions**: `packages/model/src/operations/`, `packages/model/src/operations-dsl/`
