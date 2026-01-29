---
name: package-renderer-dom
description: Renderer DSL for declarative DOM rendering from DSL templates. Use when changing how model (INode) is rendered to DOM, diff/reconcile logic, or renderer registry.
---

# @barocss/renderer-dom

## Scope

- **Rendering**: resolves templates from `@barocss/dsl` registry by node `stype`; builds VNode tree from INode tree; reconciles to DOM (patch/diff).
- **DSL dependency**: uses `element`, `data`, `slot`, `component`, marks from DSL; no template definition in renderer-dom.
- **Marks**: text nodes rendered with mark wrappers (bold, italic, etc.) from `defineMark` templates.
- **Output**: DOM nodes under a given root; used by editor-view-dom for the content layer.

## Rules

1. **Do not** define node/mark templates in renderer-dom; define in DSL, resolve by stype/mark type.
2. **Diff**: only elements with `data-bc-*` (e.g. `data-bc-sid`) are reconciled; decorator widgets (inline/block) are excluded by convention.
3. **Slots**: content array of INode is rendered into `slot('content')`; recursive by stype.
4. **References**: `packages/renderer-dom/`; depends on `@barocss/dsl`; consumed by `@barocss/editor-view-dom`.

## Quick reference

- Package: `packages/renderer-dom/`
- Deps: `@barocss/dsl`
- API: render(rootNodeId, dataStore, domRoot, options?), reconcile pipeline, renderer registry
