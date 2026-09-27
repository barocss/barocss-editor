import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertUuid, withTenant } from './tenant-store.js';
import type { VerifiedPrincipal } from './membership-store.js';

export class CompanyMemberAccessDeniedError extends Error {
  constructor() { super('company_member_access_denied'); }
}
export class CompanyMemberConflictError extends Error {
  constructor() { super('company_member_conflict'); }
}

type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
type EditableRole = 'editor' | 'viewer';
type MemberListRow = {
  status: 'allowed' | 'forbidden';
  member_id: string | null;
  member_role: MemberRole | null;
  active: boolean | null;
  is_self: boolean | null;
};
type MemberChangeRow = {
  status: 'applied' | 'no_change' | 'forbidden' | 'conflict';
  previous_role: MemberRole | null;
  new_role: MemberRole | null;
  active: boolean | null;
};

/** Verified identity is installed only for this transaction, then cleared by withTenant. */
export class CompanyMemberStore {
  constructor(private readonly pool: Pool) {}

  private async withPrincipal<T>(principal: VerifiedPrincipal, tenantId: string,
    work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!principal.issuer || principal.issuer.length > 2048 ||
      !principal.subject || principal.subject.length > 255) throw new Error('invalid_principal');
    return withTenant(this.pool, tenantId, async client => {
      await client.query("SELECT set_config('wonffice.oidc_issuer', $1, true)", [principal.issuer]);
      await client.query("SELECT set_config('wonffice.oidc_subject', $1, true)", [principal.subject]);
      return work(client);
    });
  }

  async listMembers(principal: VerifiedPrincipal, tenantId: string, after?: string) {
    if (after) assertUuid(after);
    const rows = await this.withPrincipal(principal, tenantId, async client => {
      const result = await client.query<MemberListRow>(
        'SELECT * FROM wonffice.company_member_list($1::uuid, $2::uuid, $3::uuid)',
        [tenantId, after ?? null, randomUUID()]);
      return result.rows;
    });
    if (!rows.length || rows[0].status === 'forbidden') throw new CompanyMemberAccessDeniedError();
    const members = rows.filter(row => row.member_id).slice(0, 50).map(row => ({
      memberId: row.member_id!, role: row.member_role!, active: row.active!, isSelf: row.is_self!,
    }));
    return { members, nextCursor: rows.filter(row => row.member_id).length > 50
      ? members[49].memberId : null };
  }

  private async change(principal: VerifiedPrincipal, tenantId: string, memberId: string,
    action: 'set_role' | 'revoke', role: EditableRole | null) {
    assertUuid(memberId);
    const row = await this.withPrincipal(principal, tenantId, async client => {
      const result = await client.query<MemberChangeRow>(
        'SELECT * FROM wonffice.company_member_change($1::uuid, $2::uuid, $3::text, $4::text, $5::uuid)',
        [tenantId, memberId, action, role, randomUUID()]);
      return result.rows[0];
    });
    if (!row || row.status === 'forbidden') throw new CompanyMemberAccessDeniedError();
    if (row.status === 'conflict') throw new CompanyMemberConflictError();
    return { memberId, role: row.new_role!, active: row.active!, changed: row.status === 'applied' };
  }

  async setRole(principal: VerifiedPrincipal, tenantId: string, memberId: string, role: EditableRole) {
    if (role !== 'editor' && role !== 'viewer') throw new Error('invalid_company_member_role');
    return this.change(principal, tenantId, memberId, 'set_role', role);
  }

  async revoke(principal: VerifiedPrincipal, tenantId: string, memberId: string) {
    return this.change(principal, tenantId, memberId, 'revoke', null);
  }
}
