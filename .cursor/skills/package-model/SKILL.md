---
name: package-model
description: Model transaction DSL and document operations (insertText, deleteTextRange, toggleMark, transformNode, etc.). Use when implementing or calling document edits, extensions, or transaction flows.
---

# @barocss/model

## Scope

- **Transaction**: `transaction(editor, operations).commit()`; acquires DataStore lock, `begin` overlay, runs operations, `end`, `commit`, releases lock.
- **DSL helpers**: `control(nodeId, ops)` for node-scoped ops; operations return operation descriptors, not side effects.
- **Text**: `insertText`, `replaceText`, `deleteTextRange`, `splitTextNode`, `mergeTextNodes`; mark ops: `applyMark`, `removeMark`, `toggleMark`.
- **Block/node**: `transformNode`, `moveBlockUp`, `moveBlockDown`, `splitBlockNode`, `mergeBlockNodes`, `addChild`, `removeChild`, `moveChildren`, `wrap`, `unwrap`.
- **Selection context**: selection resolved inside transaction for commands (e.g. current range for toggleMark).

## Rules

1. **Do not** call DataStore APIs directly from extensions; use model operations inside a transaction.
2. **Operations** are declarative; execution order and locking are handled by `transaction(editor, ops).commit()`.
3. **Selection**: commands receive optional selection payload; resolve block/node IDs from selection when needed (e.g. for transformNode).
4. **References**: `packages/model/`; operations under `src/operations/` and `src/operations-dsl/`; `transaction-dsl.ts`, `transaction.ts`.

## Quick reference

- Package: `packages/model/`
- Deps: `@barocss/datastore`, `@barocss/editor-core`, `@barocss/schema`
- Entry: `transaction`, `control`, and named ops from `@barocss/model`
