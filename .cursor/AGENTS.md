# Barocss Editor – AI Agent Entry Point

This repo is a **platform for building editors**. When adding or changing a feature, follow the order and docs below.

---

## Getting started (no code)

To start with the flow only, follow the **steps below** in order.

### 1. Have one task (backlog = GitHub issue)

- **If there is already an open issue** → go to step 2.
- **If there is no open issue** → create one first.
  - **With the agent**: Say "What needs to be done? Proceed." and the agent will run Research Agent → Backlog Agent → create issue(s) → proceed with the first issue.
  - **Manually**: On GitHub, **New issue** → choose "Feature (model / extension / E2E)" or "Bug fix" template → fill title and body.
  - Or tell the agent: **"Act as Backlog Agent. Create an issue: [one-line description]."** (e.g. "Create an issue: add insertList")

### 2. Proceed with one sentence

Tell the agent:

- **"What needs to be done? Proceed."**  
  (or "What needs to be done? Proceed." if the user prefers.)

The agent will pick the **first open issue** and:

1. Report **"Current task: [issue title] (issue #N)"**  
2. Run **Spec → Implementation → Test → E2E → GitHub** in order.  
   (For a bug fix, start from Implementation; for E2E-only, run the matching flow.)

No need to read code. The agent handles spec, implementation, tests, docs, and PR.

### 3. (Optional) Start from ideas

- **"Act as Research Agent. Research other editors and suggest features we could add."**  
  → You get a report + draft issue(s); use Backlog Agent to create issues from the draft.
- Then say **"What needs to be done? Proceed."**

### 4. Use a single role only

- **Internal logic validation**: "Act as Validation Agent. Validate internal logic."  
  → Follow **`docs/internal-logic-validation.md`**: run `test:run` per package in order; fix or report on failure. Use before adding features.
- **README**: "Act as README Agent. Update README." / "Align package READMEs."
- **Docs site only**: "Act as Docs Agent. Update docs only."
- **PR review**: "Act as Review Agent. Review this PR."
- **Release**: "Act as Release Agent. Release."
- **Dependencies / security**: "Act as Security Agent. Update dependencies." / "Security audit."
- **Refactor only**: "Act as Refactor Agent. Refactor [package name]."
- **Spec orchestration** (full spec creation and validation): "Act as Spec Orchestration Agent. Create/update full specs and validate." Keeps spec as source of truth so tests stay safe.

Full role list and invocation: see "Agent roles (sub-agents)" below and **`docs/agent-roles-and-orchestration.md`**. For splitting/parallel vs serial: **`docs/agent-roles-and-orchestration.md`** §3.1.

---

## Rules

- **English only**: All agent output (commit messages, PR/issue titles and body, comments, documentation, chat replies) must be in **English**. Do not use Korean or other languages unless the user explicitly requests it.
- **No open issues**: When there are no open GitHub issues, do not stop. Run Research Agent (gather ideas, suggest features), then Backlog Agent to create issue(s); proceed with the first created issue.
- **Backlog = GitHub issues**: Do not use local backlog files. Work always comes from open issues.
- **One issue at a time**: For "What needs to be done? Proceed.", pick a single open issue (first or labeled `next`) and run the full flow (Spec → Implementation → … → PR).
- **Minimize chat tokens**: Keep chat replies short (one or two sentences or bullets). Put detail in **issue body, commit message, PR description/comments, docs, docs/specs, apps/docs-site**.

---

## Single command: "What needs to be done? Proceed."

When the user says **"What needs to be done? Proceed."** or **"Proceed with the next task."** or **"다음 할일 진행해줘"** (or equivalent), do the following in order. **Always run spec verification first** (step 3 below) before the full flow.

### 1. Determine "what needs to be done"

**Backlog = GitHub issues.** Use open issues as the backlog.

1. **List open issues**: `gh issue list --state open --limit 10`. Pick the **first open issue** (or one labeled `next` if you use that). The issue title + body is the task.
2. **Nothing found (no open issues)**: Do **not** stop. Run:
   - **Research Agent**: Research other editors and materials; suggest features or improvements for our editor. Output a report + **draft issue(s)** (title + body). (e.g. compare ProseMirror / Slate / Lexical / TipTap list/block/input handling; recommend items to add.)
   - **Backlog Agent**: Create GitHub issue(s) from the Research draft (`gh issue create` or web). Pick the **first** created issue as the current task.
   - **Then**: Go to step 2 (Report), say "Current task: [first issue title] (issue #N)", then step 3 (Proceed).
   - **When `gh` is not available**: Run Research Agent only; show the user the draft issue(s) and say: "Create a New issue on GitHub from the draft above, then run 'What needs to be done? Proceed.' again."

