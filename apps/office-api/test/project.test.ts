import { describe, expect, it } from 'vitest';
import { ProjectError, type ProjectStore } from '@barocss/office-service/project-store';
import { TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal = { issuer: 'https://synthetic.example.test', subject: 'editor' };
const headers = { authorization: 'Bearer valid' };
const prefix = `/v1/tenants/${tenantId}/projects`;
const unavailable = async () => { throw new Error('unused'); };
const setup = (projects: Pick<ProjectStore, 'list' | 'get' | 'create' | 'update' | 'getPin'>) => createApiServer({
  verifier: { verify: async token => { if (token !== 'valid') throw new Error('invalid'); return principal; } },
  memberships: { getTenantAccess: unavailable, listTenantAccess: unavailable }, projects,
});
const deps = { list: unavailable, get: unavailable, create: unavailable, update: unavailable, getPin: unavailable };

describe('project API boundary', () => {
  it('requires token authentication, passes only verified principal, and returns no-store', async () => {
    const calls: unknown[] = [];
    const app = setup({ ...deps, list: async (p, id, query) => {
      calls.push([p, id, query]); return { projects: [], nextCursor: null };
    } });
    try {
      expect((await app.inject(prefix)).statusCode).toBe(401);
      expect((await app.inject({ url: prefix, headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
      const response = await app.inject({ url: prefix, headers });
      expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ projects: [], nextCursor: null });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(calls).toEqual([[principal, tenantId, {}]]);
      expect((await app.inject({ url: '/v1/tenants/invalid/projects', headers })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it('keeps denied, stale source/CAS and database failure distinct without leaking details', async () => {
    let error: Error = new TenantAccessDeniedError();
    const app = setup({ ...deps, get: async () => { throw error; } });
    try {
      for (const [failure, code, status] of [[error, 403, 'forbidden'], [new ProjectError(409, 'source_conflict'), 409, 'source_conflict'],
        [new ProjectError(409, 'revision_conflict'), 409, 'revision_conflict'], [new Error('private_database_detail'), 503, 'service_unavailable']] as const) {
        error = failure; const response = await app.inject({ url: `${prefix}/${projectId}`, headers });
        expect(response.statusCode).toBe(code); expect(response.json()).toEqual({ status });
      }
      expect((await app.inject({ url: `${prefix}/${projectId}?token=forged`, headers })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
