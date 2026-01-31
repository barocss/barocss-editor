# Barocss Editor – AI Agent Entry Point

This repo is a **platform for building editors**. When adding or changing a feature, follow the order and docs below.

---

## 시작하기 (코드 없이)

우리가 만든 플로우만으로 시작하려면, **아래 순서**만 따라하면 된다.

### 1. 할 일이 하나 있어야 한다 (백로그 = GitHub 이슈)

- **열린 이슈가 이미 있으면** → 2번으로.
- **열린 이슈가 없으면** → 먼저 이슈를 하나 만든다.
  - **에이전트로 진행할 때**: "이번에 해야할을 알려주고 진행해줘"라고 하면, 에이전트가 **규칙**에 따라 새 자료 조사를 시작하고 필요한 것들을 이슈로 남긴 뒤 첫 이슈를 진행한다. (Research Agent → Backlog Agent → 이슈 생성 → 진행.)
  - **직접 만들 때**: GitHub에서 **New issue** → "Feature (model / extension / E2E)" 또는 "Bug fix" 템플릿 선택 → 제목·본문 채우고 생성.
  - 또는 에이전트에게: **"Act as Backlog Agent. 이슈 만들어줘: [원하는 기능 한 줄]."** (예: "이슈 만들어줘: insertList 기능 추가")

### 2. 한 문장으로 진행 시키기

에이전트에게 이렇게만 말한다:

- **"이번에 해야할을 알려주고 진행해줘"**  
  (또는 "할 일 알려주고 진행해줘" / "What needs to be done? Proceed.")

에이전트가 **열린 이슈 중 첫 번째**를 골라서:

1. **"이번에 할 일: [이슈 제목] (issue #N)"** 이라고 알려주고  
2. **Spec → Implementation → Test → E2E → GitHub** 순서로 진행한다.  
   (이슈가 버그 수정이면 Implementation부터, E2E만 추가면 그에 맞게 진행.)

코드는 보지 않아도 된다. 에이전트가 스펙·구현·테스트·문서·PR까지 처리한다.

### 3. (선택) 아이디어부터 넣고 싶을 때

- **"Act as Research Agent. 다른 에디터 조사해서 우리에 추가할 만한 기능 알려줘."**  
  → 보고서 + 이슈 초안이 나오면, 그걸 바탕으로 Backlog Agent로 이슈 생성.
- 그 다음 **"이번에 해야할을 알려주고 진행해줘"** 로 진행.

### 4. 다른 역할만 쓰고 싶을 때

- **README 정리**: "Act as README Agent. README 업데이트해줘." / "패키지 README 맞춰줘."
- **문서 사이트만**: "Act as Docs Agent. docs만 업데이트해줘."
- **PR 리뷰**: "Act as Review Agent. 이 PR 리뷰해줘."
- **릴리스**: "Act as Release Agent. 릴리스 해줘."
- **의존성/보안**: "Act as Security Agent. 의존성 업데이트해줘." / "보안 점검해줘."
- **리팩터만**: "Act as Refactor Agent. [패키지명] 패키지 리팩터해줘."

역할 전체 목록과 호출 방법: 아래 "Agent roles (sub-agents)" 섹션과 **`docs/agent-roles-and-orchestration.md`**.

---

## 규칙 (Rules)

- **GitHub에 열린 이슈가 없을 때**: 새 자료 조사를 시작하고, 우리에게 필요한 것들을 이슈로 남긴다. 이슈가 없다고 해서 멈추지 않는다. (Research Agent → Backlog Agent로 이슈 생성 → 생성된 첫 이슈로 진행.)
- **백로그 = GitHub 이슈**: 로컬 백로그 파일은 사용하지 않는다. 할 일은 항상 열린 이슈에서 가져온다.
- **한 번에 한 이슈**: "이번에 해야할을 알려주고 진행해줘"에서는 열린 이슈 중 하나(첫 번째 또는 `next` 라벨)만 골라 전체 플로우(Spec → Implementation → … → PR)를 진행한다.

---

## Single command: "이번에 해야할을 알려주고 진행해줘"

When the user says **"이번에 해야할을 알려주고 진행해줘"** (or "What needs to be done? Proceed." / "할 일 알려주고 진행해줘"), do the following in order.

### 1. Determine "what needs to be done"

**Backlog = GitHub issues.** Use open issues as the backlog.

1. **List open issues**: `gh issue list --state open --limit 10`. Pick the **first open issue** (or one labeled `next` if you use that). The issue title + body is the task.
2. **Nothing found (열린 이슈 없음)**: 이슈가 없으면 **멈추지 말고** 아래를 수행한다.
   - **Research Agent**: 다른 에디터·자료를 조사하고, 우리 에디터에 추가하면 좋을 기능·개선을 제안한다. 보고서 + **이슈 초안**(제목·본문)을 출력한다. (예: ProseMirror / Slate / Lexical / TipTap 등 리스트·블록·입력 처리 비교, 우리에 넣을 만한 항목 추천.)
   - **Backlog Agent**: Research Agent가 낸 이슈 초안을 바탕으로 GitHub에 **이슈를 생성**한다. (`gh issue create` 또는 웹으로 생성.) 생성된 이슈 중 **첫 번째**를 이번 할 일로 선택한다.
   - **이후**: step 2(Report)로 가서 "이번에 할 일: [첫 번째 이슈 제목] (issue #N)"라고 알린 뒤 step 3(Proceed)로 진행한다.
   - **`gh`를 쓸 수 없을 때**: Research Agent만 실행하고, 이슈 초안(제목·본문)을 사용자에게 보여준 뒤 "위 초안으로 GitHub에서 New issue를 만들어 주시면, 다음에 '이번에 해야할을 알려주고 진행해줘'로 진행할 수 있습니다."라고 안내한다.

