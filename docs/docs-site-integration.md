# Docs-Site Integration: Spec → Feature → Implementation → Documentation → Test → Verify

This doc describes how **apps/docs-site** (the published documentation site) fits into the full agent flow: **spec definition**, **feature definition**, **implementation**, **documentation**, **testing**, and **verification**. So an agent can do all of these in one loop.

---

## 1. Two doc trees

| Location | Role | Audience |
|----------|------|----------|
| **Repo root `docs/`** | Specs, platform, verification, GitHub integration, internal architecture. Source of truth for behavior and process. | Agents, maintainers, contributors. |
| **apps/docs-site/docs/`** | Published user/developer docs (Docusaurus). Concepts, architecture, API reference, guides, examples. Deployed to GitHub Pages. | Users and developers who use the editor. |

- **Specs and behavior**: live in `docs/specs/` and `packages/<name>/SPEC.md`. When behavior or API changes, update those first, then sync the **user-facing** parts into docs-site.
- **Docs-site**: summarizes and explains for readers; it should stay consistent with specs and API. When you add a feature or operation, add or update the relevant docs-site page(s) so the published site reflects the change.

---

## 2. Full loop (with documentation)

| Step | What | Where |
|------|------|--------|
| 1 | **Spec / behavior** | `docs/specs/editor.md`, `packages/model/SPEC.md` (or relevant package). Define or update guarantees. |
| 2 | **Feature / operation** | Model: operation + DSL + exec test; extension: command; view: binding. |
| 3 | **Implementation** | Code in packages (model, extensions, editor-view, etc.). |
| 4 | **Documentation** | **apps/docs-site**: add or update concept/architecture/API/guide/example so the published site describes the feature. |
| 5 | **Testing** | Unit tests (exec test, package tests), E2E (`pnpm test:e2e:react` or `pnpm test:e2e`). |
| 6 | **Verification** | Run tests; optionally build docs-site and open in browser to confirm docs. |

Details on verification are in **`.cursor/AGENTS.md`** § How to verify. Details on specs are in **`docs/specs/README.md`**.

---

## 3. When to update docs-site

| Change | Update in docs-site |
|--------|---------------------|
| **New operation** (e.g. insertList) | `docs/api/model-operations.md` (add section); optionally `docs/api/model-operation-dsl.md`; `docs/architecture/model.md` if the package surface changes. |
| **New concept or flow** (e.g. selection resolution) | `docs/concepts/` or `docs/architecture/` (new or existing page); link from introduction or overview. |
| **New guide** (e.g. how to add a custom operation) | `docs/guides/` (e.g. `custom-operations.md`); add to `sidebars.ts` under Extending. |
| **New example** (e.g. list editing) | `docs/examples/` (e.g. new .md); add to `sidebars.ts` under Demos. |
| **API or behavior change** (spec updated) | Update the corresponding docs-site page (api/model-operations.md, architecture/model.md, etc.) so it matches the spec. |
| **New package** or major package role change | `docs/architecture/<package>.md`; add to `sidebars.ts` Architecture → Packages. |

Rule: **if a user or developer would look for it on the published site, it belongs in docs-site.** After changing specs or code, update the docs-site page that describes that behavior.

---

## 4. Where to add what (docs-site)

### 4.1 Structure (apps/docs-site/docs/)

| Folder | Use for |
|--------|---------|
| **concepts/** | Schema and model, DSL templates, rendering, editor-core, editor-view-dom, decorators. High-level concepts. |
| **architecture/** | Package roles (schema, datastore, model, dsl, renderer-dom, editor-core, editor-view-dom, converter, extensions, etc.). Overview and practical examples. |
| **api/** | API reference: editor-core, editor-view-dom, dsl, schema, model, operations (overview, selection guide, datastore operations, model operations, model-operation-dsl), datastore, renderer-dom, converter, extensions, collaboration. |
| **guides/** | How-to: extension design, custom operations, advanced extensions, decorator guide, before-hooks, etc. |
| **examples/** | Basic editor, custom extensions, decorators. Runnable or copy-paste examples. |

### 4.2 Sidebar (sidebars.ts)

- When you add a **new doc** under docs/, add it to `sidebars.ts` in the right category (Getting Started, Core Concepts, Architecture, Extending, Demos, API Reference).
- When you add a **new operation** and document it only in an existing page (e.g. model-operations.md), no sidebar change needed.
- When you add a **new guide or example**, add a new item under Extending or Demos.

### 4.3 New operation: checklist

1. Implement: operation + DSL + exec test (model), command (extension), key/input (view if needed).
2. **Docs-site**:
   - **api/model-operations.md**: add a section for the new operation (name, payload, behavior, DSL usage, example).
   - **api/model-operation-dsl.md**: add DSL helper and example if applicable.
   - **architecture/model.md**: if the package’s “Key Exports” or usage pattern changes, update that section.
3. Specs: update `packages/model/SPEC.md` (and `docs/specs/editor.md` if user-visible semantics change).
4. Tests: run unit + E2E; add E2E if the feature is user-facing.
5. Build docs-site: `pnpm --filter @barocss/docs-site build` (or from repo root `pnpm build:docs` if defined); open build or run `pnpm dev:docs` to confirm.

---

## 5. Build and verify docs-site

- **Local dev**: `pnpm dev:docs` (or `pnpm --filter @barocss/docs-site dev`). Open the URL (e.g. http://localhost:3000) and check the updated page.
- **Build**: `pnpm --filter @barocss/docs-site build`. Ensures the site builds without errors; run after changing docs or Docusaurus config.
- **Deploy**: Push to `main`; `.github/workflows/docs.yml` builds and deploys to GitHub Pages when paths under `apps/docs-site/**`, `docs/**`, or `packages/**/docs/**` change.

Optional: add a CI job that runs `pnpm --filter @barocss/docs-site build` on every PR so doc breakages are caught early.

---

## 6. Agent workflow summary (with docs)

1. **Spec**: Define or update behavior in `docs/specs/editor.md` and/or `packages/<name>/SPEC.md`.
2. **Feature / implementation**: Add operation + DSL + exec test, extension command, view binding (following `.cursor/AGENTS.md` feature loop).
3. **Documentation**: Add or update pages in **apps/docs-site/docs/** (api/model-operations, architecture/model, guides, examples) and **sidebars.ts** so the published site describes the feature.
4. **Testing**: Run unit tests and E2E (`pnpm test:e2e:react` or `pnpm test:e2e`).
5. **Verification**: Run tests; build docs-site; optionally open site in browser to confirm.

This way the agent can do **spec definition → feature definition → implementation → documentation → testing → verification** in one flow, with docs-site as the published outcome of the documentation step.

---

## 7. References

- **Agent entry and feature loop**: `.cursor/AGENTS.md`
- **Specs**: `docs/specs/README.md`, `docs/specs/editor.md`, `packages/model/SPEC.md`
- **Testing and verification**: `docs/testing-verification.md`
- **GitHub (CI, deploy)**: `docs/github-agent-integration.md` (docs deploy: `.github/workflows/docs.yml`)
- **Docs-site structure**: `apps/docs-site/README.md`, `apps/docs-site/sidebars.ts`
