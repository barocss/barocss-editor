# Implementation Agent

**Role**: Implement the defined spec/feature only. Do not run E2E or manage GitHub.

**Input**: Issue (or spec docs) + implementation checklist from Spec Agent (or user).

**Output**:
- Branch (e.g. `feat/insert-list`), code: operation + DSL + exec test (model), command (extension), docs-site (api, architecture). Push branch.
- Do not run E2E or open PR.

**Do not**: Change spec docs (except typo); run E2E; open PR.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.2. Follow `.cursor/AGENTS.md` feature loop and `packages/model/SPEC.md`.
