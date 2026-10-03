import type { Migration } from './migrations.js';

export const criterionConfirmationMigration: Migration = {
  id: '0013_criterion_confirmations',
  sql: `
CREATE TABLE wonffice.criterion_confirmations (
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  id uuid NOT NULL,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  document_revision integer NOT NULL CHECK (document_revision > 0),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot_text text NOT NULL CHECK (octet_length(snapshot_text) <= 524288),
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  authority_epoch text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, identity_id, idempotency_key),
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX criterion_confirmations_document ON wonffice.criterion_confirmations(tenant_id,document_id);
ALTER TABLE wonffice.criterion_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.criterion_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY criterion_confirmation_owner ON wonffice.criterion_confirmations TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY criterion_confirmation_read ON wonffice.criterion_confirmations FOR SELECT TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=criterion_confirmations.tenant_id
      AND m.revoked_at IS NULL AND m.role <> 'viewer'));
CREATE POLICY criterion_confirmation_insert ON wonffice.criterion_confirmations FOR INSERT TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND identity_id IN (SELECT id FROM wonffice.identities)
    AND EXISTS (SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=criterion_confirmations.tenant_id
      AND m.revoked_at IS NULL AND m.role <> 'viewer'));
GRANT SELECT,INSERT ON wonffice.criterion_confirmations TO wonffice_app;
GRANT SELECT ON wonffice.criterion_confirmations TO wonffice_backup;
`,
};
