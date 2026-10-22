import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountBindingGuard, accountNamespace, normalizeAccountBinding, sameAccountBinding } from './account-binding.ts';
import type { AccountBinding, AccountRetirement } from './account-binding.ts';

const binding: AccountBinding = {
  issuer: 'https://identity.example/realm', subject: 'account-a', userId: '10000000-0000-0000-0000-000000000001',
  loginBindingId: 'a'.repeat(64), tenantId: '20000000-0000-0000-0000-000000000001',
  workspaceId: '30000000-0000-0000-0000-000000000001', documentId: '40000000-0000-0000-0000-000000000001',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function model() {
  let now = 1000, current = true;
  const guard = new AccountBindingGuard({ binding, proofExpiresAt: 2000, now: () => now, isCurrent: () => current });
  return { guard, setTime: (value: number) => { now = value; }, setCurrent: (value: boolean) => { current = value; } };
}

test('scope is copied and frozen, with no credential, expiry or controlled-mode adoption', () => {
  const original = { ...binding };
  const normalized = normalizeAccountBinding(original);
  original.subject = 'changed';
  assert.equal(normalized.subject, 'account-a');
  assert.equal(Object.isFrozen(normalized), true);
  for (const extra of [{ controlled: true }, { credential: 'secret' }, { proofExpiresAt: 2000 }]) {
    assert.throws(() => normalizeAccountBinding({ ...binding, ...extra }), /invalid-account-binding/);
  }
  assert.match(accountNamespace(normalized), /^wonffice-sheet-account-v1:/);
  assert.equal(sameAccountBinding(binding, { ...binding }), true);
});

test('every principal, login and document field distinguishes its namespace exactly', () => {
  for (const key of Object.keys(binding) as (keyof AccountBinding)[]) {
    const value = key === 'issuer' ? `${binding.issuer}/` : key === 'subject' ? 'account-b' : key === 'loginBindingId' ? 'b'.repeat(64) : binding[key].replace(/1$/, '2');
    const foreign = { ...binding, [key]: value };
    assert.equal(sameAccountBinding(binding, foreign), false, key);
    assert.notEqual(accountNamespace(binding), accountNamespace(foreign), key);
  }
  assert.notEqual(accountNamespace({ ...binding, subject: 'a,b' }), accountNamespace({ ...binding, subject: 'a", "b' }));
});

test('unknown or malformed server scopes fail without normalization into another identity', () => {
  const invalid: unknown[] = [null, [], {}, { ...binding, userId: null }, { ...binding, userId: 'alice' },
    { ...binding, tenantId: '../tenant' }, { ...binding, subject: '' }, { ...binding, subject: 'x'.repeat(256) },
    { ...binding, loginBindingId: 'sid' }, { ...binding, issuer: '' }, { ...binding, issuer: 'x'.repeat(2049) }];
  for (const value of invalid) assert.throws(() => normalizeAccountBinding(value), /invalid-account-binding/);
  assert.equal(normalizeAccountBinding({ ...binding, issuer: 'http://127.0.0.1:55269/realm' }).issuer, 'http://127.0.0.1:55269/realm');
  assert.equal(normalizeAccountBinding({ ...binding, issuer: 'http://[::1]:55269/realm' }).issuer, 'http://[::1]:55269/realm');
});

test('shared P3 issuer and subject strings remain exact without a second identity parser', () => {
  const exact = { ...binding, issuer: 'server-verified-issuer', subject: 'issuer-specific|subject' };
  assert.deepEqual(normalizeAccountBinding(exact), exact);
});

test('unexpired current capture permits a read result and rejects foreign or forged tokens', async () => {
  const { guard } = model();
  const token = guard.capture();
  assert.equal(await guard.run(token, async () => 'native bytes'), 'native bytes');
  assert.equal(guard.isCurrent(model().guard.capture()), false);
  assert.equal(guard.isCurrent({ generation: token.generation }), false);
  assert.equal(guard.isCurrent(token), true);
});

test('logout, account switch and revocation refuse queued work without invoking its read', async () => {
  for (const reason of ['logout', 'account-switch', 'revoked'] as const satisfies readonly AccountRetirement[]) {
    const { guard } = model();
    const token = guard.capture();
    guard.retire(reason);
    guard.retire('expired');
    let reads = 0;
    await assert.rejects(guard.run(token, async () => { reads += 1; return null; }), /account-work-retired/);
    assert.equal(reads, 0);
    assert.equal(guard.retirement, reason);
    assert.throws(() => guard.capture(), /account-work-retired/);
  }
});

test('proof expires at the exact deadline and cannot revive when the clock moves back', () => {
  const { guard, setTime } = model();
  const token = guard.capture();
  setTime(1999); assert.equal(guard.isCurrent(token), true);
  setTime(2000); assert.equal(guard.isCurrent(token), false);
  setTime(1000); assert.equal(guard.isCurrent(token), false);
  assert.equal(guard.retirement, 'expired');
});

test('captured-session retirement remains closed after an ABA login transition', () => {
  const { guard, setCurrent } = model();
  const token = guard.capture();
  setCurrent(false); assert.equal(guard.isCurrent(token), false);
  setCurrent(true); assert.equal(guard.isCurrent(token), false);
  assert.equal(guard.retirement, 'session-retired');
});

test('a delayed private read or decode cannot publish after retirement or expiry', async () => {
  for (const transition of ['logout', 'account-switch', 'revoked', 'expired'] as const) {
    const { guard, setTime } = model();
    const pending = deferred<string>();
    let published = false;
    const work = guard.run(guard.capture(), () => pending.promise).then(() => { published = true; });
    if (transition === 'expired') setTime(2000); else guard.retire(transition);
    pending.resolve('old-account-private-data');
    await assert.rejects(work, /account-work-retired/);
    assert.equal(published, false);
  }
});

test('a delayed failure is fenced too, while a current operation preserves its own error', async () => {
  const { guard } = model();
  const pending = deferred<string>();
  const work = guard.run(guard.capture(), () => pending.promise);
  guard.retire('account-switch'); pending.reject(new Error('old private details'));
  await assert.rejects(work, /account-work-retired/);
  const current = model().guard;
  await assert.rejects(current.run(current.capture(), async () => { throw new Error('current read failed'); }), /current read failed/);
});

test('expiry and callback failures close the fence without exposing their details', () => {
  for (const proofExpiresAt of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => new AccountBindingGuard({ binding, proofExpiresAt, isCurrent: () => true }), /account-proof-expiry-invalid/);
  }
  const guard = new AccountBindingGuard({ binding, proofExpiresAt: 2000, now: () => 1000, isCurrent: () => { throw new Error('secret'); } });
  assert.equal(guard.isCurrent(), false);
  assert.equal(guard.retirement, 'session-retired');
  const brokenClock = new AccountBindingGuard({ binding, proofExpiresAt: 2000, now: () => NaN, isCurrent: () => true });
  assert.equal(brokenClock.isCurrent(), false);
});
