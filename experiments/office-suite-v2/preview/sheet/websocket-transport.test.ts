import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketTransport } from './websocket-transport.ts';
import type { BrowserSocket } from './websocket-transport.ts';
import { SHEET_RELAY_WS_LIMITS, SHEET_RELAY_WS_PATH, decodeSheetRelayClientFrame, encodeSheetRelayWsFrame, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayClientFrame, SheetRelayServerFrame, SheetRelayWsSession, SheetRelayState, SheetRelayAppendRequest, SheetRelayAppendResult, SheetRelayAccountAdmissionResponse, SheetRelayAccountBinding, SheetRelayAccountSession } from '../../src/sheet-preview-protocol.ts';

// P2 shape fixtures and a fake browser socket only. Native hash/admission/storage/server/ACL are not proved here.
const context = { documentId: 'socket-shape-test', workbookId: 'book', generation: 'generation', contractVersion: 1, engineVersion: 1, schemaVersion: 1, adapterVersion: 1 } as const;
const owner: SheetRelayWsSession = { protocolVersion: 1, controlled: true, credential: 'e'.repeat(64),
  identity: { actorId: 'controlled-actor', sessionId: 'controlled-session' }, context, access: 'read-write' };
const state: SheetRelayState = { protocolVersion: 1, context, admission: relayAdmission(context), latestSequence: 1,
  state: { bytesBase64: 'AA==', byteLength: 1, sha256: 'a'.repeat(64), frontierBase64: 'AA==' },
  bootstrap: { updateId: 'bootstrap', byteLength: 1, sha256: 'b'.repeat(64), identity: { actorId: 'fixture', sessionId: 'fixture-session' } } };
const packet = (updateId = 'native-edit-1'): SheetRelayAppendRequest => ({ protocolVersion: 1, context, admission: relayAdmission(context),
  packet: { updateId, bytesBase64: 'AQI=', byteLength: 2, sha256: 'c'.repeat(64) } });
const durable = (request: SheetRelayAppendRequest): SheetRelayAppendResult => ({ protocolVersion: 1, status: 'durable', receipt: {
  context, admission: relayAdmission(context), updateId: request.packet.updateId, sha256: request.packet.sha256, sequence: 2, frontierBase64: 'AA==' } });
async function tick(): Promise<void> { for (let i = 0; i < 5; i++) await Promise.resolve(); }
class Clock {
  now = 0;
  #id = 0;
  readonly jobs = new Map<number, { at: number; action: () => void }>();
  readonly schedule = (action: () => void, delayMs: number): (() => void) => {
    const id = ++this.#id; this.jobs.set(id, { at: this.now + delayMs, action }); return () => { this.jobs.delete(id); };
  };
  advance(delay: number): void {
    const target = this.now + delay;
    for (;;) {
      const next = [...this.jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.jobs.delete(next[0]); this.now = next[1].at; next[1].action();
    }
    this.now = target;
  }
}
class FakeSocket extends EventTarget implements BrowserSocket {
  readyState = 0;
  bufferedAmount = 0;
  closeCalls = 0;
  readonly sent: string[] = [];
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    assert.equal(this.readyState, 1); assert.equal(typeof data, 'string'); this.sent.push(data as string);
  }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  close(_code?: number, _reason?: string): void { this.closeCalls++; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  error(): void { this.dispatchEvent(new Event('error')); }
  raw(data: unknown): void { this.dispatchEvent(new MessageEvent('message', { data })); }
  reply(frame: SheetRelayServerFrame): void { this.raw(encodeSheetRelayWsFrame(frame)); }
  frames(): SheetRelayClientFrame[] { return this.sent.map(decodeSheetRelayClientFrame); }
  last(type: SheetRelayClientFrame['type']): SheetRelayClientFrame {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const frame = decodeSheetRelayClientFrame(this.sent[i]!); if (frame.type === type) return frame;
    }
    assert.fail(`Missing fake socket ${type} frame`);
  }
}
function harness(throwObservers = false) {
  const clock = new Clock(), sockets: FakeSocket[] = [], urls: string[] = [];
  const accepted: SheetRelayState[] = [], access: string[] = [], disconnected: string[] = [];
  const transport = new WebSocketTransport({ url: `ws://127.0.0.1:55265${SHEET_RELAY_WS_PATH}`,
    createSocket: url => { urls.push(url); const socket = new FakeSocket(); sockets.push(socket); return socket; }, schedule: clock.schedule,
    accepted: value => { accepted.push(value); if (throwObservers) throw new Error('controlled observer exception'); },
    access: value => { access.push(value); if (throwObservers) throw new Error('controlled observer exception'); },
    disconnected: value => { disconnected.push(value); if (throwObservers) throw new Error('controlled observer exception'); } });
  const authenticate = async (resume = true) => {
    const promise = transport.authenticate(resume ? { protocolVersion: 1, resumeCredential: owner.credential } : { protocolVersion: 1 });
    const socket = sockets.at(-1)!; socket.open();
    const frame = socket.last('authenticate');
    socket.reply({ protocolVersion: 1, type: 'authenticated', requestId: frame.requestId, session: owner, state });
    await promise; return socket;
  };
  const pin = async (socket: FakeSocket) => {
    const promise = transport.open(owner); await tick(); const frame = socket.last('open');
    socket.reply({ protocolVersion: 1, type: 'state', requestId: frame.requestId, state }); await promise;
  };
  const ready = async () => { const socket = await authenticate(); await pin(socket); return socket; };
  return { clock, sockets, urls, transport, accepted, access, disconnected, authenticate, pin, ready };
}

