// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });
it('a retained project repository cannot send as another login or after account ABA', async () => {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', 'https://synthetic-idp.example.test');
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const network = vi.fn(), issuer = 'https://synthetic-idp.example.test';
  let token = 'synthetic-A';
  network.mockImplementation(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` }));
    if (url === `${issuer}/token`) return new Response(JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600 }));
    throw new Error('An old repository must not reach the project API');
  });
  vi.stubGlobal('fetch', network);
  const auth = await import('./auth-client'), { serverProjectRepository } = await import('./project-client');
  const login = async (value: string, returnPath?: string) => {
    token = value;
    sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'synthetic-state', verifier: 'synthetic-verifier', intent: 'user', ...(returnPath ? { returnPath } : {}) }));
    history.replaceState(null, '', '/auth/callback?state=synthetic-state&code=synthetic-code');
    await auth.finishLogin();
  };
  const projectPath = '/?tenant=11111111-1111-4111-8111-111111111111&workspace=22222222-2222-4222-8222-222222222222&project=33333333-3333-4333-8333-333333333333';
  expect(auth.projectLocation(new URL(projectPath, location.origin).search)).not.toBeNull();
  expect(auth.projectLocation(new URL(projectPath + '&project=duplicate', location.origin).search)).toBeNull();
  expect(auth.projectLocation(new URL(projectPath + '&return=https://example.com', location.origin).search)).toBeNull();
  await login('synthetic-A', projectPath);
  expect(location.pathname + location.search).toBe(projectPath);
  const original = serverProjectRepository('tenant', 'workspace', 'editor');
  await login('synthetic-B');
  const requestsBefore = network.mock.calls.length;
  await expect(original.read('project')).rejects.toThrow('계정이 바뀌었습니다');
  expect(network.mock.calls.length).toBe(requestsBefore);
  await login('synthetic-A');
  const requestsAfter = network.mock.calls.length;
  await expect(original.create('제목', '목표')).rejects.toThrow('계정이 바뀌었습니다');
  expect(network.mock.calls.length).toBe(requestsAfter);
  auth.clearSession();
});
it('keeps a bounded live execution wait separate from ordinary writes and rejects its response after account change', async () => {
  vi.resetModules(); vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', 'https://synthetic-idp.example.test'); vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const issuer = 'https://synthetic-idp.example.test'; let finish!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url === `${issuer}/token`) return Response.json({ access_token: 'synthetic-A', token_type: 'bearer', expires_in: 3600 });
    return url.endsWith('/execution') ? pending : Response.json({ execution: null });
  }));
  const auth = await import('./auth-client');
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'synthetic-state', verifier: 'synthetic-verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=synthetic-state&code=synthetic-code'); await auth.finishLogin();
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const base = `${location.origin}/api/v1/tenants/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/works/33333333-3333-4333-8333-333333333333/execution`;
  const request = auth.captureAuthorizedFetch()(base, { method: 'POST', body: '{}' });
  expect(timeout).toHaveBeenLastCalledWith(610000);
  await auth.authorizedFetch(`${base}/44444444-4444-4444-8444-444444444444/accept`, { method: 'POST', body: '{}' });
  expect(timeout).toHaveBeenLastCalledWith(10000);
  auth.clearSession(); finish(Response.json({ execution: null }));
  await expect(request).rejects.toThrow('계정이 바뀌었습니다'); timeout.mockRestore();
});
it('refuses a delayed execution response body after logout even when headers arrived under the original account', async () => {
  vi.resetModules(); vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', 'https://synthetic-idp.example.test'); vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const issuer = 'https://synthetic-idp.example.test'; let finish!: (value: unknown) => void;
  const body = new Promise<unknown>(resolve => { finish = resolve; });
  let entered!: () => void; const decoding = new Promise<void>(resolve => { entered = resolve; });
  const response = Response.json({ execution: null }); response.json = () => { entered(); return body; };
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url === `${issuer}/token`) return Response.json({ access_token: 'synthetic-A', token_type: 'bearer', expires_in: 3600 });
    return response;
  }));
  const auth = await import('./auth-client'), { serverProjectRepository } = await import('./project-client');
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'synthetic-state', verifier: 'synthetic-verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=synthetic-state&code=synthetic-code'); await auth.finishLogin();
  const reading = serverProjectRepository('tenant', 'workspace', 'editor').execution!('project', 'work');
  await decoding; auth.clearSession(); finish({ execution: null });
  await expect(reading).rejects.toThrow('계정이 바뀌었습니다');
});
