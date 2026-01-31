# Barocss Editor – Platform Perspective: Enabling AI Agents to Develop Editors Indefinitely

This repo is a **textbook-style platform for building editors**. All packages (datastore, model, operation, extension, editor-view, schema, dsl, renderer, …) are related; **adding a feature means touching several layers with the same patterns and then verifying in the browser with E2E**.

This doc states that perspective and outlines **what is needed so an AI Agent can add and change editor features on this platform without bound**.

---

## 1. What the platform already provides

### 1.1 Layers and data flow

| Order | Layer | Package | Role |
|-------|--------|--------|------|
| 1 | **datastore** | @barocss/datastore | Node storage/read, content/marks API, lock, overlay, $alias |
| 2 | **model** | @barocss/model | Operation definitions, DSL, transaction, selection resolution |
| 3 | **operation** | model: operations + operations-dsl | defineOperation, defineOperationDSL, exec tests |
| 4 | **extension** | @barocss/extensions | Command registration, keybinding → command, run operation via transaction |
| 5 | **editor-view** | editor-view-dom / editor-view-react | Input/key → command, selection conversion, DOM/React render |
| 6 | **Documentation** | apps/docs-site | Published user/developer docs (concepts, architecture, API, guides, examples). Deploy to GitHub Pages. |
| Support | schema, dsl, renderer-dom, editor-core, text-analyzer, … | Each package | Schema, templates, render, commands/keybindings, text analysis, etc. |

A single feature (e.g. insertParagraph) flows in that order: datastore → model (operation + DSL) → extension (command) → editor-view (key/input) → E2E, then **documentation** (apps/docs-site) so the published site describes the feature. Full loop (spec → implementation → documentation → test → verify) is in **`docs/docs-site-integration.md`**.

### 1.2 Patterns already in place

- **Adding an operation**: implement operation → DSL → register-operations / operations-dsl index → exec test → (optional) E2E  
  → Documented in `.cursor/skills/model-operation-creation/SKILL.md`.
- **Full verification**: if you touch any of datastore/model/operation/extension/editor-view, confirm with **browser E2E**.  
  → `docs/testing-verification.md` §1.1, §2.4.
- **Per-package skills**: under `.cursor/skills/`, package-*, app-*, selection-application, model-operation-creation, etc., guide “where to change what”.

So **layers, patterns, and verification paths** are already defined like a textbook.

---

## 2. What is needed for “AI Agent to develop editors indefinitely”

For an agent to **keep adding and changing features** on this platform, the following should be in place.

### 2.1 Single entry point: “feature-adding loop”

- **One place** in the docs that states:  
  “To add feature F: 1) datastore if needed, 2) model operation + DSL + tests, 3) extension command, 4) editor-view binding, 5) add/update E2E, 6) add/update docs in apps/docs-site (api, architecture, guides, examples).”
- **References**: `docs/testing-verification.md` §1.1, `.cursor/skills/model-operation-creation/SKILL.md`, and **`docs/docs-site-integration.md`** (when/how to update docs-site).  
  → Treat that as the “default feature-adding loop”; other feature types (e.g. new block type, new mark) can extend it in the same doc or a linked doc (“for type F use this order + this skill”).

### 2.2 Consistent patterns and locations

- **Operation**: defineOperation + defineOperationDSL + register-operations + operations-dsl index + exec test + (when possible) E2E.  
  → Fixed patterns make it easier for the agent to predict the next step.
- **Extension**: registerCommand + (optional) keybinding; command runs transaction(editor, ops).commit().  
  → Same location (e.g. extensions/src) and shape when “adding a new command”.
- **Editor-view**: input/key → command call, selection conversion.  
  → Specify which app is the E2E target (currently React: `pnpm test:e2e:react`).

If docs and skills reflect the same patterns, the agent can choose “add operation only” vs “extension + E2E” and proceed accordingly.

### 2.3 Verification loop: unit tests + E2E

- **Unit**: `pnpm --filter @barocss/<package> test` (or test:run) to verify that package.  
  → `docs/testing-verification.md` §2.2.
- **E2E**: `pnpm test:e2e:react` (React), `pnpm test:e2e` (DOM) to verify “after all layers” in the browser.  
  → Put “always run E2E after feature add/change” in the checklist.
- **Practical verification**: step-by-step by scenario (new feature / bug fix / E2E-only), what to do when a test fails, and manual browser checks are in **`.cursor/AGENTS.md`** § “How to verify (practical)” (Verification by scenario, When something fails, Manual verification). A short summary and pointer is in **`docs/testing-verification.md`** §4 “Problem verification (practical)”.

If the agent follows “code change → unit test → E2E” and uses the scenario-based verification when needed, the platform can keep working as features are added indefinitely.

