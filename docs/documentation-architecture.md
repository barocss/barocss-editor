# Documentation architecture

Decision for issue #268: retain Docusaurus and publish its static build.

## Problem

The repository now contains 31 public packages and one private release marker. Ten public READMEs were short placeholders. Three public READMEs mixed English and Korean. The documentation site primarily described the earlier editor foundations. It did not explain the new Office packages or their entry points.

These are ownership and verification problems. Replacing the site framework alone would not fix them.

## Options

| Option | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Keep Docusaurus | Existing URLs, React demos, MDX, navigation, static output, and Pages workflow | Keep its dependencies and configuration | Use now |
| Move to Astro Starlight | Static documentation with a smaller client-side baseline | Migrate routes, demos, navigation, and deployment; revalidate all links | Consider if measured maintenance or performance problems remain |
| Build a custom static site | Full control over presentation | Own search, navigation, code formatting, routing, and documentation tooling | Do not add this maintenance burden now |

[Docusaurus](https://docusaurus.io/docs) already builds static HTML. Its [deployment model](https://docusaurus.io/docs/deployment) supports a static host. [Starlight](https://starlight.astro.build/getting-started/) is a valid future alternative, but changing frameworks is not required to publish static documentation.

## Source ownership

| Information | Canonical source |
| --- | --- |
| Package purpose, installation, usage, lifecycle, limitations | `packages/<name>/README.md`, in English |
| Package name, version, public subpaths, peer ranges | `packages/<name>/package.json` |
| Package catalogue group | `scripts/docs/groups.json` |
| Cross-package integration guides | `apps/docs-site/docs/guides/` |
| DOM onboarding example and homepage demo | The TypeScript fence in `apps/docs-site/docs/quick-start.md` |
| Product specifications and internal delivery process | Root `docs/` and package specifications |

The package catalogue and package guide pages are generated into an ignored `.generated` directory. Do not edit those files. Public subpath coverage is checked against the publish manifest. A new package without a guide or catalogue group fails the documentation check.

## Validation and deployment

`pnpm docs:check` checks README structure, language, public entry-point coverage, and catalogue coverage. `pnpm docs:examples` extracts complete TypeScript examples and compiles them against freshly packed public artifacts, without source aliases. The same command also builds the Office CSS recipe with the extracted Note, Office UI, and React examples in a Vite consumer. The npm consumer CI job runs this check after package validation. Strict type checking proves API compatibility; it does not prove every browser or collaboration behavior.

`pnpm build:docs` generates the catalogue and builds static pages with broken-link checking. Documentation pull requests build a downloadable preview artifact. Only main builds deploy through GitHub Pages. README and package-manifest changes now trigger the site workflow.

The local preflight includes the documentation coverage check. Reviewers still inspect rendered pages and exercise changed interactive examples on a desktop browser.

## Scope and follow-up

This refresh verifies package onboarding and the DOM/React guides. Existing deep concept and API pages keep their URLs and content. Pages not revalidated carry an explicit reference-status notice. They are not presented as checked API examples. Remove a notice only after updating its API calls and adding suitable verification.

Package README edits do not change an already published npm archive. They reach npm on the next package release. This documentation PR does not create package versions or publish packages.

Review a framework migration only with evidence: build cost, broken navigation, unsupported content requirements, or sustained maintenance work that the current pipeline cannot resolve.
