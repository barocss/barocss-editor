---
name: package-editor-core
description: Headless editor core (commands, selection, extensions, history, keybindings). Use when changing editor lifecycle, command execution, extension registration, or event flow.
---

# @barocss/editor-core

## Scope

- **Editor**: owns DataStore, SelectionManager, CommandRegistry, ExtensionManager, HistoryManager, KeybindingManager.
- **Commands**: `registerCommand({ name, execute, canExecute })`; execution via `executeCommand(name, payload)` or `chain().cmd().run()`.
- **Extensions**: `Extension` with `name`, `priority`, `onCreate(editor)`, `onDestroy(editor)`; register commands in `onCreate`.
- **Events**: `contentChange`, `selectionChange`, `commandExecute`, `historyChange`; subscribe with `editor.on(event, callback)`.
- **History**: `undo()`, `redo()`, `canUndo()`, `canRedo()`.

## Rules

1. **Model changes** must go through `@barocss/model` transactions (e.g. `transaction(editor, ops).commit()`), not direct DataStore writes from extensions.
2. **Commands**: return `true`/`false` from `execute`; `canExecute` gates availability (e.g. for UI).
3. **Extension order**: determined by `priority` (lower runs first); declare `dependencies` when order matters.
4. **Keybindings**: defined in editor-core (e.g. default-keybindings); format `Mod+b`, `when: 'editorFocus && editorEditable'`.
5. **References**: `packages/editor-core/`; event naming in `docs/event-naming-convention.md`.

## Quick reference

- Package: `packages/editor-core/`
- Deps: `@barocss/datastore`, `@barocss/model`, `@barocss/schema`, `@barocss/extensions`, `@barocss/shared`
