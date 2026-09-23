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
}, {
  id: '0002_oidc_memberships',
  sql: `
CREATE TABLE wonffice.identities (
  id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE wonffice.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES wonffice.tenants(id) ON DELETE RESTRICT,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, identity_id)
);
CREATE INDEX memberships_identity ON wonffice.tenant_memberships(identity_id, tenant_id);
CREATE TABLE wonffice.membership_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES wonffice.tenants(id) ON DELETE RESTRICT,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  approval_ref text NOT NULL CHECK (char_length(approval_ref) BETWEEN 1 AND 120),
  action text NOT NULL CHECK (action IN ('bootstrap_owner', 'grant', 'revoke')),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, approval_ref)
);

ALTER TABLE wonffice.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.identities FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.membership_events FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_owner ON wonffice.identities TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY membership_owner ON wonffice.tenant_memberships TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY membership_event_owner ON wonffice.membership_events TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY identity_context ON wonffice.identities TO wonffice_app
  USING (issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
    AND subject = NULLIF(current_setting('wonffice.oidc_subject', true), ''));
CREATE POLICY membership_context ON wonffice.tenant_memberships TO wonffice_app
  USING (identity_id IN (SELECT id FROM wonffice.identities));
GRANT SELECT ON wonffice.identities, wonffice.tenant_memberships TO wonffice_app;
GRANT SELECT ON wonffice.identities, wonffice.tenant_memberships,
  wonffice.membership_events TO wonffice_backup;
`,
}, {
  id: '0003_member_tenant_names',
  sql: `
CREATE POLICY tenant_member_list ON wonffice.tenants TO wonffice_app
  USING (id IN (
    SELECT tenant_id FROM wonffice.tenant_memberships
    WHERE revoked_at IS NULL
  ));
`,
}];