test('fake browser socket authenticates first, pins owner only after validation and keeps credentials out of metadata/URL', async () => {
  const h = harness();
  try {
    const authentication = h.transport.authenticate({ protocolVersion: 1 });
    const socket = h.sockets[0]!;
    assert.equal(socket.sent.length, 0); assert.equal(h.transport.inspect().phase, 'connecting');
    assert.equal(h.transport.inspect().pending[0]?.operation, 'authenticate');
    await assert.rejects(h.transport.append(packet()), /owner-not-pinned/);
    socket.open();
    assert.equal(socket.frames().length, 1);
    const first = socket.last('authenticate'); assert.equal(first.type, 'authenticate');
    if (first.type === 'authenticate') assert.deepEqual(first.session, { protocolVersion: 1 });
    socket.reply({ protocolVersion: 1, type: 'authenticated', requestId: first.requestId, session: owner, state });
    const bundle = await authentication; assert.deepEqual(bundle, { session: owner, state });
    await assert.rejects(h.transport.open({ ...owner, credential: 'f'.repeat(64) }), /original-session-mismatch/);
    await h.pin(socket);
    assert.equal(h.transport.inspect().phase, 'ready'); assert.deepEqual(h.access, ['read-write']);
    assert.ok(!JSON.stringify(h.transport.inspect()).includes(owner.credential));
    assert.equal(new URL(h.urls[0]!).search, '');
    assert.equal(socket.frames()[1]?.type, 'open');
    assert.equal(h.clock.jobs.size, 0);
  } finally { h.transport.close(); }
});

test('fake URL validation rejects credentials, HTTP, query/hash and nonprotocol paths before socket construction', () => {
  for (const url of [`http://127.0.0.1${SHEET_RELAY_WS_PATH}`, `ws://user:secret@127.0.0.1${SHEET_RELAY_WS_PATH}`,
    `ws://127.0.0.1${SHEET_RELAY_WS_PATH}?credential=secret`, `ws://127.0.0.1${SHEET_RELAY_WS_PATH}#secret`, 'ws://127.0.0.1/other']) {
    assert.throws(() => new WebSocketTransport({ url, createSocket: () => { assert.fail('must not create socket'); }, accepted: () => {}, access: () => {}, disconnected: () => {} }));
  }
});

test('fake replies correlate operation and packet independently; out-of-order ACKs and accepted pushes do not drain another request', async () => {
  const h = harness();
  try {
    const socket = await h.ready();
    const a = packet('original-a'), b = packet('original-b');
    const first = h.transport.append(a), second = h.transport.append(b); await tick();
    const frames = socket.frames().filter(frame => frame.type === 'append'); assert.equal(frames.length, 2);
    const one = frames[0]!, two = frames[1]!;
    assert.notEqual(one.requestId, two.requestId);
    const acceptedResult = durable(a); assert.equal(acceptedResult.status, 'durable');
    if (acceptedResult.status !== 'durable') assert.fail();
    socket.reply({ protocolVersion: 1, type: 'accepted', receipt: acceptedResult.receipt, state: { ...state, latestSequence: 2 } });
    assert.equal(h.accepted.length, 1); assert.equal(h.transport.inspect().pending.length, 2);
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: 'unknown-correlation', result: durable(a) });
    assert.equal(h.transport.inspect().pending.length, 2);
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: two.requestId, result: durable(b) });
    assert.deepEqual(await second, durable(b)); assert.equal(h.transport.inspect().pending[0]?.packetId, a.packet.updateId);
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: one.requestId, result: durable(a) });
    assert.deepEqual(await first, durable(a));
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: one.requestId, result: durable(a) });
    assert.equal(h.transport.inspect().pending.length, 0);
    assert.deepEqual((socket.last('append') as Extract<SheetRelayClientFrame, { type: 'append' }>).request, b);
    assert.equal(h.transport.inspect().history.at(-1)?.sha256, a.packet.sha256);
  } finally { h.transport.close(); }
});

