import { memberDirectoryMigration } from './member-directory-migration.js';
import { platformOperatorMigration } from './platform-operator-migration.js';
import { companyMemberMigration } from './company-member-migration.js';

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
}, {
  id: '0004_document_snapshots',
  sql: `
ALTER TABLE wonffice.documents
  ADD COLUMN title text NOT NULL DEFAULT 'Untitled' CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  ADD COLUMN metadata_revision integer NOT NULL DEFAULT 1 CHECK (metadata_revision > 0),
  ADD COLUMN mode text NOT NULL DEFAULT 'snapshot' CHECK (mode IN ('snapshot', 'initializing', 'collaborative')),
  ADD COLUMN page_id text,
  ADD COLUMN document_key text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE wonffice.documents SET document_key = 'wonffice-' || tenant_id::text || '-' || id::text;
UPDATE wonffice.documents SET page_id = id::text WHERE product = 'note';
ALTER TABLE wonffice.documents
  ALTER COLUMN document_key SET NOT NULL,
  ADD CONSTRAINT document_key_derived CHECK (document_key = 'wonffice-' || tenant_id::text || '-' || id::text),
  ADD CONSTRAINT note_page_only CHECK ((product = 'note') = (page_id IS NOT NULL));
CREATE UNIQUE INDEX documents_document_key ON wonffice.documents(document_key);
CREATE UNIQUE INDEX documents_note_page ON wonffice.documents(tenant_id, page_id) WHERE page_id IS NOT NULL;

CREATE TABLE wonffice.document_snapshots (
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  file_format text NOT NULL,
  file_version integer NOT NULL CHECK (file_version > 0),
  snapshot_text text NOT NULL CHECK (octet_length(snapshot_text) <= 524288),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT
);
CREATE TABLE wonffice.document_receipts (
  tenant_id uuid NOT NULL REFERENCES wonffice.tenants(id) ON DELETE RESTRICT,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'metadata')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  document_id uuid,
  result_head jsonb,
  result_snapshot_text text CHECK (result_snapshot_text IS NULL OR octet_length(result_snapshot_text) <= 524288),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, identity_id, operation, idempotency_key),
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((document_id IS NULL) = (result_head IS NULL)),
  CHECK (result_head IS NULL OR (operation = 'metadata') = (result_snapshot_text IS NULL))
);
ALTER TABLE wonffice.document_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.document_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.document_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.document_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY snapshot_owner ON wonffice.document_snapshots TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY snapshot_context ON wonffice.document_snapshots TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid);
CREATE POLICY receipt_owner ON wonffice.document_receipts TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY receipt_context ON wonffice.document_receipts TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT id FROM wonffice.identities))
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND identity_id IN (SELECT id FROM wonffice.identities));
GRANT SELECT, INSERT, UPDATE ON wonffice.document_snapshots, wonffice.document_receipts TO wonffice_app;
GRANT SELECT ON wonffice.document_snapshots, wonffice.document_receipts TO wonffice_backup;
`,
}, platformOperatorMigration, companyMemberMigration, {
  id: '0007_document_collaboration_seed',
  sql: `
CREATE TABLE wonffice.document_collaboration_seeds (
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'yorkie'),
  provider_project text NOT NULL CHECK (char_length(provider_project) BETWEEN 1 AND 120),
  provider_build text NOT NULL CHECK (char_length(provider_build) BETWEEN 1 AND 120),
  seed_id uuid NOT NULL,
  request_key text NOT NULL CHECK (char_length(request_key) BETWEEN 1 AND 120),
  snapshot_revision integer NOT NULL CHECK (snapshot_revision > 0),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('initializing', 'uncertain', 'confirmed')),
  confirmed_provider_checkpoint text CHECK (confirmed_provider_checkpoint IS NULL OR
    char_length(confirmed_provider_checkpoint) BETWEEN 1 AND 120),
  confirmed_provider_snapshot_hash text CHECK (confirmed_provider_snapshot_hash IS NULL OR
    confirmed_provider_snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  PRIMARY KEY (tenant_id, document_id),
  UNIQUE (seed_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL AND
    confirmed_provider_checkpoint IS NOT NULL AND confirmed_provider_snapshot_hash IS NOT NULL))
);
ALTER TABLE wonffice.document_collaboration_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.document_collaboration_seeds FORCE ROW LEVEL SECURITY;
CREATE POLICY collaboration_seed_owner ON wonffice.document_collaboration_seeds TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY collaboration_seed_context ON wonffice.document_collaboration_seeds TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON wonffice.document_collaboration_seeds TO wonffice_app;
GRANT SELECT ON wonffice.document_collaboration_seeds TO wonffice_backup;
`,
}, {
  id: '0008_document_capabilities',
  sql: `
CREATE TABLE wonffice.document_capabilities (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  issuer text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  session_id text NOT NULL CHECK (char_length(session_id) BETWEEN 1 AND 255),
  provider_project text NOT NULL CHECK (char_length(provider_project) BETWEEN 1 AND 120),
  provider_build text NOT NULL CHECK (char_length(provider_build) BETWEEN 1 AND 120),
  access text NOT NULL CHECK (access IN ('r', 'rw')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at <= created_at + interval '60 seconds')
);
CREATE INDEX document_capabilities_expiry ON wonffice.document_capabilities(expires_at);
ALTER TABLE wonffice.document_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.document_capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY capability_owner ON wonffice.document_capabilities TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY capability_issue ON wonffice.document_capabilities TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid
    AND issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
    AND subject = NULLIF(current_setting('wonffice.oidc_subject', true), ''));
GRANT INSERT ON wonffice.document_capabilities TO wonffice_app;
GRANT SELECT ON wonffice.document_capabilities TO wonffice_backup;

-- A random token's hash identifies one capability before a tenant context exists.
-- The function can read only this table. Document and membership reads remain under app RLS.
CREATE FUNCTION wonffice.lookup_document_capability(p_hash text)
RETURNS TABLE(tenant_id uuid, document_id uuid, issuer text, subject text,
  session_id text, provider_project text, provider_build text, access text)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog AS $$
  SELECT c.tenant_id, c.document_id, c.issuer, c.subject, c.session_id,
    c.provider_project, c.provider_build, c.access
  FROM wonffice.document_capabilities AS c
  WHERE c.token_hash = p_hash AND c.expires_at > clock_timestamp()
    AND c.expires_at <= c.created_at + interval '60 seconds'
$$;
REVOKE ALL ON FUNCTION wonffice.lookup_document_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.lookup_document_capability(text) TO wonffice_app;
`,
}, {
  id: '0009_full_note_collaboration_seed',
  sql: `
ALTER TABLE wonffice.document_collaboration_seeds
  ADD COLUMN codec_version text,
  ADD COLUMN canonical_seed jsonb,
  ADD COLUMN canonical_seed_hash text,
  ADD COLUMN source_snapshot_text text;
ALTER TABLE wonffice.document_collaboration_seeds
  ADD CONSTRAINT full_note_seed_complete CHECK (
    (codec_version IS NULL AND canonical_seed IS NULL AND canonical_seed_hash IS NULL
      AND source_snapshot_text IS NULL) OR
    (codec_version = 'note-full-seed-v2' AND canonical_seed IS NOT NULL
      AND canonical_seed_hash ~ '^[0-9a-f]{64}$' AND source_snapshot_text IS NOT NULL));
-- Old raw roots have no canonical tree proof. Preserve their attempt and frozen
-- snapshot, but close ordinary collaboration access until manual inspection.
UPDATE wonffice.document_collaboration_seeds
  SET status = 'uncertain', confirmed_at = NULL,
    confirmed_provider_checkpoint = NULL, confirmed_provider_snapshot_hash = NULL,
    updated_at = now()
  WHERE codec_version IS NULL AND status = 'confirmed';
UPDATE wonffice.documents AS d SET mode = 'initializing', updated_at = now()
  FROM wonffice.document_collaboration_seeds AS s
  WHERE s.tenant_id = d.tenant_id AND s.document_id = d.id
    AND s.codec_version IS NULL AND s.status = 'uncertain'
    AND d.mode = 'collaborative';
`,
}, memberDirectoryMigration];
