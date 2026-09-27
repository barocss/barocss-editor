import { describe, expect, it } from 'vitest';
import { createApiServer } from '../src/server.js';
import { AuthProviderUnavailableError } from '../src/oidc.js';
import { CapabilityError } from '@barocss/office-service/capability-store';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const documentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentKey = `wonffice-${tenantId}-${documentId}`;
const path = `/v1/tenants/${tenantId}/documents/${documentId}/capabilities`;
const principal = { issuer: 'https://idp.example', subject: 'alice',
  sessionId: 'synthetic-login-session', expiresAt: 1_800_000_000 };

function server() {
  const issued: unknown[] = [];
  const checked: unknown[] = [];
  let callerActive = true;
  let sessionActive = true;
  let databaseAvailable = true;
  let exposePrivateFields = false;
  let issueError: CapabilityError | null = null;
  const app = createApiServer({
    verifier: {
      verify: async () => principal,
      verifySession: async token => {
        if (token !== 'signed-oidc-token') throw new Error('invalid');
        if (!sessionActive) throw new AuthProviderUnavailableError();
        return principal;
      },
    },
    memberships: { getTenantAccess: async () => { throw new Error('unused'); },
      listTenantAccess: async () => { throw new Error('unused'); } },
    documents: { create: async () => { throw new Error('unused'); },
      list: async () => { throw new Error('unused'); },
      open: async () => { throw new Error('unused'); },
      updateSnapshot: async () => { throw new Error('unused'); },
      updateMetadata: async () => { throw new Error('unused'); },
      getReceipt: async () => { throw new Error('unused'); } },
    capabilities: {
      issue: async input => {
        issued.push(input);
        if (issueError) throw issueError;
        if (!databaseAvailable) throw new Error('private-database-credential');
        return { token: 'opaque-yorkie-token', expiresAt: 1_800_000_000,
          documentKey, access: input.access,
          ...(exposePrivateFields ? { sessionId: 'private-session-id' } : {}) };
      },
      authorize: async request => {
        checked.push(request);
        if (!databaseAvailable) throw new Error('private-database-credential');
        if (request.token !== 'opaque-yorkie-token') {
          return { allowed: false, status: 401 as const, reason: 'invalid_capability' };
        }
        return { allowed: true, status: 200 as const,
          reason: exposePrivateFields ? 'private-policy-detail' : 'allowed',
          ...(exposePrivateFields ? { tokenHash: 'private-token-hash' } : {}) };
      },
    },
    verifyYorkieCaller: async request => callerActive && request.headers['x-synthetic-caller'] === 'local-test',
  });
  return { app, issued, checked,
    setCallerActive: (value: boolean) => { callerActive = value; },
    setSessionActive: (value: boolean) => { sessionActive = value; },
    setDatabaseAvailable: (value: boolean) => { databaseAvailable = value; },
    setExposePrivateFields: (value: boolean) => { exposePrivateFields = value; },
    setIssueError: (value: CapabilityError | null) => { issueError = value; } };
}

