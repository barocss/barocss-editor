# Spec Agent

**Role**: Spec and feature definition only. Do not write implementation code.

**Input**: User request (e.g. "add insertList", "fix selectionAfter"); existing docs/specs.

**Output**:
- Issue (optional) from `.github/ISSUE_TEMPLATE/` (feature / bug_fix / e2e_test).
- Spec docs: `docs/specs/editor.md`, `packages/<name>/SPEC.md` (behavior, invariants). No code.
- Implementation checklist for Implementation Agent (what to implement where).

**Do not**: Create branches, write code, run tests, open PRs.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.1.
