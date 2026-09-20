# @barocss/wonffice-release

Private version marker for the Wonffice product, including its frontend and backend release combination. This package is not published to npm. Public libraries keep their own independent versions.

## Purpose

The initial `0.0.0` is a development baseline, not a service release. Neither the root package version nor the office-app version is the version of the complete service.

## Versioning

For a product change, select this package when running `pnpm changeset`. Select affected public packages separately when their published behavior changes. Documentation-only and development-tool changes do not advance the product version. Changesets versions private packages, but product tags are managed by the product release workflow.

Use a dedicated release PR for an alpha. Changesets pre-release mode can also affect public packages included in the release, so review its complete version plan. Applying Changesets, publishing npm packages, and deploying a service are separate actions.

## Release evidence

Release manifests record the frontend/backend combination and validation evidence. This package does not install a server or deploy SaaS or on-premises services.

See [the release policy](https://github.com/barocss/barocss-editor/blob/main/docs/release-flow.md) and [the npm release procedure](https://github.com/barocss/barocss-editor/blob/main/docs/npm-release.md).
