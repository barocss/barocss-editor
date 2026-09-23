# Wonffice API bootstrap

Private Node.js/TypeScript application using Fastify. It verifies OIDC access tokens and current tenant membership for [#355](https://github.com/barocss/barocss-editor/issues/355). It does not yet store document bodies, serve the editor, or implement browser login pages. Do not expose it as a production service.

## Local execution

Use Node from the root `.nvmrc` (22.22.0), then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @barocss/office-api dev
curl -i http://127.0.0.1:4100/health/live
curl -i http://127.0.0.1:4100/health/ready
```

`live` returns 200 while the process can answer HTTP. `ready` intentionally returns 503 with `service_not_configured`. Document storage and full product readiness are still absent. GET and HEAD are accepted on the probes. Other methods return 405; unknown routes return 404. Fastify stays at the HTTP boundary; membership checks run in office-service.

| Variable | Default | Accepted value |
| --- | --- | --- |
| `OFFICE_API_HOST` | `127.0.0.1` | Literal IPv4 or IPv6 address; container uses `0.0.0.0` |
| `OFFICE_API_PORT` | `4100` | Integer 1–65535 |
| `OFFICE_API_SHUTDOWN_TIMEOUT_MS` | `10000` | Integer 1–60000 |
| `OFFICE_OIDC_ISSUER` | unset | Exact trusted issuer URL; HTTPS except loopback development |
| `OFFICE_OIDC_JWKS_URL` | unset | JWKS URL on the same origin as the issuer |
| `OFFICE_OIDC_AUDIENCE` | unset | API audience in access tokens |
| `OFFICE_API_DATABASE_URL` | unset | App-role PostgreSQL URL, never owner/backup |

Set all four auth variables together. Partial configuration fails startup. When absent, the two auth routes do not exist. Configure the issuer and JWKS from trusted installation settings, never from a request or token header. The server accepts only configured signature algorithms and verifies issuer, audience, signature, expiry and token type. It never trusts a browser-selected role or tenant ID as proof of access.

`GET /v1/me` requires a `Bearer` access token and returns the verified `{ issuer, subject, tenants, nextCursor }`. Each tenant entry has its UUID, name and current role. The page has at most 50 entries; pass `?after=<nextCursor>` until the cursor is null. A user with no membership receives an empty list. `GET /v1/tenants/:tenantId/access` checks active membership in PostgreSQL on every request and returns `{ tenantId, role }`. A missing, invalid or expired token returns 401. A valid token with no active membership returns 403. Provider or database unavailability returns 503. Responses use `Cache-Control: no-store`. Browser auth-code/PKCE callback, refresh, logout and UI role-based entry remain separate product integration work. There is no CORS allowlist or trusted reverse proxy configuration yet.

Draft company administration for [#377](https://github.com/barocss/barocss-editor/issues/377) adds `GET /v1/tenants/:tenantId/members?after=<uuid>`, `PATCH /v1/tenants/:tenantId/members/:memberId` with `{ "role": "editor" | "viewer" }`, and `DELETE` at the same member URL. Each route requires the caller's current active owner/admin membership in that tenant. The list is capped at 50 entries and returns internal `memberId`, role, active and isSelf flags; it does not return OIDC issuer, subject, email or token. Changes can affect only active editor/viewer members; owner/admin changes and cross-tenant targets are rejected. Successful changes return `memberId`, role, active and changed. Missing authentication returns 401, denied access 403, revoked target conflict 409 and database/audit failure 503. The internal UUID alone is not sufficient for a human to identify a change target safely. The Office UI must block role changes until PM, Architecture and Security establish a verified minimum display identifier and target-confirmation contract. These draft routes are not an approved external administration workflow.

The process uses explicit settings, not `NODE_ENV`, to select its network binding. It does not load `.env` files. Startup errors do not print environment values. SIGINT and SIGTERM close the listener and drain active HTTP connections. The deadline closes remaining connections and terminates the process with a failure exit code, even if a close hook has not completed. Logs contain lifecycle events only.

## Build and checks

```sh
pnpm --filter @barocss/office-api build
pnpm --filter @barocss/office-api start
pnpm --filter @barocss/office-api test
pnpm preflight
```

The test command builds the real entry point and checks actual HTTP requests, invalid configuration, occupied ports, SIGINT, SIGTERM and an incomplete request at the shutdown deadline. Source and test type checks participate in repository preflight. The app test is included in the existing recursive unit-test CI command.

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

Server-owned Fastify schemas validate inputs and serialize responses. Inputs do not receive implicit type coercion, defaults or silent removal of unexpected fields. The JSON body limit is 1 MiB. Error responses omit messages, stack traces, submitted values and validation internals. Proxy headers and request-ID headers are not trusted. Document data routes remain pending.

Wonffice does not implement its own collaboration server. Yorkie is the selected alpha provider, but this API check does not authenticate Yorkie connections or stop a direct local Yorkie client. Provider authorization and revocation require separate [#366](https://github.com/barocss/barocss-editor/issues/366) evidence. See the [provider contract](../../docs/specs/wonffice-collaboration-providers.md).
