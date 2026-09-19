# packages npm release readiness

- work_id: 258-npm-release
- issue: https://github.com/barocss/barocss-editor/issues/258
- status: qa_ready
- owner: Codex
- scope: All public packages under packages/, including office-workspace. wonffice-release remains private.
- deliverable: Dist JS/types/CSS, isolated tarball consumer validation, Changesets version PR workflow and manual npm release workflow.
- exclusions: Actual npm publication, npm credential configuration, product deployment and product release version changes.
- gates: Local preflight; release guard tests; all-package build/pack; consumer type and browser bundle validation; CI.
- rollout: Merge preparation PR, create and merge version PR, configure npm trusted publishers, run manual preparation, then explicit publish.
- rollback: npm versions are immutable. Stop an uncertain batch, inspect publication report and registry, fix forward with a patch version. Never replace a published version.

## Verification evidence

- Built and packed 31 public packages; archive entry and dependency-import audits passed.
- Isolated npm consumer: 44 JS/type exports and 9 CSS exports passed with TypeScript 5.9.3 (`skipLibCheck: false`) and Vite 5.4.21.
- Whole-repository unit tests: 8,551 passed, 17 pre-existing skipped.
- Publish guard tests: 6 passed.
- Local lint: no new errors (existing 540 errors and 7,208 warnings remain in the ratchet).
- Final pnpm preflight passed: lint, 41 source projects (3 existing demo-app exceptions), test type budgets and release/check tooling.
- GitHub CI will run on the preparation PR; actual publication is not part of this change.
- npm credentials, package ownership, trusted publisher configuration and actual publication are not exercised.
