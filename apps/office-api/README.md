# Wonffice API bootstrap

Private backend application. This is WP-05a, the first part of [#330](https://github.com/barocss/barocss-editor/issues/330). It does not yet store documents, authenticate users, or serve the editor. Do not expose it as a production service.

## Local execution

Use Node from the root `.nvmrc` (22.22.0), then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @barocss/office-api dev
curl -i http://127.0.0.1:4100/health/live
curl -i http://127.0.0.1:4100/health/ready
```

`live` returns 200 while the process can answer HTTP. `ready` intentionally returns 503 with `service_not_configured`. Database, migrations, identity and storage readiness must be implemented before this can serve product traffic. GET and HEAD are accepted. Other methods return 405; unknown routes return 404. No data endpoints, CORS allowlist, proxy trust, login or tenant access are implied by these probes.

| Variable | Default | Accepted value |
| --- | --- | --- |
| `OFFICE_API_HOST` | `127.0.0.1` | Literal IPv4 or IPv6 address; container uses `0.0.0.0` |
| `OFFICE_API_PORT` | `4100` | Integer 1–65535 |
| `OFFICE_API_SHUTDOWN_TIMEOUT_MS` | `10000` | Integer 1–60000 |

The process uses explicit settings, not `NODE_ENV`, to select its network binding. It does not load `.env` files. Startup errors do not print environment values. SIGINT and SIGTERM close the listener and drain active HTTP connections. The deadline closes remaining connections and marks the process exit unsuccessful. Logs contain lifecycle events only.

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
pnpm --filter @barocss/office-api build
docker build -t wonffice-api:wp05a apps/office-api
docker run --rm --name wonffice-api -p 127.0.0.1:4100:4100 wonffice-api:wp05a
```

The image runs as `node` and has no runtime npm dependencies. The Docker context allowlist only sends the package manifest and compiled output. Container health uses **liveness**; it is not product readiness. Keep the internal port 4100 for the included health check. A future release pipeline must bind this artifact to its source commit, scan and pin its base image digest, and promote the same resulting digest to both deployment types. This bootstrap image is not a completed release manifest or a tested installation bundle.

With a running local Docker daemon, verify the built artifact from the repository root:

```sh
pnpm --filter @barocss/office-api build
node scripts/backend/verify-container.mjs
```

The `Backend container` workflow runs the same check on Linux for relevant PRs. It builds one image and starts it twice with default and explicit server settings. Each run checks its image ID, non-root user, read-only filesystem, image health check, HTTP liveness/readiness and clean SIGTERM exit. It removes only its own test containers and image tag. It does not push an image or deploy a service. These two configuration runs are not SaaS/on-premises installation acceptance.

The development host had no running Docker daemon on 2026-09-20; Docker Desktop could not be found. Local container execution remains unavailable. Check the PR's `API container smoke` result for Linux evidence. Authentication, persistence and both deployment acceptance checks remain pending. See the [backend plan](../../docs/specs/wonffice-backend-foundation.md) for the next work and data contracts.