test('fake operation/packet mismatches disconnect instead of resolving the wrong original', async () => {
  for (const fault of ['operation', 'packet'] as const) {
    const h = harness();
    try {
      const socket = await h.ready(), promise = h.transport.append(packet()); await tick();
      const rejected = assert.rejects(promise, /mismatch/), sent = socket.last('append');
      if (fault === 'operation') socket.reply({ protocolVersion: 1, type: 'state', requestId: sent.requestId, state });
      else socket.reply({ protocolVersion: 1, type: 'append-result', requestId: sent.requestId, result: durable(packet('wrong-original')) });
      await rejected; assert.equal(h.transport.inspect().pending.length, 0);
      assert.equal(h.transport.inspect().phase, 'waiting'); assert.equal(socket.closeCalls, 1);
    } finally { h.transport.close(); }
  }
});

test('fake access pushes and either rejection envelope synchronously report read-only while retaining correlated rejection', async () => {
  for (const envelope of ['rejected', 'append-result'] as const) {
    const h = harness();
    try {
      const socket = await h.ready();
      socket.reply({ protocolVersion: 1, type: 'access', access: 'read-only' });
      assert.equal(h.access.at(-1), 'read-only'); assert.equal(h.transport.inspect().access, 'read-only');
      const request = packet(), promise = h.transport.append(request); await tick();
      const frame = socket.last('append');
      if (envelope === 'rejected') socket.reply({ protocolVersion: 1, type: 'rejected', requestId: frame.requestId, code: 'read-only-denied', updateId: request.packet.updateId });
      else socket.reply({ protocolVersion: 1, type: 'append-result', requestId: frame.requestId,
        result: { protocolVersion: 1, status: 'rejected', code: 'read-only-denied', updateId: request.packet.updateId } });
      assert.equal(h.access.at(-1), 'read-only');
      assert.deepEqual(await promise, { protocolVersion: 1, status: 'rejected', code: 'read-only-denied', updateId: request.packet.updateId });
      socket.reply({ protocolVersion: 1, type: 'access', access: 'read-write' });
      assert.equal(h.transport.inspect().access, 'read-write');
    } finally { h.transport.close(); }
  }
});

test('fake unknown/revoked session denial rejects all pending work and never reconnects or creates a fresh session', async () => {
  for (const code of ['session-denied', 'current-access-denied']) {
    const h = harness();
    try {
      const socket = await h.ready(), promise = h.transport.append(packet()); await tick();
      const rejected = assert.rejects(promise, /access-denied/);
      socket.reply({ protocolVersion: 1, type: 'rejected', code });
      assert.equal(h.access.at(-1), 'denied'); await rejected;
      assert.equal(h.transport.inspect().phase, 'denied'); h.clock.advance(60_000); await tick();
      assert.equal(h.sockets.length, 1); assert.equal(h.clock.jobs.size, 0);
      await assert.rejects(h.transport.authenticate({ protocolVersion: 1 }), /access-denied/);
      await assert.rejects(h.transport.state(), /access-denied/);
    } finally { h.transport.close(); }
  }
});

test('fake correlated authorization denial preserves the actual rejected packet and code before freezing other requests', async () => {
  for (const code of ['session-denied', 'current-access-denied']) {
    for (const includeUpdateId of [false, true]) {
      const h = harness();
      try {
        const socket = await h.ready(), original = packet('denied-original'), other = packet('unanswered-original');
        const rejectedPacket = h.transport.append(original), unanswered = h.transport.append(other);
        const unknown = assert.rejects(unanswered, /access-denied/); await tick();
        const request = socket.frames().find(frame => frame.type === 'append' && frame.request.packet.updateId === original.packet.updateId);
        assert.ok(request);
        socket.reply({ protocolVersion: 1, type: 'rejected', requestId: request.requestId, code,
          ...(includeUpdateId ? { updateId: original.packet.updateId } : {}) });
        assert.equal(h.transport.inspect().phase, 'denied'); assert.equal(h.access.at(-1), 'denied');
        assert.deepEqual(await rejectedPacket, { protocolVersion: 1, status: 'rejected', code, updateId: original.packet.updateId });
        await unknown;
        assert.equal(h.transport.inspect().history.find(entry => entry.packetId === original.packet.updateId)?.outcome, 'rejected');
        assert.equal(h.transport.inspect().history.find(entry => entry.packetId === other.packet.updateId)?.outcome, 'disconnected');
        assert.equal(h.transport.inspect().pending.length, 0);
        h.clock.advance(60_000); assert.equal(h.sockets.length, 1);
      } finally { h.transport.close(); }
    }
  }
});

