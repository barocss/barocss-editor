// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '@barocss/shared';
import { AuthError } from './auth-client';
import { AuthenticatedWorkspaceFrame } from './authenticated-frame';
import type { AuthorizedWorkspaceCatalog } from './server-catalog';

const state = vi.hoisted(() => ({ current: true, read: vi.fn() }));
vi.mock('./auth-client', async original => ({ ...await original<typeof import('./auth-client')>(),
  captureAuthorizedSession: () => ({ requestFetch: vi.fn(), isCurrent: () => state.current }) }));
vi.mock('./project-client', () => ({ serverProjectRepository: () => ({ list: vi.fn() }) }));
vi.mock('./server-catalog', async original => ({ ...await original<typeof import('./server-catalog')>(), readAuthorizedWorkspaceCatalog: state.read }));
vi.mock('@barocss/office-ui', async original => { const t = createTranslator('ko'); return { ...await original<typeof import('@barocss/office-ui')>(), useOfficeLocale: () => ({ t }) }; });
const tenantId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const catalog = (title = 'Authorized original'): AuthorizedWorkspaceCatalog => ({ tenantId, workspaceId, source: 'server', state: 'ready',
  capabilities: { stableFolders: false, ownershipClassification: false }, documents: [{ tenantId, workspaceId, documentId, product: 'word', title,
    mode: 'snapshot', metadataRevision: 1, pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-word', fileVersion: 1, revision: 1, snapshotHash: 'a'.repeat(64) }],
  projects: ['Alpha', 'Beta'].map(id => ({ revision: 1, record: { id, title: id, goal: '', archived: false, comments: [], works: [], activities: [], drafts: {},
    results: [{ id: `${id}-placement`, name: 'stale alias', document: { product: 'word', id: documentId }, inputs: [] }] } })) });
let container: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.current = true; state.read.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (authorityEpoch: number, onAccessFailure = vi.fn(), authorized = true) => {
  await act(async () => root.render(<AuthenticatedWorkspaceFrame tenantId={tenantId} workspaceId={workspaceId} workspaceName="Workspace One" role="editor"
    authorityEpoch={authorityEpoch} authorized={authorized} active="" busy={false} error="" onOpen={vi.fn()} onNavigate={vi.fn()} onAccessFailure={onAccessFailure}>
    <div data-native="retained">Native editor</div>
  </AuthenticatedWorkspaceFrame>));
};
it('shows multiple expandable Project placements without replacing the native editor on collapse', async () => {
  state.read.mockResolvedValue(catalog()); await render(1);
  const native = container.querySelector('[data-native]');
  expect(container.textContent).toContain('Workspace One'); expect(container.textContent).toContain('Alpha'); expect(container.textContent).toContain('Beta');
  expect(container.querySelectorAll('[data-original]')).toHaveLength(3); expect(container.textContent).not.toContain('stale alias');
  await act(async () => (container.querySelector('.ow-tree-group') as HTMLButtonElement).click());
  expect(container.querySelectorAll('[data-original]')).toHaveLength(2); expect(container.querySelector('[data-native]')).toBe(native);
});
it('reports current login expiry even when the request cleared the captured session before rejecting', async () => {
  let reject!: (error: unknown) => void;
  state.read.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; })); const denied = vi.fn();
  await render(1, denied);
  await act(async () => { state.current = false; reject(new AuthError('unauthorized', 'expired')); });
  expect(denied).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unauthorized' }));
  expect(container.querySelectorAll('[data-original]')).toHaveLength(0);
});
it('does not disclose a delayed catalog or failure from a retired authority epoch', async () => {
  let resolve!: (value: AuthorizedWorkspaceCatalog) => void;
  state.read.mockReturnValueOnce(new Promise(finish => { resolve = finish; })).mockResolvedValue(catalog('Current original'));
  const denied = vi.fn(); await render(1, denied); await render(2, denied);
  await act(async () => resolve(catalog('Retired original')));
  expect(container.textContent).toContain('Current original'); expect(container.textContent).not.toContain('Retired original'); expect(denied).not.toHaveBeenCalled();
  await render(3, denied, false); expect(container.querySelectorAll('[data-original]')).toHaveLength(0);
});
it('removes prior authorized rows before layout effects under a new authority', async () => {
  state.read.mockResolvedValueOnce(catalog('Prior original')); await render(1);
  expect(container.textContent).toContain('Prior original');
  state.read.mockReturnValue(new Promise(() => {}));
  let duringLayout = '';
  function Observe() { useLayoutEffect(() => { duringLayout = container.textContent ?? ''; }, []); return null; }
  await act(async () => root.render(<AuthenticatedWorkspaceFrame tenantId={tenantId} workspaceId={workspaceId} workspaceName="Workspace One" role="editor"
    authorityEpoch={2} authorized active="" busy={false} error="" onOpen={vi.fn()} onNavigate={vi.fn()} onAccessFailure={vi.fn()}>
    <Observe />
  </AuthenticatedWorkspaceFrame>));
  expect(duringLayout).not.toContain('Prior original'); expect(duringLayout).not.toContain('Alpha');
  expect(container.querySelectorAll('[data-original]')).toHaveLength(0);
});
