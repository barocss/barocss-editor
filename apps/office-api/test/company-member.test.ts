import { describe, expect, it } from 'vitest';
import { CompanyMemberAccessDeniedError, CompanyMemberConflictError } from
  '@barocss/office-service/company-member-store';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const memberId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal = { issuer: 'https://idp.example.test', subject: 'synthetic-owner' };

describe('company member HTTP boundary', () => {
  it('requires OIDC, validates input and returns minimal member DTO', async () => {
    const app = createApiServer({
      verifier: { verify: async token => {
        if (token !== 'valid') throw new Error('invalid_token');
        return principal;
      } },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      companyMembers: {
        listMembers: async () => ({ members: [{ memberId, role: 'viewer' as const,
          active: true, isSelf: false }], nextCursor: null }),
        setRole: async () => ({ memberId, role: 'editor' as const, active: true, changed: true }),
        revoke: async () => ({ memberId, role: 'editor' as const, active: false, changed: true }),
      },
    });
    try {
      const path = `/v1/tenants/${tenantId}/members`;
      expect((await app.inject({ url: path })).statusCode).toBe(401);
      expect((await app.inject({ url: path, headers: { authorization: 'Bearer bad' } })).statusCode).toBe(401);
      const headers = { authorization: 'Bearer valid' };
      const list = await app.inject({ url: path, headers });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({ members: [{ memberId, role: 'viewer', active: true, isSelf: false }],
        nextCursor: null });
      expect(list.headers['cache-control']).toBe('no-store');
      expect((await app.inject({ url: `${path}?other=1`, headers })).statusCode).toBe(400);
      expect((await app.inject({ url: '/v1/tenants/not-uuid/members', headers })).statusCode).toBe(400);
      const target = `${path}/${memberId}`;
      expect((await app.inject({ method: 'PATCH', url: target, headers,
        payload: { role: 'admin' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: target, headers,
        payload: { role: 'editor', issuer: principal.issuer } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: target, headers,
        payload: { role: 'editor' } })).json()).toEqual({ memberId, role: 'editor',
        active: true, changed: true });
      expect((await app.inject({ method: 'DELETE', url: target, headers })).json()).toEqual({
        memberId, role: 'editor', active: false, changed: true });
    } finally { await app.close(); }
  });

  it('keeps 403, conflict and database failure distinct', async () => {
    let mode: 'denied' | 'conflict' | 'outage' = 'denied';
    const fail = async (): Promise<never> => {
      if (mode === 'denied') throw new CompanyMemberAccessDeniedError();
      if (mode === 'conflict') throw new CompanyMemberConflictError();
      throw new Error('synthetic_database_outage');
    };
    const app = createApiServer({ verifier: { verify: async () => principal },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      companyMembers: { listMembers: fail, setRole: fail, revoke: fail },
    });
    try {
      const headers = { authorization: 'Bearer valid' };
      const path = `/v1/tenants/${tenantId}/members/${memberId}`;
      expect((await app.inject({ url: `/v1/tenants/${tenantId}/members`, headers })).statusCode).toBe(403);
      mode = 'conflict';
      expect((await app.inject({ method: 'DELETE', url: path, headers })).statusCode).toBe(409);
      mode = 'outage';
      const outage = await app.inject({ method: 'DELETE', url: path, headers });
      expect(outage.statusCode).toBe(503);
      expect(outage.body).not.toContain('synthetic_database_outage');
    } finally { await app.close(); }
  });
});
