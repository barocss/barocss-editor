import test from 'node:test';
import assert from 'node:assert/strict';
import { endAccountLogin } from './account-logout.ts';
import { SHEET_RELAY_ACCOUNT_LOGOUT_PATH, SHEET_RELAY_ACCOUNT_LIMITS,
  parseSheetRelayAccountLogoutRequest } from '../../src/sheet-preview-protocol.ts';

function json(value: unknown, status = 200): Response { return Response.json(value, { status }); }
const success = { protocolVersion: 1, status: 'logged-out' };

test('logout uses captured authenticated request and returns true only for the shared success response', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    ++calls;
    assert.equal(input, SHEET_RELAY_ACCOUNT_LOGOUT_PATH);
    assert.ok(String(input).startsWith('/api/v1/'));
    assert.ok(!String(input).includes('?'));
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.credentials, 'same-origin');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    assert.deepEqual(parseSheetRelayAccountLogoutRequest(JSON.parse(String(init.body)) as unknown), { protocolVersion: 1 });
    assert.equal(init.signal?.aborted, false);
    return json(success);
  };
  assert.equal(await endAccountLogin(fetcher), true); assert.equal(calls, 1);
});

test('HTTP denial, malformed or extra fields, false success, wrong media type and redirect fail closed', async () => {
  const redirected = json(success);
  Object.defineProperty(redirected, 'redirected', { value: true });
  for (const response of [
    json(success, 401), json(success, 403), json(success, 500),
    json({ protocolVersion: 1, status: 'not-logged-out' }), json({ ...success, extra: true }),
    json({ status: 'logged-out' }), json({ protocolVersion: 2, status: 'logged-out' }), json(false),
    new Response('{invalid', { headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(success), { headers: { 'Content-Type': 'text/plain' } }),
    new Response(null, { status: 204 }), redirected,
  ]) assert.equal(await endAccountLogin(async () => response), false);
});

test('declared and actual stream byte limits reject independently and cancel oversized bodies', async () => {
  for (const declared of ['1025', '-1', 'invalid']) {
    const response = json(success); response.headers.set('Content-Length', declared);
    assert.equal(await endAccountLogin(async () => response), false);
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1025)); }, cancel() { cancelled = true; } });
  const response = new Response(stream, { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } });
  assert.equal(await endAccountLogin(async () => response), false); assert.equal(cancelled, true);
  const invalidUtf8 = new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } });
  assert.equal(await endAccountLogin(async () => invalidUtf8), false);
});

test('header rejection cancels a custom body without waiting for its cancellation promise', async () => {
  for (const headers of [new Headers({ 'Content-Type': 'text/plain' }), new Headers({ 'Content-Type': 'application/json', 'Content-Length': '1025' })]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; return new Promise<void>(() => {}); } });
    assert.equal(await endAccountLogin(async () => new Response(stream, { headers })), false);
    assert.equal(cancelled, true);
  }
});

test('network and request abort are unconfirmed and never invoke a fallback', async () => {
  for (const error of [new Error('network unavailable'), new DOMException('aborted', 'AbortError')]) {
    let calls = 0;
    assert.equal(await endAccountLogin(async () => { ++calls; throw error; }), false);
    assert.equal(calls, 1);
  }
});

test('authorization deadline bounds even a request adapter that ignores cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const pending = endAccountLogin(async (_input, init) => { signal = init?.signal; return new Promise<Response>(() => {}); });
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(Math.min(SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs, 5000));
  assert.equal(await pending, false); assert.equal(signal?.aborted, true);
});

test('authorization deadline also cancels a stalled response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  let readStarted!: () => void;
  const reading = new Promise<void>(resolve => { readStarted = resolve; });
  const stream = new ReadableStream<Uint8Array>({ pull() { readStarted(); }, cancel() { cancelled = true; } });
  const pending = endAccountLogin(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
  await reading;
  // Let the fulfilled request enter its bounded stream reader.
  await Promise.resolve();
  t.mock.timers.tick(Math.min(SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs, 5000));
  assert.equal(await pending, false); assert.equal(cancelled, true);
});
