import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { CompanyMemberStore, CompanyMemberConflictError, CompanyMemberAccessDeniedError } from '../src/company-member-store.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const memberId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal = { issuer: 'https://verified.example', subject: 'current-owner' };
function fixture(status = 'applied') {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true, context_empty: true }] };
    if (sql.includes('company_member_change')) return { rows: [{ status,
      previous_role: 'viewer', new_role: 'editor', active: true }] };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { store: new CompanyMemberStore({ connect } as unknown as Pool), query, release, connect };
}
describe('displayed directory revision mutation boundary', () => {
  it('rejects missing or invalid revisions before obtaining a connection', async () => {
    const f = fixture();
    for (const revision of [undefined, null, '2', 0, -1, 1.5, 2147483648, NaN, Infinity]) {
      await expect(f.store.setRole(principal, tenantId, memberId, 'editor', revision as never)).rejects.toThrow('invalid_directory_revision');
      await expect(f.store.revoke(principal, tenantId, memberId, revision as never)).rejects.toThrow('invalid_directory_revision');
    }
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('binds the original revision to guarded SQL without looking up the latest label', async () => {
    const f = fixture();
    await f.store.setRole(principal, tenantId, memberId, 'editor', 2147483647);
    const call = f.query.mock.calls.find(([sql]) => sql.includes('company_member_change'))!;
    expect(call[0]).toContain('company_member_change_confirmed');
    expect(call[0]).toContain('$5::integer, $6::uuid');
    expect((call as unknown as [string, unknown[]])[1]).toEqual([tenantId, memberId, 'set_role', 'editor', 2147483647, expect.any(String)]);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('company_member_directory_list'))).toBe(false);
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it('commits one SQL refusal audit before returning a conflict or access denial', async () => {
    for (const [status, error] of [['conflict', CompanyMemberConflictError], ['forbidden', CompanyMemberAccessDeniedError]] as const) {
      const f = fixture(status);
      await expect(f.store.revoke(principal, tenantId, memberId, 7)).rejects.toBeInstanceOf(error);
      expect(f.query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
      expect(f.release).toHaveBeenCalledWith(false);
    }
  });
});
