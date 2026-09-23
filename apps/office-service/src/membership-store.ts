import type { Pool, PoolClient } from 'pg';
import { assertUuid, withTenant } from './tenant-store.js';

export interface VerifiedPrincipal { issuer: string; subject: string }
export type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';

export class TenantAccessDeniedError extends Error {
  constructor() { super('tenant_access_denied'); }
}

/** Membership is read in the same transaction as the authorized tenant operation. */
export class MembershipStore {
  constructor(private readonly pool: Pool) {}

  async listTenantAccess(principal: VerifiedPrincipal, after?: string) {
    if (after) assertUuid(after);
    this.assertPrincipal(principal);
    const client = await this.pool.connect();
    let healthy = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query('SET LOCAL search_path = pg_catalog');
      const role = await client.query(`SELECT current_user = 'wonffice_app'
        AND NOT rolsuper AND NOT rolbypassrls
        AND NOT pg_has_role(current_user, 'wonffice_owner', 'MEMBER')
        AND NOT pg_has_role(current_user, 'wonffice_backup', 'MEMBER') AS safe,
        NULLIF(current_setting('wonffice.tenant_id', true), '') IS NULL
          AND NULLIF(current_setting('wonffice.oidc_issuer', true), '') IS NULL
          AND NULLIF(current_setting('wonffice.oidc_subject', true), '') IS NULL AS context_empty
        FROM pg_roles WHERE rolname = current_user`);
      if (!role.rows[0]?.safe) throw new Error('invalid_application_role');
      if (!role.rows[0]?.context_empty) throw new Error('invalid_tenant_context');
      await client.query("SELECT set_config('wonffice.oidc_issuer', $1, true)", [principal.issuer]);
      await client.query("SELECT set_config('wonffice.oidc_subject', $1, true)", [principal.subject]);
      const result = await client.query<{ tenantId: string; name: string; role: TenantRole }>(`
        SELECT m.tenant_id AS "tenantId", t.name, m.role
        FROM wonffice.tenant_memberships m
        JOIN wonffice.tenants t ON t.id = m.tenant_id
        WHERE m.revoked_at IS NULL AND ($1::uuid IS NULL OR m.tenant_id > $1::uuid)
        ORDER BY m.tenant_id LIMIT 51`, [after ?? null]);
      await client.query('COMMIT');
      await client.query("SELECT set_config('wonffice.tenant_id', '', false)");
      await client.query("SELECT set_config('wonffice.oidc_issuer', '', false)");
      await client.query("SELECT set_config('wonffice.oidc_subject', '', false)");
      healthy = true;
      const tenants = result.rows.slice(0, 50);
      return { tenants, nextCursor: result.rows.length > 50 ? tenants[49].tenantId : null };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Discard below. */ }
      throw error;
    } finally {
      client.release(!healthy);
    }
  }

  private assertPrincipal(principal: VerifiedPrincipal) {
    if (!principal.issuer || principal.issuer.length > 2048 ||
      !principal.subject || principal.subject.length > 255) throw new Error('invalid_principal');
  }

  async withAuthorizedTenant<T>(principal: VerifiedPrincipal, tenantId: string,
    operation: (client: PoolClient, role: TenantRole) => Promise<T>): Promise<T> {
    this.assertPrincipal(principal);
    return withTenant(this.pool, tenantId, async client => {
      // These values come only from a verified access token. RLS also restricts the
      // membership row to this identity; the app role has no membership write grant.
      await client.query("SELECT set_config('wonffice.oidc_issuer', $1, true)", [principal.issuer]);
      await client.query("SELECT set_config('wonffice.oidc_subject', $1, true)", [principal.subject]);
      const result = await client.query<{ role: TenantRole }>(`
        SELECT role FROM wonffice.tenant_memberships
        WHERE tenant_id = $1 AND revoked_at IS NULL`, [tenantId]);
      const role = result.rows[0]?.role;
      if (!role) throw new TenantAccessDeniedError();
      return operation(client, role);
    });
  }

  async getTenantAccess(principal: VerifiedPrincipal, tenantId: string) {
    return this.withAuthorizedTenant(principal, tenantId,
      async (_client, role) => ({ tenantId, role }));
  }
}
