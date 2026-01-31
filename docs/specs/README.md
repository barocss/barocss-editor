# Editor and Package Specifications

This directory and the linked package specs define **what the editor and each package guarantee**. Use them when implementing or changing behavior so that code, tests, and docs stay aligned.

---

## 1. Two levels of specs

| Level | What it describes | Where it lives |
|-------|-------------------|----------------|
| **Editor-wide** | Document model, selection semantics, operation semantics (user-visible and cross-package guarantees). | `docs/specs/editor.md` (and subsections if split later). |
| **Package** | A single package’s API, invariants, and behavior (inputs/outputs, what callers can rely on). | `packages/<name>/SPEC.md` (e.g. `packages/model/SPEC.md`). |

- **Editor-wide spec**: read when adding or changing user-visible behavior, operations, or selection; update when that behavior changes.
- **Package spec**: read when working inside that package or when another package depends on it; update when the package’s contract or behavior changes.

---

## 2. Where to find what

### Editor-wide

- **`docs/specs/editor.md`** — Document model (tree, block, text, marks), selection (resolution, `selectionAfter`), operation semantics (e.g. insertParagraph, insertText guarantees), and references to architecture/flow docs.

### Package specs

- **`packages/model/SPEC.md`** — Model: transaction, operations (inputs/outputs, invariants), selection resolution. Exec tests in `packages/model/test/operations/*.exec.test.ts` are the concrete spec for each operation.
- Other packages: add `packages/<name>/SPEC.md` when the package has a clear contract (API, invariants, or behavior that other packages or tests rely on). List new specs here and in `.cursor/AGENTS.md`.

### Existing docs that act as specs

- **`docs/dom/portal-system-spec.md`** — Portal system (renderer-dom): goals, API, behavior.
- **`docs/transaction-selection.md`** — When and how selection is updated during a transaction (selection resolution rules).
- **`docs/selection-application-flow.md`** — How `selectionAfter` flows from model to view.

When adding a new subsystem (e.g. collaboration, input handling), consider adding a `*-spec.md` under `docs/` or `docs/specs/` and linking it from this README.

---

## 3. When to update specs

| Change | Update |
|--------|--------|
| New or changed **user-visible behavior** (e.g. Enter creates a new paragraph, selection after paste) | `docs/specs/editor.md` (and operation semantics if applicable). |
| New or changed **operation** (inputs, outputs, invariants) | `packages/model/SPEC.md`, and the operation’s exec test. |
| New or changed **package API or guarantees** | That package’s `SPEC.md` (create one if missing). |
| New **subsystem** (e.g. new renderer feature) | New spec doc (e.g. `docs/specs/<subsystem>.md` or `docs/dom/<name>-spec.md`) and link from here. |

Rule: **if tests or callers rely on a behavior, that behavior belongs in a spec**. When you change the behavior, update the spec and the tests together.

### When to update the published docs (apps/docs-site)

When you change specs or user-visible behavior, update the **published documentation site** so it stays in sync:

- **New or changed operation**: add or update `apps/docs-site/docs/api/model-operations.md` (and model-operation-dsl.md, architecture/model.md if needed).
- **New concept or guide**: add or update a page under `apps/docs-site/docs/concepts/`, `guides/`, or `examples/`, and add it to `sidebars.ts`.

Full plan (when/what to update, build/verify) is in **`docs/docs-site-integration.md`**.

---

## 4. How agents use specs

1. **Before implementing**: Read the editor-wide spec for user-visible behavior and operation semantics; read the relevant package spec for the layer you are touching.
2. **While implementing**: Follow the guarantees (e.g. `selectionAfter.nodeId` is a text node when the spec says so); add or adjust exec tests so they assert the spec.
3. **After changing behavior**: Update the spec to match the new behavior; if user-facing, update **apps/docs-site** (see `docs/docs-site-integration.md`); then run the verification steps in `.cursor/AGENTS.md` (unit tests, E2E, optionally build docs-site).

References: `.cursor/AGENTS.md` (feature loop, verification), `docs/platform-for-agent.md` (patterns), `docs/docs-site-integration.md` (when/how to update docs-site), `docs/testing-verification.md` (what to run).
