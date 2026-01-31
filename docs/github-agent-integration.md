# GitHub and Agent Integration: Issue → PR → Merge → Deploy

This doc describes how to tie the editor development flow (and AI agents) to GitHub: **issue creation**, **PR creation**, **merge**, and **deploy**, so that agents can drive work from an issue to a merged PR with automated checks and deployment.

---

## 1. Overview

| Step | Who | What |
|------|-----|------|
| **Issue** | User or agent | Create an issue from a template (feature / bug / E2E). Agent uses it as the spec. |
| **Branch** | Agent | Create branch from `main` (e.g. `feat/insert-list`, `fix/insert-paragraph-selection`). |
| **Implement** | Agent | Follow `.cursor/AGENTS.md` feature loop; run verification (`.cursor/AGENTS.md` § How to verify). |
| **PR** | Agent | Push branch, open PR with template filled; CI runs automatically. |
| **Merge** | Human or automation | Merge when CI passes (and optional review). |
| **Deploy** | GitHub Actions | Docs deploy on push to `main`; package release via changesets (see below). |

Agents can automate up to **PR creation**; **merge** and **release** are typically human-approved or triggered by merging a version PR.

---

## 2. Issue: creation and templates

### 2.1 Where

- **Templates**: `.github/ISSUE_TEMPLATE/`
  - **Feature**: new operation/extension/E2E — use "Feature (model / extension / E2E)".
  - **Bug fix**: fix or behavior change — use "Bug fix / behavior change".
  - **E2E only**: add or update E2E tests only — use "E2E test only".

### 2.2 How (user or agent)

1. On GitHub: **New issue** → choose the template → fill title and body.
2. Or with GitHub CLI:  
   `gh issue create --title "[Feature] insertList" --body-file - < issue-body.md`  
   (use the template body as `issue-body.md`).

### 2.3 What the agent does with an issue

- Read the issue (title + body) to know scope: feature / fix / E2E-only.
- Use the "Verification" section in the template as the checklist to run before opening a PR.
- Optionally reference the issue in the PR (e.g. "Closes #123").

### 2.4 Rule: no open issues → research and create issues

When there are **no open GitHub issues**, the agent must not stop. It must:

1. **Research Agent**: Start new research (e.g. other editors, features we could add), then produce a report and **draft issue(s)** (title + body).
2. **Backlog Agent**: Create GitHub issue(s) from those drafts (`gh issue create` or equivalent).
3. Then treat the **first created (or first open) issue** as the current task and run the full flow (Spec → Implementation → … → PR).

See `.cursor/AGENTS.md` § 규칙 (Rules) and § Single command step 1 "Nothing found".

---

## 3. Branch and PR

### 3.1 Branch naming

- **Feature**: `feat/<short-name>` (e.g. `feat/insert-list`, `feat/wrap-blockquote`).
- **Fix**: `fix/<short-name>` (e.g. `fix/insert-paragraph-selection`).
- **E2E only**: `e2e/<short-name>` or `test/<short-name>` (e.g. `e2e/toggle-bold`).

Create from `main`:

```bash
git fetch origin main
git checkout -b feat/insert-list origin/main
```

(If your workflow uses `git new`, use that alias instead of `git checkout -b`.)

### 3.2 PR template

- **File**: `.github/PULL_REQUEST_TEMPLATE.md`
- When opening a PR, fill: **What changed**, **Verification** (what was run), **Related** (issue link).
- CI runs on every push to the PR branch: lint, type-check, unit tests, E2E (React).

### 3.3 Opening a PR (agent or human)

After implementing and verifying locally:

```bash
git add -A
git commit -m "feat(model,extensions): add insertList operation and E2E"
git push origin feat/insert-list
gh pr create --base main --head feat/insert-list --title "Add insertList (model + extension + E2E)" --body "See template checklist."
```

Or use GitHub web UI: **Compare & pull request** and fill the template.

---

## 4. CI: what runs on PR and push

- **Workflow**: `.github/workflows/ci.yml`
- **Triggers**: `push` and `pull_request` to `main`.

**Jobs:**

| Job | Runs |
|-----|------|
| **Lint, type-check, unit test** | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm type-check`, `pnpm test` |
| **E2E (editor-react)** | `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e:react` |

- Merge only when both jobs pass (and any required review, if configured).
- Branch protection (see below) can require "Lint, type-check, unit test" and "E2E (editor-react)" as required status checks.

---

## 5. Merge

- **Who**: Human (merge button / squash) or automation with write access (e.g. merge when CI green and approved).
- **Recommendation**: Keep merge as a human step or a controlled automation (e.g. "auto-merge when CI passes and label `auto-merge` is added").

**Branch protection (optional but recommended):**

- **main**: Require a pull request, require status checks ("Lint, type-check, unit test", "E2E (editor-react)"), optionally require review.
- In **Settings → Branches → Branch protection rules**: add rule for `main`, enable "Require status checks to pass", and select the CI job names above.

---

## 6. Deploy

### 6.1 Docs (GitHub Pages)

- **Workflow**: `.github/workflows/docs.yml`
- **Trigger**: Push to `main` that touches `apps/docs-site/**`, `docs/**`, or `packages/**/docs/**`; or `workflow_dispatch`.
- **Effect**: Builds docs and deploys to GitHub Pages. No extra step after merge to `main`.

### 6.2 Packages (npm publish)

- **Tool**: [Changesets](https://github.com/changesets/changesets). Config: `.changeset/config.json` (base branch `main`).
- **Flow**:
  1. On a branch: add a changeset with `pnpm changeset` (describe the change and version bump type).
  2. Merge the PR (with the changeset file) to `main`.
  3. On `main`: run `pnpm version-packages` (consumes changesets, updates versions), commit and push (or open a "Version packages" PR and merge).
  4. Publish: run `pnpm release` (`pnpm build && changeset publish`) from `main` when you want to publish to npm.

**Automation option:** Add a workflow that, on push to `main`, runs `pnpm version-packages` and, if there are version bumps, commits and runs `pnpm release` (requires npm token in secrets). For a simpler setup, keep version and publish manual.

---

## 7. Agent workflow summary

1. **Input**: User creates an issue (or says "add insertList" → agent creates an issue from the feature template).
2. **Branch**: Agent creates `feat/insert-list` from `main`.
3. **Implement**: Agent follows `.cursor/AGENTS.md` (model → extension → E2E) and runs verification (exec test → model test → extensions test → E2E).
4. **Commit & push**: Agent commits and pushes to `feat/insert-list`.
5. **PR**: Agent opens a PR with title and body from `.github/PULL_REQUEST_TEMPLATE.md`, referencing the issue.
6. **CI**: GitHub Actions run lint, type-check, unit tests, E2E. Agent or user fixes any failures and pushes.
7. **Merge**: Human (or automation) merges the PR to `main`.
8. **Deploy**: Docs deploy automatically if docs changed; packages are published when maintainers run the changeset flow and `pnpm release`.

---

## 8. References

- **Agent entry and verification**: `.cursor/AGENTS.md`
- **Testing and verification**: `docs/testing-verification.md`
- **Platform and feature loop**: `docs/platform-for-agent.md`
- **CI workflow**: `.github/workflows/ci.yml`
- **Docs deploy**: `.github/workflows/docs.yml`
- **Changesets**: `.changeset/config.json`, root `package.json` scripts `changeset`, `version-packages`, `release`