test('fake uncorrelated or wrong-packet revocation leaves the original acknowledgment unknown instead of fabricating rejection', async () => {
  for (const code of ['session-denied', 'current-access-denied']) {
    for (const mode of ['uncorrelated', 'wrong-packet'] as const) {
      const h = harness();
      try {
        const socket = await h.ready(), original = packet('original-pending'), promise = h.transport.append(original);
        const unknown = assert.rejects(promise, /access-denied/); await tick();
        const request = socket.last('append');
        socket.reply({ protocolVersion: 1, type: 'rejected', code,
          ...(mode === 'wrong-packet' ? { requestId: request.requestId, updateId: 'different-packet' } : {}) });
        await unknown;
        assert.equal(h.transport.inspect().phase, 'denied');
        assert.equal(h.transport.inspect().history.find(entry => entry.packetId === original.packet.updateId)?.outcome, 'disconnected');
        assert.equal(h.transport.inspect().history.filter(entry => entry.outcome === 'rejected').length, 0);
        assert.equal(h.transport.inspect().pending.length, 0);
      } finally { h.transport.close(); }
    }
  }
});

test('fake disconnect rejects pending append, authenticates original credential on reconnect, and never resends append itself', async () => {
  const h = harness();
  try {
    const socket = await h.ready(), original = packet(), promise = h.transport.append(original); await tick();
    const old = socket.last('append'), rejected = assert.rejects(promise, /socket-closed/);
    socket.close(); await rejected; await tick();
    assert.equal(h.sockets.length, 1); h.clock.advance(249); assert.equal(h.sockets.length, 1);
    h.clock.advance(1); const resumed = h.sockets[1]!; resumed.open();
    const authentication = resumed.last('authenticate'); assert.equal(authentication.type, 'authenticate');
    if (authentication.type === 'authenticate') assert.deepEqual(authentication.session, { protocolVersion: 1, resumeCredential: owner.credential });
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: old.requestId, result: durable(original) });
    resumed.reply({ protocolVersion: 1, type: 'authenticated', requestId: authentication.requestId, session: owner, state }); await tick();
    assert.equal(h.accepted.length, 1); assert.equal(resumed.frames().filter(frame => frame.type === 'append').length, 0);
    const retry = h.transport.append(original); await tick(); const sent = resumed.last('append');
    assert.notEqual(sent.requestId, old.requestId);
    assert.deepEqual((sent as Extract<SheetRelayClientFrame, { type: 'append' }>).request, original);
    resumed.reply({ protocolVersion: 1, type: 'append-result', requestId: sent.requestId, result: durable(original) });
    assert.deepEqual(await retry, durable(original)); assert.equal(h.transport.inspect().generation, 2);
  } finally { h.transport.close(); }
});

test('fake original identity/context changes on resumed authentication fail closed', async () => {
  for (const field of ['credential', 'identity', 'context'] as const) {
    const h = harness();
    try {
      const socket = await h.ready(); socket.close(); await tick(); h.clock.advance(250);
      const resumed = h.sockets[1]!; resumed.open(); const request = resumed.last('authenticate');
      const changed = { ...owner };
      if (field === 'credential') changed.credential = 'f'.repeat(64);
      if (field === 'identity') changed.identity = { ...owner.identity, sessionId: 'replacement-session' };
      if (field === 'context') changed.context = { ...context, generation: 'replacement-generation' };
      resumed.reply({ protocolVersion: 1, type: 'authenticated', requestId: request.requestId, session: changed,
        state: field === 'context' ? { ...state, context: changed.context, admission: relayAdmission(changed.context) } : state });
      await tick(); assert.equal(h.transport.inspect().phase, 'denied'); assert.equal(h.accepted.length, 0);
      h.clock.advance(60_000); assert.equal(h.sockets.length, 2);
    } finally { h.transport.close(); }
  }
});

test('fake automatic reconnect has exactly six bounded attempts and pause/close cancel every owned timer', async () => {
  const h = harness();
  try {
    const first = await h.ready(); first.close(); await tick();
    for (const delay of [250, 500, 1000, 2000, 4000, 5000]) {
      const count = h.sockets.length; h.clock.advance(delay - 1); assert.equal(h.sockets.length, count);
      h.clock.advance(1); assert.equal(h.sockets.length, count + 1);
      h.sockets.at(-1)!.close(); await tick();
    }
    assert.equal(h.transport.inspect().reconnectAttempt, 6); assert.equal(h.clock.jobs.size, 0);
    h.clock.advance(60_000); assert.equal(h.sockets.length, 7);
    h.transport.setPaused(true); assert.equal(h.transport.inspect().phase, 'paused');
    h.transport.setPaused(false); assert.equal(h.clock.jobs.size, 1);
    h.transport.close(); h.clock.advance(60_000); assert.equal(h.sockets.length, 7); assert.equal(h.clock.jobs.size, 0);
  } finally { h.transport.close(); }
});

