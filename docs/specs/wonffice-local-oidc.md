# Local OIDC and tenant-membership check

This is the synthetic #355 backend check. It uses Keycloak 26.7.4, PostgreSQL 16 and the Fastify API. It does not test product UI, document saving or Yorkie authorization. Keep this environment separate from zero-js. The Wonffice Yorkie instance, when used for later collaboration checks, has its own Colima profile and loopback ports 18080/18081; #355 does not require Yorkie.

## Isolated local services

Use Node from `.nvmrc`. Start the dedicated `wonffice` Colima profile and point Docker at its socket. Do not change the global Docker context. Create a dedicated Docker network and volume for Keycloak. Create a mode-0600 environment file **outside the repository** containing `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD`. Generate the password locally; do not put it in a command line, issue, PR or log.

```sh
colima start --profile wonffice
export DOCKER_HOST="unix://$HOME/.colima/wonffice/docker.sock"
docker network create wonffice-auth-net
docker volume create wonffice-keycloak-data
docker run -d --name wonffice-keycloak --network wonffice-auth-net \
  --mount source=wonffice-keycloak-data,target=/opt/keycloak/data \
  --env-file "$LOCAL_KEYCLOAK_ADMIN_ENV_FILE" \
  -p 127.0.0.1:18180:8080 --restart unless-stopped \
  quay.io/keycloak/keycloak:26.7.4 start-dev
```

Use a new Keycloak volume for first provisioning. `start-dev` and loopback HTTP are for this local check only. `provision-local-keycloak.mjs` refuses to overwrite its output. It creates the `wonffice-local` realm, public `wonffice-browser` client with authorization-code/PKCE S256, `wonffice-api` access-token audience, and two synthetic accounts. Keep its output outside the repository at mode 0600.

```sh
WONFFICE_LOCAL_KEYCLOAK_ADMIN_ENV_FILE="$LOCAL_KEYCLOAK_ADMIN_ENV_FILE" \
WONFFICE_LOCAL_KEYCLOAK_OUTPUT="$LOCAL_KEYCLOAK_USERS_FILE" \
node scripts/backend/provision-local-keycloak.mjs
```

Prepare a **new** PostgreSQL 16 database on a private Unix socket with `wonffice_owner`, `wonffice_app` and `wonffice_backup` as described in [office-service](../../apps/office-service/README.md). For this synthetic local cluster only, disable TCP listening (`-h ''`) and use a private socket directory. Never use the trust-auth test configuration for an external installation. Apply reviewed migrations with `OFFICE_MIGRATION_DATABASE_URL` as `wonffice_owner` before starting the API.

Create protected JSON manifests outside the repository. They must use real `issuer` and `subject` values from the generated Keycloak account file. Give each change a unique approval reference from the operator's change record. Apply in this order: bootstrap Alpha with Alice as owner, bootstrap Beta with Bob as owner, grant Bob `admin` in Alpha. The two tenant IDs go into a protected JSON file as `{ "alpha": "<UUID>", "beta": "<UUID>" }`. The change shapes are:

```json
{ "action": "bootstrap_owner", "tenantId": "<UUID>", "tenantName": "Alpha", "issuer": "<issuer>", "subject": "<Alice subject>", "approvalRef": "<approval record>" }
```

```json
{ "action": "grant", "tenantId": "<Alpha UUID>", "issuer": "<issuer>", "subject": "<Bob subject>", "role": "admin", "approvalRef": "<approval record>" }
```

Run `OFFICE_MEMBERSHIP_MANIFEST_PATH=<protected file> OFFICE_MIGRATION_DATABASE_URL=<owner URL> pnpm --filter @barocss/office-service membership:admin` once per manifest. A protected `revoke` manifest has the grant fields with `action: "revoke"` and a new approval reference. The CLI logs only success and whether the transaction changed data. It cannot prove that the approval reference was authorized; the operator must check the approval record first.

Start the API with `OFFICE_OIDC_ISSUER`, same-origin `OFFICE_OIDC_JWKS_URL`, `OFFICE_OIDC_AUDIENCE=wonffice-api`, and `OFFICE_API_DATABASE_URL` for **wonffice_app**. Set `OFFICE_API_PORT=14100` for this local check; the normal default is 4100. The API still reports `/health/ready` as 503 because document storage is incomplete.

With the API running, run the browser check. It starts a callback listener on 127.0.0.1:18200, launches two separate Chromium contexts, completes real authorization-code/PKCE logins, and checks `/v1/me` and tenant access. It does not print passwords or tokens.

```sh
WONFFICE_LOCAL_KEYCLOAK_USERS_FILE="$LOCAL_KEYCLOAK_USERS_FILE" \
WONFFICE_LOCAL_TENANTS_FILE="$LOCAL_TENANTS_FILE" \
OFFICE_MIGRATION_DATABASE_URL="$OWNER_DATABASE_URL" \
WONFFICE_LOCAL_REVOKE_MANIFEST="$LOCAL_REVOKE_MANIFEST" \
node scripts/backend/verify-local-oidc-browser.mjs
```

The first run expects Bob's Alpha `admin` role and applies the approved revoke after checking it. Stop and restart only the Wonffice API, its dedicated PostgreSQL cluster and `wonffice-keycloak`. Then repeat the browser check with `WONFFICE_EXPECT_ALPHA_ROLE=revoked` and without `WONFFICE_LOCAL_REVOKE_MANIFEST`. Bob must still own Beta but must not see or access Alpha. Run `PG_BIN=<PostgreSQL 16 bin> pnpm --filter @barocss/office-service test:postgres` for a fresh synthetic cluster, backup/restore and RLS check. Run `pnpm --filter @barocss/office-api test`, `pnpm preflight`, and the backend container smoke test when Docker is available.

For shutdown, stop the API with SIGINT/SIGTERM, stop the dedicated Keycloak container, and stop the dedicated PostgreSQL cluster with `pg_ctl -m fast -w stop`. Retain the private volumes, database and protected manifest files until the operator has recorded the evidence and approved cleanup. Never stop, reconfigure or remove the zero-js Yorkie service as part of this check.

This check does not establish an external IdP setup, a production Keycloak configuration, platform-operator authorization, product login UI, document-save permissions or Yorkie capability revocation. Those require separate integration and QA/Security evidence before external alpha.
