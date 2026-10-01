import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import { assertUuid } from './tenant-store.js';

export type DirectoryProvision = {
  tenantId: string; memberId: string; displayLabel: string;
  sourceCategory: 'company_roster'; sourceRef: string; approvalRef: string; actorRef: string;
  expectedRevision: number | null;
};
export type DirectoryEntry = {
  tenantId: string; memberId: string; memberCode: string; displayLabel: string;
  sourceCategory: 'company_roster'; sourceRef: string; approvalRef: string; actorRef: string;
  revision: number; updatedAt: string;
};
const reference = /^[A-Za-z0-9._:/#-]{1,120}$/;

export function validateDirectoryProvision(input: DirectoryProvision): DirectoryProvision {
  if (!input || typeof input !== 'object' || Object.keys(input).sort().join(',') !==
    'actorRef,approvalRef,displayLabel,expectedRevision,memberId,sourceCategory,sourceRef,tenantId') {
    throw new Error('invalid_directory_provision');
  }
  assertUuid(input.tenantId); assertUuid(input.memberId);
  if (typeof input.displayLabel !== 'string' || input.displayLabel !== input.displayLabel.trim() ||
    [...input.displayLabel].length < 1 || [...input.displayLabel].length > 120 ||
    [...input.displayLabel].some(char => {
      const code = char.codePointAt(0)!;
      return code < 32 || (code >= 127 && code <= 159);
    }) || input.sourceCategory !== 'company_roster' ||
    [input.sourceRef, input.approvalRef, input.actorRef].some(value =>
      typeof value !== 'string' || !reference.test(value)) ||
    (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 || input.expectedRevision >= 2147483647))) {
    throw new Error('invalid_directory_provision');
  }
  // Canonical Unicode avoids an accidental rename/replay conflict for equivalent labels.
  return { tenantId: input.tenantId.toLowerCase(), memberId: input.memberId.toLowerCase(),
    displayLabel: input.displayLabel.normalize('NFC'), sourceCategory: input.sourceCategory,
    sourceRef: input.sourceRef, approvalRef: input.approvalRef, actorRef: input.actorRef,
    expectedRevision: input.expectedRevision };
}

async function ownerTransaction<T>(client: Client, work: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SET LOCAL search_path = pg_catalog');
    const safe = await client.query(`SELECT current_user = 'wonffice_owner'
      AND session_user = 'wonffice_owner' AND NOT rolsuper AND NOT rolbypassrls AS safe
      FROM pg_roles WHERE rolname = current_user`);
    if (!safe.rows[0]?.safe) throw new Error('invalid_directory_admin_role');
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Discard failed connections. */ }
    throw error;
  }
}
const entrySql = `SELECT tenant_id AS "tenantId", member_id AS "memberId",
  member_code AS "memberCode", display_label AS "displayLabel", source_category AS "sourceCategory",
  source_ref AS "sourceRef", approval_ref AS "approvalRef", actor_ref AS "actorRef",
  revision, updated_at AS "updatedAt" FROM wonffice.member_directory
  WHERE tenant_id = $1 AND member_id = $2`;
function entry(row: DirectoryEntry & { updatedAt: string | Date }): DirectoryEntry {
  return { ...row, updatedAt: new Date(row.updatedAt).toISOString() };
}

/** Private owner-role operation for an existing exact tenant membership. No HTTP caller. */
export async function provisionMemberDirectory(client: Client, value: DirectoryProvision) {
  const input = validateDirectoryProvision(value);
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return ownerTransaction(client, async () => {
    // Same owner-admin serialization boundary; target membership precedes directory locks.
    await client.query('SELECT pg_advisory_xact_lock(87142, 2)');
    const target = await client.query(`SELECT 1 FROM wonffice.tenant_memberships
      WHERE tenant_id = $1 AND identity_id = $2 FOR UPDATE`, [input.tenantId, input.memberId]);
    if (target.rowCount !== 1) throw new Error('unknown_directory_member');
    const previous = await client.query<{ request_hash: string; result_entry: DirectoryEntry }>(
      `SELECT request_hash, result_entry FROM wonffice.member_directory_events
       WHERE tenant_id = $1 AND approval_ref = $2`, [input.tenantId, input.approvalRef]);
    if (previous.rows[0]) {
      if (previous.rows[0].request_hash !== hash) throw new Error('directory_approval_conflict');
      return { applied: false, entry: previous.rows[0].result_entry };
    }
    const existing = await client.query<DirectoryEntry & { updatedAt: Date }>(`${entrySql} FOR UPDATE`,
      [input.tenantId, input.memberId]);
    const revision = existing.rows[0]?.revision ?? null;
    if (revision !== input.expectedRevision) throw new Error('directory_revision_conflict');
    await client.query(`INSERT INTO wonffice.member_directory
      (tenant_id, member_id, display_label, source_category, source_ref, approval_ref, actor_ref, revision)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
      ON CONFLICT (tenant_id, member_id) DO UPDATE SET display_label = EXCLUDED.display_label,
        source_category = EXCLUDED.source_category, source_ref = EXCLUDED.source_ref,
        approval_ref = EXCLUDED.approval_ref, actor_ref = EXCLUDED.actor_ref,
        revision = wonffice.member_directory.revision + 1, updated_at = clock_timestamp()`,
    [input.tenantId, input.memberId, input.displayLabel, input.sourceCategory,
      input.sourceRef, input.approvalRef, input.actorRef]);
    const result = await client.query<DirectoryEntry & { updatedAt: Date }>(entrySql,
      [input.tenantId, input.memberId]);
    const stored = entry(result.rows[0]);
    await client.query(`INSERT INTO wonffice.member_directory_events
      (tenant_id, approval_ref, member_id, request_hash, previous_revision, result_entry)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.tenantId, input.approvalRef, input.memberId, hash, revision, JSON.stringify(stored)]);
    return { applied: true, entry: stored };
  });
}

/** Contains private provenance. Write only to a protected operator output file. */
export async function readMemberDirectory(client: Client, input: {
  tenantId: string; memberId: string; approvalRef: string;
}) {
  assertUuid(input.tenantId); assertUuid(input.memberId);
  if (typeof input.approvalRef !== 'string' || !reference.test(input.approvalRef)) throw new Error('invalid_directory_read');
  return ownerTransaction(client, async () => {
    const target = await client.query(`SELECT 1 FROM wonffice.tenant_memberships
      WHERE tenant_id = $1 AND identity_id = $2 FOR SHARE`, [input.tenantId, input.memberId]);
    if (target.rowCount !== 1) throw new Error('unknown_directory_member');
    const result = await client.query<DirectoryEntry & { updatedAt: Date }>(entrySql,
      [input.tenantId, input.memberId]);
    return result.rows[0] ? entry(result.rows[0]) : null;
  });
}