test('fake handshake and reply deadlines reject pending promises; abort cannot admit a late ACK', async () => {
  const h = harness();
  try {
    const handshake = h.transport.authenticate({ protocolVersion: 1, resumeCredential: owner.credential });
    const expired = assert.rejects(handshake, /timeout/); h.clock.advance(4999); assert.equal(h.transport.inspect().pending.length, 1);
    h.clock.advance(1); await expired; assert.equal(h.transport.inspect().pending.length, 0); assert.equal(h.clock.jobs.size, 0);
  } finally { h.transport.close(); }
  const r = harness();
  try {
    const socket = await r.ready(), promise = r.transport.append(packet()); await tick();
    const expired = assert.rejects(promise, /timeout/); r.clock.advance(SHEET_RELAY_WS_LIMITS.replyMs); await expired;
    assert.equal(r.transport.inspect().pending.length, 0); assert.equal(r.transport.inspect().history.at(-1)?.outcome, 'timeout');
    assert.equal(socket.closeCalls, 1);
  } finally { r.transport.close(); }
  const a = harness();
  try {
    const socket = await a.ready(), abort = new AbortController(), promise = a.transport.append(packet(), abort.signal); await tick();
    const frame = socket.last('append'), rejected = assert.rejects(promise, /aborted/); abort.abort(); await rejected;
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: frame.requestId, result: durable(packet()) });
    assert.equal(a.transport.inspect().history.at(-1)?.outcome, 'aborted'); assert.equal(a.transport.inspect().pending.length, 0);
    assert.equal(a.transport.inspect().phase, 'ready');
  } finally { a.transport.close(); }
});

test('fake malformed, oversized and binary incoming frames reject active requests without granting access', async () => {
  for (const data of ['{', 'x'.repeat(SHEET_RELAY_WS_LIMITS.frameBytes + 1), new Uint8Array([0])]) {
    const h = harness();
    try {
      const socket = await h.ready(), promise = h.transport.append(packet()); await tick();
      const rejected = assert.rejects(promise, /invalid-frame/); socket.raw(data); await rejected;
      assert.equal(h.transport.inspect().pending.length, 0); assert.equal(h.access.at(-1), 'read-write');
      assert.equal(h.transport.inspect().phase, 'waiting');
    } finally { h.transport.close(); }
  }
});

test('fake send buffering and pending-count caps remain finite and reject callers', async () => {
  const h = harness();
  try {
    const socket = await h.ready(); socket.bufferedAmount = SHEET_RELAY_WS_LIMITS.bufferedBytes;
    await assert.rejects(h.transport.append(packet()), /buffer-limit/);
    assert.equal(h.transport.inspect().pending.length, 0);
  } finally { h.transport.close(); }
  const p = harness();
  try {
    const socket = await p.ready();
    const calls = Array.from({ length: SHEET_RELAY_WS_LIMITS.pendingRequests + 1 }, () => p.transport.state());
    const results = Promise.allSettled(calls); await tick();
    assert.equal(p.transport.inspect().pending.length, SHEET_RELAY_WS_LIMITS.pendingRequests);
    socket.close(); const settled = await results;
    assert.equal(settled.filter(result => result.status === 'rejected').length, calls.length);
    assert.equal(settled.filter(result => result.status === 'rejected' && result.reason instanceof Error && /pending-limit/.test(result.reason.message)).length, 1);
  } finally { p.transport.close(); }
});

test('fake request namespace cap closes after 4096 requests and metadata history remains bounded to 128', async () => {
  const h = harness();
  try {
    const socket = await h.ready();
    for (let i = 2; i < SHEET_RELAY_WS_LIMITS.requestsPerConnection; i++) {
      const promise = h.transport.state(); await tick(); const frame = socket.last('open');
      socket.reply({ protocolVersion: 1, type: 'state', requestId: frame.requestId, state }); await promise;
    }
    assert.equal(socket.sent.length, SHEET_RELAY_WS_LIMITS.requestsPerConnection);
    assert.equal(h.transport.inspect().history.length, 128);
    await assert.rejects(h.transport.state(), /request-limit/);
    assert.equal(h.transport.inspect().pending.length, 0); assert.equal(h.transport.inspect().phase, 'waiting');
  } finally { h.transport.close(); }
});

test('fake pause/close reject outstanding work and late callbacks cannot reopen transport', async () => {
  const h = harness();
  try {
    const socket = await h.ready(), promise = h.transport.append(packet()); await tick();
    const request = socket.last('append'), rejected = assert.rejects(promise, /paused/);
    h.transport.setPaused(true); await rejected;
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: request.requestId, result: durable(packet()) });
    h.clock.advance(60_000); assert.equal(h.sockets.length, 1); assert.equal(h.transport.inspect().phase, 'paused');
    await assert.rejects(h.transport.state(), /paused/);
    h.transport.setPaused(false); h.clock.advance(250); const next = h.sockets[1]!; next.open();
    const auth = next.last('authenticate'); h.transport.close(); await tick();
    next.reply({ protocolVersion: 1, type: 'authenticated', requestId: auth.requestId, session: owner, state });
    h.clock.advance(60_000); await tick();
    assert.equal(h.transport.inspect().phase, 'closed'); assert.equal(h.transport.inspect().pending.length, 0);
    assert.equal(h.clock.jobs.size, 0); assert.equal(h.accepted.length, 0);
    await assert.rejects(h.transport.append(packet()), /closed/);
  } finally { h.transport.close(); }
});

