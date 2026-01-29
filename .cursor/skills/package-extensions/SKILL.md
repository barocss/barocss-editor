---
name: package-extensions
description: Extension interface and built-in extensions (commands, keybindings, model operations). Use when adding or changing extensions, commands, or keybindings.
---

# @barocss/extensions

## Scope

- **Extension**: interface with `name`, `priority`, `onCreate(editor)`, `onDestroy(editor)`; register commands in `onCreate` via `editor.registerCommand({ name, execute, canExecute })`.
- **Model changes**: use `@barocss/model` only: `transaction(editor, ops).commit()` with `control(nodeId, [toggleMark, transformNode, ...])`; do not call DataStore directly.
- **Commands**: `execute` returns boolean; `canExecute` gates availability; payload often includes selection (e.g. for toggleBold).
- **Keybindings**: registered in editor-core (e.g. default-keybindings); format `Mod+b`, `when: 'editorFocus && editorEditable'`; add after command is registered by extension.

## Rules

1. **Do not** use DataStore or raw operations in extensions; use model operations inside `transaction(editor, ops).commit()`.
2. **Selection**: resolve block/node from selection when needed (e.g. transformNode on block containing cursor); use payload?.selection.
3. **Priority**: lower number runs first; use for ordering extensions and command resolution.
4. **Keybinding**: add entry in editor-core keybinding list (e.g. default-keybindings.ts) with command name and `when` clause.
5. **References**: `packages/extensions/`; docs: extension-design-and-implementation.md, operation-selection-handling.md; model: `packages/model/`.

## Quick reference

- Package: `packages/extensions/`
- Deps: `@barocss/editor-core`, `@barocss/model`
- Pattern: Extension class → onCreate registerCommand → execute uses transaction(editor, control(nodeId, [...ops])).commit()
