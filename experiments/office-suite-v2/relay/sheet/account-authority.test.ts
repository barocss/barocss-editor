import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { AccountAuthority } from './account-authority.ts';
import type { AccountSessionGate, AccountTokenVerifier, VerifiedAccountLogin } from './account-authority.ts';
import { RelayError } from './service.ts';

const token = 'private.access.token';
const initialClaims = { issuer: 'https://issuer.example/realm', subject: 'account-a', sessionId: 'login-a', expiresAt: 2000 };
const signal = () => new AbortController().signal;
const code = (expected: string, status: number) => (error: unknown): boolean => {
  assert(error instanceof RelayError); assert.equal(error.code, expected); assert.equal(error.status, status);
  assert.equal(error.message, expected); assert(!error.message.includes(token)); return true;
};
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('MODEL: proof is immutable, token-private, canonically bound; current repeats both authorities', async () => {
  const verified: string[] = [], gated: string[] = [];
  const authority = new AccountAuthority({
    verifier: { async verifySession(value) { verified.push(value); return initialClaims; } },
    sessionGate: async input => { gated.push(input.accessToken); assert.deepEqual(input, { accessToken: token, ...initialClaims }); return true; },
    clock: () => 1_000_000,
  });
  const proof = await authority.authenticate(token, signal());
  assert(Object.isFrozen(proof));
  assert.deepEqual(Object.keys(proof).sort(), ['expiresAt', 'issuer', 'loginBindingId', 'sessionId', 'subject']);
  assert.equal(proof.loginBindingId, createHash('sha256').update(JSON.stringify([
    'wonffice.sheet.login.v1', initialClaims.issuer, initialClaims.subject, initialClaims.sessionId,
  ])).digest('hex'));
  assert(!JSON.stringify(proof).includes(token)); assert.equal(JSON.stringify(authority), '{}');
  await authority.current(proof, signal()); assert.deepEqual(verified, [token, token]); assert.deepEqual(gated, [token, token]);
  await assert.rejects(authority.current({ ...proof }, signal()), code('account-authentication-denied', 401));
  const other = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => true });
  await assert.rejects(other.current(proof, signal()), code('account-authentication-denied', 401));
});

test('MODEL: malformed token, malformed verified claims, expiry, and verifier failures are sanitized', async () => {
  let calls = 0;
  const authority = new AccountAuthority({ verifier: { async verifySession() { calls++; return initialClaims; } }, sessionGate: async () => true, clock: () => 1_000_000 });
  for (const value of ['', 'one.two', 'one.two.three.four', 'one.two.=', `${'a'.repeat(8190)}.b.c`]) {
    await assert.rejects(authority.authenticate(value, signal()), code('account-authentication-denied', 401));
  }
  assert.equal(calls, 0);
  for (const claims of [
    { ...initialClaims, issuer: '' }, { ...initialClaims, subject: '' }, { ...initialClaims, sessionId: '' },
    { ...initialClaims, expiresAt: NaN }, { ...initialClaims, expiresAt: 1.1 },
    { ...initialClaims, expiresAt: Number.MAX_SAFE_INTEGER },
  ]) {
    const malformed = new AccountAuthority({ verifier: { async verifySession() { return claims; } }, sessionGate: async () => true, clock: () => 1_000_000 });
    await assert.rejects(malformed.authenticate(token, signal()), code('account-authentication-denied', 401));
  }
  for (const [failure, expected, status] of [
    [new Error('invalid_access_token'), 'account-authentication-denied', 401],
    [new Error('auth_provider_unavailable'), 'account-authority-unavailable', 503],
    [new Error(token), 'account-authority-unavailable', 503],
  ] as const) {
    const broken = new AccountAuthority({ verifier: { async verifySession() { throw failure; } }, sessionGate: async () => true });
    await assert.rejects(broken.authenticate(token, signal()), code(expected, status));
  }
  const expired = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => { throw new Error('must-not-run'); }, clock: () => 2_000_000 });
  await assert.rejects(expired.authenticate(token, signal()), code('account-session-expired', 401));
});

