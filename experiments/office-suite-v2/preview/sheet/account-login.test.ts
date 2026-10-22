import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetAccountLogin, readSheetReturnLocation, sheetReturnPath } from './account-login.ts';
import type { AccountLoginBrowser, AuthClientPort } from './account-login.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const target = { tenantId, documentId, clientId, new: true as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function model(initialCurrent = true) {
  let href = `https://sheet.example${sheetReturnPath(target)}`;
  let now = 1000;
  let current = initialCurrent;
  let storageListener: ((event: StorageEvent) => void) | undefined;
  const storage = new Map<string, string>();
  const timers = new Set<() => void>();
  const calls: string[] = [];
  let fetcher: typeof fetch = async () => Response.json({ ready: true });
  const browser: AccountLoginBrowser = {
    href: () => href,
    replace: path => { href = new URL(path, href).href; calls.push(`replace:${path}`); },
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); } },
    listenStorage: listener => { storageListener = listener; return () => { storageListener = undefined; }; },
    now: () => now,
    schedule: callback => { timers.add(callback); return () => { timers.delete(callback); }; },
  };
  const auth: AuthClientPort = {
    beginLogin: async (intent, force) => { calls.push(`begin:${intent}:${force}:${new URL(href).pathname}${new URL(href).search}`); },
    finishLogin: async () => { calls.push('finish'); browser.replace('/'); return 'user'; },
    consumeResumeIntent: () => 'user',
    consumeLogoutReturn: () => false,
    loadIdentity: async () => ({ issuer: 'https://issuer.example', subject: 'account-a', tenants: [] }),
    confirmTenant: async () => 'editor',
    listWorkspaces: async () => ({ items: [], nextCursor: null }),
    captureAuthorizedSession: () => ({ isCurrent: () => current, requestFetch: (input, init) => fetcher(input, init) }),
    clearSession: () => { current = false; calls.push('clear'); },
    announceLogout: () => { calls.push('announce'); },
    isLogoutEvent: event => event.key === 'wonffice.oidc.logout',
  };
  const login = new SheetAccountLogin(auth, browser);
  return { login, auth, browser, storage, calls,
    href: () => href,
    navigate: (value: string) => { href = value; },
    fetcher: (value: typeof fetch) => { fetcher = value; },
    switchAccount: () => { current = false; },
    establishAccount: () => { current = true; },
    advance: (time: number) => { now = time; for (const timer of [...timers]) timer(); },
    storageLogout: () => { storageListener?.({ key: 'wonffice.oidc.logout' } as StorageEvent); },
    hasListener: () => storageListener !== undefined,
  };
}

test('an absent initial Office session refuses private work without retiring the fresh sign-in page', async () => {
  const m = model(false);
  let retirements = 0;
  m.login.subscribeRetirement(() => { ++retirements; });
  await assert.rejects(m.login.loadIdentity());
  assert.equal(retirements, 0);
  assert.throws(() => m.login.captureAuthorizedSession());
  assert.equal(retirements, 0);
  await m.login.beginLogin(target);
  assert.ok(m.calls.includes('begin:user:false:/'));
  m.navigate('https://sheet.example/auth/callback?code=one-time&state=office-state');
  m.auth.finishLogin = async () => { m.establishAccount(); m.browser.replace('/'); return 'user'; };
  assert.deepEqual(await m.login.finishLogin(), target);
  const lease = m.login.captureAuthorizedSession(2000);
  assert.equal(lease.isCurrent(), true);
  m.switchAccount();
  assert.equal(lease.isCurrent(), false);
  assert.equal(retirements, 2); // Explicit begin retires once; the real account change retires again.
});

test('an invalid new capture still retires a previously authenticated Office session', () => {
  const m = model();
  let retirements = 0;
  m.login.subscribeRetirement(() => { ++retirements; });
  const lease = m.login.captureAuthorizedSession(2000);
  m.switchAccount();
  assert.throws(() => m.login.captureAuthorizedSession(), /retired/);
  assert.equal(retirements, 1);
  assert.equal(lease.isCurrent(), false);
});

test('validated Sheet location survives Office fixed root callback and preserves new-client intent', async () => {
  const m = model();
  await m.login.beginLogin(target, true);
  assert.ok(m.calls.includes('begin:user:true:/'));
  assert.equal(m.storage.size, 1);
  assert.ok(![...m.storage.values()].join('').includes('token'));
  m.navigate('https://sheet.example/auth/callback?code=one-time&state=office-state');
  assert.deepEqual(await m.login.finishLogin(), target);
  assert.equal(m.href(), `https://sheet.example${sheetReturnPath(target)}`);
  assert.equal(m.storage.size, 0);
});

test('return links reject foreign scope, duplicate or unknown fields and malformed identifiers', () => {
  for (const value of [
    'https://elsewhere.example/', '/auth/callback', '/?code=secret', '/#fragment',
    `/?tenant=${tenantId}`, `/?document=${documentId}`, '/?client=not-uuid',
    `/?client=${clientId}&client=${clientId}`, `/?client=${clientId}&new=0`, '/?new=1',
    `/?tenant=${tenantId}&document=${documentId}&role=owner`,
  ]) assert.throws(() => readSheetReturnLocation(value, 'https://sheet.example'), /Invalid|Incomplete/);
});

test('missing, corrupt and cross-origin saved callback state never supplies a document', async () => {
  for (const saved of [null, '{bad json', JSON.stringify({ version: 1, origin: 'https://elsewhere.example', path: '/' }), JSON.stringify({ version: 1, origin: 'https://sheet.example', path: '//elsewhere.example/' })]) {
    const m = model();
    if (saved) m.storage.set('wonffice.sheet.account-return-v1', saved);
    m.navigate('https://sheet.example/auth/callback?code=one-time');
    await assert.rejects(m.login.finishLogin());
    assert.ok(m.calls.includes('finish'));
    assert.equal(m.storage.size, 0);
    assert.equal(m.href(), 'https://sheet.example/');
  }
});

