// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';

const issuer = 'https://synthetic-idp.example.test';
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const sourceText = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const snapshotText = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2) + '\n';
const original = { tenantId, workspaceId, documentId, expectedRevision: 7, expectedSnapshotHash: sha(sourceText),
  expectedPriorPinDigest: sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId,
    documentId, 'pinned', NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])])),
  snapshotText, schemaAction: 'adopt', idempotencyKey: 'reload:506._-' };
const requestHash = sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId, 'adopt',
  7, original.expectedSnapshotHash, original.expectedPriorPinDigest, snapshotText]));
const expectedReceipt = { operation: 'update', idempotencyKey: original.idempotencyKey, requestHash,
  document: { documentId, tenantId, workspaceId, product: 'note', title: 'Independent historical receipt', creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: NATIVE_NOTE_FIXTURES.TARGET_A2.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2,
    revision: 8, snapshotHash: sha(snapshotText) }, snapshotText };
const path = `/api/v1/tenants/${tenantId}/note-native2/receipts/update/${original.idempotencyKey}`;
interface Call { url: string; method: string; body: string; headers: Headers; request: Request }
interface State { calls: Call[]; expiresIn: number; handler?: (call: Call) => Response | Promise<Response> }
const sessions: Array<{ clearSession(): void }> = [];
async function login(overrides: Partial<State> = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer);
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'controlled-reload-browser');
  const state: State = { calls: [], expiresIn: 3600, ...overrides };
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, location.origin) : input, init); }
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.href.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url.href === `${issuer}/token`) return Response.json({ access_token: 'synthetic-reload-current', token_type: 'bearer', expires_in: state.expiresIn });
    const request = input instanceof Request ? input : new Request(input, init);
    const call: Call = { url: url.pathname + url.search, method: request.method,
      body: await request.clone().text(), headers: new Headers(init?.headers), request };
    state.calls.push(call);
    if (url.pathname !== path) throw new Error(`Unexpected service route: ${call.url}`);
    return state.handler ? state.handler(call) : Response.json(expectedReceipt);
  }));
  const auth = await import('./auth-client');
  sessions.push(auth);
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=state&code=code');
  await auth.finishLogin();
  const api = await import('./native2-authenticated-receipt-recovery');
  const factory = api.createAuthenticatedNative2ReceiptRecovery();
  return { auth, api, factory, state };
}
afterEach(() => {
  for (const session of sessions.splice(0)) session.clearSession();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear();
});

