import type { Migration } from './migrations.js';

/** Additive directory storage; labels never participate in authorization. */
export const memberDirectoryMigration: Migration = {
  id: '0010_member_directory',
  sql: `
CREATE TABLE wonffice.member_directory (
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  member_code text NOT NULL DEFAULT ('M-' || replace(gen_random_uuid()::text, '-', ''))
    CHECK (member_code ~ '^M-[0-9a-f]{32}$'),
  display_label text NOT NULL CHECK (char_length(display_label) BETWEEN 1 AND 120
    AND display_label = btrim(display_label) AND display_label !~ '[[:cntrl:]]'),
  source_category text NOT NULL CHECK (source_category = 'company_roster'),
  source_ref text NOT NULL CHECK (source_ref ~ '^[A-Za-z0-9._:/#-]{1,120}$'),
  approval_ref text NOT NULL CHECK (approval_ref ~ '^[A-Za-z0-9._:/#-]{1,120}$'),
  actor_ref text NOT NULL CHECK (actor_ref ~ '^[A-Za-z0-9._:/#-]{1,120}$'),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, member_id),
  UNIQUE (tenant_id, member_code),
  FOREIGN KEY (tenant_id, member_id) REFERENCES wonffice.tenant_memberships(tenant_id, identity_id)
    ON DELETE RESTRICT
);
CREATE TABLE wonffice.member_directory_events (
  tenant_id uuid NOT NULL,
  approval_ref text NOT NULL,
  member_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  previous_revision integer,
  result_entry jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, approval_ref),
  FOREIGN KEY (tenant_id, member_id) REFERENCES wonffice.member_directory(tenant_id, member_id)
    ON DELETE RESTRICT
);
ALTER TABLE wonffice.member_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.member_directory FORCE ROW LEVEL SECURITY;
ALTER TABLE wonffice.member_directory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wonffice.member_directory_events FORCE ROW LEVEL SECURITY;
CREATE POLICY member_directory_owner ON wonffice.member_directory TO wonffice_owner
  USING (true) WITH CHECK (true);
CREATE POLICY member_directory_event_owner ON wonffice.member_directory_events TO wonffice_owner
  USING (true) WITH CHECK (true);
REVOKE ALL ON wonffice.member_directory, wonffice.member_directory_events FROM PUBLIC, wonffice_app;
GRANT SELECT ON wonffice.member_directory, wonffice.member_directory_events TO wonffice_backup;

-- Reuse the existing bounded current-membership check and its audit. Raw
-- principal, approval/actor/source references and audit rows stay private.
CREATE FUNCTION wonffice.company_member_directory_list(p_tenant uuid, p_after uuid, p_request uuid)
RETURNS TABLE(status text, member_id uuid, member_role text, active boolean, is_self boolean,
  display_label text, member_code text, source_category text, directory_revision integer,
  directory_updated_at timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.status, m.member_id, m.member_role, m.active, m.is_self,
    d.display_label, d.member_code, d.source_category, d.revision, d.updated_at
  FROM wonffice.company_member_list(p_tenant, p_after, p_request) m
  LEFT JOIN wonffice.member_directory d ON m.status = 'allowed'
    AND d.tenant_id = p_tenant AND d.member_id = m.member_id
  ORDER BY m.member_id
$$;
REVOKE ALL ON FUNCTION wonffice.company_member_directory_list(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wonffice.company_member_directory_list(uuid, uuid, uuid) TO wonffice_app;
`,
};
