import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { startAccountMode } from './account-mode.ts';
import type { AccountModeOptions } from './account-mode.ts';
import type { AuthClientPort, SheetAccountIdentity } from './account-login.ts';
import type { SheetRelayAccountAdmissionResponse } from '../../src/sheet-preview-protocol.ts';

// Minimal Node DOM and captured-session models. This is not real browser, OIDC, PG or native editor proof.
class Control extends EventTarget {
  hidden = false; inert = false; disabled = false; href = ''; textContent = ''; value = '';
  children: Control[] = [];
  replaceChildren(...children: Control[]): void { this.children = children; this.value = children[0]?.value ?? ''; }
}
class Button extends Control { click(): void { if (!this.disabled) this.dispatchEvent(new Event('click')); } }
class Select extends Control {}
class Input extends Control {}
class Anchor extends Control {}
const tenantId = '22222222-2222-4222-8222-222222222222';
const documentId = '44444444-4444-4444-8444-444444444444';
const identity: SheetAccountIdentity = { issuer: 'https://identity.example.test/realm', subject: 'account-a',
  currentUserId: '11111111-1111-4111-8111-111111111111', tenants: [
    { tenantId, name: 'Actual company A', role: 'editor' },
    { tenantId: '66666666-6666-4666-8666-666666666666', name: 'Actual company B', role: 'viewer' },
  ] };
function response(): SheetRelayAccountAdmissionResponse {
  const now = Date.now();
  return { protocolVersion: 1, ticket: 'a'.repeat(64), expiresAt: now + 5_000, grantExpiresAt: now + 60_000,
    accountBinding: { issuer: identity.issuer, subject: identity.subject, userId: identity.currentUserId!, loginBindingId: '1'.repeat(64),
      tenantId, documentId, workspaceId: '33333333-3333-4333-8333-333333333333' } };
}
function authModel() {
  const state = { current: true, loginCalls: 0, identityCalls: 0, clearCalls: 0, announceCalls: 0, captures: 0,
    requests: [] as { input: RequestInfo | URL; init: RequestInit | undefined }[],
    begin: async (): Promise<void> => {},
    identity: async (): Promise<SheetAccountIdentity> => structuredClone(identity),
    response: async (): Promise<Response> => new Response(JSON.stringify(response())),
  };
  const requestFetch: typeof fetch = async (input, init) => { state.requests.push({ input, init }); return state.response(); };
  const port: AuthClientPort = {
    beginLogin: async intent => { assert.equal(intent, 'user'); state.loginCalls++; return state.begin(); },
    finishLogin: async () => 'user', consumeResumeIntent: () => 'user', consumeLogoutReturn: () => false,
    loadIdentity: async () => { state.identityCalls++; return state.identity(); },
    confirmTenant: async requested => { assert.equal(requested, tenantId); return 'editor'; },
    listWorkspaces: async () => ({ items: [], nextCursor: null }),
    // Office captures an absent token without throwing; that capture stays invalid.
    captureAuthorizedSession: () => { state.captures++; const present = state.current; return { requestFetch, isCurrent: () => present && state.current }; },
    announceLogout: () => { state.announceCalls++; }, clearSession: () => { state.current = false; state.clearCalls++; },
    isLogoutEvent: event => event.key === 'modeled-office-logout',
  };
  return { port, state, requestFetch };
}
const ids = ['sheet-workbook', 'account-controls', 'session-label', 'preview-scope', 'account-status', 'account-sign-in',
  'alternative-panel', 'durable-controls', 'account-logout', 'account-open', 'account-tenant', 'account-document', 'account-fresh-login', 'account-identity'];
