# Office service — PostgreSQL foundation

Private Node.js/TypeScript service code, separate from Fastify. This first module stores tenants, workspaces, and document **metadata only**. It does not store document bodies or authenticate users. The API does not yet import it; `/health/ready` remains 503.

Target: PostgreSQL 16, Node from the root `.nvmrc`. Tracking: [#351](https://github.com/barocss/barocss-editor/issues/351), release acceptance: [#322](https://github.com/barocss/barocss-editor/issues/322).

## Roles and schema

Provision three separate database roles through the database administrator. Never give the API owner or backup credentials.

| Role | Permissions and purpose |
| --- | --- |
| `wonffice_owner` | Owns the database/schemas, applies reviewed migrations. No superuser, CREATEROLE, CREATEDB, or BYPASSRLS. Can read all tenant data under its explicit maintenance policy. |
| `wonffice_app` | Not an owner or member of the owner or backup role; no superuser/BYPASSRLS. Can read the current tenant and read/write its workspaces/document metadata. Cannot provision tenants, read migration history, truncate, or change roles to the owner. |
| `wonffice_backup` | Read-only grants on application and migration tables, with BYPASSRLS to make complete backups. This is a privileged data-access identity, never an application identity. |

Administrator provisioning example for an **empty, dedicated database**, using PostgreSQL 16 tools:

```sql
CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
CREATE DATABASE wonffice OWNER wonffice_owner;
REVOKE ALL ON DATABASE wonffice FROM PUBLIC;
GRANT CONNECT ON DATABASE wonffice TO wonffice_owner, wonffice_app, wonffice_backup;
```

Set credentials through your secret manager or interactive administrator tooling, not committed SQL or shell arguments. Production access must use authenticated connections and verified TLS or a controlled local socket. The test harness's local trust authentication is restricted to its own private temporary socket; it is not an installation configuration.

`wonffice.tenants` uses a UUID primary key. Workspaces and document metadata use `(tenant_id, id)` primary keys. Documents reference `(tenant_id, workspace_id)` together, so a document cannot attach to another tenant's workspace. The foreign keys restrict deletion. There is no automatic cascading data deletion. Names have a 200-character bound. Body/schema/revision storage, user memberships, quotas, retention, and asset storage are later changes.

All three tenant tables enable and force RLS. The application policy uses `wonffice.tenant_id`. `withTenant` obtains one pool connection, begins a transaction, checks the app role, rejects nonempty inherited context, sets local context with a parameter, runs the operation, commits, clears context, and releases. Failure rolls back and destroys the connection. Tenant defaults in role, database, connection options, or previous pool use are rejected before running the callback. Do not configure a tenant default or grant owner/backup membership to the app role. Remove an invalid setting/grant and recreate affected pools before retrying. Successful cleanup writes an explicit empty context; it does not use RESET, which can restore a default. `TenantStore` currently supports workspace creation and a bounded list of at most 100 workspaces. Pagination and metadata editing are not implemented.

**The caller must authenticate and authorize the tenant before calling this module.** A UUID or setting a context is not authentication. Trusted server code can select another context. The raw SQL callback is an internal service boundary, not an API for browsers or external plugins. Do not issue transaction controls, change roles or tenant settings, retain the client, or start unawaited queries inside it. A connection loss during COMMIT leaves the outcome uncertain: do not blindly retry writes. Request idempotency and document conflict handling belong to the later document-save contract.

## Apply and recover a database change

```sh
pnpm --filter @barocss/office-service build
# Supply OFFICE_MIGRATION_DATABASE_URL via the execution environment/secret manager.
pnpm --filter @barocss/office-service migrate
```

The URL must connect as `wonffice_owner` to the explicitly chosen database. The runner uses one transaction and an advisory lock, with a 5-second lock timeout and a 30-second statement timeout. It applies new entries from `src/migrations.ts` in order. It stores exact SQL SHA-256 checksums in `wonffice_meta.migrations`. Duplicate, reordered, changed, or unknown applied entries are rejected. An older binary cannot silently operate its migrator against newer history. Run the migrator separately from API startup; do not grant DDL to application instances.

Before a change, stop conflicting migration jobs, record the commit and history, create a database backup, and verify the intended new database restore. Failed DDL and its history entries roll back together; after diagnosing the failure, rerun the **same reviewed artifact**. A commit with an uncertain network outcome is resolved by reconnecting and checking history before taking further action. Do not edit applied SQL or overwrite checksums. Add a new migration. Checksums detect migration history mismatches, not arbitrary manual schema drift.

This initial additive schema has no destructive `down` command. After data exists, deleting its tables is not recovery. For a failed application rollout, use a compatible earlier application or a reviewed forward fix. To recover stored data, restore into a new database and validate before any separately authorized traffic switch. The previous database stays intact. A DB restore can lose changes newer than its backup; no zero-data-loss or recovery-time guarantee has been measured.

CLI logs are JSON `migration_complete` (applied IDs) or `migration_failed`, with a nonzero exit on failure. URLs, SQL errors, credentials, and row values are not logged. For diagnosis, an authorized operator checks the database connection/role, migration history and database logs through controlled access. Do not copy customer rows or secrets into issues.

## Backup and restore into a new database

Use the PostgreSQL 16 `pg_dump`/`pg_restore` client tools. For operator commands, configure host/port and a protected `PGPASSFILE` through the environment; do not put passwords in a command line. The following names are examples for an operator-created source and a **new empty** recovery database:

```sh
umask 077
pg_dump --username=wonffice_backup --dbname=wonffice --format=custom --file=database.dump
# Administrator creates a NEW empty database owned by wonffice_owner first.
pg_restore --username=wonffice_owner --dbname=wonffice_recovery \
  --no-owner --exit-on-error --single-transaction database.dump
```

Preserve both the source database and the archive. Do not use `--clean` against an existing database. Verify tenant/workspace/document metadata and migration history hashes, then verify no-context and cross-tenant access as the **real app role**, not the owner. The automated test below does this on synthetic data. A completed dump or process restart alone is not successful recovery.

Dump files do not contain cluster role definitions or credentials. Provision the same roles in a fresh cluster and preserve grants on restore. Archive confidentiality, encryption, remote retention, key handling, scheduled backups, restore frequency, operator access, and RPO/RTO remain installation policy work. This validates **database-only** recovery. S3 objects, document bodies, configuration and keys are not yet stored or backed up by this module. It is not the complete product backup plan.

## Verification

```sh
pnpm --filter @barocss/office-service test
PG_BIN=/path/to/postgresql/16/bin pnpm --filter @barocss/office-service test:postgres
```

The integration runner always creates and cleans its own temporary PostgreSQL cluster. It accepts no existing database URL, uses synthetic values, disables TCP listening, and does not contact production services. PostgreSQL binaries must exist; missing binaries fail instead of marking an unrun test successful. Linux CI runs the same command. Root execution is unsupported by PostgreSQL `initdb`.

Evidence covers concurrent/repeated migration, failed DDL rollback, history mismatch, real app-role privileges, no-context/cross-tenant RLS, composite references, connection re-use after failure, rejection of configured tenant defaults and backup membership, and a fresh database restore with matching data/history hashes and restored access control. Capacity, external provider behavior, OIDC, product saving, full backup scheduling and production installation remain unverified or unimplemented.

References: [PostgreSQL row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html), [SQL dump and restore](https://www.postgresql.org/docs/16/backup-dump.html), [node-postgres transactions](https://node-postgres.com/features/transactions).
