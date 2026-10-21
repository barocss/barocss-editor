// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';

const issuer = 'https://synthetic-idp.example.test';
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const currentUserId = '44444444-4444-4444-8444-444444444444';
const scope = { tenantId, workspaceId, documentId };
const original = NATIVE_NOTE_FIXTURES.SOURCE_A;
const raw = JSON.stringify(original);
const snapshotHash = createHash('sha256').update(raw).digest('hex');
const head = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled full original',
  creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: original.document.attributes.pageId,
  documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2,
  revision: 1, snapshotHash };
const opened = { document: head, snapshotText: raw };
const pinned = { status: 'pinned', documentId, documentRevision: 1, snapshotHash,
  nativeFormat: { format: 'barocss-note', version: 2 }, bundle: original.schemaBundle };

interface ControlledState {
  role: 'editor' | 'viewer';
  workspaces: string[];
  expiresIn: number;
  afterBundle?: () => void;
  onDocumentResponse?: (response: Response) => Response;
  calls: Array<{ path: string; method: string; authPresent: boolean }>;
}

const sessions: Array<{ clearSession: () => void }> = [];

async function login(overrides: Partial<ControlledState> = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer);
  vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'synthetic-browser');
  const state: ControlledState = { role: 'editor', workspaces: [workspaceId], expiresIn: 3600, calls: [], ...overrides };
  const fetchMock = vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.href.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` });
    if (url.href === `${issuer}/token`) return Response.json({ access_token: 'synthetic-current',
      token_type: 'bearer', expires_in: state.expiresIn });
    const headers = new Headers(init?.headers);
    state.calls.push({ path: url.pathname + url.search, method: input instanceof Request ? input.method : init?.method ?? 'GET',
      authPresent: headers.has('authorization') });
    if (url.pathname === '/api/v1/me') return Response.json({ issuer, subject: 'current-person', currentUserId,
      tenants: [{ tenantId, name: 'Controlled tenant', role: state.role }], nextCursor: null });
    if (url.pathname === `/api/v1/tenants/${tenantId}/access`) return Response.json({ tenantId, role: state.role });
    if (url.pathname === `/api/v1/tenants/${tenantId}/workspaces`) return Response.json({
      workspaces: state.workspaces.map(id => ({ id, name: 'Controlled workspace' })), nextCursor: null });
    if (url.pathname === `/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}`) {
      const response = Response.json(opened);
      return state.onDocumentResponse?.(response) ?? response;
    }
    if (url.pathname === `/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}/schema-bundle`) {
      state.afterBundle?.();
      return Response.json(pinned);
    }
    throw new Error(`Unexpected controlled route: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, location.origin) : input, init);
    }
  });
  const auth = await import('./auth-client');
  sessions.push(auth);
  sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
  history.replaceState(null, '', '/auth/callback?state=state&code=code');
  await auth.finishLogin();
  const reader = await import('./native2-authenticated-reader');
  return { auth, reader, state, fetchMock };
}

