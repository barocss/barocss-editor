---
work_id: 260-npm-release
artifact_type: release-brief
status: qa_ready
owner_role: release-manager
source_request: 'Merge PR #259 and publish the prepared packages via GitHub Actions.'
last_updated: 2026-09-20
---

# Initial coordinated npm publication

Issue: https://github.com/barocss/barocss-editor/issues/260
Preparation: PR #259, merged as 481a3d065e22ce5c1156b4eb3bafad9c17f84270. Its three CI jobs passed.

## Scope

Publish all 31 public packages in packages/. Apply the pending Changesets and use the existing organization NPM_TOKEN only in explicitly selected bootstrap authentication mode. Keep wonffice-release private at 0.0.0; no service deployment.

## Preconditions and rollout

1. Local preflight and archive/isolated consumer checks must pass on the version changes.
2. Version PR must pass all three CI jobs before merge. The owner has authorized merge and publication.
3. Wait for the resulting main commit's full CI before publishing.
4. Run npm-release.yml in bootstrap preparation mode to verify authentication and artifacts without publishing.
5. Run the same workflow with publish=true for the approved main commit. Use the validated tarballs; no local npm publish.
6. Verify all 31 registry versions, latest tags and integrity values against workflow artifacts.

## Rollback and monitoring

A multi-package publication is not atomic. On any failure, stop and compare publication.json with npm. Do not overwrite, unpublish or change tags automatically. Retry only identical completed versions; different bytes require a new patch-version PR. The agent monitors GitHub Actions and npm registry results. The owner handles any npm account or token permission changes that cannot be completed through the existing configuration.

## Known limits

The presence of an organization secret does not prove it is valid or has package publish permission. Bootstrap identity is checked before builds. Trusted-publisher settings for new packages can be configured after their initial registration. Existing organization secrets must not be removed because other repositories may use them.

## Local evidence

- pnpm preflight: passed, including lint, 41 source projects and test type budgets. Existing debt was not increased.
- pnpm release:npm:check: passed for all 31 tarballs, 44 JS/type entries and 9 CSS entries.
- Registry precheck: all 31 intended versions are absent.
- Workflow YAML parsing and diff whitespace checks passed.
- PR CI, main CI and authenticated publication remain required.