### 2. Report

Reply with one short line: **"Current task: [issue title] (issue #N)"** (e.g. "Current task: Add insertList (issue #5)"). Then continue to step 3.

### 3. Proceed

**Spec verification first**: Before (or as part of) the full flow, run **spec verification** so that the next task starts from a known-good state and failures are interpreted against the spec.

1. **Run tests for the scope of the current task**:
   - **If the current issue targets a specific package** (e.g. issue title contains "renderer-dom", "fix(test): renderer-dom", or a package name), run **that package's tests only**: `pnpm --filter @barocss/<package> test -- --run` (e.g. `pnpm --filter @barocss/renderer-dom test -- --run`). This focuses spec verification on the package in scope.
   - **Otherwise**: Run tests for the repo (`pnpm test`) or per-package in order per **`docs/internal-logic-validation.md`**.
2. **If any test fails**: Follow **§7.1 Spec verification when tests fail** — locate the spec for the failing behavior (`docs/specs/`, `packages/<name>/SPEC.md`), compare spec vs test expectation, treat spec as source of truth, then fix the test or the implementation. Do not change code or test without consulting the spec first.
3. **Then** run the full flow for the current task (issue) in role order.

Run the **full flow** for that task, in role order:

| Task type | Flow |
|-----------|------|
| **New feature** (e.g. "Add insertList") | Spec Agent (issue + spec docs + implementation checklist) → Implementation Agent (branch, code, exec tests, docs-site) → Test Agent (unit tests) → E2E Agent (E2E spec + run) → GitHub Agent (PR). |
| **Bug fix / change** (e.g. "Fix selectionAfter") | Implementation Agent (branch, fix, tests) → Test Agent → E2E Agent → GitHub Agent. |
| **E2E only** (e.g. "Add E2E for toggleBold") | Implementation Agent (E2E spec only) or E2E Agent directly → GitHub Agent. |
| **Issue already has checklist** | Start from Implementation Agent (use issue body as checklist), then Test → E2E → GitHub. |

- **Spec Agent**: Create/update issue (optional), `docs/specs/editor.md` and/or `packages/<name>/SPEC.md`, and an implementation checklist. Do not write code.
- **Implementation Agent**: Create branch, implement per checklist (model → extension → docs-site). Do not run E2E or open PR.
- **Test Agent**: Run unit tests for touched packages; fix or hand back to Implementation if fail.
- **E2E Agent**: Run `pnpm test:e2e:react` (or `pnpm test:e2e`); add/update E2E spec if needed; report pass/fail.
- **GitHub Agent**: Open PR with template; **include "Closes #N" in the PR body** so the issue is closed when the PR is merged. Do not edit spec or code.

If the user only said "What needs to be done? Proceed." with no other context, use the **first open issue** and run the full flow. After each role, continue to the next role without asking unless a handback is needed (e.g. tests fail → fix or report). **PR body must include "Closes #N" (or "Fixes #N")** so that when the PR is merged, GitHub automatically closes the issue; no separate backlog file to update.

---

## Agent roles (sub-agents)

Work can be split by **role** so that different agents (or the same agent acting as different roles) handle spec, implementation, tests, E2E, and GitHub. Full definitions, inputs/outputs, handoff, and orchestration are in **`docs/agent-roles-and-orchestration.md`**. **Order and connections (diagrams)**: see **`docs/agent-roles-and-orchestration.md`** §3.0 (Mermaid flowcharts: main flow, handbacks, Spec Orchestration, on-demand agents).

