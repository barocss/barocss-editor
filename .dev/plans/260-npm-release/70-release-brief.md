---
work_id: 260-npm-release
artifact_type: release-brief
status: qa_ready
owner_role: release-manager
source_request: 'Merge and publish the prepared packages. The owner subsequently authorized local initial publication with interactive authentication, followed by Trusted Publishing.'
last_updated: 2026-09-20
---

# Initial coordinated npm publication

Issue: https://github.com/barocss/barocss-editor/issues/260
Preparation: PR #259, merged as 481a3d065e22ce5c1156b4eb3bafad9c17f84270. Its three CI jobs passed.

## Scope

Publish all 31 public packages in packages/. Changesets were first applied in PR #261, merged as 575d3825725939b4bba90a0c64c84971a35d1ea1. The 13 published bootstrap packages advance to 0.1.2 through Changesets for deterministic packaging; the 18 unshipped versions remain at their original planned versions so the bootstrap packages' exact dependency versions will also become available. Keep wonffice-release private at 0.0.0; no service deployment. No bypass-2FA bootstrap token is used for the final publication path.

## Preconditions and rollout

1. Local preflight and archive/isolated consumer checks must pass on the version changes.
2. Version PR must pass all three CI jobs before merge. The owner has authorized merge and publication.
3. Wait for the resulting main commit's full CI before publishing.
4. Run npm-release.yml in trusted preparation mode to verify artifacts without publishing. Use its exact validated artifacts for the owner-authorized local initial publication of the 13 new packages.
5. Register and verify Trusted Publishers for all 31 packages. Run the workflow with publish=true and authentication=trusted for the approved main commit. Skip already-published versions only if their archive integrity matches exactly.
6. Verify all 31 registry versions, latest tags and integrity values against workflow artifacts.

## Rollback and monitoring

A multi-package publication is not atomic. On any failure, stop and compare publication.json with npm. Do not overwrite, unpublish or change tags automatically. Retry only identical completed versions; different bytes require a new patch-version PR. The agent monitors GitHub Actions and npm registry results. The owner handles any npm account or token permission changes that cannot be completed through the existing configuration.

## Known limits

The old organization token failed authentication and was not used for publication. Existing organization secrets were preserved. All 31 packages now have a GitHub Actions publisher for barocss/barocss-editor and npm-release.yml. The 29 automated registrations restrict the environment to npm; the two user-created registrations (schema and shared) omit the environment restriction. The 13 locally bootstrapped versions do not have GitHub provenance; subsequent versions can use OIDC publication. The temporary local npm login was ended with npm logout after registration.

## Local evidence

- pnpm preflight: passed, including lint, 41 source projects and test type budgets. Existing debt was not increased.
- pnpm release:npm:check: passed for all 31 tarballs, 44 JS/type entries and 9 CSS entries.
- Registry precheck: all 31 intended versions are absent.
- Workflow YAML parsing and diff whitespace checks passed.
- PR #261 CI passed: https://github.com/barocss/barocss-editor/actions/runs/35454726861
- Exact main commit CI passed: https://github.com/barocss/barocss-editor/actions/runs/35455494757
- Trusted preparation passed: https://github.com/barocss/barocss-editor/actions/runs/35455930166
- The 13 new packages were published locally from those CI artifacts and verified by version, latest and SHA-512 integrity. The first package's negative-cache delay was checked against the version endpoint; no duplicate version was published.
- Actual trusted release was stopped before publication by the integrity guard: https://github.com/barocss/barocss-editor/actions/runs/35482055889
- Root cause: pnpm pack resolves workspace dependency entries in nondeterministic order. Across the two CI runs, differing archives contained only package.json dependency-key ordering differences.
- The new normalization step stabilizes dependency maps and tar metadata without reordering conditional exports. Normalizing both complete independent CI batches produced identical bytes for all 31 packages.
- A regression test covers dependency and archive-entry ordering, timestamps, preserved JS content, conditional export priority, executable permissions and idempotence.
- Final local checks, PR/main CI, trusted publication and all-31 registry integrity verification remain required.
