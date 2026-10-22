import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountAdmission } from './account-admission.ts';
import type { SheetAccountIdentity, SheetAccountLease } from './account-login.ts';
import type { SheetRelayAccountAdmissionResponse, SheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';

// Controlled HTTP/stream fixtures only. These tests do not prove OIDC, grants, PG or native session issuance.
const binding: SheetRelayAccountBinding = {
  issuer: 'https://identity.example.test/realm', subject: 'account-a', loginBindingId: '1'.repeat(64),
  userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333', documentId: '44444444-4444-4444-8444-444444444444',
};
const identity: SheetAccountIdentity = { issuer: binding.issuer, subject: binding.subject, currentUserId: binding.userId, tenants: [] };
const requested = { tenantId: binding.tenantId, documentId: binding.documentId, workspaceId: binding.workspaceId };
const original = 'e'.repeat(64);
const baseNow = 1_000_000;
const admission = (ticket = 'a'.repeat(64)): SheetRelayAccountAdmissionResponse => ({ protocolVersion: 1, ticket, expiresAt: baseNow + 5_000,
  grantExpiresAt: baseNow + 60_000, accountBinding: binding });
function harness() {
  const calls: { input: RequestInfo | URL; init: RequestInit | undefined }[] = [];
  const state = { current: true, expiries: [] as number[], retired: 0,
    response: async (): Promise<Response> => new Response(JSON.stringify(admission(calls.length.toString(16).padStart(64, '0'))), { headers: { 'content-type': 'application/json' } }) };
  const lease: SheetAccountLease = {
    requestFetch: async (input, init) => { calls.push({ input, init }); return state.response(); },
    isCurrent: () => state.current,
    setExpiresAt: value => { state.expiries.push(value); },
    retire: () => { state.current = false; state.retired++; },
  };
  return { calls, state, lease };
}
async function tick(): Promise<void> { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function heldBody(): { response: Response; complete: (value: unknown) => void } {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({ start: value => { controller = value; } }));
  return { response, complete: value => { controller.enqueue(new TextEncoder().encode(JSON.stringify(value))); controller.close(); } };
}

test('account admission probes captured same-origin scope before returning a guard and always fetches a new ticket', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  const h = harness(), result = await createAccountAdmission(h.lease, requested, identity);
  assert.deepEqual(result.binding, binding); assert.equal(result.guard.isCurrent(), true);
  assert.deepEqual(h.state.expiries, [admission().grantExpiresAt]);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(JSON.parse(String(h.calls[0]!.init?.body)), { protocolVersion: 1 });
  const first = await result.admit(original), second = await result.admit(original);
  assert.notEqual(first.ticket, '1'.padStart(64, '0')); assert.notEqual(second.ticket, first.ticket);
  assert.equal(h.calls.length, 3);
  for (const call of h.calls) {
    assert.equal(call.input, `/api/v1/tenants/${binding.tenantId}/sheets/${binding.documentId}/admission`);
    assert.equal(call.init?.method, 'POST'); assert.equal(call.init?.credentials, 'same-origin');
    assert.equal(call.init?.cache, 'no-store'); assert.equal(call.init?.redirect, 'error');
    assert.deepEqual(call.init?.headers, { 'content-type': 'application/json', accept: 'application/json' });
    assert.equal(String(call.input).includes(original), false); assert.equal(String(call.input).includes(first.ticket), false);
    assert.equal(Object.keys(call.init?.headers ?? {}).some(key => key.toLowerCase() === 'authorization'), false);
  }
  assert.deepEqual(JSON.parse(String(h.calls[1]!.init?.body)), { protocolVersion: 1, resumeCredential: original });
  await assert.rejects(result.admit('f'.repeat(64)), /original-credential-required/);
  await assert.rejects(result.admit(), /original-credential-required/);
  assert.equal(h.calls.length, 3);
});

test('account admission requires canonical currentUserId before HTTP and rejects a foreign identity or requested scope', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  for (const currentUserId of [undefined, null, '']) {
    const h = harness();
    const withoutUser = { issuer: identity.issuer, subject: identity.subject, tenants: identity.tenants };
    await assert.rejects(createAccountAdmission(h.lease, requested, currentUserId === undefined ? withoutUser : { ...withoutUser, currentUserId }), /canonical-identity-required/);
    assert.equal(h.calls.length, 0);
  }
  for (const field of ['issuer', 'subject', 'userId', 'tenantId', 'documentId', 'workspaceId'] as const) {
    const h = harness();
    const changed = { ...binding, [field]: field === 'issuer' ? 'https://other.example.test' : field === 'subject' ? 'account-b' : '55555555-5555-4555-8555-555555555555' };
    h.state.response = async () => new Response(JSON.stringify({ ...admission(), accountBinding: changed }));
    await assert.rejects(createAccountAdmission(h.lease, requested, identity), /identity-or-scope-mismatch/);
    assert.equal(h.state.retired, 1); assert.equal(h.state.expiries.length, 0);
  }
});