| Role | Focus | Input | Output |
|------|--------|--------|--------|
| **Backlog** | GitHub issue lifecycle as backlog | User request (create/triage/order) | New issues, labels, issue list report |
| **Research** | Research other editors, suggest new features | User request (topic or "what to add") | Report (editors, features, recommendations), draft issue bodies |
| **Spec** | Spec and feature definition (per issue) | User request, existing specs | Issue (optional), spec docs, implementation checklist |
| **Spec Orchestration** | Full spec creation and validation | User request or schedule | Updated docs/specs + package SPECs, validation report (spec ↔ implementation ↔ test). Keeps spec as single source of truth so tests stay safe. |
| **Implementation** | Implement defined spec | Issue + spec + checklist | Branch, code (model, extension, view), exec tests, docs-site |
| **Test** | Unit and scenario tests | Branch + code | Unit test code/results; pass or hand back to Implementation |
| **E2E** | Browser E2E and behavior | Branch + unit pass | E2E spec/results; pass or hand back to Implementation |
| **GitHub** | Issue, PR, merge, deploy | Branch + tests pass | PR, merge (if allowed), deploy on merge |
| **Docs** | Documentation only (apps/docs-site) | Spec/code change or user request | Updated docs-site pages |
| **Review** | PR / branch review | PR or branch | Review comment (approve / request changes) |
| **Release** | Package release (changeset, version, publish) | User request or post-merge | Version PR or npm publish |
| **Security** | Dependency / security | User request or schedule | Audit report, dependency update PR |
| **Refactor** | Refactoring only (no new features) | User request or scope | Refactored code; Test Agent must pass after |
| **Validation** | Internal logic validation (package tests in order) | User request or "Validate internal logic" | Per-package test:run in order; pass/fail report; fix or escalate |
| **README** | README only (root + packages/*/README.md) | User request or new package/feature | Updated root README.md, updated packages/*/README.md |

**Spec Orchestration** should always be available: it orchestrates full spec creation and validation so that specs remain the single source of truth and test code stays safe. Invoke when you need to create/update all specs or validate that implementation and tests align with specs.

**How to invoke by role**: Say “Act as **Spec Agent** …” (e.g. "Create an issue", "Triage backlog" for Backlog; "Research other editors and suggest features" for Research), or Implementation / Test / E2E / GitHub Agent) and give the input (e.g. “For issue #123, implement per the checklist”). Each role only does its scope; handoff is defined in the doc above. **Role files**: **`.cursor/roles/`** — `BACKLOG_AGENT.md`, `RESEARCH_AGENT.md`, `SPEC_AGENT.md`, `SPEC_ORCHESTRATION_AGENT.md`, `IMPLEMENTATION_AGENT.md`, `TEST_AGENT.md`, `E2E_AGENT.md`, `GITHUB_AGENT.md`, `DOCS_AGENT.md`, `REVIEW_AGENT.md`, `RELEASE_AGENT.md`, `SECURITY_AGENT.md`, `REFACTOR_AGENT.md`, `VALIDATION_AGENT.md`, `README_AGENT.md` (short scope per role; @-mention when invoking). For **automation**, use triggers (e.g. issue labels `spec-ready`, `ready-for-test`, `unit-pass`, `e2e-pass`) as the contract; see `docs/agent-roles-and-orchestration.md` §4.2.

---

## Feature-adding loop

1. **datastore** (if needed) — add nodes/APIs  
2. **model** — implement operation + DSL + exec test  
3. **extension** — register command, run operation via transaction  
4. **editor-view** — input/key → command invocation  
5. **E2E** — verify in browser with `pnpm test:e2e:react` or `pnpm test:e2e`  
6. **Documentation** — add or update **apps/docs-site** (api, architecture, guides, examples) so the published site describes the feature. Build with `pnpm --filter @barocss/docs-site build` or `pnpm dev:docs` to confirm.

Details on layers, patterns, and verification are in **`docs/platform-for-agent.md`**. Full flow including docs-site (spec → implementation → documentation → test → verify) is in **`docs/docs-site-integration.md`**.

## Where to do what

- **Internal logic validation (per-package order and tests)**: **`docs/internal-logic-validation.md`**  
  - Validation order (shared → schema → … → devtool), what to validate per package, how to run tests. Follow this doc when "Validate internal logic" / "Act as Validation Agent".
- **Package / app / flow skills**: **`.cursor/skills/README.md`**  
  - Which skill to use per package, cross-cutting flows (e.g. adding operations, selection), and app roles (editor-test, editor-react) in a table.
- **Adding an operation**: **`.cursor/skills/model-operation-creation/SKILL.md`**  
  - How to add defineOperation, DSL, registration, exec test, and E2E as one set.
- **Running tests**: **`docs/testing-verification.md`**  
  - Unit tests, E2E (React/DOM), per-package commands.
- **Specs (what the editor and packages guarantee)**: **`docs/specs/README.md`**  
  - Editor-wide: `docs/specs/editor.md` (document model, selection, operation semantics).  
  - Package-level: `packages/<name>/SPEC.md` (e.g. `packages/model/SPEC.md`). Read before implementing; update when behavior changes.
- **Documentation (published site)**: **`docs/docs-site-integration.md`**  
  - When to update **apps/docs-site** (new operation → api/model-operations, architecture; new guide/example → guides/, examples/; sidebar).  
  - Full loop: spec → implementation → **documentation** → test → verify.

## How to give commands

When you ask the agent to change this repo, phrase the request so the agent knows **what** to do and **which layer(s)** to touch. After changes, the agent should run the right tests.

### By scope

| You want to… | Say something like… | Agent will… |
|--------------|---------------------|-------------|
| Add a **new feature** end-to-end | “Add a `insertList` feature: model operation + DSL + exec test, extension command, and E2E in editor-react.” | Follow the feature-adding loop (model → extension → view → E2E → docs-site), use model-operation-creation skill, update apps/docs-site (api/model-operations, etc.) if requested, then run unit + E2E and build docs-site. |
| Add **only a model operation** | “Add a `splitListItem` operation with DSL and exec test (no extension yet).” | Create operation + DSL, register, add `packages/model/test/operations/splitListItem.exec.test.ts`, run `pnpm --filter @barocss/model test -- test/operations/splitListItem.exec.test.ts`. |
| Add **only E2E** for existing behavior | “Add an E2E test in editor-react for toggleBold: select text, press Mod+b, assert bold.” | Add or extend `apps/editor-react/tests/*.spec.ts`, run `pnpm test:e2e:react`. |
| **Fix or change** one layer | “In insertParagraph, ensure selectionAfter.nodeId is always a text node.” | Edit the relevant package (e.g. model), run that package’s tests and, if needed, E2E. |
| **Verify** after changes | “Run unit tests for model and extensions and then E2E for React.” | Run `pnpm --filter @barocss/model test:run`, `pnpm --filter @barocss/extensions test:run`, then `pnpm test:e2e:react`. |
| **Internal logic validation** (per-package) | "Validate internal logic." / "Act as Validation Agent. Validate internal logic." | Follow **`docs/internal-logic-validation.md`**: run `pnpm --filter @barocss/<package> test:run` in the documented order (shared → schema → … → devtool); report pass/fail; fix or escalate. |

### What to include in a command

- **Feature or change**: name it (e.g. “insertList”, “toggleBold E2E”).
- **Layers**: say which of datastore / model / extension / editor-view (and which app: editor-react vs editor-test) you care about.
- **Verification**: ask to run tests when it matters, e.g. “then run `pnpm test:e2e:react`” or “run the model and extension tests”.

### Examples

- “Add a new model operation `wrapInBlockquote` with DSL and exec test, then add a ParagraphExtension command and E2E in editor-react.”
- “Add E2E tests for insertParagraph in editor-react: Enter in paragraph, Enter at end of heading.”
- “Fix insertParagraph so selectionAfter.nodeId is always a text node; run model and editor-react E2E after.”

---

## How to verify (practical)

After making changes, run the right tests in this order. All commands are from the **repo root** unless noted.

### 1. What you changed → what to run

| You changed | Run (in order) |
|-------------|----------------|
| **datastore** only | `pnpm --filter @barocss/datastore test:run` |
| **model** (operations, transaction, DSL) | `pnpm --filter @barocss/model test:run` |
| **model** and you added a new operation | `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts` then `pnpm --filter @barocss/model test:run` |
| **extensions** | `pnpm --filter @barocss/extensions test:run` |
| **editor-view-dom** | `pnpm --filter @barocss/editor-view-dom test:run` |
| **editor-view-react** | (no unit test script; rely on E2E) |
| **schema** | `pnpm --filter @barocss/schema test:run` |
| **Full feature** (model + extension + view) | Unit for each touched package (see above), then **E2E** (see step 2). |
| **docs-site** (docs changed) | `pnpm --filter @barocss/docs-site build` (or `pnpm dev:docs` to preview). Deploy: push to main (`.github/workflows/docs.yml`). |

### 2. E2E (browser)

- **React app** (recommended for feature checks):  
  `pnpm test:e2e:react`  
  - Starts editor-react on port 5175 if needed, runs Playwright.
- **DOM app**:  
  `pnpm test:e2e`  
  - Starts editor-test on port 5173 if needed, runs Playwright.
- **Single E2E file**:  
  `pnpm --filter @barocss/editor-react test:e2e -- tests/insertParagraph.spec.ts`

Run E2E **after** unit tests pass when you touched model, extension, or editor-view.

### 3. Full verification (sanity check)

From repo root, run everything that can run:

```bash
pnpm test
pnpm test:e2e:react
```

`pnpm test` runs Vitest in all packages that have a `test` script (not Playwright). Then E2E for React.

### 4. Manual browser check

- Start app: `pnpm dev:react` (React, port 5175) or `pnpm dev:site` (DOM, port 5173).
- Open the URL, interact (e.g. Enter, typing, bold), confirm behavior.
- Use when E2E doesn’t cover the case or to double-check after a fix.

### 5. Quick reference

| Goal | Command |
|------|--------|
| Model unit only | `pnpm --filter @barocss/model test:run` |
| Model single operation test | `pnpm --filter @barocss/model test -- test/operations/insertParagraph.exec.test.ts` |
| Extensions unit | `pnpm --filter @barocss/extensions test:run` |
| E2E React | `pnpm test:e2e:react` |
| E2E DOM | `pnpm test:e2e` |
| All unit (no E2E) | `pnpm test` |
| Manual React app | `pnpm dev:react` → http://localhost:5175 |

### 6. Verification by scenario (step-by-step)

Use this when you need a fixed sequence to confirm the change.

**New feature (e.g. insertList)**

1. Run the new operation’s exec test:  
   `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts`  
   → All tests in that file must pass.
2. Run full model tests:  
   `pnpm --filter @barocss/model test:run`  
   → No regressions.
3. If an extension was added:  
   `pnpm --filter @barocss/extensions test:run`  
   → Extension tests pass.
4. Run E2E for the app you changed:  
   `pnpm test:e2e:react` (or `pnpm test:e2e` for DOM).  
   → At least the new or updated spec must pass.
5. Optional manual check:  
   `pnpm dev:react` → open http://localhost:5175 → perform the action (e.g. trigger the new command) → confirm result in the DOM (e.g. new block, new list item).

**Bug fix or behavior change (e.g. selectionAfter in insertParagraph)**

1. Run the affected package’s tests (e.g. model):  
   `pnpm --filter @barocss/model test:run`  
   → Fix any failing test; add or adjust tests so the new behavior is asserted.
2. If the fix touches extensions:  
   `pnpm --filter @barocss/extensions test:run`  
   → All pass.
3. Run E2E:  
   `pnpm test:e2e:react`  
   → No new failures; if an E2E was added for the bug, it must pass.
4. Manual check:  
   Reproduce the old bug scenario in the browser (e.g. Enter in paragraph, then type); confirm the bug is gone (e.g. caret in the right node, no crash).

**E2E-only change (new or updated spec)**

1. Run E2E:  
   `pnpm test:e2e:react` (or `pnpm test:e2e`).  
   → New/updated spec passes; existing specs still pass.
2. If the app’s initial content or DOM changed:  
   Update the spec’s selectors/assertions to match the current app (see `apps/editor-react/src/` or `apps/editor-test/src/main.ts`).

### 7. When something fails

**Spec-first rule**: When a test fails, **check the spec before changing code**. The failure may be due to a wrong or outdated test, not a wrong implementation. See **§7.1 Spec verification when tests fail** below.

| Failure | What to do |
|--------|------------|
| **Unit test fails** in a package | 1) **Consult spec first** (see §7.1). 2) If spec matches implementation and test expects something else, fix the test. 3) If spec is wrong or unclear, update the spec, then fix code or test. 4) Re-run `pnpm --filter @barocss/<package> test:run` until it passes. Do not run E2E until unit passes. |
| **Package has no test files** (vitest reports "No test files found") | Create a minimal test file in that package (e.g. `test/<name>.test.ts` with one smoke test that imports and asserts core behavior). Then re-run `pnpm --filter @barocss/<package> test:run`. See **`docs/internal-logic-validation.md`** §3.2. |
| **E2E fails** (e.g. selector, timeout) | 1) Run unit tests for the same feature (model + extensions); if unit passes, the issue is likely DOM/timing or selector. 2) Run E2E in headed mode (`pnpm --filter @barocss/editor-react test:e2e -- --headed`) and watch the run; adjust selectors or waits in the spec. 3) If the app’s initial content changed, update the spec to match. |
| **Only one E2E file fails** | Run that file alone: `pnpm --filter @barocss/editor-react test:e2e -- tests/<name>.spec.ts`; fix assertions or selectors in that file. |
| **Manual behavior wrong** but tests pass | Add or extend a unit test (e.g. exec test) or E2E test that asserts the expected behavior; then fix the implementation until the new test passes. |

