# Tenant member directory — #408

Directory labels identify an existing tenant member for a person reading the company roster. They do not authenticate a person, verify an email or grant access. Authentication remains verified OIDC issuer/subject; authorization remains current tenant membership. Use only a company-authorized roster with an explicit approval. Test records must be synthetic.

## Private provisioning and inspection

Use Node from `.nvmrc`, `pnpm --filter @barocss/office-service build` and migration `0010_member_directory`. Applied migration SQL/checksums remain immutable. The migration adds forced-RLS owner-only directory and approval-event tables. `wonffice_app` receives no direct directory read/write grant. The bounded member-list function alone exposes an authorized tenant's summary. `wonffice_backup` has read access for backup only.

Create a private directory outside the checkout (`umask 077`, directory mode700). Save a600 JSON manifest. Supply `OFFICE_MIGRATION_DATABASE_URL` through the existing protected configuration; never put its value in logs, Issues or command history. Use a dedicated login as `wonffice_owner`, without superuser or bypass-RLS. A platform-operator grant does not authorize this operation.

A provision manifest has exactly `action` and `change`:

```json
{
  "action": "provision",
  "change": {
    "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "memberId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "displayLabel": "Synthetic colleague",
    "sourceCategory": "company_roster",
    "sourceRef": "roster:synthetic-v1",
    "approvalRef": "approval:synthetic-1",
    "actorRef": "operator:synthetic",
    "expectedRevision": null
  }
}
```

These UUIDs are examples, not identities to create. The operation requires that exact existing tenant/member pair. It creates no identity, account, membership, role or grant. Labels must have1–120 Unicode code points, no surrounding whitespace or control characters. Labels normalize to NFC. References have1–120 ASCII letters/digits or `._:/#-`; never supply secrets. References and actor records stay private. An approved label can contain punctuation or angle brackets; a future UI must render it as text.

For creation, `expectedRevision` is null. For an approved update, use the exact current positive integer revision. Every new approved update increments revision, even when only provenance changes. The original member code remains fixed. Duplicate labels get different random server-issued `M-` plus32-hex codes, unique within the tenant. A stale revision refuses the change; read, refresh and obtain a new approval. The tenant+approval reference identifies the fixed operation. An identical retry returns its original entry, even after a later rename. Reusing the reference with different member, label, provenance or revision refuses the operation. Directory update and immutable result event commit together.

Set manifest/result paths to fresh private files, then run:

```sh
pnpm --filter @barocss/office-service directory:admin
```

`OFFICE_DIRECTORY_MANIFEST_PATH` selects the manifest. `OFFICE_DIRECTORY_RESULT_PATH` selects a new600 output file in a700 directory outside the checkout. The CLI refuses symlink manifests, world/group permissions and overwriting an output. Console output contains only success/failure. The result file can contain private provenance; retain it according to the company policy and do not publish it.

An inspection manifest has exactly `action: "read"`, `tenantId`, `memberId`, `approvalRef`. Inspection requires the same protected owner role and an existing exact member; it returns the current directory entry or null. It does not create an identification record.

Stop only the process/database created for the local test. Do not stop a shared IdP or another worker's runtime. Tests remove their own database/socket and independent browser contexts in `finally`.

## Member-list consumer contract

`GET /v1/tenants/:tenantId/members` retains `memberId`, `role`, `active`, `isSelf`, the50-row limit, memberId ordering and `nextCursor`. It adds mandatory `identification`:

| Field | Identified | Unidentified |
| --- | --- | --- |
| state | `identified` | `unidentified` |
| displayLabel | Company-approved roster text | null |
| memberCode | Stable tenant-bound disambiguation code | null |
| sourceCategory | `company_roster` | null |
| revision | Positive integer | null |
| updatedAt | UTC ISO timestamp | null |

Only a complete stored entry is identified. Missing/inconsistent data remains unidentified. The summary excludes issuer, subject, email, tokens, approval/source record references and actor references. Current owner/admin membership permits listing; editor/viewer, absent or revoked membership, cross-tenant and operator-only identities are denied. Responses remain `no-store`.

## Exact handoff to #377 and #378

This child does not implement role-mutation guards or the human confirmation UI. The existing narrow PATCH/DELETE routes remain machine-addressed until #377 implements the following guard. Do not use an unguarded legacy route for a human-confirmed directory action.

1. #378 displays current company, label, member code, source state/revision and old/new role or revocation. Withhold human-targeted controls for unidentified entries. A roster label is not legally verified identity or verified email.
2. #377 requires the displayed positive directory revision, exact memberId and tenantId on every human-targeted mutation; missing revision has no silent fallback. Do not accept a label/code as identity or authority.
3. In the existing protected database mutation transaction, check the verified actor and lock its active owner/admin membership `FOR SHARE`. Lock the exact target membership `FOR UPDATE`, then lock/read its `member_directory` row `FOR SHARE`. Require an identified entry whose revision equals the displayed revision. Apply the membership change and audit only after this comparison, holding the locks through commit.
4. Provisioning serializes private administration with advisory `(87142,2)`, then locks target membership `FOR UPDATE`, then directory `FOR UPDATE`. It never waits for an actor-membership row after locking the target. #377 must retain the target-membership→directory order; do not acquire a directory lock before the membership lock. No ordinary app operation needs the private global advisory lock.
5. A missing entry or stale revision returns an explicit refresh/reconfirmation conflict, with no membership change. If confirmation wins the target lock before a rename, it can only change the member against the verified still-current revision; if rename wins, comparison sees the new revision and refuses. Verify both schedules in #377, including unchanged audit/membership on refusal. #408 concurrency tests validate provisioning updates, not this future mutation race.

#377/#378 and the complete alpha/release gates remain incomplete. Local directory verification does not approve customer provisioning, invitations, deployment or external publication.

## Focused verification

With the required Node and locally installed PostgreSQL:

```sh
pnpm --filter @barocss/office-service test:directory:postgres
pnpm --filter @barocss/office-service exec vitest run test/member-directory.test.ts test/contracts.test.ts
pnpm --filter @barocss/office-api exec vitest run test/company-member.test.ts
pnpm preflight
```

`PG_BIN` can select a local PostgreSQL bin directory. The actual-OIDC test is `apps/office-api/test/member-directory.oidc.integration.mjs`, run from that app after build. Set `WONFFICE_LOCAL_KEYCLOAK_USERS_FILE` to the existing600 synthetic fixture. It uses the existing loopback IdP read-only, PKCE callback18200 and its own API14208; serialize these ports and fixture preparation. It logs no tokens or credentials. It checks two independent login contexts, two tenants, duplicate labels, missing identification, denial, unchanged fixed replay and API/PostgreSQL restart against its own database.
