import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationAuthorityError } from '@barocss/office-service/collaboration-store';
import { createApiServer, type ApiAuthDependencies } from '../src/server.js';
import { AuthProviderUnavailableError, InvalidAccessTokenError } from '../src/oidc.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const documentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal = { issuer: 'https://synthetic.invalid/issuer', subject: 'current-writer' };
const session = { ...principal, sessionId: 'verified-session', expiresAt: 2000000000 };
const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
function fixture(verifySession?: ApiAuthDependencies['verifier']['verifySession']) {
  const verify = vi.fn(async (_token: string) => principal);
  const requestTransition = vi.fn(async () => ({ mode: 'initializing' as const, documentId,
    documentKey: `wonffice-${tenantId}-${documentId}`, transitionStatus: 'uncertain' as const }));
  const reconcile = vi.fn(async () => ({ mode: 'collaborative' as const, documentId,
    documentKey: `wonffice-${tenantId}-${documentId}` }));
  const app = createApiServer({ verifier: { verify, verifySession },
    memberships: { getTenantAccess: vi.fn(), listTenantAccess: vi.fn() },
    documents: { create: vi.fn(), list: vi.fn(), open: vi.fn(), updateSnapshot: vi.fn(),
      updateMetadata: vi.fn(), getReceipt: vi.fn() }, collaboration: { requestTransition, reconcile } });
  apps.push(app);
  return { app, verify, requestTransition, reconcile };
}
const routes = [
  { suffix: '', payload: { expectedRevision: 1, idempotencyKey: 'seed-once' } },
  { suffix: '/reconcile', payload: {} },
];

describe('current collaboration session HTTP boundary', () => {
  it.each(routes)('fails closed without verifySession on $suffix', async ({ suffix, payload }) => {
    const { app, verify, requestTransition, reconcile } = fixture();
    expect(await verify('signature-valid-token')).toEqual(principal);
    const response = await app.inject({ method: 'POST', url:
      `/v1/tenants/${tenantId}/documents/${documentId}/collaboration${suffix}`,
    headers: { authorization: 'Bearer signature-valid-token' }, payload });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'auth_unavailable' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(requestTransition).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
  });
  it.each(routes)('rejects missing/expired claims or verifier outage before service on $suffix',
    async ({ suffix, payload }) => {
      for (const [error, statusCode] of [[new InvalidAccessTokenError(), 401],
        [new AuthProviderUnavailableError(), 503]] as const) {
        const { app, verify, requestTransition, reconcile } = fixture(async () => { throw error; });
        expect(await verify('signature-valid-token')).toEqual(principal);
        const response = await app.inject({ method: 'POST', url:
          `/v1/tenants/${tenantId}/documents/${documentId}/collaboration${suffix}`,
        headers: { authorization: 'Bearer signature-valid-token' }, payload });
        expect(response.statusCode).toBe(statusCode);
        expect(requestTransition).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
      }
    });
  it.each(routes)('passes only the verified current session on $suffix', async ({ suffix, payload }) => {
    const verifySession = vi.fn(async () => session);
    const { app, verify, requestTransition, reconcile } = fixture(verifySession);
    const response = await app.inject({ method: 'POST', url:
      `/v1/tenants/${tenantId}/documents/${documentId}/collaboration${suffix}`,
    headers: { authorization: 'Bearer session-token' }, payload });
    expect(response.statusCode).toBe(200); expect(verify).not.toHaveBeenCalled();
    expect(verifySession).toHaveBeenCalledExactlyOnceWith('session-token');
    if (suffix) expect(reconcile).toHaveBeenCalledExactlyOnceWith(session, tenantId, documentId);
    else expect(requestTransition).toHaveBeenCalledExactlyOnceWith(session, tenantId, documentId, payload);
  });
  it.each(routes)('rejects caller-supplied authority and maps gate denial on $suffix',
    async ({ suffix, payload }) => {
      const { app, requestTransition, reconcile } = fixture(async () => session);
      const url = `/v1/tenants/${tenantId}/documents/${documentId}/collaboration${suffix}`;
      for (const authority of [{ sessionId: 'forged' }, { issuer: 'forged' }, { subject: 'forged' },
        { expiresAt: 9999999999 }]) {
        expect((await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer token' },
          payload: { ...payload, ...authority } })).statusCode).toBe(400);
      }
      expect(requestTransition).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
      for (const [status, reason] of [[401, 'session_expired'], [403, 'forbidden'],
        [503, 'auth_unavailable']] as const) {
        const denial = async () => { throw new CollaborationAuthorityError(status, reason); };
        requestTransition.mockImplementation(denial); reconcile.mockImplementation(denial);
        const response = await app.inject({ method: 'POST', url,
          headers: { authorization: 'Bearer token' }, payload });
        expect(response.statusCode).toBe(status); expect(response.json()).toEqual({ status: reason });
      }
    });
});
