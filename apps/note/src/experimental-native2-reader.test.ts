import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function wire(file = NATIVE_NOTE_FIXTURES.SOURCE_A, revision = 1) {
  const raw = JSON.stringify(file);
  const head = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled original',
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: file.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision, snapshotHash: hash(raw) };
  return { head, raw, opened: { document: head, snapshotText: raw },
    pinned: { status: 'pinned', documentId, documentRevision: revision, snapshotHash: head.snapshotHash,
      nativeFormat: { format: 'barocss-note', version: 2 }, bundle: file.schemaBundle } };
}
function transport(responses: Array<Response | Error>, isCurrent = () => true) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const authorizedFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Missing controlled response');
    return response;
  };
  return { calls, reader: createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2', authorizedFetch, isCurrent }) };
}
describe('private readonly native2 transport/context', () => {
  it.each(Object.entries(NATIVE_NOTE_FIXTURES))('retains every original field and original raw byte in %s', async (_name, original) => {
    const raw = JSON.stringify(original), before = structuredClone(original);
    const h = { ...wire().head, pageId: original.document.attributes.pageId, snapshotHash: hash(raw) };
    const pinned = { ...wire().pinned, snapshotHash: h.snapshotHash, bundle: original.schemaBundle };
    const { reader, calls } = transport([Response.json({ document: h, snapshotText: raw }), Response.json(pinned)]);
    const result = await reader.open(documentId);
    expect(result.document).toEqual(h);
    expect(result.snapshotText).toBe(raw);
    expect(result.file).toEqual({ fileVersion: 2, document: original.document, schemaBundle: original.schemaBundle,
      ...('savedAt' in original ? { savedAt: original.savedAt } : {}) });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.file.schemaBundle.definitions)).toBe(true);
    expect(original).toEqual(before);
    expect(calls.map(call => call.url)).toEqual([
      `/controlled-native2/v1/tenants/${tenantId}/note-native2/documents/${documentId}`,
      `/controlled-native2/v1/tenants/${tenantId}/note-native2/documents/${documentId}/schema-bundle`]);
    expect(calls.every(call => call.init?.method === 'GET' && call.init.body === undefined)).toBe(true);
    expect(Object.keys(reader)).toEqual(['open']);
  });
  it.each(['documentId', 'tenantId', 'workspaceId', 'pageId', 'documentKey', 'snapshotHash', 'mode', 'fileVersion'] as const)(
    'refuses a wrong head %s without fetching a bundle', async field => {
      const x = wire(), h: Record<string, unknown> = { ...x.head };
      h[field] = field === 'fileVersion' ? 1 : field === 'mode' ? 'collaborative' : 'wrong';
      const { reader, calls } = transport([Response.json({ document: h, snapshotText: x.raw })]);
      await expect(reader.open(documentId)).rejects.toMatchObject({ code: 'invalid_native2_response' });
      expect(calls).toHaveLength(1);
    });
  it('refuses unrecognized grants and duplicate decoded HTTP keys', async () => {
    const x = wire();
    const duplicate = `{"document":${JSON.stringify(x.head)},"snapshotText":${JSON.stringify(x.raw)},"snapshotText":${JSON.stringify(x.raw)}}`;
    for (const response of [Response.json({ document: { ...x.head, roles: ['owner'] }, snapshotText: x.raw }), new Response(duplicate)]) {
      const { reader, calls } = transport([response]);
      await expect(reader.open(documentId)).rejects.toMatchObject({ code: 'invalid_native2_response' });
      expect(calls).toHaveLength(1);
    }
  });
  it.each(['documentId', 'documentRevision', 'snapshotHash', 'nativeFormat', 'status', 'definitions', 'extra'] as const)(
    'refuses a mismatched/raced whole bundle %s', async field => {
      const x = wire(), p: Record<string, unknown> = structuredClone(x.pinned);
      if (field === 'definitions') p.bundle = { ...x.pinned.bundle, definitions: [...x.pinned.bundle.definitions].reverse() };
      else if (field === 'extra') p.grant = true;
      else p[field] = field === 'documentRevision' ? 2 : field === 'nativeFormat' ? { format: 'barocss-note', version: 1 } : 'wrong';
      const { reader, calls } = transport([Response.json(x.opened), Response.json(p)]);
      await expect(reader.open(documentId)).rejects.toMatchObject({ code: 'invalid_native2_response' });
      expect(calls).toHaveLength(2);
    });
  it('refuses a missing immutable dependency and foreign intrinsic definition scope', async () => {
    const x = wire();
    const { reader } = transport([Response.json(x.opened),
      Response.json({ ...x.pinned, bundle: { ...x.pinned.bundle, definitions: x.pinned.bundle.definitions.slice(0, 1) } })]);
    await expect(reader.open(documentId)).rejects.toMatchObject({ code: 'invalid_native2_response' });
    const foreign = createExperimentalNative2NoteReader({ tenantId, workspaceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      apiBase: '/controlled-native2', isCurrent: () => true,
      authorizedFetch: async () => Response.json({ ...x.opened, document: { ...x.head, workspaceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } }) });
    await expect(foreign.open(documentId)).rejects.toMatchObject({ code: 'invalid_native2_response' });
  });
  it('refuses a retired owner before any request', async () => {
    const { reader, calls } = transport([], () => false);
    await expect(reader.open(documentId)).rejects.toMatchObject({ code: 'stale_native2_context' });
    expect(calls).toEqual([]);
  });
  it.each(['fetch', 'body'] as const)('does not deliver after owner retirement during %s', async phase => {
    const x = wire(); let active = true, release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2', isCurrent: () => active,
      authorizedFetch: async () => {
        calls++;
        if (phase === 'fetch') { entered(); await held; }
        const response = Response.json(x.opened);
        if (phase === 'body') {
          const originalText = response.text.bind(response);
          response.text = async () => { entered(); await held; return originalText(); };
        }
        return response;
      } });
    const opened = reader.open(documentId); await waiting; active = false; release();
    await expect(opened).rejects.toMatchObject({ code: 'stale_native2_context' });
    expect(calls).toBe(1);
  });
  it.each([401, 403, 404, 503])('preserves status %s without fallback/retry', async status => {
    const { reader, calls } = transport([Response.json({ status: 'scope_forbidden' }, { status })]);
    await expect(reader.open(documentId)).rejects.toMatchObject({ status, code: 'scope_forbidden' });
    expect(calls).toHaveLength(1);
  });
  it('keeps network and host-auth denial distinct', async () => {
    for (const [error, expected] of [[new Error('offline'), { status: null, code: 'network_error' }],
      [Object.assign(new Error('denied'), { kind: 'forbidden' }), { status: 403, code: 'forbidden' }]] as const) {
      const { reader, calls } = transport([error]);
      await expect(reader.open(documentId)).rejects.toMatchObject(expected); expect(calls).toHaveLength(1);
    }
  });
});
