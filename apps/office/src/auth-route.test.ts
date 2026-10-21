// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { authRouteRequest, authenticatedItem, resolveAuthenticatedRouteItem, snapshotIntentURL } from './auth-route';
import { createProjectRecord } from '@barocss/shared';
import type { AuthorizedWorkspaceCatalog } from './server-catalog';

const tenant = '11111111-1111-4111-8111-111111111111', workspace = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
const catalog = (): AuthorizedWorkspaceCatalog => ({ source: 'server', tenantId: tenant, workspaceId: workspace, state: 'ready', capabilities: { stableFolders: false, ownershipClassification: false }, projects: [], documents: [
  { tenantId: tenant, workspaceId: workspace, documentId: id, product: 'word', title: 'Fictional', metadataRevision: 1, mode: 'snapshot', revision: 1, pageId: null, documentKey: `wonffice-${tenant}-${id}`, fileFormat: 'barocss-word', fileVersion: 1, snapshotHash: 'a'.repeat(64) }
] });
describe('authenticated compact route requests', () => {
  it('keeps the short requested path without selecting a tenant or product before authorization', () => {
    const request = authRouteRequest(`/${workspace}/${id}`)!;
    expect(request.route).toEqual({ kind: 'item', workspaceId: workspace, itemId: id });
    expect(request.expected).toBeUndefined();
    expect(authenticatedItem(request, catalog())).toEqual({ kind: 'document', id, product: 'word' });
    expect(snapshotIntentURL({ tenantId: tenant, workspaceId: workspace, documentId: id, product: 'word' })).toBe(`/${workspace}/${id}?tenant=${tenant}`);
  });
  it('refuses partial projects even when a document head matches', () => {
    expect(() => authenticatedItem(authRouteRequest(`/${workspace}/${id}`)!, { ...catalog(), state: 'partial' })).toThrow(/complete/i);
  });
  it('refuses a project/document collision and a contradictory old product identity', () => {
    const source = catalog(); source.projects = [{ record: { id } as never, revision: 1 }];
    expect(() => authenticatedItem(authRouteRequest(`/${workspace}/${id}`)!, source)).toThrow(/ambiguous/i);
    expect(() => authenticatedItem(authRouteRequest(`/?tenant=${tenant}&workspace=${workspace}&document=${id}&product=note`)!, catalog())).toThrow(/does not match/i);
  });
  it('refuses foreign tenant or workspace metadata rather than accepting the same item ID', () => {
    const request = authRouteRequest(`/${workspace}/${id}?tenant=${tenant}`)!;
    expect(() => authenticatedItem(request, { ...catalog(), tenantId: workspace })).toThrow(/complete/i);
    expect(() => authenticatedItem(request, { ...catalog(), workspaceId: tenant })).toThrow(/complete/i);
  });
  it('keeps existing OIDC and administrator entries outside native item parsing', () => {
    for (const path of ['/', '/auth/callback?code=secret&state=state', '/admin', '/operator']) expect(authRouteRequest(path)).toBeNull();
    expect(() => authRouteRequest('/invalid/id')).toThrow(/identity/i);
    expect(() => authRouteRequest(`/${workspace}/${id}?tenant=${tenant}&tenant=${tenant}`)).toThrow(/duplicate/i);
  });
});

describe('exact authorized item discovery', () => {
  const request = () => authRouteRequest(`/${workspace}/${id}?tenant=${tenant}`)!;
  const project = () => ({ tenantId: tenant, workspaceId: workspace, actor: { kind: 'human', id: 'verified-actor' }, project: {
    revision: 1, record: { ...createProjectRecord('Fictional project', 'Routing verification'), id }
  } });
  it('resolves a unique authorized original even when unrelated catalog pages are unavailable', async () => {
    const read = vi.fn<typeof fetch>(async input => String(input).includes('/documents/') ? Response.json({ document: catalog().documents[0] }) : new Response(null, { status: 404 }));
    expect(await resolveAuthenticatedRouteItem(request(), tenant, read, () => true)).toEqual({ kind: 'document', id, product: 'word' });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([path]) => path)).toEqual([`/api/v1/tenants/${tenant}/documents/${id}`, `/api/v1/tenants/${tenant}/projects/${id}`]);
    expect(read.mock.calls.some(([path]) => String(path).includes('?'))).toBe(false);
  });
  it('resolves a unique project only after proving document absence', async () => {
    const read = vi.fn<typeof fetch>(async input => String(input).includes('/projects/') ? Response.json(project()) : new Response(null, { status: 404 }));
    expect(await resolveAuthenticatedRouteItem(request(), tenant, read, () => true)).toEqual({ kind: 'project', id });
  });
  it('refuses an exact project/document collision before selecting either kind', async () => {
    const read = vi.fn<typeof fetch>(async input => Response.json(String(input).includes('/projects/') ? project() : { document: catalog().documents[0] }));
    await expect(resolveAuthenticatedRouteItem(request(), tenant, read, () => true)).rejects.toThrow(/ambiguous/i);
  });
  it.each([401, 403, 500])('does not treat a failed other namespace (%s) as absent', async status => {
    const read = vi.fn<typeof fetch>(async input => String(input).includes('/documents/') ? Response.json({ document: catalog().documents[0] }) : new Response(null, { status }));
    await expect(resolveAuthenticatedRouteItem(request(), tenant, read, () => true)).rejects.toMatchObject({ kind: status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'unavailable' });
  });
  it('refuses a retained response after current access retires while its body is being read', async () => {
    let current = true, finish!: (value: unknown) => void;
    const body = new Promise<unknown>(resolve => { finish = resolve; });
    const response = Response.json({}); response.json = () => body;
    const read = vi.fn<typeof fetch>(async input => String(input).includes('/documents/') ? response : new Response(null, { status: 404 }));
    const result = resolveAuthenticatedRouteItem(request(), tenant, read, () => current);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    current = false; finish({ document: catalog().documents[0] });
    await expect(result).rejects.toMatchObject({ kind: 'cancelled' });
  });
  it('refuses a different tenant before requesting either namespace', async () => {
    const read = vi.fn<typeof fetch>();
    await expect(resolveAuthenticatedRouteItem(request(), workspace, read, () => true)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(read).not.toHaveBeenCalled();
  });
});
