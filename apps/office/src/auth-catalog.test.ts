// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, listCatalogDocuments, readDocumentCatalog, snapshotIntentFromSearch } from './auth-client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;
function head(index = 1, product: 'note' | 'word' | 'slides' | 'site' = 'word') {
  return { documentId: documentId(index), tenantId, workspaceId, product, title: `문서 ${index}`, creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: product === 'note' ? documentId(index) : null,
    documentKey: `wonffice-${tenantId}-${documentId(index)}`, fileFormat: `barocss-${product}`,
    fileVersion: 1, revision: 1, snapshotHash: 'a'.repeat(64) };
}
const page = (documents: unknown[], nextCursor: string | null = null) => ({ documents, nextCursor });
const transport = (value: unknown) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));
const fullPage = (start = 1) => Array.from({ length: 50 }, (_, i) => head(start + i));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('authorized four-product head catalog', () => {
  it('reads only the scoped unfiltered service list and preserves authorized Site intents', async () => {
    const heads = [head(1, 'note'), head(2, 'word'), { ...head(3, 'slides'), fileVersion: 2, mode: 'initializing' },
      { ...head(4, 'site'), mode: 'collaborative' }];
    const requestFetch = transport(page(heads));
    expect(await listCatalogDocuments(tenantId, workspaceId, undefined, requestFetch)).toEqual({ items: heads, nextCursor: null });
    expect(requestFetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/tenants/${tenantId}/documents?workspaceId=${workspaceId}`);
    expect(snapshotIntentFromSearch(`?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId(4)}&product=site`)).toEqual({ tenantId, workspaceId, documentId: documentId(4), product: 'site' });
  });

  it.each([
    { documentId: 'invalid' }, { tenantId: workspaceId }, { workspaceId: tenantId }, { product: 'unknown' },
    { title: '' }, { title: ' '.repeat(3) }, { title: 'a'.repeat(201) }, { title: 1 },
    { revision: 0 }, { revision: -1 }, { revision: 1.1 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { metadataRevision: 0 }, { metadataRevision: '1' }, { mode: 'editing' },
    { fileFormat: 'barocss-note' }, { fileVersion: 2 }, { fileVersion: 0 },
    { pageId: documentId(1) }, { documentKey: 'local-copy' }, { snapshotHash: 'bad' },
    { snapshotText: 'private body' }, { owner: 'fictional owner' }, { folderId: documentId(1) },
  ])('rejects malformed or inferred head fields %j', async changes => {
    await expect(readDocumentCatalog(tenantId, workspaceId, transport(page([{ ...head(), ...changes }]))))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('requires a real Note page UUID', async () => {
    await expect(readDocumentCatalog(tenantId, workspaceId, transport(page([{ ...head(1, 'note'), pageId: null }]))))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it.each([null, [], {}, { documents: [], nextCursor: undefined }, page([], documentId(1)),
    page(fullPage().concat(head(51))), page([head()], 'invalid'), page([head()], documentId(1)),
    { ...page([head()]), snapshotText: 'body' }, page([head(), head()]), page([head(2), head(1)])])('rejects malformed pages %j', async value => {
    await expect(readDocumentCatalog(tenantId, workspaceId, transport(value))).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('rejects invalid requested scope and cursor before fetching', async () => {
    const requestFetch = transport(page([]));
    for (const args of [['bad', workspaceId, undefined], [tenantId, 'bad', undefined], [tenantId, workspaceId, '']] as const) {
      await expect(listCatalogDocuments(args[0], args[1], args[2], requestFetch)).rejects.toMatchObject({ kind: 'configuration' });
    }
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it('keeps one captured source for ordered bounded paging', async () => {
    const requestFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page(fullPage(), documentId(50))))
      .mockResolvedValueOnce(Response.json(page([head(51, 'site')])));
    expect(await readDocumentCatalog(tenantId, workspaceId, requestFetch)).toHaveLength(51);
    expect(requestFetch).toHaveBeenNthCalledWith(2, `/api/v1/tenants/${tenantId}/documents?workspaceId=${workspaceId}&after=${documentId(50)}`);
  });

  it.each([page([head(50)]), page(fullPage(), documentId(50)), page(fullPage(51), documentId(50))])('refuses duplicate, cyclic or incoherent continuation %j', async continuation => {
    const requestFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page(fullPage(), documentId(50))))
      .mockResolvedValueOnce(Response.json(continuation));
    await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(requestFetch).toHaveBeenCalledTimes(2);
  });

  it('fails when the service still has pages after the read bound', async () => {
    let requests = 0;
    const requestFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      const start = requests++ * 50 + 1;
      return Response.json(page(fullPage(start), documentId(start + 49)));
    });
    await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(requests).toBe(100);
  });

  it.each([[401, 'unauthorized'], [403, 'forbidden'], [500, 'unavailable']] as const)('preserves failed-page status %s and never returns partial titles', async (status, kind) => {
    const requestFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page(fullPage(), documentId(50))))
      .mockResolvedValueOnce(new Response(null, { status }));
    await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toMatchObject({ kind });
  });

  it('maps a failed transport to an explicit read failure', async () => {
    const requestFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps malformed JSON to an explicit read failure', async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('{'));
    await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toBeInstanceOf(AuthError);
  });
});

it('refuses delayed catalog JSON after logout using the captured authorized fetch', async () => {
  vi.resetModules();
  const issuer = 'https://synthetic-idp.example.test';
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer);
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  let finish!: (value: unknown) => void;
  const body = new Promise<unknown>(resolve => { finish = resolve; });
  let entered!: () => void;
  const decoding = new Promise<void>(resolve => { entered = resolve; });
  const response = Response.json(page([head()]));
  response.json = () => { entered(); return body; };
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url === `${issuer}/token`) return Response.json({ access_token: 'synthetic-A', token_type: 'bearer', expires_in: 3600 });
    return response;
  }));
  const auth = await import('./auth-client');
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'synthetic-state', verifier: 'synthetic-verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=synthetic-state&code=synthetic-code');
  await auth.finishLogin();
  // Node Request does not resolve relative URLs as the browser does.
  const captured = auth.captureAuthorizedFetch();
  const requestFetch: typeof fetch = (input, init) => captured(typeof input === 'string' ? new URL(input, location.origin).href : input, init);
  const reading = auth.readDocumentCatalog(tenantId, workspaceId, requestFetch);
  await decoding;
  auth.clearSession();
  finish(page([head()]));
  await expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
});

it('accepts only a stable creator UUID or explicit legacy Unknown without inferring a tenant owner', async () => {
  const creatorUserId = '55555555-5555-4555-8555-555555555555';
  for (const creator of [creatorUserId, null]) {
    const items = await readDocumentCatalog(tenantId, workspaceId, transport(page([{ ...head(), creatorUserId: creator }])));
    expect(items[0]).toMatchObject({ creatorUserId: creator });
  }
  const legacyHead: Record<string, unknown> = { ...head() };
  delete legacyHead.creatorUserId;
  const legacy = await readDocumentCatalog(tenantId, workspaceId, transport(page([legacyHead])));
  expect(legacy[0]).toMatchObject({ creatorUserId: null });
});

it.each(['not-a-user', '', 123, {}, undefined])('rejects malformed present creator attribution %j', async creatorUserId => {
  // Response.json omits undefined; an explicit own-undefined field must not become an inferred owner either.
  const requestFetch = creatorUserId === undefined ? vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200,
    json: async () => page([{ ...head(), creatorUserId }]) } as Response) : transport(page([{ ...head(), creatorUserId }]));
  await expect(readDocumentCatalog(tenantId, workspaceId, requestFetch)).rejects.toMatchObject({ kind: 'unavailable' });
});
