import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertUuid } from './tenant-store.js';
import type { VerifiedPrincipal } from './membership-store.js';

export class PlatformOperatorAccessDeniedError extends Error {
  constructor() { super('platform_operator_access_denied'); }
}

type OperatorOperation = 'access' | 'tenants' | 'status';

/** Current platform grant is checked for every operation, without tenant context. */
export class PlatformOperatorStore {
  constructor(private readonly pool: Pool) {}

  private async withOperator<T>(principal: VerifiedPrincipal, operation: OperatorOperation,
    read: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!principal.issuer || principal.issuer.length > 2048 ||
      !principal.subject || principal.subject.length > 255) throw new Error('invalid_principal');
    const client = await this.pool.connect();
    let healthy = false;
    let denied = false;
    let value!: T;
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
      if (!role.rows[0]?.context_empty) throw new Error('invalid_operator_context');
      await client.query("SELECT set_config('wonffice.oidc_issuer', $1, true)", [principal.issuer]);
      await client.query("SELECT set_config('wonffice.oidc_subject', $1, true)", [principal.subject]);
      const identity = await client.query<{ id: string }>(
        'SELECT id FROM wonffice.identities WHERE issuer = $1 AND subject = $2',
        [principal.issuer, principal.subject]);
      const identityId = identity.rows[0]?.id;
      const grant = identityId ? await client.query(`SELECT 1
        FROM wonffice.platform_operator_grants
        WHERE identity_id = $1 AND revoked_at IS NULL`, [identityId]) : null;
      denied = !grant?.rowCount;
      if (!denied) value = await read(client);
      // The app role can append only its current verified identity's audit row.
      if (identityId) await client.query(`INSERT INTO wonffice.platform_operator_reads
        (id, identity_id, operation, outcome) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), identityId, operation, denied ? 'forbidden' : 'allowed']);
      await client.query('COMMIT');
      await client.query("SELECT set_config('wonffice.tenant_id', '', false)");
      await client.query("SELECT set_config('wonffice.oidc_issuer', '', false)");
      await client.query("SELECT set_config('wonffice.oidc_subject', '', false)");
      healthy = true;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Discard the connection. */ }
      throw error;
    } finally {
      client.release(!healthy);
    }
    if (denied) throw new PlatformOperatorAccessDeniedError();
    return value;
  }

  async getAccess(principal: VerifiedPrincipal) {
    return this.withOperator(principal, 'access', async () => ({ operator: true as const }));
  }

  async getStatusAccess(principal: VerifiedPrincipal) {
    return this.withOperator(principal, 'status', async () => ({ operator: true as const }));
  }

  async listTenantProvisioning(principal: VerifiedPrincipal, after?: string) {
    if (after) assertUuid(after);
    return this.withOperator(principal, 'tenants', async client => {
      const result = await client.query<{
        tenant_id: string; name: string; owner_provisioned: boolean;
      }>('SELECT * FROM wonffice.operator_tenant_overview($1::uuid)', [after ?? null]);
      const tenants = result.rows.slice(0, 50).map(row => ({
        tenantId: row.tenant_id, name: row.name,
        provisioningStatus: row.owner_provisioned ? 'owner_provisioned' as const : 'owner_missing' as const,
      }));
      return { tenants, nextCursor: result.rows.length > 50 ? tenants[49].tenantId : null };
    });
  }
}
