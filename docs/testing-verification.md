# Barocss Editor – Testing and Implementation Verification

This document describes how and to what extent the editor can be tested, and how to use tests to verify implementation.

---

## 1. Test layers

| Layer | Where | Tool | Purpose |
|-------|--------|------|---------|
| **Unit** | `packages/*/test/` | Vitest | DataStore, model ops, DSL, schema, renderer-dom, editor-view-dom units, text-analyzer, converter, etc. |
| **Integration** | `packages/editor-view-dom/test/integration/` | Vitest (jsdom) | EditorViewDOM + renderer-dom, decorators, selection mapping, mutation observer, mount/unmount. |
| **E2E (DOM)** | `apps/editor-test/tests/` | Playwright | Full app in browser (EditorViewDOM): content layer, DOM structure, visible text. |
| **E2E (React)** | `apps/editor-react/tests/` | Playwright | Full app in browser (EditorView React): content layer, insertParagraph 등 기능 검증. |

---

## 1.1 Full-stack layers and browser functional testing

기능 하나를 넣거나 바꿀 때 다음 레이어를 순서대로 설정한 뒤, **실제 브라우저에서 기능 테스트**로 검증한다.

| 순서 | 레이어 | 위치 | 역할 |
|------|--------|------|------|
| 1 | **datastore** | `packages/datastore` | 노드 저장/조회, content API, lock, overlay, $alias 등. |
| 2 | **model** | `packages/model` | operation 정의, DSL, transaction, selection 해석. |
| 3 | **operation** | `packages/model/src/operations`, `operations-dsl` | `defineOperation` + `defineOperationDSL`, exec 테스트. |
| 4 | **extension** | `packages/extensions` | command 등록, keybinding → command, transaction에 operation 넣어 실행. |
| 5 | **editor-view** | `packages/editor-view-dom` 또는 `editor-view-react` | 입력/키 → command 호출, selection 변환, DOM/React 렌더. |

**브라우저 기능 테스트 실행**

- **React 기준**: `pnpm test:e2e:react` (또는 `pnpm --filter @barocss/editor-react test:e2e`)  
  - `apps/editor-react`: EditorView(React) + createCoreExtensions, 포트 5175.
- **DOM 기준**: `pnpm test:e2e` (또는 `pnpm --filter @barocss/editor-test test:e2e`)  
  - `apps/editor-test`: EditorViewDOM + createCoreExtensions, 포트 5173.

datastore, model, operation, extension, editor-view 중 하나라도 건드렸으면 해당 기능에 맞는 E2E 스펙을 추가·수정한 뒤 위 명령으로 통과하는지 확인한다.

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

**React 앱 (기능 테스트 권장)**  
레포 루트에서:

```bash
pnpm test:e2e:react
```

또는 `apps/editor-react`에서: `pnpm test:e2e`. 포트 5175, `reuseExistingServer: true`.

**DOM 앱 (editor-test)**  
레포 루트에서:

```bash
pnpm test:e2e
```

또는 `cd apps/editor-test && pnpm test:e2e`. 포트 5173.

Headed (브라우저 창으로 확인):

```bash
cd apps/editor-react && pnpm test:e2e:headed
cd apps/editor-test  && pnpm test:e2e:headed
```

Playwright가 `pnpm dev`로 앱을 띄우고, 60초 안에 준비되지 않으면 터미널에서 해당 앱을 먼저 `pnpm dev` 한 뒤 다시 E2E를 실행하면 된다.

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

### 3.3 E2E (editor-test, DOM)

- **Current spec**: `tests/editor-view.spec.ts` – EditorViewDOM 렌더링:
  - Content layer visible (`[data-bc-layer="content"]`).
  - No document wrapper under content.
  - 2 paragraphs, “BaroCSS Editor Demo”, “Rich Text Features”, “This is a ”, “bold text”, “italic text” 등 초기 문서와 일치.

### 3.4 E2E (editor-react, React)

- **Current spec**: `tests/insertParagraph.spec.ts` – insertParagraph 기능:
  - Content layer visible, 초기 paragraph 2개.
  - 첫 번째 paragraph 클릭(포커스) 후 Enter 입력.
  - paragraph 개수 3개로 증가하는지 검증 (datastore → model → operation → extension → editor-view 전체 경로).

---

## 4. Problem verification (practical)

