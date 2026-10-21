import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

export interface PlatformOperatorChange {
  action: 'grant' | 'revoke';
  issuer: string;
  subject: string;
  actorRef: string;
  approvalRef: string;
}

function validate(input: PlatformOperatorChange) {
  if (!['grant', 'revoke'].includes(input.action) ||
    !input.issuer || input.issuer.length > 2048 ||
    !input.subject || input.subject.length > 255 ||
    !/^[A-Za-z0-9._:/#-]{1,120}$/.test(input.actorRef) ||
    !/^[A-Za-z0-9._:/#-]{1,120}$/.test(input.approvalRef)) {
    throw new Error('invalid_platform_operator_change');
  }
}

/** Owner-only operation. The caller must verify human approval outside this process. */
export async function applyPlatformOperatorChange(client: Client, input: PlatformOperatorChange) {
  validate(input);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SET LOCAL search_path = pg_catalog');
    const role = await client.query(`SELECT current_user = 'wonffice_owner'
      AND NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname = current_user`);
    if (!role.rows[0]?.safe) throw new Error('invalid_platform_operator_admin_role');
    await client.query('SELECT pg_advisory_xact_lock(87142, 5)');
    const previous = await client.query<{
      action: PlatformOperatorChange['action']; actor_ref: string; issuer: string; subject: string;
    }>(`SELECT e.action, e.actor_ref, i.issuer, i.subject
      FROM wonffice.platform_operator_events e
      JOIN wonffice.identities i ON i.id = e.identity_id
      WHERE e.approval_ref = $1`, [input.approvalRef]);
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (row.action !== input.action || row.actor_ref !== input.actorRef ||
        row.issuer !== input.issuer || row.subject !== input.subject) {
        throw new Error('platform_operator_approval_conflict');
      }
      await client.query('COMMIT');
      return { applied: false };
    }
    if (input.action === 'grant') {
      await client.query(`INSERT INTO wonffice.identities (id, issuer, subject)
        VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO NOTHING`,
      [randomUUID(), input.issuer, input.subject]);
    }
    const identity = await client.query<{ id: string }>(
      'SELECT id FROM wonffice.identities WHERE issuer = $1 AND subject = $2',
      [input.issuer, input.subject]);
    const identityId = identity.rows[0]?.id;
    if (!identityId) throw new Error('unknown_platform_operator_identity');
    if (input.action === 'grant') {
      const changed = await client.query(`INSERT INTO wonffice.platform_operator_grants
        (identity_id) VALUES ($1)
        ON CONFLICT (identity_id) DO UPDATE
        SET granted_at = now(), revoked_at = NULL
        WHERE wonffice.platform_operator_grants.revoked_at IS NOT NULL`, [identityId]);
      if (changed.rowCount !== 1) throw new Error('platform_operator_grant_conflict');
    } else {
      const changed = await client.query(`UPDATE wonffice.platform_operator_grants
        SET revoked_at = now() WHERE identity_id = $1 AND revoked_at IS NULL`, [identityId]);
      if (changed.rowCount !== 1) throw new Error('platform_operator_revoke_conflict');
    }
    await client.query(`INSERT INTO wonffice.platform_operator_events
      (id, identity_id, actor_ref, approval_ref, action) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), identityId, input.actorRef, input.approvalRef, input.action]);
    await client.query('COMMIT');
    return { applied: true };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Caller discards a failed connection. */ }
    throw error;
  }
}
