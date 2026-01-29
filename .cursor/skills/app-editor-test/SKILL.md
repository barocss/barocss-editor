---
name: app-editor-test
description: Full editor integration test app with Playwright E2E. Use when running or changing editor-test, adding E2E tests, or debugging the full editor stack (DataStore, Editor, EditorViewDOM, extensions, Devtool).
---

# apps/editor-test

## Scope

- **Purpose**: Run the full Barocss Editor in the browser for manual and automated testing. Uses DataStore, Editor, EditorViewDOM, schema, DSL, extensions (createCoreExtensions, createBasicExtensions), and optional Devtool.
- **Entry**: `src/main.ts` → `bootstrap()` mounts editor in `#editor-container`; HMR-safe via `data-bootstrap-executed` and `window.__editor` / `window.__editorViewDOM`.
- **Schema**: Rich schema in main.ts (document, heading, paragraph, blockQuote, codeBlock, list, bTable, marks, etc.). All node/mark templates are defined in main.ts (define, defineMark) before creating EditorViewDOM.
- **E2E**: Playwright in `tests/`; `playwright.config.ts` uses `pnpm dev` on port 5173, `testDir: './tests'`. Run with `pnpm test:e2e` or `pnpm test:e2e:headed`.
- **Scripts**: `pnpm dev`, `pnpm preview`, `pnpm test:e2e`, `pnpm test:e2e:headed`, `pnpm live:watch` (scripts/live-watch.js).

## Rules

1. **Bootstrap**: Do not run bootstrap twice; check `container.hasAttribute('data-bootstrap-executed')` and reuse `window.__editor` / `window.__editorViewDOM` when present (e.g. HMR).
2. **E2E**: Tests assume dev server at `baseURL: 'http://localhost:5173'`; ensure selectors match the DOM produced by main.ts (e.g. `[data-bc-layer="content"]`, `[data-bc-stype="paragraph"]`). Update tests if you change initial content or structure in main.ts.
3. **Schema/templates**: Node and mark definitions in main.ts must match the schema (stype names). Adding a new node type requires both schema entry and `define(stype, template)`.
4. **References**: `apps/editor-test/`; deps: datastore, editor-core, editor-view-dom, schema, dsl, devtool, extensions. No renderer-dom in package.json (editor-view-dom brings it).

## Quick reference

- App path: `apps/editor-test/`
- Entry: `src/main.ts` (bootstrap), `tests/editor-view.spec.ts` (E2E)
- Dev: `pnpm dev` → http://localhost:5173
- E2E: `pnpm test:e2e` (Playwright, Chromium)
