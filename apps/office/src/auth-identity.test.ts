// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const issuer = 'https://synthetic-idp.example.test';
const currentUserId = '33333333-3333-4333-8333-333333333333';
async function authenticated(pages: unknown[], onDecode?: () => void) {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer);
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const fetchMock = vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url === `${issuer}/token`) return Response.json({ access_token: 'synthetic-current', token_type: 'bearer', expires_in: 3600 });
    return { ok: true, status: 200, json: async () => { onDecode?.(); return pages.shift(); } } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  // Match browser-relative Request resolution without changing the captured auth client.
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, location.origin) : input, init);
    }
  });
  const auth = await import('./auth-client');
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=state&code=code');
  await auth.finishLogin();
  return auth;
}
const page = (changes: Record<string, unknown> = {}) => ({ issuer, subject: 'person', currentUserId,
  tenants: [], nextCursor: null, ...changes });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });
it('reads the verified internal person UUID without tenants and maps only legacy absence to Unknown', async () => {
  let auth = await authenticated([page()]);
  expect(await auth.loadIdentity()).toEqual({ issuer, subject: 'person', currentUserId, tenants: [] });
  const legacy: Record<string, unknown> = page(); delete legacy.currentUserId;
  auth = await authenticated([legacy]);
  expect((await auth.loadIdentity()).currentUserId).toBeNull();
  auth = await authenticated([page({ currentUserId: null })]);
  expect((await auth.loadIdentity()).currentUserId).toBeNull();
});
it.each(['invalid', '', 42, {}, undefined])('refuses malformed present current person %j', async value => {
  const auth = await authenticated([page({ currentUserId: value })]);
  await expect(auth.loadIdentity()).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([{ currentUserId: '44444444-4444-4444-8444-444444444444' }, { currentUserId: null },
  { issuer: 'https://other.example' }, { subject: 'different-person' }])('refuses changed verified identity across pages %j', async change => {
  const auth = await authenticated([page({ nextCursor: '11111111-1111-4111-8111-111111111111' }), page(change)]);
  await expect(auth.loadIdentity()).rejects.toMatchObject({ kind: 'unauthorized' });
});

it('retains the verified current person through all pages of the same captured login', async () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const tenant = { tenantId, name: 'Current company', role: 'editor' };
  const auth = await authenticated([page({ tenants: [tenant], nextCursor: tenantId }), page()]);
  expect(await auth.loadIdentity()).toEqual({ issuer, subject: 'person', currentUserId, tenants: [tenant] });
});
it('refuses a genuine old identity decode after its captured login is retired', async () => {
  let finish!: (value: unknown) => void;
  const body = new Promise<unknown>(resolve => { finish = resolve; });
  let entered!: () => void;
  const decoding = new Promise<void>(resolve => { entered = resolve; });
  const auth = await authenticated([body], entered);
  const reading = auth.loadIdentity();
  await decoding;
  auth.clearSession();
  finish(page());
  await expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
});
