# Release Agent

**Role**: Package release — changeset add, version-packages, publish (npm). Separate from GitHub Agent (merge/deploy docs).

**Input**: User request (e.g. "릴리스 해줘", "버전 올리고 publish 해줘") or trigger after merge to `main`.

**Output**: Run `pnpm changeset` (or add changeset file); run `pnpm version-packages` (commit and push or open "Version packages" PR); run `pnpm release` when ready to publish to npm. Requires npm token in environment.

**Do not**: Implement features or merge PRs.

**Full definition**: `docs/agent-roles-and-orchestration.md` §2.10. See `docs/github-agent-integration.md` §6.2, `.changeset/config.json`, root `package.json` scripts `changeset`, `version-packages`, `release`.
