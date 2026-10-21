// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';
import type { Native2MutationInput } from './native2-authenticated-mutation';

const issuer = 'https://synthetic-idp.example.test';
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const scope = { tenantId, workspaceId, documentId };
const root = `/api/v1/tenants/${tenantId}/note-native2`;
const raw = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const targetRaw = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2);
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const hash = sha(raw);
const priorPinDigest = sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId,
  'pinned', NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
const head = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled original', creatorUserId: null,
  metadataRevision: 1, mode: 'snapshot', pageId: NATIVE_NOTE_FIXTURES.SOURCE_A.document.attributes.pageId,
  documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 7, snapshotHash: hash };
const candidate = (idempotencyKey = 'attempt:503') => ({ snapshotText: targetRaw, schemaAction: 'adopt' as const, idempotencyKey });
const checks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'];
const sessions: Array<{ clearSession(): void }> = [];
interface Call { path: string; method: string; body: string; headers: Headers; request: Request }
interface State {
  calls: Call[]; expiresIn: number; role: 'editor' | 'viewer';
  handler?: (call: Call) => Promise<Response> | Response;
  receipt?: Record<string, unknown>; effects: number; sourceReads: number;
}
function receipt(body: Record<string, unknown>): Record<string, unknown> {
  const snapshotText = body.snapshotText as string;
  return { operation: 'update', idempotencyKey: body.idempotencyKey, requestHash: sha(JSON.stringify([
    'note-native2-snapshot-v1', tenantId, workspaceId, documentId, body.schemaAction, body.expectedRevision,
    body.expectedSnapshotHash, body.expectedPriorPinDigest, snapshotText])),
  document: { ...head, revision: 8, snapshotHash: sha(snapshotText) }, snapshotText };
}
function validation(body: Record<string, unknown>) {
  return { status: 'structurally_valid', kind: body.kind, documentId, documentRevision: 7, snapshotHash: hash,
    priorPinDigest, checks: body.kind === 'document' ? checks : [...checks, 'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'],
    ...(body.kind === 'candidate' ? { candidateSnapshotHash: sha(body.snapshotText as string), action: body.intendedAction } : {}) };
}
async function login(overrides: Partial<State> = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer);
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const state: State = { calls: [], expiresIn: 3600, role: 'editor', effects: 0, sourceReads: 0, ...overrides };
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, location.origin) : input, init);
    }
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.href.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url.href === `${issuer}/token`) return Response.json({ access_token: 'synthetic-current', token_type: 'bearer', expires_in: state.expiresIn });
    const request = input instanceof Request ? input : new Request(input, init);
    const call: Call = { path: url.pathname + url.search, method: request.method,
      body: await request.clone().text(), headers: new Headers(init?.headers), request };
    state.calls.push(call);
    if (url.pathname === '/api/v1/me') return Response.json({ issuer, subject: 'controlled-person', currentUserId: null,
      tenants: [{ tenantId, name: 'Controlled tenant', role: state.role }], nextCursor: null });
    if (url.pathname.endsWith('/access')) return Response.json({ tenantId, role: state.role });
    if (url.pathname.endsWith('/workspaces')) return Response.json({ workspaces: [{ id: workspaceId, name: 'Controlled workspace' }], nextCursor: null });
    if (url.pathname === `${root}/documents/${documentId}`) {
      state.sourceReads++;
      return Response.json({ document: head, snapshotText: raw });
    }
    if (url.pathname.endsWith('/schema-bundle')) return Response.json({ status: 'pinned', documentId,
      documentRevision: 7, snapshotHash: hash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle });
    if (state.handler) return state.handler(call);
    if (url.pathname.endsWith('/validation')) return Response.json(validation(JSON.parse(call.body)));
    if (url.pathname.endsWith('/snapshot')) {
      const incoming = receipt(JSON.parse(call.body));
      if (state.receipt && state.receipt.requestHash !== incoming.requestHash) return Response.json({ status: 'key_reuse' }, { status: 409 });
      if (!state.receipt) { state.effects++; state.receipt = incoming; }
      return Response.json(state.receipt);
    }
    if (url.pathname.includes('/receipts/update/')) return state.receipt ? Response.json(state.receipt) : Response.json({ status: 'not_found' }, { status: 404 });
    throw new Error(`Unexpected controlled route ${call.path}`);
  }));
  const auth = await import('./auth-client');
  sessions.push(auth);
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=state&code=code');
  await auth.finishLogin();
  const api = await import('./native2-authenticated-mutation');
  const factory = api.createAuthenticatedNative2Mutation();
  const context = await factory.open(scope);
  return { auth, factory, context, state };
}
afterEach(() => {
  for (const session of sessions.splice(0)) session.clearSession();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear();
});
const writes = (state: State) => state.calls.filter(call => ['POST', 'PUT'].includes(call.method));

