import type { Migration } from './migrations.js';

/** A narrow owner-owned boundary; app role never gets direct member write access. */
export const companyMemberMigration: Migration = {
  id: '0006_company_member_admin',
  sql: `
CREATE TABLE wonffice.company_member_admin_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES wonffice.tenants(id) ON DELETE RESTRICT,
  actor_identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  target_identity_id uuid,
  action text NOT NULL CHECK (action IN ('list', 'set_role', 'revoke')),
  previous_role text CHECK (previous_role IN ('owner', 'admin', 'editor', 'viewer')),
  requested_role text CHECK (requested_role IN ('editor', 'viewer')),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'applied', 'no_change', 'forbidden', 'conflict')),
  request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wonffice.company_member_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.company_member_admin_events FORCE ROW LEVEL SECURITY;
CREATE POLICY company_member_event_owner ON wonffice.company_member_admin_events TO wonffice_owner
  USING (true) WITH CHECK (true);
GRANT SELECT ON wonffice.company_member_admin_events TO wonffice_backup;

-- The one application role can call these functions only with the verified OIDC
-- and tenant context installed for the current transaction by office-service.
-- The owning role can see member rows inside the function, but the app role
-- receives only bounded rows from this tenant and never receives table UPDATE.
CREATE FUNCTION wonffice.company_member_list(p_tenant uuid, p_after uuid, p_request uuid)
RETURNS TABLE(status text, member_id uuid, member_role text, active boolean, is_self boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_actor uuid; v_role text;
BEGIN
  IF session_user <> 'wonffice_app' OR
    p_tenant IS DISTINCT FROM NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid OR
    p_request IS NULL THEN
    RAISE EXCEPTION 'invalid_company_member_context';
  END IF;
  SELECT id INTO v_actor FROM wonffice.identities
    WHERE issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
      AND subject = NULLIF(current_setting('wonffice.oidc_subject', true), '');
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::text, NULL::boolean, NULL::boolean;
    RETURN;
  END IF;
  SELECT m.role INTO v_role FROM wonffice.tenant_memberships m
    WHERE m.tenant_id = p_tenant AND m.identity_id = v_actor AND m.revoked_at IS NULL
    FOR SHARE;
  IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'admin' THEN
    INSERT INTO wonffice.company_member_admin_events
      (id, tenant_id, actor_identity_id, action, outcome, request_id)
      VALUES (gen_random_uuid(), p_tenant, v_actor, 'list', 'forbidden', p_request);
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::text, NULL::boolean, NULL::boolean;
    RETURN;
  END IF;
  INSERT INTO wonffice.company_member_admin_events
    (id, tenant_id, actor_identity_id, action, outcome, request_id)
    VALUES (gen_random_uuid(), p_tenant, v_actor, 'list', 'allowed', p_request);
  RETURN QUERY SELECT 'allowed'::text, m.identity_id, m.role, m.revoked_at IS NULL,
      m.identity_id = v_actor
    FROM wonffice.tenant_memberships m
    WHERE m.tenant_id = p_tenant AND (p_after IS NULL OR m.identity_id > p_after)
    ORDER BY m.identity_id LIMIT 51;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'allowed'::text, NULL::uuid, NULL::text, NULL::boolean, NULL::boolean;
  END IF;
END
$$;

CREATE FUNCTION wonffice.company_member_change(
  p_tenant uuid, p_target uuid, p_action text, p_role text, p_request uuid)
RETURNS TABLE(status text, previous_role text, new_role text, active boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_actor uuid; v_actor_role text; v_target_role text; v_revoked_at timestamptz;
  v_outcome text := 'forbidden'; v_current_role text; v_active boolean;
BEGIN
  IF session_user <> 'wonffice_app' OR
    p_tenant IS DISTINCT FROM NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid OR
    p_target IS NULL OR p_request IS NULL OR
    p_action IS NULL OR p_action NOT IN ('revoke', 'set_role') OR
    (p_action = 'set_role' AND (p_role IS NULL OR p_role NOT IN ('editor', 'viewer'))) OR
    (p_action = 'revoke' AND p_role IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_company_member_change';
  END IF;
  SELECT id INTO v_actor FROM wonffice.identities
    WHERE issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
      AND subject = NULLIF(current_setting('wonffice.oidc_subject', true), '');
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  SELECT m.role INTO v_actor_role FROM wonffice.tenant_memberships m
    WHERE m.tenant_id = p_tenant AND m.identity_id = v_actor AND m.revoked_at IS NULL
    FOR SHARE;
  IF v_actor_role IN ('owner', 'admin') THEN
    SELECT m.role, m.revoked_at INTO v_target_role, v_revoked_at
      FROM wonffice.tenant_memberships m
      WHERE m.tenant_id = p_tenant AND m.identity_id = p_target FOR UPDATE;
    IF v_target_role IN ('editor', 'viewer') THEN
      IF v_revoked_at IS NOT NULL THEN
        v_outcome := 'conflict';
      ELSIF p_action = 'revoke' THEN
        UPDATE wonffice.tenant_memberships SET revoked_at = now()
          WHERE tenant_id = p_tenant AND identity_id = p_target;
        v_outcome := 'applied'; v_current_role := v_target_role; v_active := false;
      ELSIF v_target_role = p_role THEN
        v_outcome := 'no_change'; v_current_role := v_target_role; v_active := true;
      ELSE
        UPDATE wonffice.tenant_memberships SET role = p_role
          WHERE tenant_id = p_tenant AND identity_id = p_target;
        v_outcome := 'applied'; v_current_role := p_role; v_active := true;
      END IF;
    END IF;
  END IF;
  INSERT INTO wonffice.company_member_admin_events
    (id, tenant_id, actor_identity_id, target_identity_id, action,
      previous_role, requested_role, outcome, request_id)
    VALUES (gen_random_uuid(), p_tenant, v_actor, p_target, p_action,
      v_target_role, p_role, v_outcome, p_request);
  RETURN QUERY SELECT v_outcome, v_target_role, v_current_role, v_active;
END
$$;
REVOKE ALL ON FUNCTION wonffice.company_member_list(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION wonffice.company_member_change(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.company_member_list(uuid, uuid, uuid) TO wonffice_app;
GRANT EXECUTE ON FUNCTION wonffice.company_member_change(uuid, uuid, text, text, uuid) TO wonffice_app;
`,
};
