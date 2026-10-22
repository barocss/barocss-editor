/** New Sheet catalog/ACL only. Integration alone registers and applies this entry.
 * Provisioning uses the existing private wonffice_owner operator connection:
 * INSERT sheet_documents; INSERT sheet_document_grants for existing members.
 * Changes lock membership -> document -> grant, then UPDATE access/revoked_at
 * with revision=revision+1. No identity provisioning or application ACL writer.
 */
export const sheetAccessMigration = { id: '0026_sheet_access', sql: `
CREATE TABLE wonffice.sheet_documents (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  workbook_id uuid NOT NULL,
  generation uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,workspace_id) REFERENCES wonffice.workspaces(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX sheet_documents_workspace ON wonffice.sheet_documents(tenant_id,workspace_id,id);
CREATE TABLE wonffice.sheet_document_grants (
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  access text NOT NULL CHECK (access IN ('read-write','read-only')),
  revoked_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,document_id,identity_id),
  FOREIGN KEY (tenant_id,document_id) REFERENCES wonffice.sheet_documents(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,identity_id) REFERENCES wonffice.tenant_memberships(tenant_id,identity_id) ON DELETE RESTRICT
);
CREATE INDEX sheet_document_grants_identity ON wonffice.sheet_document_grants(tenant_id,identity_id,document_id);

ALTER TABLE wonffice.sheet_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.sheet_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.sheet_document_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.sheet_document_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY sheet_document_owner ON wonffice.sheet_documents TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY sheet_grant_owner ON wonffice.sheet_document_grants TO wonffice_owner USING(true) WITH CHECK(true);
CREATE POLICY sheet_grant_read ON wonffice.sheet_document_grants FOR SELECT TO wonffice_app USING(
  tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
  AND identity_id IN(SELECT id FROM wonffice.identities)
  AND revoked_at IS NULL
  AND EXISTS(SELECT 1 FROM wonffice.tenant_memberships m
    WHERE m.tenant_id=sheet_document_grants.tenant_id AND m.identity_id=sheet_document_grants.identity_id AND m.revoked_at IS NULL)
);
CREATE POLICY sheet_document_read ON wonffice.sheet_documents FOR SELECT TO wonffice_app USING(
  tenant_id=NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid AND active
  AND EXISTS(SELECT 1 FROM wonffice.sheet_document_grants g
    WHERE g.tenant_id=sheet_documents.tenant_id AND g.document_id=sheet_documents.id)
);
REVOKE ALL ON wonffice.sheet_documents,wonffice.sheet_document_grants FROM PUBLIC;
GRANT SELECT ON wonffice.sheet_documents,wonffice.sheet_document_grants TO wonffice_app;
GRANT SELECT ON wonffice.sheet_documents,wonffice.sheet_document_grants TO wonffice_backup;

CREATE FUNCTION wonffice.enforce_sheet_document_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF ROW(NEW.tenant_id,NEW.id,NEW.workspace_id,NEW.workbook_id,NEW.generation)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.workspace_id,OLD.workbook_id,OLD.generation) THEN
    RAISE EXCEPTION 'sheet_document_identity_immutable' USING ERRCODE='23000';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'sheet_document_revision_conflict' USING ERRCODE='23000';
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION wonffice.enforce_sheet_document_identity() FROM PUBLIC;
CREATE TRIGGER sheet_document_identity BEFORE UPDATE ON wonffice.sheet_documents
  FOR EACH ROW EXECUTE FUNCTION wonffice.enforce_sheet_document_identity();
CREATE FUNCTION wonffice.enforce_sheet_grant_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF ROW(NEW.tenant_id,NEW.document_id,NEW.identity_id)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.document_id,OLD.identity_id) THEN
    RAISE EXCEPTION 'sheet_grant_identity_immutable' USING ERRCODE='23000';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'sheet_grant_revision_conflict' USING ERRCODE='23000';
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION wonffice.enforce_sheet_grant_identity() FROM PUBLIC;
CREATE TRIGGER sheet_grant_identity BEFORE UPDATE ON wonffice.sheet_document_grants
  FOR EACH ROW EXECUTE FUNCTION wonffice.enforce_sheet_grant_identity();

-- App has no UPDATE grant. Owner-owned function supplies only this verified
-- person's current row and retains shared row locks through the outer COMMIT.
CREATE FUNCTION wonffice.sheet_current_access(p_tenant uuid,p_workspace uuid,p_document uuid,p_intent text)
RETURNS TABLE(user_id uuid,effective_access text,tenant_id uuid,workspace_id uuid,document_id uuid,
  workbook_id uuid,generation uuid,grant_version integer,document_version integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_user uuid; v_role text; v_document wonffice.sheet_documents%ROWTYPE;
  v_grant wonffice.sheet_document_grants%ROWTYPE; v_access text;
BEGIN
  IF session_user<>'wonffice_app' OR p_tenant IS NULL OR p_workspace IS NULL OR p_document IS NULL
    OR p_tenant IS DISTINCT FROM NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid
    OR p_intent IS NULL OR p_intent NOT IN('read','write') THEN
    RAISE EXCEPTION 'sheet_access_denied' USING ERRCODE='42501';
  END IF;
  -- Canonical existing identities + active tenant membership; FOR SHARE OF m.
  SELECT a.id,a.role INTO v_user,v_role FROM wonffice.project_current_actor(p_tenant) a;
  IF v_user IS NULL OR v_role IS NULL OR v_role NOT IN('owner','admin','editor','viewer') THEN
    RAISE EXCEPTION 'sheet_access_denied' USING ERRCODE='42501';
  END IF;
  SELECT d.* INTO v_document FROM wonffice.sheet_documents d
    WHERE d.tenant_id=p_tenant AND d.workspace_id=p_workspace AND d.id=p_document FOR SHARE OF d;
  IF NOT FOUND OR NOT v_document.active THEN
    RAISE EXCEPTION 'sheet_access_denied' USING ERRCODE='42501';
  END IF;
  SELECT g.* INTO v_grant FROM wonffice.sheet_document_grants g
    WHERE g.tenant_id=p_tenant AND g.document_id=p_document AND g.identity_id=v_user FOR SHARE OF g;
  IF NOT FOUND OR v_grant.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'sheet_access_denied' USING ERRCODE='42501';
  END IF;
  v_access=CASE WHEN v_role='viewer' OR v_grant.access='read-only' THEN 'read-only' ELSE 'read-write' END;
  IF p_intent='write' AND v_access<>'read-write' THEN
    RAISE EXCEPTION 'sheet_read_only' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT v_user,v_access,v_document.tenant_id,v_document.workspace_id,v_document.id,
    v_document.workbook_id,v_document.generation,v_grant.revision,v_document.revision;
END
$$;
REVOKE ALL ON FUNCTION wonffice.sheet_current_access(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.sheet_current_access(uuid,uuid,uuid,text) TO wonffice_app;
` } satisfies { id: string; sql: string };
