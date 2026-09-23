# Wonffice API bootstrap

Private Node.js/TypeScript application using Fastify. It verifies OIDC access tokens and current tenant membership for [#355](https://github.com/barocss/barocss-editor/issues/355). It provides tenant-authorized PostgreSQL snapshot document routes for [#367](https://github.com/barocss/barocss-editor/issues/367). It does not serve the editor or provide Yorkie capabilities. Do not expose it as a production service.

## Local execution

Use Node from the root `.nvmrc` (22.22.0), then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @barocss/office-api dev
curl -i http://127.0.0.1:4100/health/live
curl -i http://127.0.0.1:4100/health/ready
```

`live` returns 200 while the process can answer HTTP. `ready` intentionally returns 503 with `service_not_configured`: document API routes alone do not prove product/Yorkie readiness. GET and HEAD are accepted on the probes. Other methods return 405; unknown routes return 404. Fastify stays at the HTTP boundary; membership and document transactions run in office-service.

| Variable | Default | Accepted value |
| --- | --- | --- |
| `OFFICE_API_HOST` | `127.0.0.1` | Literal IPv4 or IPv6 address; container uses `0.0.0.0` |
| `OFFICE_API_PORT` | `4100` | Integer 1–65535 |
| `OFFICE_API_SHUTDOWN_TIMEOUT_MS` | `10000` | Integer 1–60000 |
| `OFFICE_OIDC_ISSUER` | unset | Exact trusted issuer URL; HTTPS except loopback development |
| `OFFICE_OIDC_JWKS_URL` | unset | JWKS URL on the same origin as the issuer |
| `OFFICE_OIDC_AUDIENCE` | unset | API audience in access tokens |
| `OFFICE_API_DATABASE_URL` | unset | App-role PostgreSQL URL, never owner/backup |

Set all four auth variables together. Partial configuration fails startup. When absent, authenticated routes do not exist. Configure the issuer and JWKS from trusted installation settings, never from a request or token header. The server accepts only configured signature algorithms and verifies issuer, audience, signature, expiry and token type. It never trusts a browser-selected role or tenant ID as proof of access.

`GET /v1/me` requires a `Bearer` access token and returns the verified `{ issuer, subject, tenants, nextCursor }`. Each tenant entry has its UUID, name and current role. The page has at most 50 entries; pass `?after=<nextCursor>` until the cursor is null. A user with no membership receives an empty list. `GET /v1/tenants/:tenantId/access` checks active membership in PostgreSQL on every request and returns `{ tenantId, role }`. A missing, invalid or expired token returns 401. A valid token with no active membership returns 403. Provider or database unavailability returns 503. Responses use `Cache-Control: no-store`. Browser auth-code/PKCE callback, refresh, logout and UI role-based entry remain separate product integration work. There is no CORS allowlist or trusted reverse proxy configuration yet.

The process uses explicit settings, not `NODE_ENV`, to select its network binding. It does not load `.env` files. Startup errors do not print environment values. SIGINT and SIGTERM close the listener and drain active HTTP connections. The deadline closes remaining connections and terminates the process with a failure exit code, even if a close hook has not completed. Logs contain lifecycle events only.

## Build and checks

```sh
pnpm --filter @barocss/office-api build
pnpm --filter @barocss/office-api start
pnpm --filter @barocss/office-api test
PG_BIN=/path/to/postgresql/16/bin pnpm --filter @barocss/office-api test:postgres
pnpm preflight
```

The unit test command builds the real entry point and checks actual HTTP requests, invalid configuration, occupied ports, SIGINT, SIGTERM and an incomplete request at the shutdown deadline. `test:postgres` creates and removes a private PostgreSQL 16 cluster and synthetic local JWKS server, then checks signed tokens, two accounts, current membership, document create/retry/read/update and API restart. It does not use the operator's Keycloak realm. Source and test type checks participate in repository preflight. The unit test is included in the existing recursive CI command.

## Container artifact

Build once using the locked repository toolchain, then package the output:

```sh
node scripts/backend/package-api.mjs
docker build -t wonffice-api:wp05a apps/office-api
docker run --rm --name wonffice-api -p 127.0.0.1:4100:4100 wonffice-api:wp05a
```

The image runs as `node`. `package-api.mjs` builds the API and office-service, then deploys their frozen production graph with `--frozen-lockfile --prefer-offline --ignore-scripts` into `.container`. pnpm may fetch registry metadata for a workspace dependency; package versions remain bound to the reviewed lockfile. Only the reviewed office-service workspace dependency is accepted. The Docker context allowlist sends only this deployment directory. Source, tests and development dependencies are excluded. Container health uses **liveness**; it is not product readiness. Keep the internal port 4100 for the included health check. A future release pipeline must bind this artifact to its source commit, scan and pin its base image digest, and promote the same resulting digest to both deployment types. This image is not a completed release manifest or a tested installation bundle.

With a running local Docker daemon, verify the built artifact from the repository root:

```sh
node scripts/backend/package-api.mjs
node scripts/backend/verify-container.mjs
```

The `Backend container` workflow runs the same check on Linux for relevant PRs. It builds one image and starts it twice with default and explicit server settings. Each run checks its image ID, non-root user, read-only filesystem, image health check, HTTP liveness/readiness and clean SIGTERM exit. It removes only its own test containers and image tag. It does not push an image or deploy a service. These two configuration runs are not SaaS/on-premises installation acceptance.

The local Keycloak/PostgreSQL/API browser check uses synthetic accounts and a dedicated local environment. Run `scripts/backend/provision-local-keycloak.mjs` only against a new loopback Keycloak realm and keep its admin input and generated account file outside the repository with mode 0600. `scripts/backend/verify-local-oidc-browser.mjs` reads that file and a protected tenant ID file, obtains access tokens through a browser auth-code/PKCE flow, and checks two isolated browser contexts, cross-tenant denial and immediate API revocation. Neither script writes passwords or tokens to logs. The local Keycloak development server is not an external deployment or a production IdP configuration. See the [local OIDC runbook](../../docs/specs/wonffice-local-oidc.md) and [office-service instructions](../office-service/README.md) for setup, shutdown, tenant provisioning and recovery.

## API and collaboration boundaries

The JSON body limit is 1 MiB; snapshot text is limited to 512 KiB. Inputs do not receive implicit type coercion, defaults or silent removal of unexpected fields. Error responses omit messages, stack traces, submitted values and validation internals. Proxy headers and request-ID headers are not trusted. All document routes require a verified bearer token and active PostgreSQL membership on every request.

Document API paths under `/v1/tenants/:tenantId`:

- `POST /documents`: `{workspaceId,product,title,fileFormat,fileVersion,snapshotText,idempotencyKey}`. Every Note create also requires `importMode: "new-page-copy"`. The server assigns `documentId`, `pageId` and `documentKey`; it remaps only the copied Note's self references.
- `GET /documents?workspaceId=&product=&after=`: up to 50 current-tenant document heads and a UUID `nextCursor`.
- `GET /documents/:documentId`: current document head and exact `snapshotText` only while `mode` is `snapshot`.
- `PUT /documents/:documentId/snapshot`: `{expectedRevision,snapshotText,idempotencyKey}`. A successful compare-and-swap increments the snapshot revision.
- `PATCH /documents/:documentId/metadata`: `{expectedMetadataRevision,title,idempotencyKey}`. The title's revision is independent of the snapshot revision.
- `GET /receipts/:operation/:idempotencyKey`: the current principal's confirmed create/update/metadata receipt. Create and snapshot-update receipts include the exact confirmed `snapshotText`; metadata receipts contain a head only. Receipts have no automatic expiry in this alpha schema; a lost response must be resolved with the same key or this route before creating another document.

The file format/version for Note, Word, Slides and Site is the product's `barocss-*` v1 envelope. The service rejects malformed envelopes and session-owned `sid`/`parentId`, but each product still owns full schema validation. A document key is an address, not an authorization token. A `409 revision_conflict` or `mode_conflict` leaves the confirmed body unchanged. The API does not seed Yorkie, issue capabilities, or turn a snapshot into an active collaborative document. #366 and product adapters must prove those transitions before external alpha.

Wonffice does not implement its own collaboration server. Yorkie is the selected alpha provider, but this API check does not authenticate Yorkie connections or stop a direct local Yorkie client. Provider authorization and revocation require separate [#366](https://github.com/barocss/barocss-editor/issues/366) evidence. See the [provider contract](../../docs/specs/wonffice-collaboration-providers.md).
