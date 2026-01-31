# Agent roles

Each file in this directory defines one **role** for sub-agent invocation. When you say “Act as **Backlog Agent**” (or Research / Spec / Implementation / Test / E2E / GitHub / Docs / Review / Release / Security / Refactor / README Agent), read the corresponding file and **`docs/agent-roles-and-orchestration.md`** for full scope, inputs, outputs, and handoff.

| File | Role | Focus |
|------|------|--------|
| **BACKLOG_AGENT.md** | Backlog Agent | GitHub issue lifecycle as backlog (create, label, order, triage). No implement, no spec. |
| **RESEARCH_AGENT.md** | Research Agent | Research other editors, suggest new features (report, draft issue bodies). No implement. |
| **SPEC_AGENT.md** | Spec Agent | Spec and feature definition (issue, spec docs, implementation checklist). No code. |
| **IMPLEMENTATION_AGENT.md** | Implementation Agent | Implement spec (branch, code, exec tests, docs-site). No E2E, no PR. |
| **TEST_AGENT.md** | Test Agent | Unit tests and results. No E2E, no PR. |
| **E2E_AGENT.md** | E2E Agent | E2E spec and browser run. No PR. |
| **GITHUB_AGENT.md** | GitHub Agent | PR, merge, deploy. No spec/code edits. |
| **DOCS_AGENT.md** | Docs Agent | Documentation only (apps/docs-site). No implement, no spec. |
| **REVIEW_AGENT.md** | Review Agent | PR/branch review. No implement, no merge. |
| **RELEASE_AGENT.md** | Release Agent | Package release (changeset, version, publish). No implement, no merge. |
| **SECURITY_AGENT.md** | Security Agent | Dependency/security. No feature implement. |
| **REFACTOR_AGENT.md** | Refactor Agent | Refactoring only; no new features. Test Agent runs after. |
| **README_AGENT.md** | README Agent | README only (root + packages/*/README.md). No implement, no apps/docs-site. |

**Flow**: Spec → Implementation → Test → E2E → GitHub. Backlog feeds issues; Research feeds report → user or Backlog. Docs, Review, Release, Security, Refactor, README are on-demand (docs only, review PR, release, audit deps, refactor). Handback to Implementation when tests fail due to code.

**Orchestration**: Manual (“Act as X Agent …”) or trigger-based (issue labels, PR events); see `docs/agent-roles-and-orchestration.md` §4.
