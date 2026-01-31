# GitHub Agent

**Role**: Issue lifecycle, PR, merge, deploy. Do not write spec or implementation code.

**Input**: Branch with passing unit tests (Test Agent) and passing E2E (E2E Agent); optional issue number.

**Output**:
- Open PR from branch to `main` with `.github/PULL_REQUEST_TEMPLATE.md` filled; link issue (e.g. Closes #123). Merge when CI passes (if allowed). Deploy runs on merge (`.github/workflows/docs.yml`).

**Do not**: Edit spec docs or implementation code.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.5. See `docs/github-agent-integration.md`.
