export interface Migration { id: string; sql: string }

// Applied migrations are immutable. Add a new entry instead of editing shipped SQL.
export const migrations: readonly Migration[] = [{
  id: '0001_tenant_workspaces',
  sql: `
CREATE SCHEMA wonffice;
REVOKE ALL ON SCHEMA wonffice FROM PUBLIC;
GRANT USAGE ON SCHEMA wonffice TO wonffice_app;

CREATE TABLE wonffice.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wonffice.workspaces (
  tenant_id uuid NOT NULL REFERENCES wonffice.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE wonffice.documents (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN ('note', 'word', 'slides', 'site')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES wonffice.workspaces(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX documents_workspace ON wonffice.documents(tenant_id, workspace_id);

ALTER TABLE wonffice.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY document_owner ON wonffice.documents TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY document_context ON wonffice.documents TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid);
CREATE POLICY tenant_owner ON wonffice.tenants TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY workspace_owner ON wonffice.workspaces TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY tenant_context ON wonffice.tenants TO wonffice_app
  USING (id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid);
CREATE POLICY workspace_context ON wonffice.workspaces TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid);
GRANT SELECT ON wonffice.tenants TO wonffice_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wonffice.workspaces, wonffice.documents TO wonffice_app;
GRANT USAGE ON SCHEMA wonffice, wonffice_meta TO wonffice_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA wonffice, wonffice_meta TO wonffice_backup;
`,
}];