test('fake throwing observers cannot turn a correlated native packet result into transport refusal', async () => {
  const h = harness(true);
  try {
    const socket = await h.ready(), promise = h.transport.append(packet()); await tick(); const frame = socket.last('append');
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: frame.requestId, result: durable(packet()) });
    assert.deepEqual(await promise, durable(packet())); assert.equal(h.transport.inspect().phase, 'ready');
    socket.error(); await tick(); assert.equal(h.transport.inspect().phase, 'waiting');
  } finally { h.transport.close(); }
});


// P3 fixtures verify transport fencing only. They do not prove OIDC, PostgreSQL or live permission checks.
const accountBinding: SheetRelayAccountBinding = {
  issuer: 'https://identity.example.test/realm', subject: 'account-a', loginBindingId: '1'.repeat(64),
  userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333', documentId: '44444444-4444-4444-8444-444444444444',
};
const accountContext = { ...context, documentId: accountBinding.documentId };
const accountOwner: SheetRelayAccountSession = { ...owner, controlled: false, context: accountContext, accountBinding, expiresAt: 20_000 };
const accountState: SheetRelayState = { ...state, context: accountContext, admission: relayAdmission(accountContext) };
function accountHarness() {
  const clock = new Clock(), sockets: FakeSocket[] = [], admissions: (string | undefined)[] = [];
  const accepted: SheetRelayState[] = [], access: string[] = [], disconnected: string[] = [];
  const gate = { current: true, admit: async (_credential?: string): Promise<SheetRelayAccountAdmissionResponse> => ({
    protocolVersion: 1, ticket: admissions.length.toString(16).padStart(64, '0'), expiresAt: clock.now + 5_000,
    grantExpiresAt: 20_000, accountBinding,
  }) };
  const transport = new WebSocketTransport({ url: `ws://127.0.0.1:55265${SHEET_RELAY_WS_PATH}`, now: () => clock.now, schedule: clock.schedule,
    createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    account: { isCurrent: () => gate.current, admit: credential => { admissions.push(credential); return gate.admit(credential); } },
    accepted: value => accepted.push(value), access: value => access.push(value), disconnected: value => disconnected.push(value) });
  const authenticate = async () => {
    const promise = transport.authenticate({ protocolVersion: 1, resumeCredential: accountOwner.credential });
    await tick(); const socket = sockets.at(-1)!; socket.open();
    const frame = socket.last('authenticate-account');
    socket.reply({ protocolVersion: 1, type: 'account-authenticated', requestId: frame.requestId, session: accountOwner, state: accountState });
    await promise; return socket;
  };
  const ready = async () => {
    const socket = await authenticate(), promise = transport.open(accountOwner); await tick();
    socket.reply({ protocolVersion: 1, type: 'state', requestId: socket.last('open').requestId, state: accountState });
    await promise; return socket;
  };
  return { clock, sockets, admissions, accepted, access, disconnected, gate, transport, authenticate, ready };
}

test('P3 fake socket privately sends one-use ticket first and keeps account secrets out of URL and metadata', async () => {
  const h = accountHarness();
  try {
    const socket = await h.ready();
    assert.deepEqual(h.admissions, [accountOwner.credential]);
    assert.equal(socket.frames()[0]?.type, 'authenticate-account');
    assert.equal(socket.frames().some(frame => frame.type === 'authenticate'), false);
    const first = socket.frames()[0]!;
    assert.equal(first.type, 'authenticate-account');
    if (first.type !== 'authenticate-account') assert.fail();
    assert.equal(JSON.stringify(h.transport.inspect()).includes(first.ticket), false);
    assert.equal(JSON.stringify(h.transport.inspect()).includes(accountOwner.credential), false);
    assert.equal(JSON.stringify(h.transport.inspect()).includes(accountBinding.subject), false);
    assert.equal(h.transport.inspect().phase, 'ready');
  } finally { h.transport.close(); }
  assert.equal(h.clock.jobs.size, 0);
});

test('P3 reconnect obtains a fresh ticket for the original native credential without replaying an append', async () => {
  const h = accountHarness();
  try {
    const first = await h.ready(); first.close(); await tick(); h.clock.advance(250); await tick();
    const socket = h.sockets[1]!; socket.open();
    const auth = socket.last('authenticate-account'), previous = first.last('authenticate-account');
    assert.equal(auth.type, 'authenticate-account'); assert.equal(previous.type, 'authenticate-account');
    if (auth.type !== 'authenticate-account' || previous.type !== 'authenticate-account') assert.fail();
    assert.notEqual(auth.ticket, previous.ticket); assert.deepEqual(h.admissions, [accountOwner.credential, accountOwner.credential]);
    socket.reply({ protocolVersion: 1, type: 'account-authenticated', requestId: auth.requestId, session: accountOwner, state: accountState });
    await tick(); assert.equal(h.accepted.length, 1);
    assert.equal(socket.frames().some(frame => frame.type === 'append'), false);
  } finally { h.transport.close(); }
});