test('account admission checks all seven original binding fields and the original verified grant expiry on every new ticket', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  for (const field of [...Object.keys(binding), 'grantExpiresAt']) {
    const h = harness(), result = await createAccountAdmission(h.lease, requested, identity);
    const changed = { ...admission(), accountBinding: { ...binding } };
    if (field === 'grantExpiresAt') changed.grantExpiresAt++;
    else (changed.accountBinding as Record<string, string>)[field] = field === 'issuer' ? 'https://other.example.test' : field === 'subject' ? 'account-b' :
      field === 'loginBindingId' ? '2'.repeat(64) : '55555555-5555-4555-8555-555555555555';
    h.state.response = async () => new Response(JSON.stringify(changed));
    await assert.rejects(result.admit(original), /original-binding-required/);
    assert.equal(result.guard.isCurrent(), false); assert.equal(h.state.retired, 1);
  }
});

test('account admission bounds both declared and actual streamed JSON bytes and cancels oversized bodies', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  for (const declared of ['32769', '-1', 'not-a-number', '9007199254740993']) {
    const h = harness(); let cancelled = false;
    h.state.response = async () => new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { headers: { 'content-length': declared } });
    await assert.rejects(createAccountAdmission(h.lease, requested, identity), /response-limit/);
    assert.equal(cancelled, true); assert.equal(h.state.expiries.length, 0);
  }
  const h = harness(); let cancelled = false;
  h.state.response = async () => new Response(new ReadableStream<Uint8Array>({ start: controller => {
    controller.enqueue(new Uint8Array(20_000)); controller.enqueue(new Uint8Array(12_769));
  }, cancel: () => { cancelled = true; } }), { headers: { 'content-length': '1' } });
  await assert.rejects(createAccountAdmission(h.lease, requested, identity), /response-limit/);
  assert.equal(cancelled, true);
});

test('account admission rejects non-JSON, malformed UTF8, unknown fields and HTTP failures without exposing response text', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  for (const response of [new Response('secret-invalid-json'), new Response(new Uint8Array([0xff])),
    new Response(JSON.stringify({ ...admission(), bearer: 'secret' })), new Response('secret', { status: 403 })]) {
    const h = harness(); h.state.response = async () => response;
    await assert.rejects(createAccountAdmission(h.lease, requested, identity), error => error instanceof Error &&
      /invalid-json|invalid-account-admission|http-403/.test(error.message) && !error.message.includes('secret'));
    assert.equal(h.state.expiries.length, 0);
  }
});

test('account admission refuses expired, excessive ticket lifetime and expired login proofs', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  for (const change of [{ expiresAt: baseNow }, { expiresAt: baseNow + 5_001 }, { expiresAt: baseNow, grantExpiresAt: baseNow }]) {
    const h = harness(); h.state.response = async () => new Response(JSON.stringify({ ...admission(), ...change }));
    await assert.rejects(createAccountAdmission(h.lease, requested, identity), /expired-or-unbounded/);
    assert.equal(h.state.expiries.length, 0);
  }
});

test('account admission retires a late HTTP response after logout before reading its body', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  const h = harness(); let complete!: (response: Response) => void;
  h.state.response = () => new Promise(resolve => { complete = resolve; });
  const promise = createAccountAdmission(h.lease, requested, identity), rejected = assert.rejects(promise, /session-retired/);
  h.state.current = false; complete(new Response(JSON.stringify(admission())));
  await rejected; assert.equal(h.state.expiries.length, 0);
});

test('account admission fences logout and proof expiry while a response stream is being decoded', async t => {
  let now = baseNow; t.mock.method(Date, 'now', () => now);
  for (const retirement of ['logout', 'expiry'] as const) {
    now = baseNow;
    const h = harness(), result = await createAccountAdmission(h.lease, requested, identity), held = heldBody();
    h.state.response = async () => held.response;
    const promise = result.admit(original), rejected = assert.rejects(promise, /session-retired|account-work-retired/);
    await tick();
    if (retirement === 'logout') h.state.current = false; else now = admission().grantExpiresAt;
    held.complete(admission()); await rejected;
    assert.equal(result.guard.isCurrent(), false);
  }
});

test('account admission preserves split UTF8 data and ignores an optional unrequested workspace selector', async t => {
  t.mock.method(Date, 'now', () => baseNow);
  const h = harness();
  const unicodeBinding = { ...binding, subject: '계정' }, bytes = new TextEncoder().encode(JSON.stringify({ ...admission(), accountBinding: unicodeBinding }));
  h.state.response = async () => new Response(new ReadableStream<Uint8Array>({ start: controller => {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close();
  } }));
  const result = await createAccountAdmission(h.lease, { tenantId: binding.tenantId, documentId: binding.documentId }, { ...identity, subject: unicodeBinding.subject });
  assert.equal(result.binding.subject, unicodeBinding.subject); assert.equal(result.binding.workspaceId, binding.workspaceId);
});
