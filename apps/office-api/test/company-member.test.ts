import { describe, expect, it, vi } from 'vitest';
import { CompanyMemberAccessDeniedError, CompanyMemberConflictError } from
  '@barocss/office-service/company-member-store';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const memberId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const unidentified = { state: 'unidentified' as const, displayLabel: null, memberCode: null,
  sourceCategory: null, revision: null, updatedAt: null };
const principal = { issuer: 'https://idp.example.test', subject: 'synthetic-owner' };

describe('company member HTTP boundary', () => {
  it('retains identified label/code/revision but never exposes private roster provenance', async () => {
    const identification = { state: 'identified' as const, displayLabel: '<가상 동명이인>',
      memberCode: 'M-' + 'a'.repeat(32), sourceCategory: 'company_roster' as const,
      revision: 2, updatedAt: '2026-10-01T00:00:00.000Z' };
    const app = createApiServer({ verifier: { verify: async () => principal },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      companyMembers: {
        listMembers: async () => ({ members: [{ memberId, role: 'viewer' as const, active: true,
          isSelf: false, identification, issuer: 'private-issuer', subject: 'private-subject',
          approvalRef: 'private-approval', sourceRef: 'private-source', actorRef: 'private-actor' }],
          nextCursor: memberId }),
        setRole: async () => { throw new Error('unused'); }, revoke: async () => { throw new Error('unused'); },
      },
    });
    try {
      const response = await app.inject({ url: `/v1/tenants/${tenantId}/members`,
        headers: { authorization: 'Bearer valid' } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ members: [{ memberId, role: 'viewer', active: true,
        isSelf: false, identification }], nextCursor: memberId });
      expect(response.body).not.toContain('private-');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });
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
          active: true, isSelf: false, identification: unidentified }], nextCursor: null }),
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
      expect(list.json()).toEqual({ members: [{ memberId, role: 'viewer', active: true, isSelf: false, identification: unidentified }],
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
        payload: { role: 'editor', expectedDirectoryRevision: 2 } })).json()).toEqual({ memberId, role: 'editor',
        active: true, changed: true });
      expect((await app.inject({ method: 'DELETE', url: target, headers, payload: { expectedDirectoryRevision: 2 } })).json()).toEqual({
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
      expect((await app.inject({ method: 'DELETE', url: path, headers, payload: { expectedDirectoryRevision: 2 } })).statusCode).toBe(409);
      mode = 'outage';
      const outage = await app.inject({ method: 'DELETE', url: path, headers, payload: { expectedDirectoryRevision: 2 } });
      expect(outage.statusCode).toBe(503);
      expect(outage.body).not.toContain('synthetic_database_outage');
    } finally { await app.close(); }
  });
  it('passes only the exact displayed revision and refuses missing, coercible or extra input', async () => {
    const change = vi.fn(async () => ({ memberId, role: 'viewer' as const, active: true, changed: false }));
    const app = createApiServer({ verifier: { verify: async () => principal },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      companyMembers: { listMembers: async () => { throw new Error('no_latest_lookup'); },
        setRole: change, revoke: change },
    });
    try {
      const url = `/v1/tenants/${tenantId}/members/${memberId}`, headers = { authorization: 'Bearer valid' };
      for (const method of ['PATCH', 'DELETE'] as const) {
        const valid = method === 'PATCH' ? { role: 'viewer' } : {};
        for (const revision of [undefined, null, '2', 0, -1, 1.5, 2147483648]) {
          const response = await app.inject({ method, url, headers,
            payload: { ...valid, ...(revision === undefined ? {} : { expectedDirectoryRevision: revision }) } });
          expect(response.statusCode).toBe(400);
        }
        expect((await app.inject({ method, url, headers,
          payload: { ...valid, expectedDirectoryRevision: 2, displayLabel: 'forged' } })).statusCode).toBe(400);
      }
      expect((await app.inject({ method: 'DELETE', url, headers })).statusCode).toBe(400);
      expect(change).not.toHaveBeenCalled();
      expect((await app.inject({ method: 'PATCH', url, headers,
        payload: { role: 'viewer', expectedDirectoryRevision: 2147483647 } })).statusCode).toBe(200);
      expect(change).toHaveBeenLastCalledWith(principal, tenantId, memberId, 'viewer', 2147483647);
      expect((await app.inject({ method: 'DELETE', url, headers,
        payload: { expectedDirectoryRevision: 2 } })).statusCode).toBe(200);
      expect(change).toHaveBeenLastCalledWith(principal, tenantId, memberId, 2);
    } finally { await app.close(); }
  });

});