test('MODEL: current rejects changed original issuer, subject, sid, expiry and live provider revocation', async () => {
  for (const replacement of [
    { ...initialClaims, issuer: 'https://other.example/' }, { ...initialClaims, subject: 'account-b' },
    { ...initialClaims, sessionId: 'login-b' }, { ...initialClaims, expiresAt: 2001 },
  ]) {
    let claims = initialClaims, gateCalls = 0;
    const authority = new AccountAuthority({ verifier: { async verifySession() { return claims; } }, sessionGate: async () => { gateCalls++; return true; }, clock: () => 1_000_000 });
    const proof = await authority.authenticate(token, signal()); claims = replacement;
    await assert.rejects(authority.current(proof, signal()), code('account-authentication-denied', 401));
    assert.equal(gateCalls, 1);
  }
  let active = true;
  const authority = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => active, clock: () => 1_000_000 });
  const proof = await authority.authenticate(token, signal()); active = false;
  await assert.rejects(authority.current(proof, signal()), code('account-session-denied', 403));
  for (const gate of [async () => false, async () => { throw new Error(token); }] satisfies AccountSessionGate[]) {
    const denied = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: gate, clock: () => 1_000_000 });
    await assert.rejects(denied.authenticate(token, signal()), error => error instanceof RelayError && ['account-session-denied', 'account-authority-unavailable'].includes(error.code) && !error.message.includes(token));
  }
});

test('MODEL: verifier wait, live gate wait and current wait recheck expiry after each await', async () => {
  let now = 1_000_000;
  const afterVerify = new AccountAuthority({ verifier: { async verifySession() { now = 2_000_000; return initialClaims; } }, sessionGate: async () => { throw new Error('must-not-run'); }, clock: () => now });
  await assert.rejects(afterVerify.authenticate(token, signal()), code('account-session-expired', 401));
  now = 1_000_000;
  const afterGate = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => { now = 2_000_000; return true; }, clock: () => now });
  await assert.rejects(afterGate.authenticate(token, signal()), code('account-session-expired', 401));
  now = 1_000_000; let checkingCurrent = false;
  const current = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => { if (checkingCurrent) now = 2_000_000; return true; }, clock: () => now });
  const proof = await current.authenticate(token, signal()); checkingCurrent = true;
  await assert.rejects(current.current(proof, signal()), code('account-session-expired', 401));
});

test('MODEL: abort fences ignored verifier/gate signals, late completion cannot create a usable proof', async () => {
  for (const waitInGate of [false, true]) {
    const pending = deferred<boolean>(), controller = new AbortController(); let gateCalled = false;
    const authority = new AccountAuthority({ verifier: { async verifySession() { if (!waitInGate) await pending.promise; return initialClaims; } },
      sessionGate: async () => { gateCalled = true; if (waitInGate) await pending.promise; return true; }, clock: () => 1_000_000 });
    let received: VerifiedAccountLogin | undefined;
    const started = authority.authenticate(token, controller.signal).then(proof => { received = proof; });
    await new Promise<void>(resolve => setImmediate(resolve)); controller.abort();
    await assert.rejects(started, code('account-operation-aborted', 409));
    pending.resolve(true); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(received, undefined); assert.equal(gateCalled, waitInGate);
  }
  const aborted = new AbortController(); aborted.abort();
  const authority = new AccountAuthority({ verifier: { async verifySession() { throw new Error('must-not-run'); } }, sessionGate: async () => true });
  await assert.rejects(authority.authenticate(token, aborted.signal), code('account-operation-aborted', 409));
});

test('MODEL: the aggregate five-second deadline fences a verifier that ignores abort', async () => {
  const pending = deferred<boolean>(); let granted = false, verifierSignal: AbortSignal | undefined;
  const authority = new AccountAuthority({ verifier: { async verifySession() { await pending.promise; return initialClaims; } },
    sessionGate: async (_input, boundedSignal) => { verifierSignal = boundedSignal; granted = true; return true; }, clock: () => 1_000_000 });
  const started = Date.now();
  await assert.rejects(authority.authenticate(token, signal()), code('account-authority-unavailable', 503));
  assert(Date.now() - started < 6000); pending.resolve(true);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(granted, false); assert.equal(verifierSignal, undefined);
});