describe('fresh current Office login receipt-only recovery (controlled replies)', () => {
  it('verifies independently declared original raw/CAS/pin/key/action and receipt after a fresh module/login without reading a latest head', async () => {
    const first = await login();
    const retainedJson = JSON.stringify(original);
    const laterDraft = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const retainedLater = laterDraft;
    first.auth.clearSession(); first.factory.retire();
    const { factory, state } = await login();
    const record = JSON.parse(retainedJson);
    const pending = factory.recover(record);
    record.snapshotText = laterDraft; record.expectedRevision = 999;
    const recovered = await pending;
    expect(recovered.kind).toBe('historical_acknowledgment');
    expect(recovered.original).toEqual(original);
    expect(recovered.receipt).toEqual(expectedReceipt);
    expect(recovered.receipt.requestHash).toBe(requestHash);
    expect(recovered.isCurrent()).toBe(true);
    expect(Object.isFrozen(recovered.original)).toBe(true);
    expect(Object.isFrozen(recovered.receipt.document)).toBe(true);
    expect(laterDraft).toBe(retainedLater);
    expect(retainedJson).toBe(JSON.stringify(original));
    expect(Object.keys(factory).sort()).toEqual(['isCurrent', 'recover', 'retire', 'subscribeRetirement']);
    expect(Reflect.get(recovered, 'update')).toBeUndefined();
    expect(Reflect.get(recovered.receipt, 'selectedPinsChanged')).toBeUndefined();
    expect(state.calls).toHaveLength(1);
    const call = state.calls[0];
    expect([call.url, call.method, call.body]).toEqual([path, 'GET', '']);
    expect(call.headers.get('authorization')).toBe('Bearer synthetic-reload-current');
    expect(call.request.redirect).toBe('error');
    expect(call.request.credentials).toBe('omit');
    expect(first.state.calls).toHaveLength(0);
  });

  it.each([
    null, {}, { ...original, tenantId: '../foreign' }, { ...original, workspaceId: 'foreign' },
    { ...original, documentId: 'foreign' }, { ...original, expectedRevision: 0 },
    { ...original, expectedRevision: Number.MAX_SAFE_INTEGER }, { ...original, expectedRevision: 7.5 },
    { ...original, expectedSnapshotHash: 'fake' }, { ...original, expectedPriorPinDigest: 'fake' },
    { ...original, schemaAction: 'create' }, { ...original, idempotencyKey: '../other' },
    { ...original, idempotencyKey: 'x'.repeat(121) }, { ...original, snapshotText: ' '.repeat(524289) },
    { ...original, snapshotText: snapshotText + '\ud800' }, { ...original, snapshotText: '{}' },
    { ...original, snapshotText: snapshotText.replace('"version":2', '"version":1') },
    { ...original, tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' },
    { ...original, token: 'forged' }, { ...original, role: 'owner' }, { ...original, requestHash },
    { ...original, approval: { approved: true } }, { ...original, fetch: 'other' }, { ...original, origin: 'http://other.test' },
  ])('refuses malformed original/foreign scope/caller authority before service GET', async input => {
    const { factory, state } = await login();
    await expect(factory.recover(input)).rejects.toBeInstanceOf(Error);
    expect(state.calls).toHaveLength(0);
  });

  it('refuses a native2 candidate without an exact page identity before receipt GET', async () => {
    const file = JSON.parse(snapshotText);
    delete file.document.attributes.pageId;
    const { factory, state } = await login();
    await expect(factory.recover({ ...original, snapshotText: JSON.stringify(file) })).rejects.toMatchObject({ code: 'invalid_candidate' });
    expect(state.calls).toHaveLength(0);
  });

  it.each(['schemaAction', 'expectedRevision', 'expectedSnapshotHash', 'expectedPriorPinDigest', 'snapshotText'])('refuses an original operation with mismatched %s despite a legitimate old receipt', async field => {
    const { factory } = await login();
    const record = { ...original, [field]: field === 'schemaAction' ? 'preserve' : field === 'expectedRevision' ? 6 :
      field === 'snapshotText' ? snapshotText.trimEnd() : 'a'.repeat(64) };
    await expect(factory.recover(record)).rejects.toMatchObject({ code: 'invalid_service_response' });
  });

  it.each(['operation', 'idempotencyKey', 'requestHash', 'snapshotText', 'extra', 'missing',
    'tenantId', 'workspaceId', 'documentId', 'revision', 'snapshotHash', 'pageId', 'fileVersion', 'fileFormat', 'metadataRevision', 'mode'])('refuses wrong/partial/legacy receipt field %s', async field => {
    const reply = { ...expectedReceipt };
    if (['operation', 'idempotencyKey', 'requestHash', 'snapshotText', 'extra'].includes(field)) Object.defineProperty(reply, field, { value: 'forged', enumerable: true });
    else if (field === 'missing') Reflect.deleteProperty(reply, 'requestHash');
    else reply.document = { ...reply.document, [field]: 'forged' };
    const { factory, state } = await login({ handler: () => Response.json(reply) });
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'invalid_service_response' });
    expect(state.calls.map(call => call.method)).toEqual(['GET']);
  });

  it.each([401, 403, 404, 409, 503])('preserves current service denial/absence %s and performs no retry or writer restoration', async status => {
    const { factory, state } = await login({ handler: () => Response.json({ status: 'mode_conflict' }, { status }) });
    await expect(factory.recover(original)).rejects.toBeInstanceOf(Error);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].method).toBe('GET');
  });

  it('private logout synchronously retires result/factory without another query/render and does not grant writing from the receipt', async () => {
    const { auth, factory, state } = await login();
    const value = await factory.recover(original);
    const notified = vi.fn(), factoryNotice = vi.fn(), removed = vi.fn();
    value.subscribeRetirement(notified); factory.subscribeRetirement(factoryNotice);
    const stop = value.subscribeRetirement(removed); stop(); stop();
    auth.clearSession();
    expect(notified).toHaveBeenCalledTimes(1); expect(factoryNotice).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    value.retire(); factory.retire(); auth.clearSession();
    expect(notified).toHaveBeenCalledTimes(1);
    const late = vi.fn(); value.subscribeRetirement(late)();
    expect(late).toHaveBeenCalledTimes(1);
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'cancelled' });
    expect(state.calls).toHaveLength(1);
  });

  it('retires at exact captured expiry without polling or a host event', async () => {
    vi.useFakeTimers();
    const { factory, state } = await login({ expiresIn: 1 });
    const value = await factory.recover(original);
    const notify = vi.fn(); value.subscribeRetirement(notify);
    vi.advanceTimersByTime(999); expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(notify).toHaveBeenCalledTimes(1);
    expect(value.isCurrent()).toBe(false);
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'cancelled' });
    expect(state.calls).toHaveLength(1);
  });

  it('same-token login replacement terminally retires historical results', async () => {
    const { auth, factory } = await login();
    const value = await factory.recover(original);
    const notify = vi.fn(); value.subscribeRetirement(notify);
    sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'next', verifier: 'next', intent: 'user' }));
    history.replaceState(null, '', '/auth/callback?state=next&code=code');
    await auth.finishLogin();
    expect(notify).toHaveBeenCalledTimes(1); expect(value.isCurrent()).toBe(false);
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('explicit result retirement preserves factory; a new lookup permanently retires only the previous result', async () => {
    const { factory } = await login();
    const one = await factory.recover(original);
    one.retire(); expect(factory.isCurrent()).toBe(true);
    const two = await factory.recover(original);
    const notify = vi.fn(); two.subscribeRetirement(notify);
    const three = await factory.recover(original);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(two.isCurrent()).toBe(false); expect(three.isCurrent()).toBe(true);
    factory.retire(); expect(three.isCurrent()).toBe(false);
  });

  it('aborts held headers on host retirement and cancels an ignored-abort late response', async () => {
    const { factory, state } = await login();
    let reply!: (response: Response) => void, enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    state.handler = () => new Promise(resolve => { reply = resolve; enter(); });
    const pending = factory.recover(original);
    const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await entered; factory.retire(); await caught;
    const cancel = vi.fn(); reply(new Response(new ReadableStream({ cancel })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state.calls.map(call => call.method)).toEqual(['GET']);
  });

  it('newer lookup retires a pending older response; only the later request can be current', async () => {
    const { factory, state } = await login();
    let reply!: (response: Response) => void, enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    let count = 0;
    state.handler = () => ++count === 1 ? new Promise(resolve => { reply = resolve; enter(); }) : Response.json(expectedReceipt);
    const pending = factory.recover(original);
    const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await entered;
    const next = await factory.recover(original);
    await caught; reply(Response.json(expectedReceipt));
    expect(next.isCurrent()).toBe(true);
    expect(state.calls).toHaveLength(2);
    expect(state.calls.every(call => call.method === 'GET')).toBe(true);
  });

  it('aborts a held response body at 10 seconds without retiring the current login factory', async () => {
    const { factory, state } = await login();
    vi.useFakeTimers();
    let enter!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; });
    const cancel = vi.fn();
    state.handler = () => new Response(new ReadableStream({ pull() { enter(); }, cancel }));
    const pending = factory.recover(original);
    const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await entered; await vi.advanceTimersByTimeAsync(10000); await caught;
    expect(cancel).toHaveBeenCalledTimes(1); expect(factory.isCurrent()).toBe(true);
    expect(state.calls).toHaveLength(1);
  });

  it('refuses bounded, invalid UTF-8, duplicate-key and redirect replies without effects', async () => {
    const { factory, state } = await login();
    state.handler = () => new Response(new Uint8Array(1048577));
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'response_too_large' });
    state.handler = () => new Response(new Uint8Array([255]));
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'invalid_service_response' });
    state.handler = () => new Response(JSON.stringify(expectedReceipt).replace('"operation":"update"', '"operation":"create","operation":"update"'));
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'invalid_service_response' });
    state.handler = () => { const value = Response.json(expectedReceipt); Object.defineProperty(value, 'redirected', { value: true }); return value; };
    await expect(factory.recover(original)).rejects.toMatchObject({ code: 'invalid_service_response' });
    expect(state.calls.every(call => call.method === 'GET')).toBe(true);
  });
});