#### 7.1 Spec verification when tests fail

Before fixing a failing test by changing implementation or test:

1. **Locate the spec** for the failing behavior:
   - Editor-wide: **`docs/specs/editor.md`**, **`docs/specs/README.md`**
   - Package-level: **`packages/<name>/SPEC.md`** (e.g. `packages/model/SPEC.md`)
   - Package docs: **`packages/<name>/docs/`** or **`packages/<name>/README.md`** (e.g. `packages/renderer-dom/docs/renderer-dom-spec.md`)
2. **Compare**: Does the spec describe the same behavior the test expects? If the spec says X and the test expects Y, treat the **spec as the source of truth** and fix the test to match the spec (unless the spec is clearly wrong or outdated).
3. **If the spec is wrong or missing**: Update the spec first (issue, `docs/specs/` or `packages/<name>/SPEC.md`), then fix code or test so that implementation and tests align with the updated spec.
4. **If the spec is correct and the implementation disagrees**: Fix the implementation and keep the test.

This avoids changing correct code when the test was written against a different (or outdated) understanding of the behavior.

### 8. Manual verification (what to check in the browser)

After code changes, if you need to confirm behavior by hand:

1. Start app: `pnpm dev:react` → http://localhost:5175 (or `pnpm dev:site` for DOM).
2. **Insert paragraph**: Click in a paragraph, press Enter → new empty paragraph below; caret in the new paragraph. Press Enter at end of a heading → new paragraph below; block type of the new block as intended.
3. **Typing**: Type in the content area → text appears at caret; no duplicate or missing characters.
4. **Block type**: Select a paragraph, apply block-type command (e.g. heading) → block type and DOM (e.g. tag name) change as expected.
5. **Marks (bold/italic)**: Select text, apply mark (e.g. Mod+b) → text shows the mark; deselect and apply again → mark removed.

