---
name: package-devtool
description: Dev tools for Barocss Editor (model tree, event log, UI panel). Use when changing devtool UI, event monitoring, or model visualization.
---

# @barocss/devtool

## Scope

- **Devtool**: constructor `{ editor, maxEvents?, refreshInterval?, debug? }`; creates floating panel (model tree tab, events tab).
- **Model tree**: reflects DataStore document; search by ID/type/text; click node to highlight in DOM.
- **Events**: subscribes to editor events; log with filter; clear button.
- **Auto-refresh**: optional refreshInterval to refresh model tree periodically.

## Rules

1. **Editor reference**: devtool reads from editor (and its DataStore); does not mutate document.
2. **DOM highlight**: node selection in tree should map to DOM element (e.g. via data-bc-sid); implement in devtool UI.
3. **Cleanup**: call `devtool.destroy()` when unmounting.
4. **References**: `packages/devtool/`; deps: `@barocss/editor-core` (Editor type / events).

## Quick reference

- Package: `packages/devtool/`
- Entry: Devtool; options: editor (required), maxEvents, refreshInterval, debug
- UI: Model Tree tab, Events tab; floating panel
