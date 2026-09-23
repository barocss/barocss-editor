import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { assertUuid } from './tenant-store.js';
import type { TenantRole } from './membership-store.js';

type PrincipalInput = { tenantId: string; issuer: string; subject: string; approvalRef: string };
export type MembershipChange =
  | (PrincipalInput & { action: 'bootstrap_owner'; tenantName: string })
  | (PrincipalInput & { action: 'grant'; role: Exclude<TenantRole, 'owner'> })
  | (PrincipalInput & { action: 'revoke'; role: Exclude<TenantRole, 'owner'> });

function validate(input: MembershipChange) {
  assertUuid(input.tenantId);
  if (!input.issuer || input.issuer.length > 2048 || !input.subject || input.subject.length > 255 ||
    !/^[A-Za-z0-9._:/#-]{1,120}$/.test(input.approvalRef)) throw new Error('invalid_membership_change');
  if (input.action === 'bootstrap_owner') {
    if (!input.tenantName.trim() || [...input.tenantName.trim()].length > 200) {
      throw new Error('invalid_membership_change');
    }
  } else if (!['admin', 'editor', 'viewer'].includes(input.role)) {
    throw new Error('invalid_membership_change');
  }
}

/** Owner-only, approval-referenced membership changes. Never call from an HTTP request. */
export async function applyMembershipChange(client: Client, input: MembershipChange) {
  validate(input);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SET LOCAL search_path = pg_catalog');
    const safe = await client.query(`SELECT current_user = 'wonffice_owner'
      AND NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname = current_user`);
    if (!safe.rows[0]?.safe) throw new Error('invalid_membership_admin_role');
    await client.query('SELECT pg_advisory_xact_lock(87142, 2)');
    const role = input.action === 'bootstrap_owner' ? 'owner' : input.role;
    const previous = await client.query<{ action: string; role: string; issuer: string; subject: string }>(`
      SELECT e.action, e.role, i.issuer, i.subject
      FROM wonffice.membership_events e JOIN wonffice.identities i ON i.id = e.identity_id
      WHERE e.tenant_id = $1 AND e.approval_ref = $2`, [input.tenantId, input.approvalRef]);
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (row.action !== input.action || row.role !== role ||
        row.issuer !== input.issuer || row.subject !== input.subject) {
        throw new Error('membership_approval_conflict');
      }
      if (input.action === 'bootstrap_owner') {
        const existing = await client.query<{ name: string }>(
          'SELECT name FROM wonffice.tenants WHERE id = $1', [input.tenantId]);
        if (existing.rows[0]?.name !== input.tenantName) {
          throw new Error('membership_approval_conflict');
        }
      }
      await client.query('COMMIT');
      return { applied: false };
    }
    const tenant = await client.query<{ name: string }>(
      'SELECT name FROM wonffice.tenants WHERE id = $1', [input.tenantId]);
    if (input.action === 'bootstrap_owner') {
      if (tenant.rows[0] && tenant.rows[0].name !== input.tenantName) {
        throw new Error('membership_bootstrap_conflict');
      }
      const count = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM wonffice.tenant_memberships WHERE tenant_id = $1',
        [input.tenantId]);
      if (count.rows[0]?.count !== '0') throw new Error('membership_bootstrap_conflict');
      if (!tenant.rows[0]) await client.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2)',
        [input.tenantId, input.tenantName]);
    } else if (!tenant.rows[0]) {
      throw new Error('unknown_tenant');
    }
    const identity = await client.query<{ id: string }>(
      'SELECT id FROM wonffice.identities WHERE issuer = $1 AND subject = $2',
      [input.issuer, input.subject]);
    let identityId = identity.rows[0]?.id;
    if (!identity.rows[0] && input.action !== 'revoke') {
      identityId = randomUUID();
      await client.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3)',
        [identityId, input.issuer, input.subject]);
    }
    if (!identityId) throw new Error('unknown_identity');
    if (input.action === 'bootstrap_owner') {
      await client.query(`INSERT INTO wonffice.tenant_memberships
        (tenant_id, identity_id, role) VALUES ($1, $2, 'owner')`, [input.tenantId, identityId]);
    } else if (input.action === 'grant') {
      const owner = await client.query(`SELECT 1 FROM wonffice.tenant_memberships
        WHERE tenant_id = $1 AND role = 'owner' AND revoked_at IS NULL LIMIT 1`, [input.tenantId]);
      if (!owner.rowCount) throw new Error('tenant_owner_missing');
      const changed = await client.query(`INSERT INTO wonffice.tenant_memberships
        (tenant_id, identity_id, role) VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, identity_id) DO UPDATE
        SET role = EXCLUDED.role, revoked_at = NULL
        WHERE wonffice.tenant_memberships.role <> 'owner'`, [input.tenantId, identityId, input.role]);
      if (changed.rowCount !== 1) throw new Error('owner_role_immutable');
    } else {
      const changed = await client.query(`UPDATE wonffice.tenant_memberships
        SET revoked_at = now() WHERE tenant_id = $1 AND identity_id = $2
        AND role = $3 AND revoked_at IS NULL AND role <> 'owner'`,
      [input.tenantId, identityId, input.role]);
      if (changed.rowCount !== 1) throw new Error('membership_revoke_conflict');
    }
    await client.query(`INSERT INTO wonffice.membership_events
      (id, tenant_id, identity_id, approval_ref, action, role) VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), input.tenantId, identityId, input.approvalRef, input.action, role]);
    await client.query('COMMIT');
    return { applied: true };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Caller discards a failed connection. */ }
    throw error;
  }
}
