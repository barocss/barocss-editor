// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';

const issuer = 'https://controlled-host.example.test';
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333', scope = { tenantId, workspaceId, documentId };
const root = `/api/v1/tenants/${tenantId}/note-native2`;
const raw = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A), targetRaw = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2);
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const priorPinDigest = sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId,
  'pinned', NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
const original = { ...scope, expectedRevision: 7, expectedSnapshotHash: sha(raw), expectedPriorPinDigest: priorPinDigest,
  snapshotText: targetRaw, schemaAction: 'adopt' as const, idempotencyKey: 'host:507' };
const requestHash = sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId, 'adopt',
  7, sha(raw), priorPinDigest, targetRaw]));
const head = { ...scope, product: 'note', title: 'Independent host source', creatorUserId: null, metadataRevision: 1,
  mode: 'snapshot', pageId: NATIVE_NOTE_FIXTURES.SOURCE_A.document.attributes.pageId,
  documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 7, snapshotHash: sha(raw) };
const receipt = { operation: 'update', idempotencyKey: original.idempotencyKey, requestHash,
  document: { ...head, revision: 8, snapshotHash: sha(targetRaw) }, snapshotText: targetRaw };
const decodedSource = { fileVersion: 2, document: NATIVE_NOTE_FIXTURES.SOURCE_A.document,
  savedAt: NATIVE_NOTE_FIXTURES.SOURCE_A.savedAt, schemaBundle: NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle };
const checks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'];
interface Call { path: string; method: string; body: string; request: Request }
interface State { calls: Call[]; effects: number; expiresIn: number; handler?: (call: Call) => Response | Promise<Response> | undefined }
const sessions: Array<{ clearSession(): void }> = [];
function hostBinding() {
  let authorized = true;
  const callbacks = new Set<() => void>();
  return { callbacks, binding: { isAuthorized: () => authorized,
    subscribeAuthority: (callback: () => void) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; } },
    retire: () => { authorized = false; [...callbacks].forEach(callback => callback()); }, restore: () => { authorized = true; } };
}
async function login(expiresIn = 3600) {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer); vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'controlled-host');
  const state: State = { calls: [], effects: 0, expiresIn };
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, location.origin) : input, init); }
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.pathname.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url.href === `${issuer}/token`) return Response.json({ access_token: 'controlled-host-memory', token_type: 'bearer', expires_in: state.expiresIn });
    const request = input instanceof Request ? input : new Request(input, init);
    const call = { path: url.pathname + url.search, method: request.method, body: await request.clone().text(), request };
    state.calls.push(call);
    const intercepted = state.handler?.(call); if (intercepted) return intercepted;
    if (url.pathname === '/api/v1/me') return Response.json({ issuer, subject: 'controlled-user', currentUserId: null,
      tenants: [{ tenantId, name: 'Controlled tenant', role: 'editor' }], nextCursor: null });
    if (url.pathname.endsWith('/access')) return Response.json({ tenantId, role: 'editor' });
    if (url.pathname.endsWith('/workspaces')) return Response.json({ workspaces: [{ id: workspaceId, name: 'Controlled workspace' }], nextCursor: null });
    if (url.pathname === `${root}/documents/${documentId}`) return Response.json({ document: head, snapshotText: raw });
    if (url.pathname.endsWith('/schema-bundle')) return Response.json({ status: 'pinned', documentId, documentRevision: 7,
      snapshotHash: sha(raw), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle });
    if (url.pathname.endsWith('/validation')) {
      const body = JSON.parse(call.body);
      return Response.json({ status: 'structurally_valid', kind: body.kind, documentId, documentRevision: 7,
        snapshotHash: sha(raw), priorPinDigest, checks: body.kind === 'document' ? checks :
          [...checks, 'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'],
        ...(body.kind === 'candidate' ? { candidateSnapshotHash: sha(targetRaw), action: 'adopt' } : {}) });
    }
    if (url.pathname.endsWith('/snapshot')) { state.effects++; return Response.json(receipt); }
    if (url.pathname === `${root}/receipts/update/${original.idempotencyKey}`) return Response.json(receipt);
    throw new Error(`Unexpected controlled route: ${call.path}`);
  }));
  const auth = await import('./auth-client'); sessions.push(auth);
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=state&code=code'); await auth.finishLogin();
  const api = await import('./native2-authenticated-host'), host = hostBinding();
  return { auth, api, host, state };
}
afterEach(() => {
  for (const auth of sessions.splice(0)) auth.clearSession();
  vi.doUnmock('./native2-authenticated-mutation');
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear();
});
const writes = (state: State) => state.calls.filter(call => call.method === 'POST' || call.method === 'PUT');

