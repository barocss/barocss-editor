import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(value: string) {
  if (!uuid.test(value)) throw new Error('invalid_id');
}

/** Caller must authenticate and authorize tenant membership before entering this boundary. */
export async function withTenant<T>(pool: Pool, tenantId: string,
  operation: (client: PoolClient) => Promise<T>): Promise<T> {
  assertUuid(tenantId);
  const client = await pool.connect();
  // Discard connections after failed operations, including a failed COMMIT/ROLLBACK.
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
      NULLIF(current_setting('wonffice.tenant_id', true), '') IS NULL AS context_empty
      FROM pg_roles WHERE rolname = current_user`);
    if (!role.rows[0]?.safe) throw new Error('invalid_application_role');
    // Reject role/database/connection defaults and stale context from other pool users.
    if (!role.rows[0]?.context_empty) throw new Error('invalid_tenant_context');
    await client.query("SELECT set_config('wonffice.tenant_id', $1, true)", [tenantId]);
    const result = await operation(client);
    await client.query('COMMIT');
    // RESET can reactivate a configured default. Always leave an explicit empty context.
    await client.query("SELECT set_config('wonffice.tenant_id', '', false)");
    healthy = true;
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Destroy the failed connection below. */ }
    throw error;
  } finally {
    client.release(!healthy);
  }
}

export interface Workspace { id: string; tenant_id: string; name: string }

export class TenantStore {
  constructor(private readonly pool: Pool) {}

  async createWorkspace(tenantId: string, name: string) {
    if (!name.trim() || [...name.trim()].length > 200) throw new Error('invalid_workspace_name');
    return withTenant(this.pool, tenantId, async client => {
      const result = await client.query<Workspace>(`INSERT INTO wonffice.workspaces
        (tenant_id, id, name) VALUES ($1, $2, $3)
        RETURNING id, tenant_id, name`, [tenantId, randomUUID(), name]);
      return result.rows[0];
    });
  }

  async listWorkspaces(tenantId: string) {
    return withTenant(this.pool, tenantId, async client => {
      const result = await client.query<Workspace>(`SELECT id, tenant_id, name
        FROM wonffice.workspaces WHERE tenant_id = $1 ORDER BY id LIMIT 100`, [tenantId]);
      return result.rows;
    });
  }
}