describe('bounded Yorkie capability HTTP contract', () => {
  it('does not expose a webhook without explicit capability and caller verification', async () => {
    const app = createApiServer();
    try {
      const response = await app.inject({ method: 'POST', url: '/internal/yorkie/auth',
        payload: { token: 'forged', method: 'Watch', attributes: [] } });
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('issues only after a verified login session and validates the requested access', async () => {
    const { app, issued } = server();
    try {
      const post = (headers: Record<string, string>, body: unknown) => app.inject({
        method: 'POST', url: path, headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });
      expect((await post({}, { access: 'rw' })).statusCode).toBe(401);
      expect((await post({ authorization: 'Bearer forged' }, { access: 'rw' })).statusCode).toBe(401);
      expect((await post({ authorization: 'Bearer signed-oidc-token' }, { access: 'owner' })).statusCode).toBe(400);
      expect((await post({ authorization: 'Bearer signed-oidc-token' },
        { access: 'r', tenantId })).statusCode).toBe(400);
      const granted = await post({ authorization: 'Bearer signed-oidc-token' }, { access: 'rw' });
      expect(granted.statusCode).toBe(201);
      expect(granted.json()).toEqual({ token: 'opaque-yorkie-token', expiresAt: 1_800_000_000,
        documentKey, access: 'rw' });
      expect(granted.headers['cache-control']).toBe('no-store');
      expect(issued).toEqual([{ principal, sessionId: principal.sessionId,
        oidcExpiresAt: principal.expiresAt, tenantId, documentId, access: 'rw' }]);
    } finally { await app.close(); }
  });

  it('fails closed on session or database failure without exposing their details', async () => {
    const state = server();
    try {
      const request = () => state.app.inject({ method: 'POST', url: path,
        headers: { authorization: 'Bearer signed-oidc-token' }, payload: { access: 'r' } });
      state.setSessionActive(false);
      expect((await request()).json()).toEqual({ status: 'auth_unavailable' });
      state.setSessionActive(true);
      state.setDatabaseAvailable(false);
      const unavailable = await request();
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.body).not.toContain('private-database-credential');
    } finally { await state.app.close(); }
  });

  it('allowlists HTTP fields and expected capability denial statuses', async () => {
    const state = server();
    const post = () => state.app.inject({ method: 'POST', url: path,
      headers: { authorization: 'Bearer signed-oidc-token' }, payload: { access: 'r' } });
    try {
      state.setExposePrivateFields(true);
      const issued = await post();
      expect(issued.statusCode).toBe(201);
      expect(issued.json()).toEqual({ token: 'opaque-yorkie-token', expiresAt: 1_800_000_000,
        documentKey, access: 'r' });
      expect(issued.body).not.toContain('private-session-id');
      const callback = await state.app.inject({ method: 'POST', url: '/internal/yorkie/auth',
        headers: { 'x-synthetic-caller': 'local-test' },
        payload: { token: 'opaque-yorkie-token', method: 'Watch',
          attributes: [{ key: documentKey, verb: 'r' }] } });
      expect(callback.json()).toEqual({ allowed: true, reason: 'allowed' });
      expect(callback.body).not.toContain('private-policy-detail');
      expect(callback.body).not.toContain('private-token-hash');
      for (const [code, status] of [[401, 'unauthorized'], [403, 'forbidden'],
        [400, 'invalid_request'], [503, 'service_unavailable']] as const) {
        state.setIssueError(new CapabilityError(code, 'private-session-detail'));
        const denied = await post();
        expect(denied.statusCode).toBe(code);
        expect(denied.json()).toEqual({ status });
        expect(denied.body).not.toContain('private-session-detail');
      }
    } finally { await state.app.close(); }
  });

  it('requires a known callback caller before inspecting the Yorkie request', async () => {
    const state = server();
    try {
      const payload = { token: 'opaque-yorkie-token', method: 'Watch',
        attributes: [{ key: documentKey, verb: 'r' }] };
      const post = (headers: Record<string, string>, body: unknown) => state.app.inject({
        method: 'POST', url: '/internal/yorkie/auth',
        headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(body),
      });
      const unknown = await post({}, payload);
      expect(unknown.statusCode).toBe(401);
      expect(unknown.json()).toEqual({ allowed: false, reason: 'unknown_caller' });
      expect(state.checked).toEqual([]);
      state.setCallerActive(false);
      expect((await post({ 'x-synthetic-caller': 'local-test' }, payload)).statusCode).toBe(401);
      state.setCallerActive(true);
      const caller = { 'x-synthetic-caller': 'local-test' };
      for (const invalid of [{ ...payload, attributes: [{ key: documentKey, verb: 'r', extra: true }] },
        { ...payload, unexpected: true }, { ...payload, attributes: 'not-an-array' }]) {
        expect((await post(caller, invalid)).statusCode).toBe(400);
      }
      expect(state.checked).toEqual([]);
      const allowed = await post(caller, payload);
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toEqual({ allowed: true, reason: 'allowed' });
      expect(state.checked).toEqual([payload]);
      const activate = await post(caller, { token: 'opaque-yorkie-token',
        method: 'ActivateClient', attributes: null });
      expect(activate.json()).toEqual({ allowed: true, reason: 'allowed' });
      expect(state.checked.at(-1)).toEqual({ token: 'opaque-yorkie-token',
        method: 'ActivateClient', attributes: [] });
      expect((await post(caller, { ...payload, attributes: null })).statusCode).toBe(400);
      const forged = await post(caller, { ...payload, token: 'forged' });
      expect(forged.statusCode).toBe(401);
      expect(forged.json()).toEqual({ allowed: false, reason: 'invalid_capability' });
      state.setDatabaseAvailable(false);
      const unavailable = await post(caller, payload);
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json()).toEqual({ allowed: false, reason: 'authorization_unavailable' });
      expect(unavailable.body).not.toContain('private-database-credential');
    } finally { await state.app.close(); }
  });
});
