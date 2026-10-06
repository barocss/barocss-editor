# Wonffice schema server

Private, independently runnable Node process for a durable authenticated Note definition registry.
It uses the existing Wonffice PostgreSQL namespace, membership/RLS and locked actor/epoch functions.
It does not start Office API, a model, browser or editor and does not hold a second native content store.

## Build and run

Use Node 22.22.0 from `.nvmrc` and the repository's pnpm 8.15.0 lockfile:

```sh
pnpm --filter @barocss/schema-server build
pnpm --filter @barocss/schema-server start
pnpm --filter @barocss/schema-server stage /absolute/fresh/runtime-directory
```

Build creates `dist/main.js`, Node-ready service/auth/codec artifacts and a separate pure schema
contract entry while retaining the existing schema root entry. A deployable runtime stages compiled
workspace artifacts plus their locked production dependency graph. The PostgreSQL integration
check stages an explicit runtime-only package closure: compiled app/service/auth/codec/contract
modules and the existing locked Fastify/jose/pg dependency graph. It projects only supported
runtime subpath exports, starts compiled main, hashes every resolved staged file before/after
and records the Node resolution graph. It neither invokes an experimental deploy linker nor
installs/downloads packages or builds source during the runtime producer. Source
TypeScript must not be loaded by that process. The `stage` command uses the same staging function
in stage-only mode after build. It does not require an evidence setting, PostgreSQL binaries,
private database, JWKS, test execution or running server; it refuses an existing destination.
Start the resulting artifact with `node <runtime-directory>/dist/main.js` and the same required configuration. Deployment to another machine or cloud is separate.

Apply reviewed migrations with a separate `wonffice_owner` connection through the existing
`OFFICE_MIGRATION_DATABASE_URL` / office-service migration CLI before running the server.
Migration `0016_schema_registry` adds immutable versions, exact dependency edges and actor-scoped
registration receipts. Do not edit applied SQL or give the process owner/backup/superuser credentials.
Back up the complete Wonffice database, including these tables, migration history, identities and
memberships, with the existing separate backup role. Restore to a separate database, apply matching
checksums and verify immutable definitions/receipts and current permissions before use. Configuration,
policy and secrets need their own protected backup. This phase does not prove full product backup.

Required environment keys (values are never printed):

- `SCHEMA_SERVER_DATABASE_URL`: the `wonffice_app` PostgreSQL URL, without a default tenant context.
- `SCHEMA_SERVER_OIDC_ISSUER`, `SCHEMA_SERVER_OIDC_AUDIENCE`, `SCHEMA_SERVER_OIDC_JWKS_URL`.
- Optional `SCHEMA_SERVER_OIDC_ALGORITHMS`: RS256 by default; the existing strict OIDC allowlist applies.
- `SCHEMA_SERVER_POLICY_FILE`: absolute path to a regular mode-0600 JSON file controlled by the operator.
- Optional `SCHEMA_SERVER_HOST` (127.0.0.1), `SCHEMA_SERVER_PORT` (4101),
  `SCHEMA_SERVER_SHUTDOWN_TIMEOUT_MS` (10000).

Missing/partial auth and DB configuration fail startup. HTTPS is required for external OIDC;
loopback IP HTTP is supported only for isolated local verification. Database settings are app-only.
Policy is a JSON array of exact scopes, with no wildcard or implicit public/cross-tenant access:

```json
[
  {
    "tenantId": "11111111-1111-4111-8111-111111111111",
    "workspaceId": "22222222-2222-4222-8222-222222222222",
    "readRoles": ["editor", "viewer"],
    "registerRoles": ["editor"],
    "capabilities": ["note.field.text.v1", "note.field.number.v1", "note.field.boolean.v1", "note.field.choice.v1"]
  }
]
```

Reload operator policy by restarting only this process. Current locked membership role and policy
are checked in the SAME registry transaction, not just an earlier HTTP precheck. Fixed registration
replay and actor receipt reads need the current register role AND all required capabilities of the
original immutable definition and complete dependency closure. A removed capability cannot be
bypassed through receipt lookup. A current viewer may read versions only when the exact read policy
and every required capability permit it; viewers cannot register. Body actor/approved flags confer no
rights. An admitted transaction holds its membership lock until settlement; a later revocation does
not mean an already committed effect was canceled. Offline JWT verification is not instant logout
revocation. No fresh per-registration human prompt is required within this preauthorization.

## HTTP contract

All data routes require a verified access token. Prefix:
`/v1/tenants/:tenantId/workspaces/:workspaceId`.

- PUT `/schemas/:schemaId/versions/:version`, body `{ "definitionText": "...", "idempotencyKey": "..." }`.
  Definition JSON has exact dialect/scope/ID/version, nullable exact parent, exact dependencies,
  requiredCapabilities and a dataset of ordered supported fields. Matching canonical immutable
  versions return the originally stored definitionText; conflicting contents refuse. Changed original
  input bytes under a fixed key refuse even if the canonical digest is identical. No latest substitution.
- GET the same exact version path returns its complete registered dependency closure and digests.
- GET `/schema-receipts/:idempotencyKey` returns the current authorized actor's original fixed receipt.
- GET `/documents/:documentId/schema-bundle` resolves an actual authorized Note snapshot in that
  workspace under the same locked read policy. Native-v1 returns `legacy_unpinned`, with actual
  revision/hash/format. Unsupported/corrupt/reserved pin metadata refuses. It returns neither
  fabricated historical pins nor a successful empty complete document bundle.

The named digest algorithm is defined by the shared registry contract. Original definition text,
canonical digest input and fixed operation request hash are distinct. Definitions/dependencies and
receipts commit atomically; no failed operation has a successful partial receipt. App role has no
update/delete grant on immutable registry tables. Current scope/authority protects reads and retries.

GET `/health/live` proves process liveness. GET `/health/ready` is 200 only for a compatible reachable
registry, safe app role/empty context and required privileges; otherwise named 503. Neither endpoint
exposes data or runs migrations. SIGTERM/SIGINT close this process's listener and pool only; a deadline
failure exits nonzero. Use a native private PostgreSQL socket for local verification; Docker is optional.

## Verification and remaining scope

`pnpm --filter @barocss/schema-server test` runs controlled tests; `test:postgres` builds and runs the
actual own process/private PostgreSQL/controlled signed JWKS integration. The latter is not genuine
browser/OIDC login or an LLM test. Source/config/runtime graph and cleanup are retained in the named
external evidence directory when `SCHEMA_SERVER_EVIDENCE` is set. No current database/server takeover
is supported by that harness.

Native schema-aware format2, full selected document bundles/offline copies, A/B definition1 with
A-only definition2 adoption, one atomic document revision/pin CAS, ordinary save/copy/backup retention,
genuine UI current-account matrices and authenticated real MCP remain subsequent #495 phases.
Registration never installs a schema globally, adopts it into a document or executes submitted code.
Full #495, full Goal, external alpha and release are incomplete. This phase makes no push/PR/deploy
or Yorkie/mobile/physical-IME claim.
