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
- Edit `navigation.ts` for common navigation across guides, package pages, and Examples. The sample links use the live-example registry; keep them in one place.
- Do not edit `.generated/`. The dev and build commands regenerate it from READMEs and manifests.
- The homepage editor runs the exact TypeScript example from `docs/quick-start.md`.
- Old pages with a reference-status notice have not been fully revalidated. Keep the notice until verification is complete.

## Deploy

`.github/workflows/docs.yml` builds affected pull requests and uploads a preview artifact. After merge to main, it deploys the static build through GitHub Pages. The repository Pages source must be **GitHub Actions**. Do not create or force-push a `gh-pages` branch.

README, package manifest, generator, site, and workflow changes trigger documentation builds. npm publication is a separate release workflow. See the root [documentation decision](../../docs/documentation-architecture.md) and [maintenance flow](../../docs/docs-site-integration.md).

## Live examples

The `/examples` gallery runs five examples: DOM, React, Note, Office UI, and structured search. `scripts/docs/live-examples.json` selects complete exported snippets from package READMEs or guides. `docs:sync` generates both the displayed source and the runtime modules from those snippets. Do not maintain a separate copy of the example code.

The example host in `examples/` is built by Vite into the ignored `static/live-examples/` directory before Docusaurus starts or builds. Its iframe isolates the Office/Tailwind styles from the documentation theme. The gallery supports direct links such as `/examples#note`, reset, and guide/source links. Demo edits are temporary.

After changing a snippet or the registry, restart `pnpm dev:docs` or run `pnpm build:docs` to rebuild the live examples. The iframe host uses workspace sources; `pnpm docs:examples` independently checks the snippets against packed public APIs.
