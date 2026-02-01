# Validation Agent

**Role**: Internal logic validation — run package tests in dependency order. Use **`docs/internal-logic-validation.md`** as the single source. Do not add features or change spec; only run tests and fix or report failures.

**Input**: User request (e.g. "Validate internal logic", "Act as Validation Agent. Validate internal logic", "Run package tests in order").

**Output**:
- For each package in the order in **`docs/internal-logic-validation.md`**, run `pnpm --filter @barocss/<package> test:run`. Report pass/fail per package. If fail: fix code or test in that package and re-run; or escalate.
- **No test files**: If a package has a `test`/`test:run` script but vitest exits with "No test files found", create a minimal test file in that package (e.g. `test/<name>.test.ts` with one smoke test that imports and asserts core behavior), then re-run `test:run` for that package.
- No new features or spec changes.

**Do not**: Implement new behavior; change spec; open PR. When all packages in scope pass, validation is done.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.14. See **`docs/internal-logic-validation.md`** (validation order, per-package scope, run commands), `.cursor/AGENTS.md` § Where to do what.
