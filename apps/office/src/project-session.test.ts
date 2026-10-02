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
