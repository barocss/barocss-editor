---
name: selection-application
description: How selection is applied from transaction to View (Model → Editor Core → DOM/React). Use when implementing selection after content change, transaction options (applySelectionToView), or debugging selection sync.
---

# Selection Application Flow

## When to use this skill

- Implementing or changing how selection is applied after a transaction (e.g. Enter key, new block).
- Choosing or documenting `transaction(editor, ops, options)` options (`applySelectionToView`).
- Debugging selection not moving to the new block, or selection changing when it should not (e.g. remote sync).
- Adding or modifying code that calls `editor.updateSelection` or listens to `editor:selection.model`.

## Flow (concise)

1. **Transaction** (`packages/model`): After operations run, selection is resolved (e.g. from `lastCreatedBlock`). Result is `selectionAfter`.
2. **Option**: `transaction(editor, ops, { applySelectionToView?: boolean })`. Default is “apply” (true). If `applySelectionToView === false`, skip step 3.
3. **Editor Core**: `editor.updateSelection(selectionAfter)` → `SelectionManager.setSelection()` + `emit('editor:selection.model', selection)`.
4. **View** (editor-view-dom / editor-view-react): Listens to `editor:selection.model` → `convertModelSelectionToDOM(selection)` → DOM Selection API.

Selection is **not** mutated by commands or `op()` during the operation loop; it is resolved in a single step after all operations and before commit, then applied to View only when `applySelectionToView !== false`.

## Rules

1. **Do not** set `context.selection.current` inside command-level `op()`; use operations that set it (e.g. insertText, deleteTextRange) or rely on TransactionManager’s selection resolution step (`lastCreatedBlock`).
2. **User-initiated** commands that should move the caret (e.g. insertParagraph): use `transaction(editor, ops, { applySelectionToView: true })` or omit options (default is apply).
3. **Remote sync / batch updates** where View selection must not change: use `transaction(editor, ops, { applySelectionToView: false })`.
4. **View application**: Only Editor Core calls `updateSelection`; View layers only react to `editor:selection.model` and call `convertModelSelectionToDOM`. Do not bypass this by mutating DOM selection from model code.

## References

- **Full flow**: `docs/selection-application-flow.md`
- **Transaction vs selection timing**: `docs/transaction-selection.md`
- **Code**: `packages/model/src/transaction.ts` (execute, options), `packages/model/src/transaction-dsl.ts` (TransactionOptions), `packages/editor-core/src/editor.ts` (updateSelection), `packages/editor-view-dom/src/editor-view-dom.ts` (editor:selection.model → applyModelSelectionWithRetry), `packages/editor-view-react/src/EditorViewContentLayer.tsx` (editor:selection.model → convertModelSelectionToDOM).