### 2.4 Expose “what to do where” via skills/docs

- **Per package**: “when editing this package, use this skill” is summarized in a table in `.cursor/skills/README.md`.  
  → When a new package is added, add a row and a skill for it.
- **Per flow**: flows that span packages (e.g. selection application, adding operations) are covered by cross-cutting skills (model-operation-creation, selection-application, etc.).  
  → When a “new flow” appears (e.g. new block type, new input handling), add a skill (and a doc if needed) in the same way.
- **Specs**: editor-wide and package-level specs define **what the editor and each package guarantee**.  
  → **`docs/specs/README.md`** describes organization (editor vs package); **`docs/specs/editor.md`** is the editor-wide spec; **`packages/<name>/SPEC.md`** is the package spec (e.g. `packages/model/SPEC.md`). Read specs before implementing; update specs and tests when behavior changes.

The agent can resolve “feature F” → “which package/flow” → “that skill + specs + testing-verification” to know what to do where.

### 2.5 Keep naming and directory conventions

- **Operation**: `operations/<name>.ts`, `operations-dsl/<name>.ts`, `test/operations/<name>.exec.test.ts`.  
- **E2E**: e.g. `apps/editor-react/tests/<feature>.spec.ts`.  
- **Skills**: package-*, app-*, flow name (e.g. model-operation-creation).

Fixed conventions let the agent grep/search for “where similar things live” and add new code in the same place.

---

## 3. Summary: todo checklist

To use the platform as a “textbook that lets an AI Agent develop editors indefinitely”:

| # | Todo | Current state |
|---|------|----------------|
| 1 | **Feature-adding loop** documented in one place (datastore → model → operation → extension → view → E2E) | Approximated in testing-verification.md §1.1; extend slightly for “by feature type” |
| 2 | **Pattern consistency** (operation + DSL + test + E2E, extension command, view binding) | Operation side covered by model-operation-creation skill; add extension/view patterns in the same style |
| 3 | **Verification loop** as default workflow (unit → E2E) | In testing-verification.md; stress “always run E2E” in AGENTS.md or platform doc |
| 4 | **Skills/docs** expose “what where” | .cursor/skills/README.md + package/app/flow skills exist; add a skill or doc per new feature type |
| 5 | **Naming/directory** conventions fixed and documented | Keep as in “patterns already in place”; add a “file/name rules” section to platform-for-agent.md or CONTRIBUTING if needed |
| 6 | **Agent entry point** in one place | This doc (docs/platform-for-agent.md) + .cursor/AGENTS.md link here and to skills README |
| 7 | **Documentation** (docs-site) in the loop | docs/docs-site-integration.md: when to update apps/docs-site, where to add api/architecture/guides/examples, build/verify |

Filling this checklist and following “layer order + patterns + verification” for each new feature keeps the repo as **both a textbook for editor development and a platform an AI Agent can extend indefinitely**.

---

## 4. How to give commands (user → agent)

When instructing the agent, say **what** to do and **which layer(s)** to touch; optionally ask to run tests.

- **Full feature**: e.g. “Add `insertList`: model operation + DSL + exec test, extension command, E2E in editor-react.”  
  → Agent follows the feature-adding loop and runs unit + E2E.
- **Single layer**: e.g. “Add operation `splitListItem` with DSL and exec test only.” or “Add E2E for toggleBold in editor-react.”
- **Fix or change**: e.g. “In insertParagraph, ensure selectionAfter.nodeId is always a text node; run model tests and E2E after.”
- **Verification**: e.g. “Run model and extension tests, then `pnpm test:e2e:react`.”

A **“How to give commands”** section with a table and examples lives in **`.cursor/AGENTS.md`**. Use it so the agent knows scope (feature vs layer) and when to run which tests.

---

## 5. References

- **Agent entry point and command phrasing**: `.cursor/AGENTS.md`
- **Specs (editor-wide and package-level)**: `docs/specs/README.md`, `docs/specs/editor.md`, `packages/model/SPEC.md`
- **Testing and verification**: `docs/testing-verification.md`
- **GitHub integration (issue, PR, CI, merge, deploy)**: `docs/github-agent-integration.md`
- **Docs-site (spec → implementation → documentation → test → verify)**: `docs/docs-site-integration.md`
- **Agent roles and orchestration (Spec / Implementation / Test / E2E / GitHub)**: `docs/agent-roles-and-orchestration.md`
- **Skills list and roles**: `.cursor/skills/README.md`
- **Operation-add pattern**: `.cursor/skills/model-operation-creation/SKILL.md`
- **Package relationships**: `docs/architecture-package-relationships.md`
