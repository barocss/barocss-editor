---
name: app-editor-decorator-test
description: Decorator-focused test app (layer, inline, block, pattern decorators, defineDecorator). Use when testing or changing the decorator system, adding decorator samples, or debugging decorator rendering and interactions.
---

# apps/editor-decorator-test

## Scope

- **Purpose**: Test the EditorViewDOM decorator system in isolation. Schema includes `decorators` (comment, highlight, linkDecorator, status) with dataSchema and render position. No Playwright; dev/preview only.
- **Entry**: `src/main.ts` → `bootstrap()`: createSchema (with decorators), DataStore, Editor, extensions, define/defineMark/defineDecorator, EditorViewDOM, then `addDecorators()` to attach target, pattern, and custom-generator decorators.
- **Decorator types**: (1) **Target decorators**: fixed target (node or range), e.g. comment, highlight, linkDecorator, status; (2) **Pattern decorators**: URL, email, color-chip with pattern + createDecorator; (3) **Custom generator**: function that returns decorators from model/text (e.g. "테스트" → chip); (4) **Inline before/after**: chip before "Hello", chip after "World" on text-14.
- **Templates**: `defineDecorator(name, template)` for comment, comment-tooltip, comment-popup, highlight, linkDecorator, status, url-link, email-link, color-chip, chip. Portal usage in `portal-test` node (define with portal(document.body, ...)).
- **Sample data**: `src/decorator-samples.ts` exports sample decorator data (comments, highlights, etc.); main.ts uses its own `addDecorators()` list rather than importing decorator-samples for the live UI.

## Rules

1. **Schema**: Decorator definitions in schema (`decorators: { comment: { name, category, dataSchema, render }, ... }`) must align with `defineDecorator(stype, template)` and with the shape of decorators passed to `view.addDecorator()`.
2. **addDecorators**: Called after view.render(); adds target decorators (sid, stype, category, target, data, position?), pattern decorators (decoratorType: 'pattern', data: { pattern, extractData, createDecorator, priority }), and custom generator (generate(model, text) → array of decorators).
3. **IDs**: Use consistent sid/nodeId in initialTree and in decorator targets (e.g. text-1, text-bold, p-1) so decorators attach to the right nodes.
4. **References**: `apps/editor-decorator-test/`; deps: datastore, editor-core, editor-view-dom, model, renderer-dom, schema, dsl. No devtool, no Playwright.

## Quick reference

- App path: `apps/editor-decorator-test/`
- Entry: `src/main.ts` (bootstrap), `src/decorator-samples.ts` (sample data only)
- Dev: `pnpm dev` (Vite, no E2E)
- Container: `#editor-container`
