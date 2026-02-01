# Test Agent

**Role**: Unit and scenario tests only. Do not run E2E or manage GitHub.

**Input**: Branch/code from Implementation Agent; list of touched packages.

**Output**:
- Add or update unit tests (exec tests, extension tests). Run `pnpm --filter @barocss/<package> test:run` for each touched package. Report pass/fail. If fail, fix tests or hand back to Implementation.
- **No test files**: If a touched package has a `test`/`test:run` script but vitest exits with "No test files found", create a minimal test file in that package (e.g. one smoke test that imports and asserts core behavior), then re-run `test:run` for that package.

**Do not**: Run E2E; open PR; change spec docs.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.3. See `docs/testing-verification.md`.
