---
name: package-renderer-react
description: React renderer for Barocss DSL (ModelData + Registry → ReactNode). Use when changing renderer-react, adding tests, or integrating with editor-view-react.
---

# @barocss/renderer-react

## Scope

- **Rendering**: Same input as renderer-dom (`RendererRegistry` + `ModelData`). Output is **ReactNode** only (no VNode, no DOM reconciliation in this package).
- **Pipeline**: `buildToReact(registry, model.stype, model)` → `React.createElement`; element/slot/data and marks resolved from DSL.
- **Dependency**: `@barocss/dsl` only; React is peer. **No** dependency on `@barocss/renderer-dom`.
- **Consumers**: `@barocss/editor-view-react` (EditorViewContentLayer uses ReactRenderer.build).

## Spec and rules

1. **Spec**: All behavior and test strategy are in **`packages/renderer-react/docs/renderer-react-spec.md`**. Read it before implementing or changing behavior; update it when contract or behavior changes.
2. **Identity**: Every node must have `key={model.sid}` and `data-bc-sid` / `data-bc-stype` on the root element so React and the view layer can reconcile and apply selection.
3. **Selection**: This package does **not** preserve or apply selection. The view layer (editor-view-react) applies ModelSelection to DOM after render (e.g. after `editor:content.change`).
4. **Marks**: Use `splitTextByMarks(text, model.marks)` and `registry.getMarkRenderer(markType)`; wrap runs with the resolved element (e.g. strong, em). Same semantics as renderer-dom; see spec §5.
5. **Do not** depend on renderer-dom or VNode types. **Do not** use array index as key when `model.sid` is available.

## Quick reference

- Package: `packages/renderer-react/`
- Entry: `ReactRenderer`, `buildToReact`; utils: `splitTextByMarks` (utils/marks.ts)
- Spec: `packages/renderer-react/docs/renderer-react-spec.md`
- Tests: Add under `packages/renderer-react/test/`; run with `pnpm --filter @barocss/renderer-react test:run` (add `test:run` script and vitest config if missing).
- Integration: `packages/editor-view-react` (EditorViewContentLayer), `apps/editor-react` (React app using EditorView).

## When to use this skill

- Adding or changing `buildToReact`, `ReactRenderer`, or mark rendering.
- Adding unit tests for renderer-react (splitTextByMarks, buildToReact output shape).
- Aligning renderer-react behavior with the spec (selection stability, keys, marks).
- Integrating or fixing editor-view-react content layer (selection after render, registry/model shape).