it('cancels a late response body when private context retirement races ignored-abort headers', async () => {
  const { context, state } = await login();
  let reply!: (response: Response) => void, enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  state.handler = () => new Promise(resolve => { reply = resolve; enter(); });
  const pending = context.validateSource(), caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await entered; context.retire(); await caught;
  const cancel = vi.fn(); reply(new Response(new ReadableStream({ cancel })));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(writes(state)).toHaveLength(1); expect(state.effects).toBe(0);
});

describe('Office-private fixed native2 transport (controlled HTTP responses)', () => {
  it('captures a current exact read, freezes independent raw hashes and uses only named same-origin operations', async () => {
    const { context, state } = await login();
    const input = candidate();
    const pending = context.prepare(input);
    input.snapshotText = raw;
    const attempt = await pending;
    expect(attempt).toMatchObject({ snapshotText: targetRaw, expectedRevision: 7, expectedSnapshotHash: hash, expectedPriorPinDigest: priorPinDigest,
      candidateSnapshotHash: sha(targetRaw), requestHash: sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId, 'adopt', 7, hash, priorPinDigest, targetRaw])) });
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(await context.validateSource()).toMatchObject({ status: 'structurally_valid', kind: 'document', checks });
    const validated = await context.validate(attempt);
    expect(validated).toMatchObject({ kind: 'candidate', action: 'adopt', candidateSnapshotHash: sha(targetRaw) });
    expect(state.effects).toBe(0);
    const saved = await context.update(attempt);
    expect(saved).toMatchObject({ operation: 'update', snapshotText: targetRaw, selectedPinsChanged: true });
    expect(saved.document.revision).toBe(8);
    expect(Object.isFrozen(saved.document)).toBe(true);
    expect(await context.recover(attempt)).toEqual(saved);
    for (const call of state.calls) {
      expect(call.headers.get('authorization')).toBe('Bearer synthetic-current');
      expect(call.request.url).toMatch(/^http:\/\/localhost.*\/api\/v1\//);
    }
    expect(writes(state).map(call => [call.method, call.path])).toEqual([
      ['POST', `${root}/documents/${documentId}/validation`], ['POST', `${root}/documents/${documentId}/validation`], ['PUT', `${root}/documents/${documentId}/snapshot`]]);
    expect(writes(state).every(call => call.request.redirect === 'error' && call.request.credentials === 'omit')).toBe(true);
    expect(state.sourceReads).toBe(1);
  });

  it('recovers committed reply loss without retry, inference, recapture or later-draft substitution; explicit retry reuses exact bytes', async () => {
    const { context, state } = await login();
    const attempt = await context.prepare(candidate());
    state.handler = call => {
      if (call.method === 'PUT') { state.receipt = receipt(JSON.parse(call.body)); state.effects++; throw new Error('Controlled lost committed ACK'); }
      return Response.json(state.receipt);
    };
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'unavailable' });
    const firstBody = writes(state)[0].body;
    await context.prepare({ snapshotText: raw, schemaAction: 'preserve', idempotencyKey: 'later-draft' });
    expect((await context.recover(attempt)).snapshotText).toBe(targetRaw);
    expect(writes(state)).toHaveLength(1);
    expect(state.effects).toBe(1);
    state.handler = undefined;
    await context.update(attempt);
    expect(writes(state)[1].body).toBe(firstBody);
    expect(state.effects).toBe(1);
    expect(state.sourceReads).toBe(1);
  });

  it('refuses changed fixed-key bytes and forged/cross-context attempts before any mutation', async () => {
    const { context, factory, state } = await login();
    const attempt = await context.prepare(candidate());
    await expect(context.prepare({ snapshotText: raw, schemaAction: 'preserve', idempotencyKey: attempt.idempotencyKey })).rejects.toMatchObject({ code: 'key_reuse' });
    await expect(context.update({ ...attempt })).rejects.toMatchObject({ code: 'foreign_attempt' });
    const next = await factory.open(scope);
    await expect(next.recover(attempt)).rejects.toMatchObject({ code: 'foreign_attempt' });
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'cancelled' });
    expect(writes(state)).toHaveLength(0);
  });

  it.each([
    { ...candidate(), snapshotText: '"bad"' },
    { ...candidate(), snapshotText: raw.replace('"version":2', '"version":1') },
    { ...candidate(), snapshotText: raw.replace('native2-note-A', 'foreign-page') },
    { ...candidate(), snapshotText: ' '.repeat(524289) },
    { ...candidate(), snapshotText: raw + '\ud800' },
    { ...candidate(), idempotencyKey: '../other' },
    { ...candidate(), schemaAction: 'preserve' },
    { ...candidate(), token: 'forged' },
  ])('refuses unsupported candidate or authority input without writes ($idempotencyKey)', async input => {
    const { context, state } = await login();
    await expect(context.prepare(input as Native2MutationInput)).rejects.toBeInstanceOf(Error);
    expect(writes(state)).toHaveLength(0);
  });

  it('labels noop adopt as no selected-pin change and preserves raw bytes without normalization', async () => {
    const { context } = await login();
    const attempt = await context.prepare({ snapshotText: raw + '\n', schemaAction: 'adopt', idempotencyKey: 'noop' });
    expect(attempt.candidateSnapshotHash).toBe(sha(raw + '\n'));
    expect((await context.update(attempt)).selectedPinsChanged).toBe(false);
  });

  it.each(['kind', 'documentId', 'documentRevision', 'snapshotHash', 'priorPinDigest', 'candidateSnapshotHash', 'action', 'checks', 'extra'])('refuses forged validation field %s; never produces a saved result', async field => {
    const { context, state } = await login();
    const attempt = await context.prepare(candidate());
    state.handler = call => Response.json({ ...validation(JSON.parse(call.body)), [field]: 'forged' });
    await expect(context.validate(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
    expect(state.effects).toBe(0);
    expect(writes(state).map(call => call.method)).toEqual(['POST']);
  });

  it.each(['operation', 'idempotencyKey', 'requestHash', 'snapshotText', 'extra', 'tenantId', 'workspaceId', 'documentId', 'revision', 'snapshotHash', 'pageId', 'fileVersion', 'missing'])('refuses forged update and recovery receipt %s', async field => {
    const { context, state } = await login();
    const attempt = await context.prepare(candidate());
    const valid = receipt({ ...attempt });
    if (['operation', 'idempotencyKey', 'requestHash', 'snapshotText', 'extra'].includes(field)) valid[field] = 'forged';
    else if (field === 'missing') delete valid.requestHash;
    else valid.document = { ...valid.document as object, [field]: 'forged' };
    state.handler = () => Response.json(valid);
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
    await expect(context.recover(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
  });

  it('refuses late completion after private logout, immediately retires and cancels a held body', async () => {
    const { auth, context, state } = await login();
    const attempt = await context.prepare(candidate());
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const cancel = vi.fn();
    state.handler = () => { entered(); return new Response(new ReadableStream({ cancel })); };
    const retired = vi.fn(); context.subscribeRetirement(retired);
    const pending = context.update(attempt);
    const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await ready;
    await Promise.resolve(); await Promise.resolve();
    auth.clearSession();
    await caught;
    expect(retired).toHaveBeenCalledTimes(1);
    expect(context.isCurrent()).toBe(false);
    await expect(context.recover(attempt)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('retires at the token deadline without a host rerender and refuses all subsequent operations', async () => {
    vi.useFakeTimers();
    const { context, state } = await login({ expiresIn: 1 });
    const attempt = await context.prepare(candidate());
    const retired = vi.fn(); context.subscribeRetirement(retired);
    const count = state.calls.length;
    vi.advanceTimersByTime(1000);
    expect(retired).toHaveBeenCalledTimes(1);
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'cancelled' });
    expect(state.calls).toHaveLength(count);
  });

  it.each([403, 409, 422, 404, 503])('preserves refusal/error %s without inferred success or automatic retry', async status => {
    const { context, state } = await login({ role: 'viewer' });
    const attempt = await context.prepare(candidate());
    state.handler = () => Response.json({ status: 'revision_conflict' }, { status });
    await expect(context.update(attempt)).rejects.toBeInstanceOf(Error);
    expect(writes(state)).toHaveLength(1);
    expect(state.effects).toBe(0);
  });

  it('bounds streamed replies and refuses redirected/invalid UTF-8 bodies', async () => {
    const { context, state } = await login();
    const attempt = await context.prepare(candidate());
    state.handler = () => new Response(new Uint8Array(2097153));
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'response_too_large' });
    state.handler = () => new Response(new Uint8Array([255]));
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
    state.handler = () => { const response = Response.json(receipt({ ...attempt })); Object.defineProperty(response, 'redirected', { value: true }); return response; };
    await expect(context.update(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
  });
});

it('refuses foreign scope before a native write and retires an explicit host/source result', async () => {
  const { factory, context, state } = await login();
  const attempt = await context.prepare(candidate());
  const notify = vi.fn(); context.subscribeRetirement(notify);
  context.retire(); context.retire();
  expect(notify).toHaveBeenCalledTimes(1);
  await expect(context.validate(attempt)).rejects.toMatchObject({ code: 'cancelled' });
  await expect(factory.open({ ...scope, tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })).rejects.toBeInstanceOf(Error);
  expect(writes(state)).toHaveLength(0);
});

it('refuses account replacement with the same token string and future late headers', async () => {
  const { auth, context, state } = await login();
  const attempt = await context.prepare(candidate());
  let respond!: (response: Response) => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  state.handler = () => new Promise<Response>(resolve => { respond = resolve; enter(); });
  const pending = context.update(attempt);
  const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await entered;
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'next', verifier: 'next', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=next&code=code');
  await auth.finishLogin();
  await caught;
  respond(Response.json(receipt({ ...attempt })));
  expect(context.isCurrent()).toBe(false);
  expect(writes(state)).toHaveLength(1);
});

it('cancels a stalled response body at the 10-second transport bound', async () => {
  const { context, state } = await login();
  const attempt = await context.prepare(candidate());
  vi.useFakeTimers();
  let reading!: () => void;
  const entered = new Promise<void>(resolve => { reading = resolve; });
  const cancel = vi.fn();
  state.handler = () => new Response(new ReadableStream({ pull() { reading(); }, cancel }));
  const pending = context.update(attempt);
  const caught = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await entered;
  await vi.advanceTimersByTimeAsync(10000);
  await caught;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(context.isCurrent()).toBe(true);
  expect(writes(state)).toHaveLength(1);
});

it('rejects duplicate response keys rather than normalizing them into a successful receipt', async () => {
  const { context, state } = await login();
  const attempt = await context.prepare(candidate());
  state.handler = () => new Response(JSON.stringify(receipt({ ...attempt })).replace('"operation":"update"', '"operation":"create","operation":"update"'));
  await expect(context.recover(attempt)).rejects.toMatchObject({ code: 'invalid_service_response' });
});

it('pure shared receipt correlation does not restore a private writer brand', async () => {
  const { context, state } = await login();
  const attempt = await context.prepare(candidate());
  const { verifyNative2UpdateReceipt } = await import('./native2-authenticated-mutation');
  const historical = verifyNative2UpdateReceipt(receipt({ ...attempt }), { ...attempt, tenantId, workspaceId,
    documentId, pageId: head.pageId });
  expect(historical).toMatchObject({ operation: 'update', requestHash: attempt.requestHash, snapshotText: targetRaw });
  expect(Object.isFrozen(historical.document)).toBe(true);
  expect(Reflect.get(historical, 'update')).toBeUndefined();
  expect(Reflect.get(historical, 'selectedPinsChanged')).toBeUndefined();
  await expect(Reflect.apply(context.update, context, [historical])).rejects.toMatchObject({ code: 'foreign_attempt' });
  expect(writes(state)).toHaveLength(0);
});
