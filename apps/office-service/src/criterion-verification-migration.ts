import type { Migration } from './migrations.js';
export const criterionVerificationMigration: Migration = {
 id:'0014_criterion_verifications',
 sql:`
CREATE TABLE wonffice.criterion_verifications (
 tenant_id uuid NOT NULL, document_id uuid NOT NULL, id uuid NOT NULL,
 identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
 confirmation_id uuid NOT NULL, idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 document_revision integer NOT NULL CHECK (document_revision > 0),
 snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
 snapshot_text text NOT NULL CHECK (octet_length(snapshot_text) <= 524288),
 context jsonb NOT NULL CHECK (jsonb_typeof(context)='object'), authority_epoch text NOT NULL,
 specimen jsonb NOT NULL CHECK (jsonb_typeof(specimen)='object'), evaluator jsonb NOT NULL CHECK (jsonb_typeof(evaluator)='object'),
 outcome text NOT NULL CHECK (outcome IN ('passed','failed','unsupported','error')),
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL CHECK (ended_at >= started_at),
 output_text text NOT NULL CHECK (octet_length(output_text) <= 2097152),
 output_hash text NOT NULL CHECK (output_hash ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,identity_id,idempotency_key),
 FOREIGN KEY (tenant_id,document_id) REFERENCES wonffice.documents(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (tenant_id,confirmation_id) REFERENCES wonffice.criterion_confirmations(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX criterion_verifications_document ON wonffice.criterion_verifications(tenant_id,document_id);
ALTER TABLE wonffice.criterion_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.criterion_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY criterion_verification_owner ON wonffice.criterion_verifications TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY criterion_verification_read ON wonffice.criterion_verifications FOR SELECT TO wonffice_app
 USING (tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
  AND EXISTS (SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=criterion_verifications.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
CREATE POLICY criterion_verification_insert ON wonffice.criterion_verifications FOR INSERT TO wonffice_app
 WITH CHECK (tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid AND identity_id IN (SELECT id FROM wonffice.identities)
  AND EXISTS (SELECT 1 FROM wonffice.tenant_memberships m WHERE m.tenant_id=criterion_verifications.tenant_id AND m.revoked_at IS NULL AND m.role<>'viewer'));
GRANT SELECT,INSERT ON wonffice.criterion_verifications TO wonffice_app;
GRANT SELECT ON wonffice.criterion_verifications TO wonffice_backup;
`,
};
