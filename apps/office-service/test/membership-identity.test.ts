import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { MembershipStore } from '../src/membership-store.js';

const principal = { issuer: 'https://verified.example', subject: 'current-person' };
const currentUserId = '33333333-3333-4333-8333-333333333333';
function fixture(provisioned: boolean) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true, context_empty: true }] };
    if (sql.includes('FROM wonffice.identities')) {
      expect(values).toEqual([principal.issuer, principal.subject]);
      return { rows: provisioned ? [{ id: currentUserId }] : [] };
    }
    if (sql.includes('FROM wonffice.tenant_memberships')) return { rows: [] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { store: new MembershipStore(pool), query, release };
}
describe('verified current person discovery', () => {
  it('returns the actual internal UUID even without tenant/project discovery rows', async () => {
    const f = fixture(true);
    expect(await f.store.listTenantAccess(principal)).toEqual({ currentUserId, tenants: [], nextCursor: null });
    const calls = f.query.mock.calls.map(([sql]) => sql);
    const identity = calls.findIndex(sql => sql.includes('FROM wonffice.identities'));
    expect(identity).toBeGreaterThan(calls.findIndex(sql => sql.includes("set_config('wonffice.oidc_subject'")));
    expect(identity).toBeLessThan(calls.indexOf('COMMIT'));
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it('keeps an unprovisioned verified person Unknown without provisioning or backfill', async () => {
    const f = fixture(false);
    expect(await f.store.listTenantAccess(principal)).toEqual({ currentUserId: null, tenants: [], nextCursor: null });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false);
  });
});
