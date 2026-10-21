# Cloud development checkpoint — Issue #514

This is a preservation checkpoint requested by the user. No feature acceptance or merge is claimed.

183 available worktrees were preserved independently, including 95 dirty worktrees. Original checkouts and indexes were left unchanged. 143 additional unpublished local branch heads were preserved. Ignored files, dependencies, local databases, and secrets are excluded by Git ignore rules. Missing/pruned worktree files cannot be recovered; their available branch histories are preserved.

Use manifest.json to select a session by original path or branch, then check out checkpointBranch in the cloud. history.json maps additional local history. These histories are alternatives and may overlap or conflict; they are not combined into one product branch.

Validation: Node 22.22.0 preflight was attempted for several historic worktrees. At least one fails with missing local dependencies or existing check debt. The remaining historic snapshots are unverified. The current primary checkout preflight PASSED with Node 22.22.0, including lint, source types, and test types, under its existing debt budgets. Its full log is included separately. Full per-session unit/browser checks remain pending. This PR is draft and must not be merged as a feature.
