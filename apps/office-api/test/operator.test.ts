import { describe, expect, it } from 'vitest';
import { PlatformOperatorAccessDeniedError } from '@barocss/office-service/platform-operator-store';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('platform operator HTTP boundary', () => {
  it('separates OIDC, current platform grant and tenant membership', async () => {
    let granted = true;
    const app = createApiServer({
      verifier: { async verify(token) { return { issuer: 'https://issuer.example', subject: token }; } },
      memberships: {
        async getTenantAccess(_principal, requested) { return { tenantId: requested, role: 'owner' as const }; },
        async listTenantAccess() { return { tenants: [], nextCursor: null }; },
      },
      operators: {
        async getAccess(principal) {
          if (principal.subject !== 'operator' || !granted) throw new PlatformOperatorAccessDeniedError();
          return { operator: true as const };
        },
        async getStatusAccess(principal) {
          if (principal.subject !== 'operator' || !granted) throw new PlatformOperatorAccessDeniedError();
          return { operator: true as const };
        },
        async listTenantProvisioning(principal, after) {
          if (principal.subject !== 'operator' || !granted) throw new PlatformOperatorAccessDeniedError();
          return { tenants: after ? [] : [{ tenantId, name: 'Alpha',
            provisioningStatus: 'owner_provisioned' as const }], nextCursor: null };
        },
      },
    });
    try {
      expect((await app.inject('/v1/operator/access')).statusCode).toBe(401);
      const companyOwner = await app.inject({ url: '/v1/operator/access',
        headers: { authorization: 'Bearer company-owner' } });
      expect(companyOwner.statusCode).toBe(403);
      expect(companyOwner.json()).toEqual({ status: 'forbidden' });
      const header = { authorization: 'Bearer operator' };
      const access = await app.inject({ url: '/v1/operator/access', headers: header });
      expect(access.statusCode).toBe(200);
      expect(access.json()).toEqual({ operator: true });
      expect(access.headers['cache-control']).toBe('no-store');
      const tenants = await app.inject({ url: '/v1/operator/tenants', headers: header });
      expect(tenants.json()).toEqual({ tenants: [{ tenantId, name: 'Alpha',
        provisioningStatus: 'owner_provisioned' }], nextCursor: null });
      expect((await app.inject({ url: '/v1/operator/tenants?after=bad', headers: header })).statusCode).toBe(400);
      const status = await app.inject({ url: '/v1/operator/status', headers: header });
      expect(status.json()).toEqual({ live: { httpStatus: 200, status: 'alive' },
        ready: { httpStatus: 503, status: 'service_not_configured' } });
      const me = await app.inject({ url: '/v1/me', headers: header });
      expect(me.json()).toEqual({ issuer: 'https://issuer.example', subject: 'operator',
        tenants: [], nextCursor: null });
      granted = false;
      const revoked = await app.inject({ url: '/v1/operator/status', headers: header });
      expect(revoked.statusCode).toBe(403);
    } finally { await app.close(); }
  });

  it('returns 503 when grant lookup fails and never returns a cached allow', async () => {
    const app = createApiServer({
      verifier: { async verify() { return { issuer: 'https://issuer.example', subject: 'operator' }; } },
      memberships: { async getTenantAccess() { throw new Error('unused'); },
        async listTenantAccess() { throw new Error('unused'); } },
      operators: { async getAccess() { throw new Error('private_database_detail'); },
        async getStatusAccess() { throw new Error('private_database_detail'); },
        async listTenantProvisioning() { throw new Error('private_database_detail'); } },
    });
    try {
      for (const path of ['/v1/operator/access', '/v1/operator/tenants', '/v1/operator/status']) {
        const response = await app.inject({ url: path, headers: { authorization: 'Bearer operator' } });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ status: 'service_unavailable' });
        expect(response.body).not.toContain('private_database_detail');
      }
    } finally { await app.close(); }
  });
});