test('P3 account, login and document scope changes refuse reconnect before constructing a new socket', async () => {
  for (const field of Object.keys(accountBinding) as (keyof SheetRelayAccountBinding)[]) {
    const h = accountHarness();
    try {
      const socket = await h.ready();
      const changed = { ...accountBinding, [field]: field === 'issuer' ? 'https://other.example.test' : field === 'subject' ? 'account-b' :
        field === 'loginBindingId' ? '2'.repeat(64) : '55555555-5555-4555-8555-555555555555' };
      h.gate.admit = async () => ({ protocolVersion: 1, ticket: '3'.repeat(64), expiresAt: 5_000, grantExpiresAt: 20_000, accountBinding: changed });
      socket.close(); await tick(); h.clock.advance(250); await tick();
      assert.equal(h.sockets.length, 1, field); assert.equal(h.transport.inspect().phase, 'denied', field);
      h.clock.advance(30_000); assert.equal(h.sockets.length, 1);
    } finally { h.transport.close(); }
  }
});

test('P3 authenticated reply must match admission binding, original native owner and verified login expiry', async () => {
  for (const change of ['binding', 'credential', 'expiry'] as const) {
    const h = accountHarness();
    try {
      const promise = h.transport.authenticate({ protocolVersion: 1, resumeCredential: accountOwner.credential });
      const denied = assert.rejects(promise, /access-denied/); await tick(); const socket = h.sockets[0]!; socket.open();
      const session: SheetRelayAccountSession = { ...accountOwner,
        ...(change === 'binding' ? { accountBinding: { ...accountBinding, subject: 'account-b' } } : {}),
        ...(change === 'credential' ? { credential: 'f'.repeat(64) } : {}),
        ...(change === 'expiry' ? { expiresAt: 20_001 } : {}) };
      socket.reply({ protocolVersion: 1, type: 'account-authenticated', requestId: socket.last('authenticate-account').requestId, session, state: accountState });
      await denied; assert.equal(h.transport.inspect().phase, 'denied');
    } finally { h.transport.close(); }
  }
});

test('P3 account retirement during held admission never constructs a socket or adopts a new account', async () => {
  const h = accountHarness();
  let complete!: (value: SheetRelayAccountAdmissionResponse) => void;
  h.gate.admit = () => new Promise(resolve => { complete = resolve; });
  try {
    const promise = h.transport.authenticate({ protocolVersion: 1 });
    const denied = assert.rejects(promise, /access-denied/); await tick(); h.gate.current = false;
    complete({ protocolVersion: 1, ticket: '4'.repeat(64), expiresAt: 5_000, grantExpiresAt: 20_000, accountBinding });
    await denied; assert.equal(h.sockets.length, 0); assert.equal(h.transport.inspect().phase, 'denied');
  } finally { h.transport.close(); }
});

test('P3 local account retirement fences held ACKs and accepted pushes before observers see them', async () => {
  const h = accountHarness();
  try {
    const socket = await h.ready(), request = { ...packet(), context: accountContext, admission: relayAdmission(accountContext) };
    const promise = h.transport.append(request), denied = assert.rejects(promise, /access-denied/); await tick();
    const frame = socket.last('append'); h.gate.current = false;
    const originalResult = durable(request); if (originalResult.status !== 'durable') assert.fail();
    const result: SheetRelayAppendResult = { ...originalResult, receipt: { ...originalResult.receipt, context: accountContext, admission: relayAdmission(accountContext) } };
    socket.reply({ protocolVersion: 1, type: 'append-result', requestId: frame.requestId, result });
    await denied;
    if (result.status !== 'durable') assert.fail();
    socket.reply({ protocolVersion: 1, type: 'accepted', receipt: result.receipt, state: accountState });
    assert.equal(h.accepted.length, 0); assert.equal(h.transport.inspect().phase, 'denied');
    assert.equal(h.transport.inspect().history.at(-1)?.outcome, 'disconnected');
  } finally { h.transport.close(); }
});

test('P3 verified login expiry retires the socket and never automatically issues a new native session', async () => {
  const h = accountHarness();
  try {
    await h.ready(); h.clock.advance(20_000); await tick();
    assert.equal(h.transport.inspect().phase, 'denied'); assert.equal(h.access.at(-1), 'denied');
    assert.equal(h.clock.jobs.size, 0); assert.equal(h.admissions.length, 1);
    await assert.rejects(h.transport.state(), /access-denied/);
  } finally { h.transport.close(); }
});

