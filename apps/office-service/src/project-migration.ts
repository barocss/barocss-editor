import type { Migration } from './migrations.js';

/** Project catalog metadata and immutable evidence; native documents keep their existing store. */
export const projectMigration: Migration = {
  id: '0011_connected_projects',
  sql: `
CREATE TABLE wonffice.projects (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 4194304),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES wonffice.workspaces(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX projects_workspace ON wonffice.projects(tenant_id, workspace_id, id);
CREATE TABLE wonffice.project_pins (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  snapshot_revision integer NOT NULL CHECK (snapshot_revision > 0),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot_text text NOT NULL CHECK (octet_length(snapshot_text) <= 524288),
  source_title text NOT NULL,
  source_product text NOT NULL CHECK (source_product IN ('note','word','slides','site')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES wonffice.projects(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT
);
CREATE TABLE wonffice.project_receipts (
  tenant_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  project_id uuid,
  result_project jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, identity_id, idempotency_key),
  FOREIGN KEY (tenant_id, identity_id) REFERENCES wonffice.tenant_memberships(tenant_id, identity_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, project_id) REFERENCES wonffice.projects(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((project_id IS NULL) = (result_project IS NULL))
);
ALTER TABLE wonffice.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.project_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.project_pins FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.project_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.project_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY project_owner ON wonffice.projects TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY project_pin_owner ON wonffice.project_pins TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY project_receipt_owner ON wonffice.project_receipts TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY project_read ON wonffice.projects FOR SELECT TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL));
CREATE POLICY project_insert ON wonffice.projects FOR INSERT TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'));
CREATE POLICY project_update ON wonffice.projects FOR UPDATE TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'))
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'));
CREATE POLICY project_pin_read ON wonffice.project_pins FOR SELECT TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL));
CREATE POLICY project_pin_insert ON wonffice.project_pins FOR INSERT TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'));
CREATE POLICY project_receipt_read ON wonffice.project_receipts FOR SELECT TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL));
CREATE POLICY project_receipt_insert ON wonffice.project_receipts FOR INSERT TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'));
CREATE POLICY project_receipt_update ON wonffice.project_receipts FOR UPDATE TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'))
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL AND role <> 'viewer'));
REVOKE ALL ON wonffice.projects, wonffice.project_pins, wonffice.project_receipts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON wonffice.projects, wonffice.project_receipts TO wonffice_app;
GRANT SELECT, INSERT ON wonffice.project_pins TO wonffice_app;
GRANT SELECT ON wonffice.projects, wonffice.project_pins, wonffice.project_receipts TO wonffice_backup;

-- Row locking requires UPDATE privilege. Keep that privilege private and expose
-- only the current verified identity's active membership through this bounded function.
CREATE FUNCTION wonffice.project_current_actor(p_tenant uuid)
RETURNS TABLE(id uuid, role text)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.identity_id, m.role
  FROM wonffice.tenant_memberships m JOIN wonffice.identities i ON i.id=m.identity_id
  WHERE m.tenant_id=p_tenant
    AND p_tenant=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND i.issuer=NULLIF(current_setting('wonffice.oidc_issuer',true),'')
    AND i.subject=NULLIF(current_setting('wonffice.oidc_subject',true),'')
    AND m.revoked_at IS NULL
  FOR SHARE OF m
$$;
REVOKE ALL ON FUNCTION wonffice.project_current_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.project_current_actor(uuid) TO wonffice_app;
`,
};
