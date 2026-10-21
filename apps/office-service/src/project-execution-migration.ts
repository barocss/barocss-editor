import type { Migration } from './migrations.js';

export const projectExecutionMigration: Migration = {
  id: '0012_project_execution_attempts',
  sql: `
CREATE TABLE wonffice.project_executions (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  work_id uuid NOT NULL,
  result_id uuid NOT NULL,
  document_id uuid NOT NULL,
  id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES wonffice.identities(id),
  claim_hash text NOT NULL CHECK (claim_hash ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 8388608),
  phase text GENERATED ALWAYS AS (data->>'phase') STORED NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, id),
  UNIQUE (tenant_id, project_id, work_id, result_id),
  CHECK (phase IN ('started','unknown','proposal','blocked','failed','accepted','applied','rejected','unsupported')),
  CHECK (data->>'id' = id::text AND data->>'actorId' = actor_id::text),
  FOREIGN KEY (tenant_id, project_id) REFERENCES wonffice.projects(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, document_id) REFERENCES wonffice.documents(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE wonffice.project_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.project_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY project_execution_owner ON wonffice.project_executions TO wonffice_owner USING (true) WITH CHECK (true);
CREATE POLICY project_execution_read ON wonffice.project_executions FOR SELECT TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND tenant_id IN (SELECT tenant_id FROM wonffice.tenant_memberships WHERE revoked_at IS NULL));
CREATE POLICY project_execution_insert ON wonffice.project_executions FOR INSERT TO wonffice_app
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND actor_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE tenant_id = project_executions.tenant_id AND revoked_at IS NULL AND role <> 'viewer'));
CREATE POLICY project_execution_update ON wonffice.project_executions FOR UPDATE TO wonffice_app
  USING (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND actor_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE tenant_id = project_executions.tenant_id AND revoked_at IS NULL AND role <> 'viewer'))
  WITH CHECK (tenant_id = NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND actor_id IN (SELECT identity_id FROM wonffice.tenant_memberships WHERE tenant_id = project_executions.tenant_id AND revoked_at IS NULL AND role <> 'viewer'));
REVOKE ALL ON wonffice.project_executions FROM PUBLIC;
GRANT SELECT (tenant_id,project_id,work_id,result_id,document_id,id,actor_id,data,phase,created_at,updated_at),
  INSERT ON wonffice.project_executions TO wonffice_app;
GRANT UPDATE (data,updated_at) ON wonffice.project_executions TO wonffice_app;
GRANT SELECT ON wonffice.project_executions TO wonffice_backup;

-- Detect revoke/restore even when the same member regains the same role.
CREATE FUNCTION wonffice.project_execution_actor_epoch(p_tenant uuid)
RETURNS TABLE(epoch text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog,pg_temp AS $$
  SELECT m.role || ':' || (SELECT count(*)::text FROM wonffice.membership_events e
    WHERE e.tenant_id=m.tenant_id AND e.identity_id=m.identity_id)
  FROM wonffice.tenant_memberships m JOIN wonffice.identities i ON i.id=m.identity_id
  WHERE m.tenant_id=p_tenant AND p_tenant=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    AND i.issuer=NULLIF(current_setting('wonffice.oidc_issuer',true),'')
    AND i.subject=NULLIF(current_setting('wonffice.oidc_subject',true),'') AND m.revoked_at IS NULL
  FOR SHARE OF m
$$;
REVOKE ALL ON FUNCTION wonffice.project_execution_actor_epoch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.project_execution_actor_epoch(uuid) TO wonffice_app;

-- Only the server-held dispatch claim can retain a finished response after revocation.
-- It cannot change the captured input, actor, document, project or any native snapshot.
CREATE FUNCTION wonffice.complete_project_execution(p_tenant uuid,p_project uuid,p_id uuid,p_claim text,p_completion jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,pg_temp AS $$
BEGIN
  IF p_tenant IS DISTINCT FROM NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    OR jsonb_typeof(p_completion) IS DISTINCT FROM 'object' OR octet_length(p_completion::text) > 1048576
    OR p_completion->>'phase' IS NULL OR p_completion->>'phase' NOT IN ('proposal','blocked','failed','unknown')
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_completion) k
      WHERE k NOT IN ('phase','reason','proposal','provenance','expectedSnapshotText','expectedSnapshotHash'))
  THEN RAISE EXCEPTION 'invalid_execution_completion'; END IF;
  UPDATE wonffice.project_executions SET data=data || p_completion,updated_at=now()
    WHERE tenant_id=p_tenant AND project_id=p_project AND id=p_id AND claim_hash=p_claim AND phase='started';
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_claim_unavailable'; END IF;
END $$;
REVOKE ALL ON FUNCTION wonffice.complete_project_execution(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.complete_project_execution(uuid,uuid,uuid,text,jsonb) TO wonffice_app;
`,
};