test('failed login restores requested location and removes its one-use return record', async () => {
  const m = model();
  m.auth.beginLogin = async () => { throw new Error('provider unavailable'); };
  await assert.rejects(m.login.beginLogin(target), /provider unavailable/);
  assert.equal(m.href(), `https://sheet.example${sheetReturnPath(target)}`);
  assert.equal(m.storage.size, 0);
});

test('explicit server expiry retires retained work without another HTTP request', async () => {
  const m = model();
  let retirements = 0;
  m.login.subscribeRetirement(() => { ++retirements; });
  const lease = m.login.captureAuthorizedSession(2000);
  lease.setExpiresAt(9000);
  m.advance(2000);
  assert.equal(lease.isCurrent(), false);
  assert.equal(retirements, 1);
  await assert.rejects(lease.requestFetch('https://sheet.example/api/v1/me'), /retired/);
});

test('account changes fence HTTP completion and decoded JSON before the caller can adopt it', async () => {
  const m = model();
  const response = deferred<Response>();
  m.fetcher(() => response.promise);
  const first = m.login.captureAuthorizedSession(2000);
  const request = first.requestFetch('https://sheet.example/api/v1/me');
  m.storageLogout();
  response.resolve(Response.json({ secret: 'old-account' }));
  await assert.rejects(request, /retired/);

  const other = model();
  const decoded = deferred<unknown>();
  const body = Response.json(null);
  body.json = () => decoded.promise;
  other.fetcher(async () => body);
  const lease = other.login.captureAuthorizedSession(2000);
  const result = await lease.requestFetch('https://sheet.example/api/v1/me');
  const json = result.json();
  other.switchAccount();
  decoded.resolve({ secret: 'old-account' });
  await assert.rejects(json, /retired/);
});

test('local logout freezes before authorized server request and confirms only its strict decoded success', async () => {
  const m = model();
  const lease = m.login.captureAuthorizedSession(2000);
  const pending = deferred<boolean>();
  const logout = m.login.logout(async requestFetch => {
    assert.equal(lease.isCurrent(), false);
    assert.ok((await requestFetch('https://sheet.example/api/v1/sheet/logout', { method: 'POST' })).ok);
    return pending.promise;
  });
  assert.equal(lease.isCurrent(), false);
  pending.resolve(true);
  assert.equal(await logout, 'confirmed');
  assert.deepEqual(m.calls, ['clear', 'announce']);
  assert.equal(m.href(), `https://sheet.example${sheetReturnPath(target)}`);
  assert.equal(await model().login.logout(), 'unconfirmed');
  const failed = model();
  assert.equal(await failed.login.logout(async () => { throw new Error('unavailable'); }), 'unconfirmed');
  assert.deepEqual(failed.calls, ['clear', 'announce']);
  const switched = model();
  assert.equal(await switched.login.logout(async () => { switched.storageLogout(); return true; }), 'unconfirmed');
});

test('logout while callback or metadata awaits prevents stale completion and disposal removes listener', async () => {
  const m = model();
  await m.login.beginLogin(target);
  m.navigate('https://sheet.example/auth/callback?code=one-time');
  const finish = deferred<'user'>();
  m.auth.finishLogin = () => finish.promise;
  const result = m.login.finishLogin();
  m.storageLogout();
  finish.resolve('user');
  await assert.rejects(result, /retired/);
  m.login.dispose();
  assert.equal(m.hasListener(), false);
  assert.throws(() => m.login.captureAuthorizedSession(), /disposed/);

  const other = model();
  const identity = deferred<Awaited<ReturnType<AuthClientPort['loadIdentity']>>>();
  other.auth.loadIdentity = () => identity.promise;
  const loading = other.login.loadIdentity();
  other.login.retire();
  identity.resolve({ issuer: 'https://issuer.example', subject: 'a', tenants: [] });
  await assert.rejects(loading, /retired/);
});

test('old logout completion cannot clear or announce logout for a newer completed login', async () => {
  const m = model(), server = deferred<boolean>();
  const oldLogout = m.login.logout(() => server.promise);
  await m.login.beginLogin(target);
  m.navigate('https://sheet.example/auth/callback?code=new-login');
  m.auth.finishLogin = async () => { m.establishAccount(); m.browser.replace('/'); return 'user'; };
  await m.login.finishLogin();
  const leaseB = m.login.captureAuthorizedSession(2000);
  const before = [...m.calls];
  server.resolve(true);
  assert.equal(await oldLogout, 'unconfirmed');
  assert.deepEqual(m.calls, before);
  assert.equal(leaseB.isCurrent(), true);
});

test('old failed begin cannot remove the newer login return context or restore its prior location', async () => {
  const m = model(), oldBegin = deferred<void>();
  let begins = 0;
  m.auth.beginLogin = () => ++begins === 1 ? oldBegin.promise : Promise.resolve();
  const first = m.login.beginLogin(target);
  const next = { ...target, clientId: '55555555-5555-4555-8555-555555555555' };
  await m.login.beginLogin(next);
  const ownedReturn = [...m.storage];
  oldBegin.reject(new Error('old-discovery-failed'));
  await assert.rejects(first, /old-discovery-failed/);
  assert.deepEqual([...m.storage], ownedReturn);
  assert.equal(m.href(), 'https://sheet.example/');
  m.navigate('https://sheet.example/auth/callback?code=new-login');
  assert.deepEqual(await m.login.finishLogin(), next);
});
