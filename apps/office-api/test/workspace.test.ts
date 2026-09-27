import { describe, expect, it } from 'vitest';
import { TenantAccessDeniedError, InvalidWorkspaceCursorError } from
  '@barocss/office-service/membership-store';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal = { issuer: 'https://idp.example.test', subject: 'synthetic-user' };

describe('authorized workspace discovery', () => {
  it('requires authentication and returns only the current tenant workspace page', async () => {
    const calls: Array<{ tenantId: string; after?: string }> = [];
    const app = createApiServer({
      verifier: { verify: async token => {
        if (token !== 'valid') throw new Error('invalid_token');
        return principal;
      } },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      workspaces: { listWorkspaces: async (_principal, id, after) => {
        calls.push({ tenantId: id, after });
        return { workspaces: [{ id: workspaceId, name: 'Notes' }], nextCursor: null };
      } },
    });
    try {
      const path = `/v1/tenants/${tenantId}/workspaces`;
      expect((await app.inject(path)).statusCode).toBe(401);
      expect((await app.inject({ url: path, headers: { authorization: 'Bearer bad' } })).statusCode).toBe(401);
      const headers = { authorization: 'Bearer valid' };
      const page = await app.inject({ url: path, headers });
      expect(page.statusCode).toBe(200);
      expect(page.json()).toEqual({ workspaces: [{ id: workspaceId, name: 'Notes' }], nextCursor: null });
      expect(page.headers['cache-control']).toBe('no-store');
      expect((await app.inject({ url: `${path}?after=${workspaceId}`, headers })).statusCode).toBe(200);
      expect(calls).toEqual([{ tenantId, after: undefined }, { tenantId, after: workspaceId }]);
      for (const url of [`${path}?after=bad`, `${path}?other=1`, `${path}?after=${workspaceId}&after=${workspaceId}`,
        '/v1/tenants/not-a-uuid/workspaces']) {
        expect((await app.inject({ url, headers })).statusCode).toBe(400);
      }
    } finally { await app.close(); }
  });

  it('keeps membership denial, foreign cursor and database outage distinct', async () => {
    let mode: 'denied' | 'cursor' | 'outage' = 'denied';
    const app = createApiServer({
      verifier: { verify: async () => principal },
      memberships: { getTenantAccess: async () => { throw new Error('unused'); },
        listTenantAccess: async () => { throw new Error('unused'); } },
      workspaces: { listWorkspaces: async () => {
        if (mode === 'denied') throw new TenantAccessDeniedError();
        if (mode === 'cursor') throw new InvalidWorkspaceCursorError();
        throw new Error('synthetic_database_outage');
      } },
    });
    try {
      const url = `/v1/tenants/${tenantId}/workspaces`;
      const headers = { authorization: 'Bearer valid' };
      const denied = await app.inject({ url, headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ status: 'forbidden' });
      mode = 'cursor';
      const cursor = await app.inject({ url: `${url}?after=${workspaceId}`, headers });
      expect(cursor.statusCode).toBe(400);
      expect(cursor.json()).toEqual({ status: 'invalid_cursor' });
      mode = 'outage';
      const outage = await app.inject({ url, headers });
      expect(outage.statusCode).toBe(503);
      expect(outage.json()).toEqual({ status: 'service_unavailable' });
      expect(outage.body).not.toContain('synthetic_database_outage');
    } finally { await app.close(); }
  });
});
