# npm package release

This release path covers the 31 public libraries under `packages/`, including `@barocss/office-workspace`. `@barocss/wonffice-release` remains private. Product deployments and product release manifests use the separate flow in [release-flow.md](release-flow.md).

## Package contract

Development uses source exports. `pnpm pack` applies `publishConfig` and replaces those exports with built ESM, declarations and CSS in `dist/`. Always use the preparation command. Direct `npm pack` on a source directory does not apply pnpm's export overrides.

React and other declared dependencies stay external. A consumer installs them from npm. Each public entry has a declaration file. Existing CSS entry names are retained; UI entries also load CSS they import. All packages include README and MIT license files. This release supports ESM and browser bundlers; it does not add CommonJS support.

The shared build is `scripts/build-library.ts`. Add a public package by declaring its source exports, dependencies, public `publishConfig` exports and README. The preparation job discovers public packages automatically; do not maintain a separate release list.

## Local verification

Use Node from `.nvmrc` and pnpm 8.15.0.

```sh
pnpm install --frozen-lockfile
pnpm preflight
pnpm release:npm:check
```

The second command checks lint and source/test types. The last command builds all packages, creates actual tarballs, checks their contents, then installs all 31 tarballs in a temporary directory outside the repository. It checks every JS/type/CSS export without workspace aliases. It also checks bare imports in every packed JS and declaration file against that package’s declared dependencies. It never publishes. `output/npm/latest.json` locates the current batch; the batch contains archives, `manifest.json` and the successful `consumer.json` report.

## Version PR

1. Add Changesets to feature/fix PRs that change published packages.
2. Merge those PRs into `main` after required checks pass.
3. Run **Npm version PR** on `main`. It creates or updates the Changesets version PR. It does not publish.
4. Verify changed versions, changelogs and lockfile in the version PR. Run the full CI and merge it.
5. Wait for all CI checks on the resulting `main` commit to pass.

Changesets versions remain independent per package. A Wonffice product release does not automatically publish all libraries. Private product metadata can still receive its own Changeset under the existing product release policy.

A version PR created with the built-in `GITHUB_TOKEN` can require approval before its CI workflows run. Select **Approve workflows to run** on that PR. For unattended CI, configure `VERSION_PR_TOKEN` with an appropriate repository token. A GitHub App installation token must be minted for each run rather than stored as a permanent secret. The local alternative below also triggers CI with a normal user push. Never bypass required checks.

```sh
git switch -c codex/npm-version
pnpm version-packages
pnpm install --lockfile-only
pnpm preflight
# Commit the version, changelog and lockfile changes; push and open a PR to main.
```

## npm setup

Enable the repository setting that allows GitHub Actions to create pull requests before using the version workflow.

Use the `npm` GitHub environment. Configure its reviewers according to the release policy. Do not store credentials in the repository.

For each existing npm package, configure its trusted publisher:

- Provider: GitHub Actions
- Organization: `barocss`
- Repository: `barocss-editor`
- Workflow filename: `npm-release.yml`
- Environment: `npm`

The workflow uses the same Node 22.22.0 as local development and npm 11.6.2 for OIDC support. No long-lived npm token is needed for normal trusted publication. Public repositories generate provenance; a private repository disables provenance.

New packages need an initial registration before their npm settings can be configured. Use the explicitly selected `bootstrap` authentication mode for that first batch and set `NPM_BOOTSTRAP_TOKEN` in the `npm` environment, or grant this repository access to the existing organization `NPM_TOKEN`. The environment token takes precedence. Bootstrap mode checks the npm identity before building; it also supports `publish=false` for an authentication check without publication. The token must have publish access to the intended `@barocss` packages and satisfy the organization's 2FA policy. After registration, configure each trusted publisher, remove a dedicated bootstrap secret when it is no longer needed and use `trusted` mode. Do not remove an organization token used by other repositories. A scoped package requires permission in the npm organization; owning the GitHub organization alone is not enough.

The external `@barocss/math-editor` package is supplied by `barocss/math`. This workflow does not publish it. Its compatible version must already be available on npm for consumer installation.

## Manual release

1. Select **Npm release** on `main` with `publish=false`. Download and inspect the archives and reports if needed.
2. Run **Npm release** again on the same approved commit with `publish=true` and the configured authentication mode.
3. The job rebuilds and validates its own exact batch. It checks successful `Lint, type-check, unit test`, `E2E (editor-react)` and `Npm package consumers` checks for that same commit. It rejects pending Changesets, changed tracked files and mismatched package reports.
4. Before any publish, it checks every registry version and internal dependency range. It publishes the validated tarballs in dependency order, then verifies npm versions and `latest` tags.

Existing versions with different content fail before publication. A retry skips a completed version only when npm's recorded integrity matches the exact archive and its `latest` tag matches. It cannot silently overwrite a version or move `latest` backwards.

## Failure and recovery

A multi-package npm publication is not atomic. Keep the workflow's `publication.json` and archives. If publication fails, stop and compare the report against npm before retrying. A lost response may mean a package was published even though the command failed. Registry propagation can also delay final verification.

Retry the same commit and exact content only. If the same version's bytes differ, create a patch version and run the normal version PR flow. Never unpublish or force tags automatically. Failed batches do not roll back packages that are already public. Deprecation, tag correction or unpublication requires a separate reviewed action.

Initial npm organization access, trusted-publisher settings and real publication must be verified by the release owner. Repository checks cannot prove those external permissions before a publish.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [Changesets action](https://github.com/changesets/action).