### 2. Report

Reply with one short line: **"이번에 할 일: [issue title] (issue #N)"** (e.g. "이번에 할 일: Add insertList (issue #5)"). Then continue to step 3.

### 3. Proceed

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
- **GitHub Agent**: Open PR with template, link issue. Do not edit spec or code.

If the user only said "이번에 해야할을 알려주고 진행해줘" with no other context, use the **first open issue** and run the full flow. After each role, continue to the next role without asking unless a handback is needed (e.g. tests fail → fix or report). When the PR is merged, the issue is closed (e.g. "Closes #N"); no separate backlog file to update.

---

## Agent roles (sub-agents)

Work can be split by **role** so that different agents (or the same agent acting as different roles) handle spec, implementation, tests, E2E, and GitHub. Full definitions, inputs/outputs, handoff, and orchestration are in **`docs/agent-roles-and-orchestration.md`**.

| Role | Focus | Input | Output |
|------|--------|--------|--------|
| **Backlog** | GitHub issue lifecycle as backlog | User request (create/triage/order) | New issues, labels, issue list report |
| **Research** | Research other editors, suggest new features | User request (topic or "what to add") | Report (editors, features, recommendations), draft issue bodies |
| **Spec** | Spec and feature definition | User request, existing specs | Issue (optional), spec docs, implementation checklist |
| **Implementation** | Implement defined spec | Issue + spec + checklist | Branch, code (model, extension, view), exec tests, docs-site |
| **Test** | Unit and scenario tests | Branch + code | Unit test code/results; pass or hand back to Implementation |
| **E2E** | Browser E2E and behavior | Branch + unit pass | E2E spec/results; pass or hand back to Implementation |
| **GitHub** | Issue, PR, merge, deploy | Branch + tests pass | PR, merge (if allowed), deploy on merge |
| **Docs** | Documentation only (apps/docs-site) | Spec/code change or user request | Updated docs-site pages |
| **Review** | PR / branch review | PR or branch | Review comment (approve / request changes) |
| **Release** | Package release (changeset, version, publish) | User request or post-merge | Version PR or npm publish |
| **Security** | Dependency / security | User request or schedule | Audit report, dependency update PR |
| **Refactor** | Refactoring only (no new features) | User request or scope | Refactored code; Test Agent must pass after |
| **README** | README only (root + packages/*/README.md) | User request or new package/feature | Updated root README.md, updated packages/*/README.md |

**How to invoke by role**: Say “Act as **Spec Agent** …” (e.g. "이슈 만들어줘", "백로그 정리해줘" for Backlog; "다른 에디터 조사해서 추가할 만한 기능 알려줘" for Research), or Implementation / Test / E2E / GitHub Agent) and give the input (e.g. “For issue #123, implement per the checklist”). Each role only does its scope; handoff is defined in the doc above. **Role files**: **`.cursor/roles/`** — `BACKLOG_AGENT.md`, `RESEARCH_AGENT.md`, `SPEC_AGENT.md`, `IMPLEMENTATION_AGENT.md`, `TEST_AGENT.md`, `E2E_AGENT.md`, `GITHUB_AGENT.md`, `DOCS_AGENT.md`, `REVIEW_AGENT.md`, `RELEASE_AGENT.md`, `SECURITY_AGENT.md`, `REFACTOR_AGENT.md`, `README_AGENT.md` (short scope per role; @-mention when invoking). For **automation**, use triggers (e.g. issue labels `spec-ready`, `ready-for-test`, `unit-pass`, `e2e-pass`) as the contract; see `docs/agent-roles-and-orchestration.md` §4.2.

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

| Failure | What to do |
|--------|------------|
| **Unit test fails** in a package | Fix the code or the test in that package; re-run `pnpm --filter @barocss/<package> test:run` until it passes. Do not run E2E until unit passes. |
| **E2E fails** (e.g. selector, timeout) | 1) Run unit tests for the same feature (model + extensions); if unit passes, the issue is likely DOM/timing or selector. 2) Run E2E in headed mode (`pnpm --filter @barocss/editor-react test:e2e -- --headed`) and watch the run; adjust selectors or waits in the spec. 3) If the app’s initial content changed, update the spec to match. |
| **Only one E2E file fails** | Run that file alone: `pnpm --filter @barocss/editor-react test:e2e -- tests/<name>.spec.ts`; fix assertions or selectors in that file. |
| **Manual behavior wrong** but tests pass | Add or extend a unit test (e.g. exec test) or E2E test that asserts the expected behavior; then fix the implementation until the new test passes. |

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

To run the same flow with GitHub (issues, PRs, CI, merge, deploy):

- **Issue templates**: `.github/ISSUE_TEMPLATE/` (feature, bug fix, E2E-only). Use when creating an issue so the agent (or you) has a clear scope and verification checklist.
- **PR template**: `.github/PULL_REQUEST_TEMPLATE.md` — fill "What changed" and "Verification" when opening a PR.
- **CI**: On every push/PR to `main`, `.github/workflows/ci.yml` runs lint, type-check, unit tests, and E2E (editor-react). Merge only when CI passes.
- **Deploy**: Push to `main` deploys docs (`.github/workflows/docs.yml`). Package release: changesets + `pnpm version-packages` and `pnpm release` (see docs below).

Full flow (branch naming, opening PR, merge, deploy) is in **`docs/github-agent-integration.md`**.

---

## Platform perspective

What is needed so an AI Agent can develop editors indefinitely, what is already in place, and the todo checklist are in **`docs/platform-for-agent.md`**.