test('MODEL: logout targets only the verified sid and requires provider success then observed inactive', async () => {
  let active = true, logoutCalls = 0, verifyCalls = 0;
  const authority = new AccountAuthority({ verifier: { async verifySession(value) { assert.equal(value, token); verifyCalls++; return initialClaims; } },
    sessionGate: async () => active,
    logoutSession: async input => {
      logoutCalls++; assert.deepEqual(input, { accessToken: token, ...initialClaims });
      active = false; return true;
    }, clock: () => 1_000_000 });
  await authority.logout(token, signal()); assert.equal(logoutCalls, 1); assert.equal(verifyCalls, 1);
  // A second call still verifies the token and observes inactive; no extra provider mutation.
  await authority.logout(token, signal()); assert.equal(logoutCalls, 1); assert.equal(verifyCalls, 2);
  const originalInactive = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => false, clock: () => 1_000_000 });
  await originalInactive.logout(token, signal());
});

test('MODEL: logout fails closed for missing port, unconfirmed result, still-active session and authority outage', async () => {
  const base = { verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => true, clock: () => 1_000_000 };
  const noPort = new AccountAuthority(base);
  await assert.rejects(noPort.logout(token, signal()), code('account-logout-unconfirmed', 503));
  for (const logoutSession of [async () => false, async () => true]) {
    const unconfirmed = new AccountAuthority({ ...base, logoutSession });
    await assert.rejects(unconfirmed.logout(token, signal()), code('account-logout-unconfirmed', 503));
  }
  const failedProvider = new AccountAuthority({ ...base, logoutSession: async () => { throw new Error(token); } });
  await assert.rejects(failedProvider.logout(token, signal()), code('account-authority-unavailable', 503));
  const failedObservation = new AccountAuthority({ ...base, sessionGate: async () => { throw new Error(token); }, logoutSession: async () => true });
  await assert.rejects(failedObservation.logout(token, signal()), code('account-authority-unavailable', 503));
  const expired = new AccountAuthority({ ...base, clock: () => 2_000_000, logoutSession: async () => { throw new Error('must-not-run'); } });
  await assert.rejects(expired.logout(token, signal()), code('account-session-expired', 401));
});

test('MODEL: logout expiry and abort during provider mutation never confirm late success', async () => {
  let now = 1_000_000;
  const expiresDuring = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => true,
    logoutSession: async () => { now = 2_000_000; return true; }, clock: () => now });
  await assert.rejects(expiresDuring.logout(token, signal()), code('account-session-expired', 401));
  const pending = deferred<boolean>(), controller = new AbortController(); let returned = false;
  const aborted = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } }, sessionGate: async () => true,
    logoutSession: async () => pending.promise, clock: () => 1_000_000 });
  const started = aborted.logout(token, controller.signal).then(() => { returned = true; });
  await new Promise<void>(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(started, code('account-operation-aborted', 409));
  pending.resolve(true); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(returned, false);
});

