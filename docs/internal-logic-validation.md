# Internal Logic Validation Order and Test Strategy

**Principle**: Validate each package's internal logic firmly before adding features. Validation **maximizes use of test code**.

---

## 1. Validation order (dependency bottom → top)

The packages below do not depend on other `@barocss/*` packages, or depend only on already-validated packages. Validating **in this order** keeps lower layers stable when validating upper ones.

| Order | Package | Deps (@barocss) | What to validate |
|-------|---------|-----------------|------------------|
| **1** | **shared** | none | Utils, constants, key strings via unit tests |
| **2** | **schema** | none | Schema definition, getNodeType, groups |
| **3** | **text-analyzer** | none | Text change analysis, Unicode analysis tests |
| **4** | **text-run-index** | none | Text run index, offset conversion tests |
| **5** | **dsl** | none | DSL functions, registry, template builders |
| **6** | **datastore** | schema, model(types) | CRUD, transaction, lock, overlay, marks, queries |
| **7** | **converter** | datastore | Conversion, load/save logic |
| **8** | **dom-observer** | text-analyzer | MutationObserver, change classification |
| **9** | **renderer-dom** | dsl, text-run-index | Reconciler, VNode↔DOM mapping, mark render |
| **10** | **renderer-react** | dsl | React build, renderer behavior |
| **11** | **model** | datastore, editor-core(types), schema | Transaction, DSL, operation execution |
| **12** | **editor-core** | datastore, model, renderer-dom, shared, schema | Keybindings, context, command execution, selectionManager |
| **13** | **extensions** | editor-core, model, converter | Extension commands, before/after hooks |
| **14** | **editor-view-dom** | dsl, datastore, dom-observer, editor-core, renderer-dom, schema, shared, text-analyzer | Input, selection, DOM sync |
| **15** | **editor-view-react** | dsl, editor-core, renderer-react, shared, text-analyzer, text-run-index | EditorView, selection, input-handler (add tests as needed) |
| **16** | **collaboration** | datastore | Collaboration adapter, sync |
| **17** | **devtool** | editor-core, model | Tracing, UI integration (optional) |

---

## 2. Per-package validation scope and test usage

For each package, **what to validate** and **which tests to use** are described below. If vitest tests exist, run `pnpm --filter @barocss/<package> test:run`.

### Tier 0 (no external deps)

- **shared**  
  - Validate: key strings, constants, shared types, util functions  
  - Tests: unit tests for input/output and edge cases  

- **schema**  
  - Validate: schema registration, getNodeType, group, content rules  
  - Tests: vitest in `packages/schema`, coverage as needed  

- **text-analyzer**  
  - Validate: `analyzeTextChanges`, Unicode/composing-char handling  
  - Tests: `packages/text-analyzer/test/` (smart-text-analyzer, unicode-text-analysis)  

- **text-run-index**  
  - Validate: `buildTextRunIndex`, `binarySearchRun`, offset↔DOM mapping  
  - Tests: add tests in package then `test:run`  

- **dsl**  
  - Validate: DSL functions, registry, template builders  
  - Tests: `packages/dsl/tests/` (dsl-functions etc.)  

### Tier 1 (datastore / converter / DOM·React render base)

- **datastore**  
  - Validate: getNode/setNode, transaction, lock, overlay, marks, content ops, queries, visitors  
  - Tests: `packages/datastore/test/` (data-store-*.test.ts, iterator, lock, mark, etc.) — **reuse existing tests**  

- **converter**  
  - Validate: doc↔storage format conversion, load/save consistency  
  - Tests: vitest in `packages/converter`  

- **dom-observer**  
  - Validate: MutationObserver setup, change collection, classification  
  - Tests: vitest in `packages/dom-observer`  

- **renderer-dom**  
  - Validate: reconciler, VNode↔DOM, marks/decorators, data-bc-sid assignment  
  - Tests: `packages/renderer-dom/test/` (reconciler, mark, decorator, etc.)  

- **renderer-react**  
  - Validate: build→React nodes, renderer instance behavior  
  - Tests: add unit tests as needed then `test:run`  

### Tier 2 (model, editor-core, extensions)

- **model**  
  - Validate: transaction execution, DSL sequence, per-operation side effects, selectionContext  
  - Tests: `packages/model/test/` — run **all** of `transaction/`, `operations/*.exec.test.ts`, `operations/*.test.ts` to prevent regressions  