afterEach(() => { for (const session of sessions.splice(0)) session.clearSession(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('authenticated Office-private native2 read', () => {
  it('notifies both read lifetimes synchronously on private session clear without a currentness query or host render', async () => {
    const { auth, reader, state } = await login();
    const factory = reader.createAuthenticatedNative2Reader();
    const result = await factory.open(scope);
    const onFactory = vi.fn(), onResult = vi.fn(), removed = vi.fn();
    factory.subscribeRetirement(onFactory);
    result.subscribeRetirement(onResult);
    const unsubscribe = result.subscribeRetirement(removed);
    unsubscribe(); unsubscribe();
    const requestCount = state.calls.length;
    auth.clearSession();
    expect(onFactory).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(state.calls).toHaveLength(requestCount);
    auth.clearSession(); factory.retire(); result.retire();
    expect(onFactory).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    result.subscribeRetirement(late)();
    expect(late).toHaveBeenCalledTimes(1);
    expect(result.isCurrent()).toBe(false);
  });

  it('notifies at the captured expiry deadline without another request or currentness query', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    const { reader, state } = await login({ expiresIn: 1 });
    const factory = reader.createAuthenticatedNative2Reader();
    const result = await factory.open(scope);
    const onFactory = vi.fn(), onResult = vi.fn();
    factory.subscribeRetirement(onFactory);
    result.subscribeRetirement(onResult);
    const requestCount = state.calls.length;
    vi.advanceTimersByTime(999);
    expect(onFactory).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFactory).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(state.calls).toHaveLength(requestCount);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('permanently retires the old reader on login replacement even when the controlled token string is unchanged', async () => {
    const { auth, reader } = await login();
    const factory = reader.createAuthenticatedNative2Reader();
    const result = await factory.open(scope);
    const retired = vi.fn();
    result.subscribeRetirement(retired);
    sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'next', verifier: 'next', intent: 'user' }));
    history.replaceState(null, '', '/auth/callback?state=next&code=code');
    await auth.finishLogin();
    expect(retired).toHaveBeenCalledTimes(1);
    expect(factory.isCurrent()).toBe(false);
    expect(result.isCurrent()).toBe(false);
    const current = reader.createAuthenticatedNative2Reader();
    expect((await current.open(scope)).isCurrent()).toBe(true);
    current.retire();
    expect(retired).toHaveBeenCalledTimes(1);
  });

  it('retires only the replaced result and keeps the factory and next result current', async () => {
    const { reader } = await login();
    const factory = reader.createAuthenticatedNative2Reader();
    const first = await factory.open(scope);
    const old = vi.fn(), parent = vi.fn();
    first.subscribeRetirement(old);
    factory.subscribeRetirement(parent);
    const pending = factory.open(scope);
    expect(old).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
    const next = await pending;
    const current = vi.fn();
    next.subscribeRetirement(current);
    first.retire();
    expect(next.isCurrent()).toBe(true);
    next.retire(); next.retire();
    expect(current).toHaveBeenCalledTimes(1);
    expect(factory.isCurrent()).toBe(true);
    factory.retire();
    expect(parent).toHaveBeenCalledTimes(1);
    expect(old).toHaveBeenCalledTimes(1);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('delivers terminal subscriptions after a clock jump and removes explicitly retired timers', async () => {
    vi.useFakeTimers();
    const { reader } = await login({ expiresIn: 1 });
    const schedule = vi.spyOn(globalThis, 'setTimeout'), clear = vi.spyOn(globalThis, 'clearTimeout');
    const factory = reader.createAuthenticatedNative2Reader();
    const expiry = schedule.mock.results[0].value;
    const result = await factory.open(scope);
    const existing = vi.fn(), lateFactory = vi.fn(), lateResult = vi.fn();
    result.subscribeRetirement(existing);
    vi.setSystemTime(Date.now() + 2000);
    factory.subscribeRetirement(lateFactory)();
    result.subscribeRetirement(lateResult)();
    expect(existing).toHaveBeenCalledTimes(1);
    expect(lateFactory).toHaveBeenCalledTimes(1);
    expect(lateResult).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(expiry);
  });

  it('clears long bounded deadline timers on explicit retirement and keeps other observers notified after one throws', async () => {
    vi.useFakeTimers();
    const { auth, reader } = await login({ expiresIn: 3000000 });
    const schedule = vi.spyOn(globalThis, 'setTimeout'), clear = vi.spyOn(globalThis, 'clearTimeout');
    const factory = reader.createAuthenticatedNative2Reader();
    const result = await factory.open(scope);
    const next = vi.fn(), parent = vi.fn();
    result.subscribeRetirement(() => { throw new Error('controlled consumer fault'); });
    result.subscribeRetirement(next);
    factory.subscribeRetirement(parent);
    expect(schedule.mock.calls.filter(([, delay]) => delay === 2147483647)).toHaveLength(1);
    vi.advanceTimersByTime(2147483647);
    expect(next).not.toHaveBeenCalled();
    const expiry = schedule.mock.results.at(-1)?.value;
    expect(() => auth.clearSession()).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(parent).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(expiry);
  });

  it('notifies expiry while a native body is held and refuses its late delivery', async () => {
    vi.useFakeTimers();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const { reader } = await login({ expiresIn: 1, onDocumentResponse: response => {
      const text = response.text.bind(response);
      response.text = async () => { entered(); await held; return text(); };
      return response;
    } });
    const factory = reader.createAuthenticatedNative2Reader();
    const ended = vi.fn();
    factory.subscribeRetirement(ended);
    const pending = factory.open(scope);
    await waiting;
    vi.advanceTimersByTime(1000);
    expect(ended).toHaveBeenCalledTimes(1);
    release();
    await expect(pending).rejects.toMatchObject({ code: 'stale_native2_context' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns the exact full raw/native/bundle and server-derived readonly provenance from one memory login', async () => {
    const { reader, state } = await login();
    const factory = reader.createAuthenticatedNative2Reader();
    const result = await factory.open(scope);
    expect(result.read.document).toEqual(head);
    expect(result.read.snapshotText).toBe(raw);
    expect(result.read.file).toEqual({ fileVersion: 2, document: original.document,
      schemaBundle: original.schemaBundle, ...('savedAt' in original ? { savedAt: original.savedAt } : {}) });
    expect(result.provenance).toEqual({ issuer, subject: 'current-person', currentUserId,
      tenantId, workspaceId, documentId, role: 'editor' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(result.isCurrent()).toBe(true);
    expect(state.calls.every(call => call.method === 'GET' && call.authPresent)).toBe(true);
    expect(state.calls.filter(call => call.path.includes('note-native2')).map(call => call.path)).toEqual([
      `/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}`,
      `/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}/schema-bundle`]);
    result.retire(); result.retire();
    expect(result.isCurrent()).toBe(false);
    expect(factory.isCurrent()).toBe(true);
    factory.retire(); factory.retire();
    expect(factory.isCurrent()).toBe(false);
  });

  it('refuses anonymous, expired, foreign workspace and malformed scope before native requests', async () => {
    const { auth, reader, state } = await login();
    const factory = reader.createAuthenticatedNative2Reader();
    await expect(factory.open({ ...scope, documentId: 'not-a-uuid' })).rejects.toMatchObject({ kind: 'configuration' });
    state.workspaces = [];
    await expect(factory.open(scope)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(state.calls.some(call => call.path.includes('note-native2'))).toBe(false);
    auth.clearSession();
    expect(factory.isCurrent()).toBe(false);
    expect(() => reader.createAuthenticatedNative2Reader()).toThrow();
  });

  it('keeps one captured login and refuses account ABA or expiry', async () => {
    const { auth, reader } = await login();
    const old = reader.createAuthenticatedNative2Reader();
    auth.clearSession();
    expect(old.isCurrent()).toBe(false);
    await expect(old.open(scope)).rejects.toMatchObject({ kind: 'cancelled' });
    const current = await login({ expiresIn: 1 });
    const expiring = current.reader.createAuthenticatedNative2Reader();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 2000);
    expect(expiring.isCurrent()).toBe(false);
    await expect(expiring.open(scope)).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('refuses a changed current tenant role after the bundle without delivering a read', async () => {
    const { reader, state } = await login({ afterBundle: () => { state.role = 'viewer'; } });
    const factory = reader.createAuthenticatedNative2Reader();
    await expect(factory.open(scope)).rejects.toMatchObject({ kind: 'cancelled' });
    expect(state.calls.filter(call => call.path.includes('note-native2'))).toHaveLength(2);
  });

  it('does not deliver a held body after host retirement or a replacement read', async () => {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    let holdFirst = true;
    const { reader, state } = await login({ onDocumentResponse: response => {
      if (holdFirst) {
        holdFirst = false;
        const text = response.text.bind(response);
        response.text = async () => { entered(); await held; return text(); };
      }
      return response;
    } });
    const factory = reader.createAuthenticatedNative2Reader();
    const first = factory.open(scope);
    await waiting;
    const second = factory.open(scope);
    release();
    await expect(first).rejects.toMatchObject({ code: 'stale_native2_context' });
    const current = await second;
    expect(current.read.snapshotText).toBe(raw);
    factory.retire();
    expect(current.isCurrent()).toBe(false);
    expect(state.calls.filter(call => call.path.includes('note-native2')).length).toBe(3);
  });

  it('allows only exact same-origin read metadata/native2 routes through the sibling lease', async () => {
    const { auth, state } = await login();
    const lease = auth.captureNative2ReadSession();
    const count = state.calls.length;
    for (const [path, init] of [
      [`/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}`, { method: 'PUT' }],
      [`/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}?x=1`, { method: 'GET' }],
      [`/api/v1/me?after=${documentId}`, { method: 'GET' }],
      ['https://foreign.example.test/api/v1/me', { method: 'GET' }],
      ['/api/v1/tenants/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/registry/versions', { method: 'GET' }],
    ] as const) {
      await expect(lease.requestFetch(path, init)).rejects.toMatchObject({ kind: 'configuration' });
    }
    expect(state.calls).toHaveLength(count);
    lease.retire(); lease.retire();
    expect(lease.isCurrent()).toBe(false);
    await expect(lease.requestFetch('/api/v1/me')).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