If any of these fail, add or adjust a test (unit or E2E) that reproduces the failure, then fix the code.

---

## GitHub: issue → PR → merge → deploy

**Rule: do not merge locally.** Flow is: create branch → commit → **push branch** → **open PR** → **merge via PR** (on GitHub or `gh pr merge`). Do not run `git merge <branch> main` and push main; that skips the PR and CI on the PR branch.

To run the same flow with GitHub (issues, PRs, CI, merge, deploy):

- **Issue templates**: `.github/ISSUE_TEMPLATE/` (feature, bug fix, E2E-only). Use when creating an issue so the agent (or you) has a clear scope and verification checklist.
- **PR template**: `.github/PULL_REQUEST_TEMPLATE.md` — fill "What changed" and "Verification" when opening a PR.
- **CI**: On every push/PR to `main`, `.github/workflows/ci.yml` runs lint, type-check, unit tests, and E2E (editor-react). Merge only when CI passes.
- **Deploy**: Push to `main` deploys docs (`.github/workflows/docs.yml`). Package release: changesets + `pnpm version-packages` and `pnpm release` (see docs below).

Full flow (branch naming, opening PR, merge, deploy) is in **`docs/github-agent-integration.md`**.

---

## Platform perspective

What is needed so an AI Agent can develop editors indefinitely, what is already in place, and the todo checklist are in **`docs/platform-for-agent.md`**.