- **editor-core**  
  - Validate: keybindings resolve, context update, executeCommand, selectionManager, updateSelection  
  - Tests: `packages/editor-core/test/` (selection-manager, editor, keybinding, etc.)  

- **extensions**  
  - Validate: command registration, execution, before/after hooks, converter integration  
  - Tests: `packages/extensions/test/`  

### Tier 3 (view, collaboration, tools)

- **editor-view-dom**  
  - Validate: input→model, selection DOM↔model sync, keydown/beforeinput  
  - Tests: `packages/editor-view-dom/test/` (event-handlers, integration, selection, etc.) — **reuse existing tests**  

- **editor-view-react**  
  - Validate: EditorView mount, selectionchange, input-handler, contentEditable event wiring  
  - Tests: add unit tests or tie to apps/editor-react E2E (re-enable E2E after internal logic is stable)  

- **collaboration**  
  - Validate: adapter, sync protocol, datastore integration  
  - Tests: collaboration, collaboration-yjs, collaboration-liveblocks each `test:run`  

- **devtool**  
  - Validate: tracing, event collection logic only when needed (optional)  

---

## 3. How to run

- **Single package**  
  ```bash
  pnpm --filter @barocss/<package> test:run
  ```
  Example: `pnpm --filter @barocss/datastore test:run`, `pnpm --filter @barocss/model test:run`

- **Full validation in order** (Tier 0 → 3)  
  ```bash
  pnpm --filter @barocss/shared test:run
  pnpm --filter @barocss/schema test:run
  pnpm --filter @barocss/text-analyzer test:run
  # … repeat in table order above
  ```

- **All at once (e.g. CI)**  
  From repo root or workspace: `pnpm -r test:run` (when each package has a `test:run` script).  
  Optionally reflect the order in this doc in CI scripts or checklists.

### 3.1 Spec-first when a test fails

When a test fails, **consult the spec before changing code**. The failure may be due to a wrong or outdated test, not a wrong implementation.

1. **Locate the spec**: `docs/specs/`, `packages/<name>/SPEC.md`, or package docs (e.g. `packages/renderer-dom/docs/renderer-dom-spec.md`).
2. **Compare**: If the spec describes behavior X and the test expects Y, treat the spec as source of truth and fix the test (or update the spec if it is wrong, then fix code/test).
3. See **AGENTS.md** §7.1 for full steps.

### 3.2 When a package has no test files

When a package has a `test` or `test:run` script but **no test files** and vitest exits with "No test files found", the agent must **create at least one test file** in that package, then re-run `test:run`.

- **Location**: The package's `test/` or `tests/` directory (follow existing package convention). Example: `packages/dom-observer/test/mutation-observer-manager.test.ts`.
- **Content**: Import the package entry or a core module and add at least one test that verifies behavior (e.g. instance creation, method call, return value). Describe only concrete facts and observed behavior.
- **Re-run**: After adding the test file, run `pnpm --filter @barocss/<package> test:run` again until it passes.

### 3.3 Always create issues first (mandatory)

When doing internal logic validation, **always** create GitHub issues for failures before any fix. Do **not** fix or open a PR until issues exist.

1. **Run tests** in the order above; collect pass/fail per package.
2. **Create GitHub issues** for each failing package (or one parent issue with a checklist). Each issue: title (e.g. `fix(test): dsl — registry.get and defineMark expectations`), body with failure summary (which tests fail, error messages or assertions).
3. **Then proceed** per issue: branch → fix → verify (`test:run` for that package) → commit → PR → merge (see `docs/github-agent-integration.md`).

Validation flow: **run tests in order → report pass/fail → create issues for every failure (mandatory) → fix per issue (branch, fix, verify, commit, PR, merge)**.

---

## 4. Summary

- **Internal logic validation**: Following the **1→2→…→17 order** above lets you validate upper packages with lower ones already stable.  
- **Test usage**: **Reuse** existing vitest tests; add unit tests where coverage is low (e.g. editor-view-react, text-run-index, renderer-react).  
- **Feature work**: Proceed only after the packages touched by the feature pass validation (tests pass).  
- **E2E**: Re-enable list/block E2E after the view layer (keydown, beforeinput wiring, etc.) is stable.
