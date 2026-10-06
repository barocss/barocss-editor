import type { Migration } from './migrations.js';
export const schemaRegistryMigration: Migration = { id: '0016_schema_registry', sql: `
CREATE TABLE wonffice.schema_versions (
 tenant_id uuid NOT NULL, workspace_id uuid NOT NULL, schema_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 definition_text text NOT NULL CHECK(octet_length(definition_text)<=65536),
 canonical_text text NOT NULL CHECK(octet_length(canonical_text)<=65536),
 actor_identity_id uuid NOT NULL REFERENCES wonffice.identities(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,workspace_id,schema_id,version), UNIQUE(tenant_id,workspace_id,schema_id,version,digest),
 FOREIGN KEY(tenant_id,workspace_id) REFERENCES wonffice.workspaces(tenant_id,id));
CREATE TABLE wonffice.schema_dependencies (
 tenant_id uuid NOT NULL, workspace_id uuid NOT NULL, schema_id uuid NOT NULL, version integer NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 16), kind text NOT NULL CHECK(kind IN ('parent','dependency')),
 dependency_id uuid NOT NULL, dependency_version integer NOT NULL, dependency_digest text NOT NULL,
 PRIMARY KEY(tenant_id,workspace_id,schema_id,version,ordinal),
 FOREIGN KEY(tenant_id,workspace_id,schema_id,version) REFERENCES wonffice.schema_versions(tenant_id,workspace_id,schema_id,version),
 FOREIGN KEY(tenant_id,workspace_id,dependency_id,dependency_version,dependency_digest)
 REFERENCES wonffice.schema_versions(tenant_id,workspace_id,schema_id,version,digest));
CREATE TABLE wonffice.schema_registry_receipts (
 tenant_id uuid NOT NULL, workspace_id uuid NOT NULL, identity_id uuid NOT NULL REFERENCES wonffice.identities(id),
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=262144),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,identity_id,idempotency_key),
 FOREIGN KEY(tenant_id,workspace_id) REFERENCES wonffice.workspaces(tenant_id,id));
ALTER TABLE wonffice.schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.schema_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.schema_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.schema_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.schema_registry_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.schema_registry_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY schema_version_owner ON wonffice.schema_versions TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY schema_dependency_owner ON wonffice.schema_dependencies TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY schema_receipt_owner ON wonffice.schema_registry_receipts TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY schema_version_read ON wonffice.schema_versions FOR SELECT TO wonffice_app USING(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_versions.tenant_id AND m.revoked_at IS NULL));
CREATE POLICY schema_version_write ON wonffice.schema_versions FOR INSERT TO wonffice_app WITH CHECK(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid AND actor_identity_id IN(SELECT id FROM wonffice.identities)
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_versions.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
CREATE POLICY schema_dependency_read ON wonffice.schema_dependencies FOR SELECT TO wonffice_app USING(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_dependencies.tenant_id AND m.revoked_at IS NULL));
CREATE POLICY schema_dependency_write ON wonffice.schema_dependencies FOR INSERT TO wonffice_app WITH CHECK(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_dependencies.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
CREATE POLICY schema_receipt_read ON wonffice.schema_registry_receipts FOR SELECT TO wonffice_app USING(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid AND identity_id IN(SELECT id FROM wonffice.identities)
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_registry_receipts.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
CREATE POLICY schema_receipt_write ON wonffice.schema_registry_receipts FOR INSERT TO wonffice_app WITH CHECK(
 tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid AND identity_id IN(SELECT id FROM wonffice.identities)
 AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=schema_registry_receipts.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
REVOKE ALL ON wonffice.schema_versions,wonffice.schema_dependencies,wonffice.schema_registry_receipts FROM PUBLIC;
GRANT SELECT,INSERT ON wonffice.schema_versions,wonffice.schema_dependencies,wonffice.schema_registry_receipts TO wonffice_app;
GRANT SELECT ON wonffice.schema_versions,wonffice.schema_dependencies,wonffice.schema_registry_receipts TO wonffice_backup;
` };
