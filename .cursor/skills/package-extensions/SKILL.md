---
name: package-extensions
description: Extension interface and built-in extensions (commands, keybindings, model operations). Use when adding or changing extensions, commands, or keybindings.
---

# @barocss/extensions

## Scope

- **Extension**: interface with `name`, `priority`, `onCreate(editor)`, `onDestroy(editor)`; register commands in `onCreate` via `editor.registerCommand({ name, execute, canExecute })`.
- **Model changes**: use `@barocss/model` only. Express the transaction as an **explicit list of operations**: `transaction(editor, [op1, op2, ...]).commit()` (e.g. `control(nodeId, [applyMark, toggleMark, ...])`). Do not call DataStore directly. Do not add or use shorthand/fluent APIs that hide the operation list (e.g. `transaction(editor).bold().commit()`); the operation DSL is the single, canonical form.
- **Commands**: `execute` returns boolean; `canExecute` gates availability; payload often includes selection (e.g. for toggleBold).
- **Keybindings**: registered in editor-core (e.g. default-keybindings); format `Mod+b`, `when: 'editorFocus && editorEditable'`; add after command is registered by extension.

## Rules

1. **Do not** use DataStore or raw operations in extensions; use model operations inside `transaction(editor, ops).commit()`. Keep **one way** to express what runs: the operation list (DSL). Do not introduce fluent/shortcut APIs that expand to ops elsewhere; extensions should build and pass the ops array explicitly.
2. **Selection**: resolve block/node from selection when needed (e.g. transformNode on block containing cursor); use payload?.selection.
3. **Priority**: lower number runs first; use for ordering extensions and command resolution.
4. **Keybinding**: add entry in editor-core keybinding list (e.g. default-keybindings.ts) with command name and `when` clause.
5. **References**: `packages/extensions/`; docs: extension-design-and-implementation.md, operation-selection-handling.md; model: `packages/model/`.

## Quick reference

- Package: `packages/extensions/`
- Deps: `@barocss/editor-core`, `@barocss/model`
- Pattern: Extension class → onCreate registerCommand → execute builds ops (e.g. applyMark(…), control(nodeId, […])), then transaction(editor, [ops]).commit(). The ops array is the canonical transaction spec; no shorthand that hides it.
