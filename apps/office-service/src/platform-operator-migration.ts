import type { Migration } from './migrations.js';

/** Platform grants are independent of tenant membership and document RLS. */
export const platformOperatorMigration: Migration = {
  id: '0005_platform_operators',
  sql: `
CREATE TABLE wonffice.platform_operator_grants (
  identity_id uuid PRIMARY KEY REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE wonffice.platform_operator_events (
  id uuid PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  actor_ref text NOT NULL CHECK (char_length(actor_ref) BETWEEN 1 AND 120),
  approval_ref text NOT NULL UNIQUE CHECK (char_length(approval_ref) BETWEEN 1 AND 120),
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wonffice.platform_operator_reads (
  id uuid PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES wonffice.identities(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('access', 'tenants', 'status')),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'forbidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wonffice.platform_operator_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.platform_operator_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.platform_operator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.platform_operator_events FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.platform_operator_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.platform_operator_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_grant_owner ON wonffice.platform_operator_grants TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY platform_event_owner ON wonffice.platform_operator_events TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY platform_read_owner ON wonffice.platform_operator_reads TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY platform_grant_self ON wonffice.platform_operator_grants TO wonffice_app
  USING (identity_id IN (SELECT id FROM wonffice.identities));
CREATE POLICY platform_read_self ON wonffice.platform_operator_reads TO wonffice_app
  WITH CHECK (identity_id IN (SELECT id FROM wonffice.identities));
GRANT SELECT ON wonffice.platform_operator_grants TO wonffice_app;
GRANT INSERT ON wonffice.platform_operator_reads TO wonffice_app;
GRANT SELECT ON wonffice.platform_operator_grants, wonffice.platform_operator_events,
  wonffice.platform_operator_reads TO wonffice_backup;

-- This narrow function returns tenant metadata only. Operator grants do not widen
-- the RLS policies on customer documents, workspaces, or tenant memberships.
CREATE FUNCTION wonffice.operator_tenant_overview(p_after uuid)
RETURNS TABLE(tenant_id uuid, name text, owner_provisioned boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.id, t.name, EXISTS (
    SELECT 1 FROM wonffice.tenant_memberships m
    WHERE m.tenant_id = t.id AND m.role = 'owner' AND m.revoked_at IS NULL
  )
  FROM wonffice.tenants t
  WHERE EXISTS (
    SELECT 1 FROM wonffice.identities i
    JOIN wonffice.platform_operator_grants g ON g.identity_id = i.id
    WHERE i.issuer = NULLIF(current_setting('wonffice.oidc_issuer', true), '')
      AND i.subject = NULLIF(current_setting('wonffice.oidc_subject', true), '')
      AND g.revoked_at IS NULL
  )
    AND (p_after IS NULL OR t.id > p_after)
  ORDER BY t.id LIMIT 51
$$;
REVOKE ALL ON FUNCTION wonffice.operator_tenant_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.operator_tenant_overview(uuid) TO wonffice_app;
`,
};