How to verify that a change or fix is correct, in a fixed order.

### 4.0 Where to look

- **Step-by-step by scenario** (new feature / bug fix / E2E-only): **`.cursor/AGENTS.md`** § “Verification by scenario (step-by-step)”.
- **When a test fails** (unit vs E2E, what to do next): **`.cursor/AGENTS.md`** § “When something fails”.
- **Manual checks in the browser** (insert paragraph, typing, block type, marks): **`.cursor/AGENTS.md`** § “Manual verification (what to check in the browser)”.

Summary:

1. **New feature**: Run new operation exec test → full model tests → extension tests (if added) → E2E → optional manual check.
2. **Bug fix**: Run affected package tests → fix or add tests → run extensions if touched → E2E → manual reproduction of the bug scenario to confirm fix.
3. **E2E-only**: Run E2E; if app content or DOM changed, update spec selectors/assertions to match.

If a **unit test fails**: fix in that package and re-run until it passes; do not run E2E until unit passes.  
If **E2E fails**: run unit tests for the same feature first; if unit passes, treat as DOM/timing/selector and adjust the spec or run E2E in headed mode to inspect.

---

## 5. Implementation verification checklist

Use this to verify that an implementation is covered and working.

### 5.1 Data and model

- [ ] **DataStore**: `pnpm --filter @barocss/datastore test:run` – transactions, overlay, lock, content, marks, iterators.
- [ ] **Model operations**: `pnpm --filter @barocss/model test:run` – all relevant ops (insertText, toggleMark, transformNode, etc.) and transaction DSL.
- [ ] **Schema**: `pnpm --filter @barocss/schema test:run` – schema creation and validation.

### 5.2 Rendering

- [ ] **DSL**: `pnpm --filter @barocss/dsl test:run` – templates, registry.
- [ ] **Renderer-dom**: `pnpm --filter @barocss/renderer-dom test:run` – VNode build, reconcile, marks, decorators.
- [ ] **Editor-view-dom (core + integration)**: `pnpm --filter @barocss/editor-view-dom test:run` – layers, decorators, selection, integration tests.

### 5.3 Input and text

- [ ] **Text analyzer**: `pnpm --filter @barocss/text-analyzer test:run` – LCP/LCS, selection bias.
- [ ] **Editor-view-dom (events/text-analysis)**: input handler and text-analysis test groups.

### 5.4 Editor and extensions

- [ ] **Editor-core**: `pnpm --filter @barocss/editor-core test:run` – selection, commands.
- [ ] **Extensions**: `pnpm --filter @barocss/extensions test:run` – extension and command behavior.

### 5.5 Full stack in browser

- [ ] **Manual**: Run `pnpm dev:site` (DOM) or `pnpm --filter @barocss/editor-react dev` (React), open 해당 포트, 입력/단축키/붙여넣기, Devtool 확인.
- [ ] **E2E (React)**: `pnpm test:e2e:react` — editor-react 앱에서 insertParagraph 등 기능 검증.
- [ ] **E2E (DOM)**: `pnpm test:e2e` — editor-test 앱에서 content layer, 초기 문서 구조·텍스트 검증.

### 5.6 Optional: decorator app

- [ ] **Manual**: Run `pnpm dev:decorator`, check layer/inline/block and pattern decorators.

---

## 6. E2E spec and initial content

The E2E spec `editor-view.spec.ts` has been updated to match the **current** initial content in `apps/editor-test/src/main.ts`: it asserts content layer visible, no document wrapper under content, two paragraphs, and visible strings “BaroCSS Editor Demo”, “Rich Text Features”, “This is a ”, “bold text”, “italic text”.

If you change the initial tree or schema in main.ts, update the spec assertions (paragraph count, visible text) so E2E continues to pass. Alternatively you can add an E2E-only minimal fixture (e.g. query param or env) and keep the spec minimal; the important part is that spec and app content stay in sync.

---

## 7. References

- **Unit/integration patterns**: `paper/testing-guide.md` (transaction DSL, control, op(), mocks, debugging).
- **E2E config**: `apps/editor-test/playwright.config.ts` (port 5173, `pnpm dev`).
- **App bootstrap**: `apps/editor-test/src/main.ts` (initial tree, schema, templates).
- **GitHub (CI, PR, deploy)**: `docs/github-agent-integration.md`.
