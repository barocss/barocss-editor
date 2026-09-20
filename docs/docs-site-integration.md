# Documentation maintenance

Follow the repository `AGENTS.md` workflow: inspect issues and PRs, work on an issue branch, validate locally, then open a PR against main.

## Update the correct source

| Change | Required documentation |
| --- | --- |
| New package | English package README, public entry-point table, complete example, catalogue group |
| Export or peer change | README entry points and installation requirements |
| Lifecycle or behavior change | README integration notes and affected guide |
| New cross-package workflow | Guide under `apps/docs-site/docs/guides/` and sidebar entry |
| New operation or detailed API | Relevant API page and specification; validate examples before removing its reference-status notice |

Package metadata comes from manifests. Package guides come from READMEs. Do not manually maintain a second package list in the site.

## Validate

1. Run `pnpm docs:check` for structure and public entry-point coverage.
2. Run `pnpm release:npm:prepare` and `pnpm docs:examples` for examples compiled against actual package archives.
3. Run `pnpm build:docs` for static output and link validation.
4. Open affected pages on a desktop browser. Exercise changed interactive examples.
5. Run `pnpm preflight` before pushing. Add runtime tests when changing behavior; type checking alone does not prove runtime behavior.

The generated files live in `apps/docs-site/.generated/` and must not be committed. Do not commit `.docusaurus` build cache changes either.

## Publish

The Documentation workflow builds affected PRs and uploads a static preview artifact. Main builds deploy through GitHub Pages. The npm consumer job checks documentation examples as part of package validation. npm releases remain governed by Changesets and the separate release workflow.

See [the architecture decision](documentation-architecture.md) for scope, limitations, and the framework choice. See [the site README](../apps/docs-site/README.md) for commands.