async function modeledPage(run: (page: {
  controls: Map<string, Control>; window: EventTarget; idbReads: () => number; socketOpens: () => number; rawRequests: () => number;
  replacements: string[]; start: (options?: AccountModeOptions) => Promise<void>;
}) => Promise<void>, href = 'http://127.0.0.1:55268/'): Promise<void> {
  const controls = new Map(ids.map(id => [id, id === 'account-tenant' ? new Select() : id === 'account-document' ? new Input() :
    id === 'account-fresh-login' ? new Anchor() : ['account-sign-in', 'account-logout', 'account-open'].includes(id) ? new Button() : new Control()]));
  controls.get('account-logout')!.disabled = true;
  controls.get('account-fresh-login')!.hidden = true;
  const window = new EventTarget(), storage = new Map<string, string>(), replacements: string[] = [];
  let idbReads = 0, socketOpens = 0, rawRequests = 0;
  const location = { origin: new URL(href).origin, pathname: new URL(href).pathname, href };
  const values: Record<string, unknown> = {
    window, document: { getElementById: (id: string) => controls.get(id), createElement: () => new Control(), querySelector: () => null }, location,
    history: { replaceState: (_state: unknown, _unused: string, target: string | URL) => {
      const url = new URL(String(target), location.origin); replacements.push(url.href); location.href = url.href; location.pathname = url.pathname;
    } }, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } },
    HTMLButtonElement: Button, HTMLSelectElement: Select, HTMLInputElement: Input, HTMLAnchorElement: Anchor,
    indexedDB: { open: () => { idbReads++; throw new Error('Private IDB must remain closed'); } },
    navigator: { locks: { request: async (_name: unknown, _options: unknown, callback: (lock: object) => Promise<void>) => callback({}) } },
    WebSocket: class { constructor() { socketOpens++; throw new Error('WS must remain closed'); } },
    fetch: () => { rawRequests++; throw new Error('Uncaptured fetch is prohibited'); },
  };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
    await run({ controls, window, idbReads: () => idbReads, socketOpens: () => socketOpens, rawRequests: () => rawRequests, replacements, start: options => startAccountMode(options) });
  } finally {
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
    await setImmediate();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
const button = (controls: Map<string, Control>, id: string): Button => controls.get(id)! as Button;

test('modeled account page hides its workbook and serializes sign in while canonical identity is pending', async () => {
  const auth = authModel(); let complete!: (value: SheetAccountIdentity) => void;
  auth.state.identity = () => new Promise(resolve => { complete = resolve; });
  await modeledPage(async page => {
    const started = page.start({ auth: auth.port });
    assert.equal(page.controls.get('sheet-workbook')!.hidden, true);
    assert.equal(page.controls.get('sheet-workbook')!.inert, true);
    assert.equal(page.idbReads(), 0); assert.equal(page.socketOpens(), 0);
    const signIn = button(page.controls, 'account-sign-in');
    signIn.click(); signIn.dispatchEvent(new Event('click'));
    const loginCallsDuringIdentity = auth.state.loginCalls;
    complete(structuredClone(identity)); await started;
    assert.equal(loginCallsDuringIdentity, 0, 'A pending canonical identity read must settle before another Office login starts.');
    assert.equal(page.idbReads(), 0); assert.equal(page.rawRequests(), 0);
  });
});

test('modeled missing Office session offers sign in without opening IDB or any network transport', async () => {
  const auth = authModel(); auth.state.current = false;
  await modeledPage(async page => {
    await page.start({ auth: auth.port });
    assert.match(page.controls.get('account-status')!.textContent, /Sign in to verify/);
    assert.equal(page.controls.get('account-sign-in')!.hidden, false);
    assert.equal(page.controls.get('account-sign-in')!.disabled, false);
    assert.equal(page.controls.get('account-fresh-login')!.hidden, true);
    assert.equal(auth.state.identityCalls, 0); assert.equal(auth.state.requests.length, 0);
    assert.equal(page.idbReads(), 0); assert.equal(page.socketOpens(), 0); assert.equal(page.rawRequests(), 0);
    button(page.controls, 'account-sign-in').click();
    assert.equal(auth.state.loginCalls, 1);
  });
});

test('modeled sign-in requests serialize while the existing Office login remains pending', async () => {
  const auth = authModel(); auth.state.current = false; let complete!: () => void;
  auth.state.begin = () => new Promise(resolve => { complete = resolve; });
  await modeledPage(async page => {
    await page.start({ auth: auth.port });
    const signIn = button(page.controls, 'account-sign-in'); signIn.click();
    signIn.dispatchEvent(new Event('click')); signIn.dispatchEvent(new Event('click'));
    assert.equal(auth.state.loginCalls, 1); assert.equal(page.idbReads(), 0); assert.equal(auth.state.requests.length, 0);
    complete(); await setImmediate();
    assert.equal(page.replacements.every(value => !value.includes('ticket') && !value.includes('Bearer')), true);
  });
});

test('modeled account page displays tenants from the canonical identity response', async () => {
  const auth = authModel();
  await modeledPage(async page => {
    await page.start({ auth: auth.port });
    assert.equal(auth.state.identityCalls, 1);
    assert.deepEqual(page.controls.get('account-tenant')!.children.map(option => [option.value, option.textContent]), identity.tenants.map(item => [item.tenantId, item.name]));
    assert.equal(page.controls.get('account-identity')!.textContent, `Account: ${identity.currentUserId}`);
    assert.equal(page.controls.get('account-open')!.disabled, false);
    assert.equal(page.controls.get('account-sign-in')!.hidden, true);
    assert.equal(page.idbReads(), 0); assert.equal(page.socketOpens(), 0);
  });
});

test('modeled foreign admission is refused before private IDB or WebSocket opens', async () => {
  const auth = authModel(); auth.state.response = async () => new Response(JSON.stringify({ ...response(), accountBinding: { ...response().accountBinding, subject: 'account-b' } }));
  await modeledPage(async page => {
    await page.start({ auth: auth.port }); await setImmediate();
    assert.equal(auth.state.requests.length, 1);
    assert.match(page.controls.get('account-status')!.textContent, /refused or unavailable/);
    assert.equal(page.idbReads(), 0); assert.equal(page.socketOpens(), 0); assert.equal(page.rawRequests(), 0);
    assert.equal(page.controls.get('sheet-workbook')!.hidden, true);
  }, `http://127.0.0.1:55268/?tenant=${tenantId}&document=${documentId}`);
});

test('modeled storage logout fences a held real Response body before IDB or WebSocket opens', async () => {
  const auth = authModel(); let body!: ReadableStreamDefaultController<Uint8Array>;
  auth.state.response = async () => new Response(new ReadableStream<Uint8Array>({ start: controller => { body = controller; } }));
  await modeledPage(async page => {
    await page.start({ auth: auth.port }); await setImmediate();
    assert.equal(auth.state.requests.length, 1);
    page.window.dispatchEvent(Object.assign(new Event('storage'), { key: 'modeled-office-logout' }));
    body.enqueue(new TextEncoder().encode(JSON.stringify(response()))); body.close(); await setImmediate();
    assert.equal(auth.state.clearCalls, 1); assert.equal(page.idbReads(), 0); assert.equal(page.socketOpens(), 0);
    assert.equal(page.controls.get('sheet-workbook')!.hidden, true);
    assert.equal(page.controls.get('account-identity')!.textContent, '');
    assert.equal(page.controls.get('account-open')!.disabled, true);
  }, `http://127.0.0.1:55268/?tenant=${tenantId}&document=${documentId}`);
});

test('modeled injected logout hides the workbook and retires local identity before the owner callback, and accepts only strict confirmation', async () => {
  for (const confirmed of [true, false, 'unexpected-truthy'] as const) {
    const auth = authModel(); let complete!: (value: unknown) => void; let calls = 0;
    let snapshot: { hidden: boolean; inert: boolean; identity: string; sameFetch: boolean; privateGlobals: boolean } | undefined;
    await modeledPage(async page => {
      await page.start({ auth: auth.port, logout: requestFetch => {
        calls++; snapshot = { sameFetch: requestFetch === auth.requestFetch, hidden: page.controls.get('sheet-workbook')!.hidden,
          inert: page.controls.get('sheet-workbook')!.inert, identity: page.controls.get('account-identity')!.textContent,
          privateGlobals: Object.hasOwn(page.window, 'sheetPreview') || Object.hasOwn(page.window, 'sheetDurable') };
        return new Promise<boolean>(resolve => { complete = value => { resolve(value as boolean); }; });
      } });
      // Model an already displayed workbook. Native/editor correctness is outside this privacy-state test.
      page.controls.get('sheet-workbook')!.hidden = false; page.controls.get('sheet-workbook')!.inert = false;
      Reflect.set(page.window, 'sheetPreview', { draft: 'model-private-draft' }); Reflect.set(page.window, 'sheetDurable', { packets: 'model-private-packets' });
      assert.equal(page.controls.get('account-logout')!.textContent, 'Sign out');
      button(page.controls, 'account-logout').click();
      assert.equal(calls, 1); assert.deepEqual(snapshot, { sameFetch: true, hidden: true, inert: true, identity: '', privateGlobals: false }); complete(confirmed); await setImmediate();
      assert.match(page.controls.get('account-status')!.textContent, confirmed === true ? /^Signed out\./ : /Provider logout is unconfirmed/);
      assert.equal(auth.state.clearCalls, 1); assert.equal(auth.state.announceCalls, 1);
      assert.equal(page.replacements.length, 0); assert.equal(auth.state.requests.length, 0); assert.equal(page.rawRequests(), 0);
    });
  }
});

test('modeled local session end reports unconfirmed provider logout without a fabricated server request or navigation', async () => {
  const auth = authModel();
  await modeledPage(async page => {
    await page.start({ auth: auth.port });
    assert.equal(page.controls.get('account-logout')!.textContent, 'End local session');
    button(page.controls, 'account-logout').click(); await setImmediate();
    assert.match(page.controls.get('account-status')!.textContent, /Provider logout is unconfirmed/);
    assert.equal(auth.state.clearCalls, 1); assert.equal(auth.state.announceCalls, 1);
    assert.equal(page.replacements.length, 0); assert.equal(auth.state.requests.length, 0); assert.equal(page.rawRequests(), 0);
  });
});