test('SIGNED FIXTURE: existing configured OIDC verifier enforces signature, issuer, audience, token kind, expiry and sid', async () => {
  // The real implementation lives in a separate package with its own TS policy.
  // Load that runtime at the structural port rather than applying experiment-only
  // erasable-source flags to its transitive legacy implementation.
  const oidcModule: unknown = await import(new URL('../../../../apps/office-api/src/oidc.ts', import.meta.url).href);
  assert(typeof oidcModule === 'object' && oidcModule !== null && 'createOidcVerifier' in oidcModule);
  assert.equal(typeof oidcModule.createOidcVerifier, 'function');
  if (typeof oidcModule.createOidcVerifier !== 'function') throw new Error('existing-oidc-factory-required');
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const foreignKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'account-authority-fixture', use: 'sig', alg: 'RS256' };
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert(address && typeof address === 'object');
  const issuer = `http://127.0.0.1:${address.port}/realm`;
  const now = Math.floor(Date.now() / 1000);
  const base: Record<string, unknown> = { iss: issuer, sub: 'real-crypto-fixture-subject', aud: 'sheet-fixture', iat: now, exp: now + 120, typ: 'Bearer', sid: 'fixture-login' };
  const encode = (claims: Record<string, unknown>, foreign = false, algorithm = 'RS256'): string => {
    const header = Buffer.from(JSON.stringify({ alg: algorithm, kid: jwk.kid })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), foreign ? foreignKeys.privateKey : keys.privateKey).toString('base64url')}`;
  };
  let gateCalls = 0;
  function isTokenVerifier(value: unknown): value is AccountTokenVerifier {
    return typeof value === 'object' && value !== null && 'verifySession' in value && typeof value.verifySession === 'function';
  }
  try {
    const verifier: unknown = oidcModule.createOidcVerifier({ issuer, audience: 'sheet-fixture', jwksUrl: new URL(`${issuer}/jwks`), algorithms: ['RS256'], databaseUrl: 'postgresql://unused-model' });
    assert(isTokenVerifier(verifier), 'existing-oidc-session-verifier-required');
    const authority = new AccountAuthority({ verifier, sessionGate: async () => { gateCalls++; return true; } });
    const proof = await authority.authenticate(encode(base), signal()); assert.equal(proof.subject, base.sub);
    await authority.current(proof, signal()); assert.equal(gateCalls, 2);
    const missingSid = { ...base }; delete missingSid.sid;
    const missingExpiry = { ...base }; delete missingExpiry.exp;
    for (const invalid of [encode(base, true), encode(base, false, 'HS256'), encode({ ...base, iss: 'https://foreign.example/' }),
      encode({ ...base, aud: 'foreign-client' }), encode({ ...base, typ: 'ID' }), encode({ ...base, exp: now - 1 }), encode(missingSid), encode(missingExpiry)]) {
      await assert.rejects(authority.authenticate(invalid, signal()), code('account-authentication-denied', 401));
    }
    assert.equal(gateCalls, 2, 'invalid signed fixtures never reach the live session port');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

for (const pendingOperation of ['authenticate', 'current'] as const) {
  test(`MODEL: confirmed own logout fences ${pendingOperation} whose live gate was already waiting`, async () => {
    const entered = deferred<boolean>(), release = deferred<boolean>();
    let active = true, holdNext = false;
    const authority = new AccountAuthority({
      verifier: { async verifySession() { return initialClaims; } },
      sessionGate: async () => {
        const observed = active;
        if (holdNext) { holdNext = false; entered.resolve(true); await release.promise; }
        return observed;
      },
      logoutSession: async () => { active = false; return true; }, clock: () => 1_000_000,
    });
    const proof = await authority.authenticate(token, signal());
    holdNext = true;
    const work = pendingOperation === 'authenticate' ? authority.authenticate(token, signal()) : authority.current(proof, signal());
    const outcome = Promise.allSettled([work]);
    try {
      await entered.promise; await authority.logout(token, signal()); release.resolve(true);
      const [result] = await outcome;
      assert.equal(result?.status, 'rejected', 'a live response captured before confirmed logout cannot grant later authority');
      if (result?.status === 'rejected') assert(code('account-session-denied', 403)(result.reason));
    } finally { release.resolve(true); await outcome; }
  });
}

test('MODEL: absolute authority deadline fences a synchronous gate that blocks timer dispatch', async () => {
  let now = 1_000_000;
  const authority = new AccountAuthority({ verifier: { async verifySession() { return initialClaims; } },
    sessionGate: async () => { now += 5001; return true; }, clock: () => now });
  await assert.rejects(authority.authenticate(token, signal()), code('account-authority-unavailable', 503));
});
