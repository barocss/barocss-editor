import type { Migration } from './migrations.js';

/** Preserve prior migrations; lock the displayed directory version through commit. */
export const companyMemberConfirmationMigration: Migration = {
  id: '0017_company_member_confirmation',
  sql: `
CREATE FUNCTION wonffice.company_member_change_confirmed(
  p_tenant uuid, p_target uuid, p_action text, p_role text, p_directory_revision integer, p_request uuid)
RETURNS TABLE(status text, previous_role text, new_role text, active boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_actor uuid; v_actor_role text; v_target_role text; v_revoked_at timestamptz;
  v_directory_revision integer;
BEGIN
  IF session_user <> 'wonffice_app' OR
    p_tenant IS DISTINCT FROM NULLIF(current_setting('wonffice.tenant_id', true), '')::uuid OR
    p_target IS NULL OR p_request IS NULL OR p_directory_revision IS NULL OR p_directory_revision < 1 OR
    p_action IS NULL OR p_action NOT IN ('revoke', 'set_role') OR
    (p_action = 'set_role' AND (p_role IS NULL OR p_role NOT IN ('editor', 'viewer'))) OR
    (p_action = 'revoke' AND p_role IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_company_member_change';
  END IF;
  SELECT id INTO v_actor FROM wonffice.identities
    WHERE issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
      AND subject = NULLIF(current_setting('wonffice.oidc_subject', true), '');
  SELECT m.role INTO v_actor_role FROM wonffice.tenant_memberships m
    WHERE m.tenant_id = p_tenant AND m.identity_id = v_actor AND m.revoked_at IS NULL
    FOR SHARE;
  -- Preserve the original authorization/refusal audit without exposing directory state.
  IF v_actor_role IN ('owner', 'admin') THEN
    SELECT m.role, m.revoked_at INTO v_target_role, v_revoked_at
      FROM wonffice.tenant_memberships m
      WHERE m.tenant_id = p_tenant AND m.identity_id = p_target FOR UPDATE;
    IF v_target_role IN ('editor', 'viewer') AND v_revoked_at IS NULL THEN
      -- Private approved provisioning takes the same target-before-directory locks.
      SELECT d.revision INTO v_directory_revision FROM wonffice.member_directory d
        WHERE d.tenant_id = p_tenant AND d.member_id = p_target FOR SHARE;
      IF v_directory_revision IS DISTINCT FROM p_directory_revision THEN
        INSERT INTO wonffice.company_member_admin_events
          (id, tenant_id, actor_identity_id, actor_issuer, actor_subject, target_identity_id,
            action, previous_role, requested_role, outcome, request_id)
          VALUES (gen_random_uuid(), p_tenant, v_actor,
            current_setting('wonffice.oidc_issuer', true),
            current_setting('wonffice.oidc_subject', true), p_target,
            p_action, v_target_role, p_role, 'conflict', p_request);
        RETURN QUERY SELECT 'conflict'::text, v_target_role, NULL::text, NULL::boolean;
        RETURN;
      END IF;
    END IF;
  END IF;
  -- Owner-only internal reuse of the original protected role/revoke/audit logic.
  RETURN QUERY SELECT * FROM wonffice.company_member_change(p_tenant, p_target, p_action, p_role, p_request);
END
$$;
REVOKE ALL ON FUNCTION wonffice.company_member_change(uuid, uuid, text, text, uuid) FROM PUBLIC, wonffice_app;
REVOKE ALL ON FUNCTION wonffice.company_member_change_confirmed(uuid, uuid, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.company_member_change_confirmed(uuid, uuid, text, text, integer, uuid) TO wonffice_app;
`,
};