describe('current Office Note host seams (actual private producers, controlled network)', () => {
  it('creates no operation automatically; explicit current calls retain independent full source, fixed operation and historical receipt data', async () => {
    const { api, host, state } = await login();
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    expect(state.calls).toHaveLength(0); expect(host.callbacks.size).toBe(2);
    const context = await mutation.open(scope);
    expect(context.source.snapshotText).toBe(raw); expect(context.source.file).toEqual(decodedSource);
    const laterDraft = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const attempt = await context.prepare({ snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: original.idempotencyKey });
    expect(attempt.requestHash).toBe(requestHash); expect(attempt.expectedPriorPinDigest).toBe(priorPinDigest);
    expect(await context.validateSource()).toMatchObject({ status: 'structurally_valid', kind: 'document' });
    expect(await context.validate(attempt)).toMatchObject({ status: 'structurally_valid', action: 'adopt' });
    expect(state.effects).toBe(0);
    expect(await context.update(attempt)).toEqual({ ...receipt, selectedPinsChanged: true });
    expect(await context.recover(attempt)).toEqual({ ...receipt, selectedPinsChanged: true });
    const historical = await recovery.recover(JSON.parse(JSON.stringify(original)));
    expect(historical.receipt).toEqual(receipt); expect(historical.original).toEqual(original);
    expect(historical.kind).toBe('historical_acknowledgment'); expect(Reflect.get(historical, 'update')).toBeUndefined();
    expect(writes(state).map(call => call.method)).toEqual(['POST', 'POST', 'PUT']); expect(state.effects).toBe(1);
    expect(JSON.parse(writes(state)[2].body)).toEqual({ expectedRevision: 7, expectedSnapshotHash: sha(raw),
      expectedPriorPinDigest: priorPinDigest, snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: original.idempotencyKey });
    expect(laterDraft).toBe(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B));
    expect(context.source.file).toEqual(decodedSource);
  });

  it('rejects missing/unauthorized bindings and foreign or extra scope before any service operation', async () => {
    const { api, state, host } = await login();
    for (const binding of [undefined, {}, { isAuthorized: () => true }, { ...host.binding, isAuthorized: () => false }]) {
      await expect(api.noteMutationLeaseFactory(tenantId, workspaceId, binding)()).rejects.toMatchObject({ code: 'host_retired' });
      await expect(api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, binding)()).rejects.toMatchObject({ code: 'host_retired' });
    }
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    for (const changed of [{ ...scope, tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' },
      { ...scope, workspaceId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' }, { ...scope, role: 'owner' }]) {
      await expect(mutation.open(changed)).rejects.toMatchObject({ code: 'scope_forbidden' });
    }
    await expect(recovery.recover({ ...original, workspaceId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })).rejects.toMatchObject({ code: 'scope_forbidden' });
    await expect(recovery.recover({ ...original, token: 'forged' })).rejects.toMatchObject({ code: 'invalid_original' });
    expect(state.calls).toHaveLength(0);
  });

  it('copies restored scope once so a getter or a later draft cannot change the checked tenant/workspace', async () => {
    const { api, host, state } = await login();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    let count = 0;
    const input = { ...original, get workspaceId() { return ++count === 1 ? workspaceId : 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; } };
    expect((await recovery.recover(input)).original.workspaceId).toBe(workspaceId);
    expect(count).toBe(1); expect(state.calls.map(call => call.method)).toEqual(['GET']);
  });

  it('host loss terminally retires factories/context/result synchronously, releases subscriptions and cannot revive on a restored role', async () => {
    const { api, host, state } = await login();
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    const context = await mutation.open(scope), historical = await recovery.recover(original);
    const notices = [mutation, recovery, context, historical].map(value => { const callback = vi.fn(); value.subscribeRetirement(callback); return callback; });
    host.retire(); expect(notices.every(callback => callback.mock.calls.length === 1)).toBe(true);
    expect(host.callbacks.size).toBe(0);
    host.restore(); mutation.retire(); recovery.retire();
    expect(notices.every(callback => callback.mock.calls.length === 1)).toBe(true);
    const late = vi.fn(); context.subscribeRetirement(late)(); expect(late).toHaveBeenCalledTimes(1);
    const before = state.calls.length;
    await expect(context.prepare({ snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: 'retired' })).rejects.toMatchObject({ code: 'host_retired' });
    await expect(mutation.open(scope)).rejects.toMatchObject({ code: 'host_retired' });
    await expect(recovery.recover(original)).rejects.toMatchObject({ code: 'host_retired' });
    expect(state.calls).toHaveLength(before); expect(writes(state)).toHaveLength(0);
  });

  it.each(['logout', 'replacement', 'expiry'])('private producer %s retires the unchanged host wrappers without another query/render', async reason => {
    if (reason === 'expiry') vi.useFakeTimers();
    const { auth, api, host, state } = await login(reason === 'expiry' ? 1 : 3600);
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    const a = vi.fn(), b = vi.fn(); mutation.subscribeRetirement(a); recovery.subscribeRetirement(b);
    if (reason === 'logout') auth.clearSession();
    else if (reason === 'expiry') vi.advanceTimersByTime(1000);
    else {
      sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'next', verifier: 'next', intent: 'user' }));
      history.replaceState(null, '', '/auth/callback?state=next&code=code'); await auth.finishLogin();
    }
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1); expect(host.callbacks.size).toBe(0);
    await expect(mutation.open(scope)).rejects.toMatchObject({ code: 'host_retired' });
    await expect(recovery.recover(original)).rejects.toMatchObject({ code: 'host_retired' });
    expect(state.calls).toHaveLength(0);
  });

  it('keeps factory lifetime after result-only retirement and still refuses copied writer attempts', async () => {
    const { api, host, state } = await login();
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    const one = await mutation.open(scope); one.retire(); expect(mutation.isCurrent()).toBe(true);
    const two = await mutation.open(scope);
    const attempt = await two.prepare({ snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: original.idempotencyKey });
    await expect(two.update({ ...attempt })).rejects.toMatchObject({ code: 'foreign_attempt' });
    const old = await recovery.recover(original); old.retire(); expect(recovery.isCurrent()).toBe(true);
    expect((await recovery.recover(original)).isCurrent()).toBe(true); expect(writes(state)).toHaveLength(0);
  });

  it.each(['validation', 'snapshot', 'receipt'])('host retirement refuses held %s body without new retry/native effect or draft substitution', async operation => {
    const { api, host, state } = await login();
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const recovery = await api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, host.binding)();
    const context = await mutation.open(scope);
    const attempt = await context.prepare({ snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: original.idempotencyKey });
    const later = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B), cancel = vi.fn();
    let enter!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; });
    state.handler = call => {
      const selected = operation === 'receipt' ? call.path.includes('/receipts/update/') : call.path.endsWith(`/${operation}`);
      if (!selected) return undefined;
      if (operation === 'snapshot') state.effects++; // Already-entered controlled commit is not rolled back by host loss.
      return new Response(new ReadableStream({ pull: () => { enter(); }, cancel }, { highWaterMark: 0 }),
        { headers: { 'content-type': 'application/json' } });
    };
    const pending = operation === 'receipt' ? recovery.recover(original) : operation === 'snapshot' ? context.update(attempt) : context.validate(attempt);
    const caught = expect(pending).rejects.toMatchObject({ code: 'host_retired' });
    await entered; const before = state.calls.length; host.retire(); await caught;
    expect(cancel).toHaveBeenCalledTimes(1); expect(state.calls).toHaveLength(before);
    expect(state.effects).toBe(operation === 'snapshot' ? 1 : 0);
    expect(attempt.snapshotText).toBe(targetRaw); expect(later).toBe(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B));
  });

  it('cancels a late mutation response after held headers ignore host abort', async () => {
    const { api, host, state } = await login();
    const mutation = await api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const context = await mutation.open(scope);
    const attempt = await context.prepare({ snapshotText: targetRaw, schemaAction: 'adopt', idempotencyKey: original.idempotencyKey });
    let reply!: (response: Response) => void, enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    state.handler = call => call.method === 'PUT' ? new Promise(resolve => { reply = resolve; enter(); }) : undefined;
    const pending = context.update(attempt), caught = expect(pending).rejects.toMatchObject({ code: 'host_retired' });
    await entered; host.retire(); await caught;
    const cancel = vi.fn(); reply(new Response(new ReadableStream({ cancel })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1); expect(writes(state)).toHaveLength(1);
  });

  it('refuses a held producer import after host retirement before creating any usable factory or service operation', async () => {
    const { api, host, state } = await login();
    let release!: () => void, enter!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { enter = resolve; });
    vi.doMock('./native2-authenticated-mutation', async () => { enter(); await held; return vi.importActual('./native2-authenticated-mutation'); });
    const pending = api.noteMutationLeaseFactory(tenantId, workspaceId, host.binding)();
    const caught = expect(pending).rejects.toMatchObject({ code: 'host_retired' });
    await entered; host.retire(); release(); await caught;
    expect(host.callbacks.size).toBe(0); expect(state.calls).toHaveLength(0);
  });

  it('cleans a synchronously retired or throwing trusted host subscription without a dangling producer', async () => {
    const { api, state } = await login(); const stop = vi.fn();
    await expect(api.noteMutationLeaseFactory(tenantId, workspaceId, { isAuthorized: () => true,
      subscribeAuthority: callback => { callback(); return stop; } })()).rejects.toMatchObject({ code: 'host_retired' });
    expect(stop).toHaveBeenCalledTimes(1);
    await expect(api.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, { isAuthorized: () => true,
      subscribeAuthority: () => { throw new Error('Controlled broken subscription'); } })()).rejects.toThrow('Controlled broken subscription');
    expect(state.calls).toHaveLength(0);
  });

  it('records Note-only main assembly statically; actual joined consumer/browser acceptance remains separate', () => {
    const main = readFileSync('apps/office/src/main.tsx', 'utf8');
    expect(main).toContain("context.product === 'note' ? { currentUserId:");
    expect(main).toContain('createNative2MutationLease: noteMutationLeaseFactory(context.tenantId, context.workspaceId, binding)');
    expect(main).toContain('createNative2ReceiptRecoveryLease: noteReceiptRecoveryLeaseFactory(context.tenantId, context.workspaceId, binding)');
    expect(main).toContain('createNative2ReadLease: noteReadLeaseFactory(context.tenantId, context.workspaceId, binding)');
  });
});