test('P3 held HTTP admission cancels on pause, close and abort; late completion cannot create a socket', async () => {
  for (const action of ['pause', 'close', 'abort'] as const) {
    const h = accountHarness(), abort = new AbortController();
    let complete!: (value: SheetRelayAccountAdmissionResponse) => void;
    h.gate.admit = () => new Promise(resolve => { complete = resolve; });
    try {
      const promise = h.transport.authenticate({ protocolVersion: 1 }, abort.signal), rejected = assert.rejects(promise, /admission-cancelled/);
      await tick();
      if (action === 'pause') h.transport.setPaused(true); else if (action === 'close') h.transport.close(); else abort.abort();
      await rejected;
      complete({ protocolVersion: 1, ticket: '5'.repeat(64), expiresAt: 5_000, grantExpiresAt: 20_000, accountBinding });
      await tick(); assert.equal(h.sockets.length, 0); assert.equal(h.clock.jobs.size, 0);
    } finally { h.transport.close(); }
  }
});


test('P3 resumed native actor, session and context must remain the original owner', async () => {
  for (const field of ['actorId', 'sessionId', 'context'] as const) {
    const h = accountHarness();
    try {
      const first = await h.ready(); first.close(); await tick(); h.clock.advance(250); await tick();
      const socket = h.sockets[1]!; socket.open();
      const session: SheetRelayAccountSession = field === 'context' ? { ...accountOwner, context: { ...accountContext, generation: 'changed-generation' } } :
        { ...accountOwner, identity: { ...accountOwner.identity, [field]: 'changed-native-owner' } };
      const changedState = { ...accountState, context: session.context, admission: relayAdmission(session.context) };
      socket.reply({ protocolVersion: 1, type: 'account-authenticated', requestId: socket.last('authenticate-account').requestId, session, state: changedState });
      await tick(); assert.equal(h.transport.inspect().phase, 'denied'); assert.equal(h.accepted.length, 0);
    } finally { h.transport.close(); }
  }
});

test('P3 expired ticket cannot be sent and an expired admission cannot create a socket', async () => {
  const h = accountHarness();
  try {
    h.gate.admit = async () => ({ protocolVersion: 1, ticket: '6'.repeat(64), expiresAt: 100, grantExpiresAt: 20_000, accountBinding });
    const promise = h.transport.authenticate({ protocolVersion: 1 }), rejected = assert.rejects(promise, /ticket-expired/);
    await tick(); const socket = h.sockets[0]!; h.clock.advance(100); socket.open();
    await rejected; assert.equal(socket.sent.length, 0);
  } finally { h.transport.close(); }
  const a = accountHarness();
  try {
    a.clock.now = 6_000;
    a.gate.admit = async () => ({ protocolVersion: 1, ticket: '6'.repeat(64), expiresAt: 5_000, grantExpiresAt: 20_000, accountBinding });
    await assert.rejects(a.transport.authenticate({ protocolVersion: 1 }), /account-binding-denied/);
    assert.equal(a.sockets.length, 0); assert.equal(a.transport.inspect().phase, 'denied');
  } finally { a.transport.close(); }
});

test('P3 account authentication never accepts the controlled reply envelope', async () => {
  const h = accountHarness();
  try {
    const promise = h.transport.authenticate({ protocolVersion: 1 }), rejected = assert.rejects(promise, /reply-operation-mismatch/);
    await tick(); const socket = h.sockets[0]!; socket.open();
    socket.reply({ protocolVersion: 1, type: 'authenticated', requestId: socket.last('authenticate-account').requestId, session: owner, state });
    await rejected; assert.equal(h.transport.inspect().phase, 'waiting'); assert.equal(h.accepted.length, 0);
  } finally { h.transport.close(); }
});


test('P3 failed admission has no controlled fallback and leaves no unhandled cancellation or socket', async () => {
  for (const synchronous of [false, true]) {
    const h = accountHarness();
    try {
      h.gate.admit = synchronous ? () => { throw new Error('fixture-admission-failed'); } : async () => { throw new Error('fixture-admission-failed'); };
      await assert.rejects(h.transport.authenticate({ protocolVersion: 1 }), /fixture-admission-failed/);
      await tick(); assert.equal(h.sockets.length, 0); assert.equal(h.clock.jobs.size, 0);
      assert.equal(h.transport.inspect().phase, 'waiting');
    } finally { h.transport.close(); }
  }
});


test('P3 immediate retirement cancels admission before its HTTP callback starts', async () => {
  const h = accountHarness();
  try {
    const promise = h.transport.authenticate({ protocolVersion: 1 }), rejected = assert.rejects(promise, /admission-cancelled/);
    h.transport.close(); await rejected; await tick();
    assert.equal(h.admissions.length, 0); assert.equal(h.sockets.length, 0); assert.equal(h.clock.jobs.size, 0);
  } finally { h.transport.close(); }
});
