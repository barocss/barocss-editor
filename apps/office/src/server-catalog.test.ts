// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { AuthError, type CatalogDocumentHead } from './auth-client';
import { readAuthorizedWorkspaceCatalog, serverCatalogGroups, type AuthorizedWorkspaceCatalog } from './server-catalog';
import { createTranslator, type ProjectSnapshot } from '@barocss/shared';

const tenantId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const id = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`;
const head = (i: number, product: CatalogDocumentHead['product'] = 'word'): CatalogDocumentHead => ({
  tenantId, workspaceId, documentId: id(i), title: `원본 ${i}`, product, mode: 'snapshot', metadataRevision: 1,
  pageId: product === 'note' ? id(i) : null, revision: 1, fileFormat: `barocss-${product}`, fileVersion: 1,
  snapshotHash: 'a'.repeat(64), documentKey: `wonffice-${tenantId}-${id(i)}`
});
function project(projectId: string): ProjectSnapshot {
  return { revision: 1, record: { id: projectId, title: projectId, goal: '', archived: false, activities: [], comments: [], works: [], drafts: {},
    results: [{ id: `${projectId}-placement`, name: '오래된 별칭', document: { product: 'word', id: id(1) }, inputs: [] },
      { id: `${projectId}-missing`, name: '표시하면 안 되는 이름', document: { product: 'word', id: id(99) }, inputs: [] }] } };
}
const catalog = (): AuthorizedWorkspaceCatalog => ({ source: 'server', tenantId, workspaceId,
  capabilities: { stableFolders: false, ownershipClassification: false }, documents: [head(1), head(2, 'site')],
  projects: [project('first'), project('second')], state: 'ready' });
const options = { perspective: 'project' as const, product: 'all' as const, query: '', sourcesLabel: '접근 가능한 원본' };

it('two Project placements and Sources point to one authorized original without cached alias or missing titles', () => {
  const groups = serverCatalogGroups(catalog(), options);
  expect(groups.map(group => group.entries.length)).toEqual([1, 1, 2]);
  const first = groups[0].entries[0], second = groups[1].entries[0], source = groups[2].entries[0];
  expect(first.row).toBe(second.row); expect(first.row).toBe(source.row);
  expect(first.id).not.toBe(second.id); expect(first.id).not.toBe(source.id);
  expect(JSON.stringify(groups)).not.toContain('별칭'); expect(JSON.stringify(groups)).not.toContain('표시하면 안');
  expect(first.row.title).toBe('원본 1');
  expect(groups[2].entries[1].disabled).toBe(true); // Site discovery does not register a server renderer.
});

it('partial Project discovery retains authorized sources without claiming unlinked files or complete projects', () => {
  const value = { ...catalog(), state: 'partial' as const };
  expect(serverCatalogGroups(value, options).map(group => group.label)).toEqual(['접근 가능한 원본']);
  expect(JSON.stringify(serverCatalogGroups(value, options))).not.toContain('first');
});

it('NFD search and product filters operate on current authorized original titles only', () => {
  const value = catalog(); value.documents[0].title = '팀 교육자료';
  const groups = serverCatalogGroups(value, { ...options, perspective: 'sources', product: 'word', query: '교육'.normalize('NFD') });
  expect(groups[0].entries.map(entry => entry.row.documentId)).toEqual([id(1)]);
  expect(serverCatalogGroups(value, { ...options, query: '오래된 별칭' }).every(group => group.entries.length === 0)).toBe(true);
});

it('workspace identity remains in empty Project placement groups', () => {
  const value = catalog(); value.documents = [];
  expect(serverCatalogGroups(value, options)[0].id).toContain(workspaceId);
  expect(serverCatalogGroups(value, options)[0].entries).toEqual([]);
});

const requestFetch = () => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ documents: [head(1)], nextCursor: null }));
it('a failed Project read becomes an explicit partial catalog, not a successful empty list', async () => {
  const result = await readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: requestFetch(),
    readProjects: async () => { throw new Error('network'); }, isCurrent: () => true });
  expect(result.state).toBe('partial'); expect(result.documents).toHaveLength(1); expect(result.projects).toEqual([]);
  expect(result.capabilities).toEqual({ stableFolders: false, ownershipClassification: false });
});

for (const kind of ['cancelled', 'unauthorized', 'forbidden'] as const) it(`${kind} Project access returns no prior titles or partial catalog`, async () => {
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: requestFetch(),
    readProjects: async () => { throw new AuthError(kind, 'denied'); }, isCurrent: () => true })).rejects.toMatchObject({ kind });
});

it('retired Workspace request cannot publish earlier authorized heads after awaiting Project discovery', async () => {
  let current = true;
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: requestFetch(),
    readProjects: async () => { current = false; return [project('old')]; }, isCurrent: () => current })).rejects.toMatchObject({ kind: 'cancelled' });
});

it('failed document discovery does not request Project data or publish an empty successful catalog', async () => {
  const readProjects = vi.fn(async () => [project('old')]);
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId,
    requestFetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'forbidden' }, { status: 403 })),
    readProjects, isCurrent: () => true })).rejects.toMatchObject({ kind: 'forbidden' });
  expect(readProjects).not.toHaveBeenCalled();
});

it('uses the host locale for catalog errors without changing scope or ownership facts', async () => {
  const t = createTranslator('en');
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: requestFetch(),
    readProjects: async () => [], isCurrent: () => false, t })).rejects.toThrow(t('workspace.catalog.changed'));
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId,
    requestFetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ documents: [], nextCursor: 'invalid' })),
    readProjects: async () => [], isCurrent: () => true, t })).rejects.toThrow(t('workspace.catalog.invalidResponse'));
});

for (const [kind, key] of [['unauthorized', 'expiredLogin'], ['forbidden', 'denied'], ['cancelled', 'changed']] as const) {
  for (const owner of ['documents', 'projects'] as const) it(`translates ${owner} transport ${kind} and keeps its access error kind`, async () => {
    const t = createTranslator('en');
    const message = t(`workspace.catalog.${key}`);
    const failure = new AuthError(kind, '인증 계층 오류');
    const reading = readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, t, isCurrent: () => true,
      requestFetch: owner === 'documents' ? vi.fn<typeof fetch>().mockRejectedValue(failure) : requestFetch(),
      readProjects: async () => { if (owner === 'projects') throw failure; return []; } });
    await expect(reading).rejects.toMatchObject({ kind, message });
  });
}

it('preserves current Project login expiry when its request clears the session before rejecting', async () => {
  let current = true;
  await expect(readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: requestFetch(),
    readProjects: async () => { current = false; throw new AuthError('unauthorized', 'expired'); }, isCurrent: () => current })).rejects.toMatchObject({ kind: 'unauthorized' });
});
