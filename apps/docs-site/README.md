# Wonffice developer documentation

Docusaurus generates the static site at https://editor.barocss.com.

## Develop and validate

Run these commands from the repository root with the Node version in `.nvmrc`:

```sh
pnpm install --frozen-lockfile
pnpm docs:check
pnpm dev:docs
pnpm build:docs
```

To check the complete README and onboarding code examples against real package archives:

```sh
pnpm release:npm:prepare
pnpm docs:examples
```

The prepare command builds and packs local artifacts. It does not publish them. Example checks install an isolated consumer under `output/docs/`, type-check the snippets, and build the documented Office styling recipe. The build output is `apps/docs-site/build/`.

## Content ownership

- Edit `packages/<name>/README.md` for package installation, entry points, usage, and limitations. Use English.
- Edit `scripts/docs/groups.json` to place a new public package in the catalogue.
- Edit `docs/` in this app for cross-package guides and deeper explanations.
- Add hand-written pages to `sidebars.ts`.
- Do not edit `.generated/`. The dev and build commands regenerate it from READMEs and manifests.
- The homepage editor runs the exact TypeScript example from `docs/quick-start.md`.
- Old pages with a reference-status notice have not been fully revalidated. Keep the notice until verification is complete.

## Deploy

`.github/workflows/docs.yml` builds affected pull requests and uploads a preview artifact. After merge to main, it deploys the static build through GitHub Pages. The repository Pages source must be **GitHub Actions**. Do not create or force-push a `gh-pages` branch.

README, package manifest, generator, site, and workflow changes trigger documentation builds. npm publication is a separate release workflow. See the root [documentation decision](../../docs/documentation-architecture.md) and [maintenance flow](../../docs/docs-site-integration.md).
