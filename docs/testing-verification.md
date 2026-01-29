# Barocss Editor – Testing and Implementation Verification

This document describes how and to what extent the editor can be tested, and how to use tests to verify implementation.

---

## 1. Test layers

| Layer | Where | Tool | Purpose |
|-------|--------|------|---------|
| **Unit** | `packages/*/test/` | Vitest | DataStore, model ops, DSL, schema, renderer-dom, editor-view-dom units, text-analyzer, converter, etc. |
| **Integration** | `packages/editor-view-dom/test/integration/` | Vitest (jsdom) | EditorViewDOM + renderer-dom, decorators, selection mapping, mutation observer, mount/unmount. |
| **E2E** | `apps/editor-test/tests/` | Playwright | Full app in browser: content layer, DOM structure, visible text. |

---

## 2. How to run tests

### 2.0 Full verification (unit + E2E)

1. **Unit**: From repo root, `pnpm test` (runs Vitest in all packages that have a `test` script).
2. **E2E**: `cd apps/editor-test && pnpm test:e2e` (starts dev server if needed, runs Playwright).

The E2E spec `editor-view.spec.ts` is aligned with the current initial content in `apps/editor-test/src/main.ts` (headings “BaroCSS Editor Demo”, “Rich Text Features”, two paragraphs with bold/italic text). If you change the initial tree in main.ts, update the spec assertions to match.

### 2.1 All unit tests (all packages)

From repo root:

```bash
pnpm test
```

Runs each workspace’s `test` script (Vitest). Does **not** run Playwright; `apps/editor-test` has no `test` script, only `test:e2e`.

### 2.2 Single package

```bash
pnpm --filter @barocss/datastore test:run
pnpm --filter @barocss/model test:run
pnpm --filter @barocss/editor-view-dom test:run
pnpm --filter @barocss/editor-core test:run
pnpm --filter @barocss/renderer-dom test:run
pnpm --filter @barocss/schema test:run
pnpm --filter @barocss/extensions test:run
pnpm --filter @barocss/converter test:run
pnpm --filter @barocss/dsl test:run
pnpm --filter @barocss/text-analyzer test:run
pnpm --filter @barocss/dom-observer test:run
pnpm --filter @barocss/shared test:run
pnpm --filter @barocss/collaboration test:run
pnpm --filter @barocss/collaboration-yjs test:run
pnpm --filter @barocss/collaboration-liveblocks test:run
```

Or from inside a package:

```bash
cd packages/datastore && pnpm test:run
cd packages/editor-view-dom && pnpm test:run
```

### 2.3 Editor-view-dom by category

```bash
pnpm --filter @barocss/editor-view-dom test:core
pnpm --filter @barocss/editor-view-dom test:events
pnpm --filter @barocss/editor-view-dom test:text-analysis
pnpm --filter @barocss/editor-view-dom test:decorator-system
pnpm --filter @barocss/editor-view-dom test:integration
```

### 2.4 E2E (Playwright)

Dev server must be reachable at `http://localhost:5173` (see `apps/editor-test/playwright.config.ts`). Either start it manually or let Playwright start it:

```bash
cd apps/editor-test
pnpm test:e2e
```

Headed (see browser):

```bash
pnpm test:e2e:headed
```

Playwright config starts the app with `pnpm dev` and port 5173 if no server is already running (`reuseExistingServer: true`). If the web server fails to be ready within 60s, start it manually in another terminal (`pnpm dev` in apps/editor-test) then run `pnpm test:e2e` again.

---

## 3. What is covered today

### 3.1 Unit (packages)

- **datastore**: Transactions, overlay, lock, content/marks, iterator, visitor, serialization, drop behavior, schema. (~58 test files.)
- **model**: Transaction DSL, all operations (insertText, deleteTextRange, toggleMark, transformNode, moveBlock, etc.), selection, lock integration. (Many files under `test/operations/`, `test/transaction/`.)
- **editor-view-dom**: Core API, layers, decorators, text analysis, input handler, model↔DOM selection, efficient edit handler.
- **renderer-dom**: VNode builder, reconciler, fiber, marks, decorators, portals, components, tables, performance. (Many files under `test/core/`.)
- **editor-core**: Selection manager, etc.
- **schema**, **dsl**, **converter**, **extensions**, **text-analyzer**, **dom-observer**, **shared**, **collaboration** (and -yjs, -liveblocks): each has Vitest tests.

