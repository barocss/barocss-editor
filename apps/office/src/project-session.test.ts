// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ProjectExecution } from '@barocss/shared';
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

it.each(['ko', 'en'] as const)('the %s Note task surface resolves current IDs, labels its actions and never generates on selection', async locale => {
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { OfficeLocaleProvider } = await import('@barocss/office-ui');
  const { createProjectRecord, createProjectComment, requestProjectWork } = await import('@barocss/shared');
  const { ProjectTaskPanel } = await import('../../../packages/office-workspace/src/project-task-panel');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const documentId = crypto.randomUUID(), pageId = crypto.randomUUID();
  const original = { product: 'note' as const, id: documentId, title: 'Fictional original' };
  let record = createProjectRecord('Fictional project', 'Review a paragraph');
  const resultId = crypto.randomUUID(); record.results.push({ id: resultId, name: original.title, document: { product: original.product, id: original.id }, inputs: [] });
  record = createProjectComment(record, { resultId, body: 'Make the introduction clearer', actor: { kind: 'human', id: 'current-user', label: 'Member' },
    target: { kind: 'note-paragraph', id: crypto.randomUUID(), quote: 'Original text', selector: { version: 1, pageId, paragraphIndex: 0 } },
    pin: { id: crypto.randomUUID(), title: original.title, document: { product: original.product, id: original.id }, revision: 3, text: JSON.stringify({ format: 'barocss-note', version: 1,
      document: { stype: 'note', attributes: { pageId }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original text' }] }] } }) } });
  record = requestProjectWork(record, record.comments[0].id, 'Make the introduction clearer');
  const unavailable = async () => { throw new Error('Unexpected repository call'); };
  const execution = vi.fn(async () => null), execute = vi.fn(unavailable), onOpen = vi.fn();
  let repository: import('../../../packages/office-workspace/src/project-ui').ProjectRepository = { writable: true, list: unavailable, read: unavailable, create: unavailable, save: unavailable,
    documents: unavailable, createDocument: unavailable, pin: unavailable, readPin: unavailable, execution, execute };
  const container = document.createElement('div');
  document.body.append(container); const root = createRoot(container);
  const render = () => root.render(createElement(OfficeLocaleProvider, { locale, children: createElement(ProjectTaskPanel,
    { record, revision: 4, repository, documents: [original], busy: false, onOpen }) }));
  try {
    await act(async () => render());
    expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(locale === 'en' ? 'Tasks' : '작업');
    expect(execution).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    const task = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Make the introduction clearer'))!;
    await act(async () => task.click());
    expect(execution).toHaveBeenCalledWith(record.id, record.works[0].id); expect(execute).not.toHaveBeenCalled();
    const open = Array.from(container.querySelectorAll('button')).find(button => button.textContent === (locale === 'en' ? 'Open original and review' : '원본 열고 검토'))!;
    expect(open).toBeDefined(); await act(async () => open.click()); expect(onOpen).toHaveBeenCalledWith(original);
    expect(container.textContent).toContain(locale === 'en' ? 'Request local model proposal' : '로컬 모델에 제안 요청');
    // Explicit fixture outcomes exercise presentation only. They are not model,
    // authority, API or PostgreSQL evidence.
    const phases = {
      failed: { reason: 'adapter_unavailable', en: 'Execution failed', ko: '실행 실패' },
      unknown: { reason: 'execution_outcome_unknown', en: 'Execution outcome unknown', ko: '실행 결과 미확인' },
      unsupported: { reason: 'unsupported_target', en: 'Unsupported target', ko: '지원 범위 밖' },
      blocked: { reason: 'authority_changed', en: 'Change needs verification', ko: '변경 확인 필요' }
    };
    for (const phase of ['failed', 'unknown', 'unsupported', 'blocked'] as const) {
      const outcome: ProjectExecution = { id: crypto.randomUUID(), projectId: record.id, workId: record.works[0].id,
        resultId, documentId, tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), actorId: 'current-user',
        phase, reason: phases[phase].reason, pendingOutputs: [],
        input: { request: record.works[0].request, revision: 3, snapshotHash: 'a'.repeat(64), snapshotText: record.comments[0].pin.text,
          target: { nodeId: record.comments[0].target.id, text: 'Original text', from: 0, to: 13 }, inputs: [] } };
      repository = { ...repository, execution: vi.fn(async () => outcome) };
      await act(async () => render());
      expect(container.querySelector('[role="status"]')?.textContent).toBe(phases[phase][locale]);
      if (locale === 'en') expect(container.querySelector('.ow-connected-work')?.textContent).not.toMatch(/[가-힣]/u);
      expect(execute).not.toHaveBeenCalled();
      expect(Array.from(container.querySelectorAll('.ow-connected-work button')).some(button => button.textContent === 'Apply to local draft' || button.textContent === '초안에 적용')).toBe(false);
    }
    record = { ...record, works: [] }; await act(async () => render());
    expect(container.textContent).toContain(locale === 'en'
      ? 'Request text recorded · task not yet confirmed. Open the original to continue.' : '요청 내용 보관됨 · 작업 미확인. 원본을 열어 이어서 확인하세요.');
    record = { ...record, works: [], comments: [] }; await act(async () => render());
    expect(container.querySelector('.ow-note-task-detail')?.textContent).toBe(locale === 'en'
      ? 'Choose a task to inspect its request and pinned original.' : '작업을 선택해 요청과 보관한 원본을 확인하세요.');
    expect(execute).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
