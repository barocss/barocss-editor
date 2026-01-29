---
name: package-dom-observer
description: DOM mutation observer (structure, text, attributes) with filtering. Use when syncing DOM changes to model or implementing MutationObserver-based flow.
---

# @barocss/dom-observer

## Scope

- **MutationObserverManagerImpl**: constructor options: `target`, `onStructureChange`, `onTextChange`, `onNodeUpdate`, `filterByDataAttributes?`, `ignoreNodeTypes?`, `filter?`.
- **Events**: structure (add/remove/move), text (oldText, newText, offsets), node update (attribute).
- **Filtering**: `filterByDataAttributes` to track only nodes with `data-bc-*`; custom `filter(mutation)` for fine control.

## Rules

1. **data-bc-***: use for editor-owned nodes (e.g. data-bc-sid) so observer can focus on meaningful changes and avoid noise.
2. **Text change**: use with text-analyzer (oldText, newText) to produce TextChange[] for model sync.
3. **Start/stop**: call `start()` after setup; `stop()` or `disconnect()` on cleanup.
4. **References**: `packages/dom-observer/`; consumed by `@barocss/editor-view-dom` for DOM→model sync.

## Quick reference

- Package: `packages/dom-observer/`
- Entry: MutationObserverManagerImpl(options)
- Callbacks: onStructureChange, onTextChange, onNodeUpdate; filterByDataAttributes, ignoreNodeTypes, filter
