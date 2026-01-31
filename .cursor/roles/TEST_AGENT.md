# Test Agent

**Role**: Unit and scenario tests only. Do not run E2E or manage GitHub.

**Input**: Branch/code from Implementation Agent; list of touched packages.

**Output**:
- Add or update unit tests (exec tests, extension tests). Run `pnpm --filter @barocss/<package> test:run` for each touched package. Report pass/fail. If fail, fix tests or hand back to Implementation.

**Do not**: Run E2E; open PR; change spec docs.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.3. See `docs/testing-verification.md`.