### 3.2 Integration (editor-view-dom)

- Mount/unmount, renderer-dom integration, decorator integration (layer/inline/block), selection mapping, mutation observer, pattern/custom decorators, component state, tables, error handling, performance smoke.

### 3.3 E2E (editor-test)

- **Current spec**: `tests/editor-view.spec.ts` – one describe “EditorViewDOM rendering”, one test:
  - Content layer visible (`[data-bc-layer="content"]`).
  - No document wrapper under content (`[data-bc-stype="document"]` count 0).
  - Exactly 2 paragraphs and 2 “text” nodes.
  - Text contains “Hello, EditorViewDOM!” and “Type here to test.”

**Problem**: The app’s initial content in `apps/editor-test/src/main.ts` is different: headings “BaroCSS Editor Demo”, “Rich Text Features”, then paragraphs with “This is a ”, “bold text”, “italic text”, etc. So this E2E test does **not** match the current app and will fail until either:

- The spec is updated to assert the **current** initial content (e.g. “BaroCSS Editor Demo”, “Rich Text Features”, paragraph structure and text), or  
- A dedicated E2E fixture is added (e.g. minimal document with “Hello, EditorViewDOM!” and “Type here to test.”) and the test runs against that.

---

## 4. Implementation verification checklist

Use this to verify that an implementation is covered and working.

### 4.1 Data and model

- [ ] **DataStore**: `pnpm --filter @barocss/datastore test:run` – transactions, overlay, lock, content, marks, iterators.
- [ ] **Model operations**: `pnpm --filter @barocss/model test:run` – all relevant ops (insertText, toggleMark, transformNode, etc.) and transaction DSL.
- [ ] **Schema**: `pnpm --filter @barocss/schema test:run` – schema creation and validation.

### 4.2 Rendering

- [ ] **DSL**: `pnpm --filter @barocss/dsl test:run` – templates, registry.
- [ ] **Renderer-dom**: `pnpm --filter @barocss/renderer-dom test:run` – VNode build, reconcile, marks, decorators.
- [ ] **Editor-view-dom (core + integration)**: `pnpm --filter @barocss/editor-view-dom test:run` – layers, decorators, selection, integration tests.

### 4.3 Input and text

- [ ] **Text analyzer**: `pnpm --filter @barocss/text-analyzer test:run` – LCP/LCS, selection bias.
- [ ] **Editor-view-dom (events/text-analysis)**: input handler and text-analysis test groups.

### 4.4 Editor and extensions

- [ ] **Editor-core**: `pnpm --filter @barocss/editor-core test:run` – selection, commands.
- [ ] **Extensions**: `pnpm --filter @barocss/extensions test:run` – extension and command behavior.

### 4.5 Full stack in browser

- [ ] **Manual**: Run `pnpm dev:site` (or `pnpm --filter @barocss/editor-test dev`), open http://localhost:5173, type, use shortcuts, paste, check Devtool.
- [ ] **E2E**: Fix `editor-view.spec.ts` to match current app (or E2E fixture), then run `cd apps/editor-test && pnpm test:e2e`.

### 4.6 Optional: decorator app

- [ ] **Manual**: Run `pnpm dev:decorator`, check layer/inline/block and pattern decorators.

---

## 5. E2E spec and initial content

The E2E spec `editor-view.spec.ts` has been updated to match the **current** initial content in `apps/editor-test/src/main.ts`: it asserts content layer visible, no document wrapper under content, two paragraphs, and visible strings “BaroCSS Editor Demo”, “Rich Text Features”, “This is a ”, “bold text”, “italic text”.

If you change the initial tree or schema in main.ts, update the spec assertions (paragraph count, visible text) so E2E continues to pass. Alternatively you can add an E2E-only minimal fixture (e.g. query param or env) and keep the spec minimal; the important part is that spec and app content stay in sync.

---

## 6. References

- **Unit/integration patterns**: `paper/testing-guide.md` (transaction DSL, control, op(), mocks, debugging).
- **E2E config**: `apps/editor-test/playwright.config.ts` (port 5173, `pnpm dev`).
- **App bootstrap**: `apps/editor-test/src/main.ts` (initial tree, schema, templates).
