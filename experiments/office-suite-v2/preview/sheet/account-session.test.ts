import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableSession } from './durable-session.ts';
import type { DurableTransport, DurableTransportEvents } from './durable-session.ts';
import type { WebSocketSessionOwner, WebSocketTransportView } from './websocket-transport.ts';
import { prepareOutboxEnqueue, prepareOutboxMark } from './outbox.ts';
import type { OutboxStore, OutboxSnapshot, StoredClient, StoredPacket, PacketResult } from './outbox.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import { SheetController } from './controller.ts';
import { bytesToBase64, base64ToBytes, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountBinding, SheetRelayAccountSession, SheetRelayState, SheetRelayIdentity,
  SheetRelayAppendRequest, SheetRelayReceipt, SheetRelaySessionRequest, SheetRelayWsSession } from '../../src/sheet-preview-protocol.ts';

// Memory persistence and transport models with real native packets. No IdP, PG, IDB or browser proof.
const binding: SheetRelayAccountBinding = {
  issuer: 'https://issuer.example/realm', subject: 'account-a', userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222', workspaceId: '33333333-3333-4333-8333-333333333333',
  documentId: '44444444-4444-4444-8444-444444444444', loginBindingId: 'a'.repeat(64),
};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function hash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
class MemoryStore implements OutboxStore {
  snapshot: OutboxSnapshot = { client: null, packets: [] };
  loadGate: Promise<void> | undefined;
  readonly loaded = deferred<void>();
  marks = 0;
  async load(): Promise<OutboxSnapshot> { this.loaded.resolve(); await this.loadGate; return structuredClone(this.snapshot); }
  async createClient(client: StoredClient): Promise<void> { assert.equal(this.snapshot.client, null); this.snapshot = { client: structuredClone(client), packets: [] }; }
  async enqueue(_clientId: string, request: SheetRelayAppendRequest, identity: SheetRelayIdentity): Promise<StoredPacket> {
    const result = await prepareOutboxEnqueue(this.snapshot, request, identity);
    if (result.changed) this.snapshot = { client: result.client, packets: [...this.snapshot.packets, result.packet] };
    return structuredClone(result.packet);
  }
  async mark(_clientId: string, updateId: string, result: PacketResult): Promise<StoredPacket> {
    const old = this.snapshot.packets.find(packet => packet.request.packet.updateId === updateId); assert.ok(old);
    const packet = prepareOutboxMark(old, result); ++this.marks;
    this.snapshot = { ...this.snapshot, packets: this.snapshot.packets.map(item => item === old ? packet : item) };
    return structuredClone(packet);
  }
  close(): void {}
}
class AccountWire implements DurableTransport {
  readonly native: SheetReplica;
  readonly session: SheetRelayAccountSession;
  readonly bootstrap: SheetRelayState['bootstrap'];
  readonly events: DurableTransportEvents;
  phase: WebSocketTransportView['phase'] = 'idle';
  sequence = 1;
  authentication: (SheetRelayAccountSession | SheetRelayWsSession) | undefined;
  readonly calls: SheetRelaySessionRequest[] = [];
  readonly appends: SheetRelayAppendRequest[] = [];
  readonly appendStarted = deferred<void>();
  appendGate: Promise<void> | undefined;
  private constructor(native: SheetReplica, session: SheetRelayAccountSession, bootstrap: SheetRelayState['bootstrap'], events: DurableTransportEvents) {
    this.native = native; this.session = session; this.bootstrap = bootstrap; this.events = events;
  }
  static async create(events: DurableTransportEvents, original?: AccountWire): Promise<AccountWire> {
    if (original) return new AccountWire(new SheetReplica(original.session.context,
      { actorId: 'model-receiver', sessionId: 'model-receiver-session' }, original.native.exportUpdate()),
    original.session, original.bootstrap, events);
    const context = createWorkbookContext({ documentId: binding.documentId, workbookId: binding.documentId, generation: 'account-model-generation' });
    const seed = new SheetReplica(context, { actorId: 'bootstrap-actor', sessionId: 'bootstrap-session' });
    try {
      seed.commit({ kind: 'sheet.insert', sheetId: 'budget', name: 'Budget', afterSheetId: null });
      seed.commit({ kind: 'axis.insert', sheetId: 'budget', axis: 'row', id: 'r1', afterId: null });
      seed.commit({ kind: 'axis.insert', sheetId: 'budget', axis: 'column', id: 'c1', afterId: null });
      seed.commit({ kind: 'cell.commit', key: cell(seed), input: { kind: 'literal', value: 1 } });
      const bytes = seed.exportUpdate();
      const session: SheetRelayAccountSession = { protocolVersion: 1, controlled: false, credential: 'b'.repeat(64),
        identity: { actorId: 'verified-account-author', sessionId: 'native-editor-session' }, context,
        accountBinding: binding, access: 'read-write', expiresAt: Date.now() + 60_000 };
      return new AccountWire(new SheetReplica(context, { actorId: 'model-receiver', sessionId: 'model-receiver-session' }, bytes), session,
        { updateId: 'account-bootstrap', sha256: await hash(bytes), byteLength: bytes.length, identity: seed.identity }, events);
    } finally { seed.destroy(); }
  }
  async authenticate(request: SheetRelaySessionRequest) {
    this.calls.push(structuredClone(request)); this.phase = 'ready'; this.events.access('read-write');
    return { session: structuredClone(this.authentication ?? this.session), state: await this.state() };
  }
  async open(owner: WebSocketSessionOwner): Promise<SheetRelayState> {
    assert.equal(owner.controlled, false); assert.equal(owner.credential, this.session.credential);
    assert.deepEqual(owner.identity, this.session.identity);
    return this.state();
  }
  async state(): Promise<SheetRelayState> {
    const bytes = this.native.exportUpdate();
    return { protocolVersion: 1, context: this.session.context, admission: relayAdmission(this.session.context), latestSequence: this.sequence,
      bootstrap: this.bootstrap, state: { bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: await hash(bytes), frontierBase64: bytesToBase64(this.native.frontier()) } };
  }
  async append(request: SheetRelayAppendRequest) {
    this.appends.push(structuredClone(request));
    this.native.receive(base64ToBytes(request.packet.bytesBase64)); ++this.sequence;
    const receipt: SheetRelayReceipt = { context: request.context, admission: request.admission,
      updateId: request.packet.updateId, sha256: request.packet.sha256, sequence: this.sequence, frontierBase64: bytesToBase64(this.native.frontier()) };
    this.appendStarted.resolve(); await this.appendGate;
    return { protocolVersion: 1 as const, status: 'durable' as const, receipt };
  }
  setPaused(paused: boolean): void { this.phase = paused ? 'paused' : 'waiting'; }
  close(): void { this.phase = 'closed'; }
  inspect(): WebSocketTransportView { return { kind: 'websocket', phase: this.phase, generation: 1, framesSent: 0, framesReceived: 0,
    access: 'read-write', reconnectAttempt: 0, pending: [], history: [] }; }
}
function cell(replica: SheetReplica) { const result = new ReferenceIndex(replica.projection).keyAt('budget', 0, 0); assert.ok(result); return result; }
function value(replica: SheetReplica) { const engine = new CalculationEngine(replica.projection); engine.recalculate(); const result = engine.read(cell(replica)); assert.equal(result.status, 'fresh'); return result.status === 'fresh' ? result.value : null; }
function edit(session: DurableSession) {
  assert.ok(session.replica);
  const change = session.replica.commit({ kind: 'cell.commit', key: cell(session.replica), input: { kind: 'literal', value: 9 } });
  session.publish(change.event.eventId, change.update); return change;
}
async function setup(store = new MemoryStore(), accountBinding = binding, newClient = true, original?: AccountWire) {
  let events!: DurableTransportEvents;
  const proxy: DurableTransport = {
    authenticate: request => wire.authenticate(request), open: owner => wire.open(owner),
    append: request => wire.append(request), state: () => wire.state(),
    setPaused: paused => { wire.setPaused(paused); }, close: () => { wire.close(); }, inspect: () => wire.inspect(),
  };
  let current = true, httpCalls = 0;
  const session = new DurableSession({ clientId: 'account-client', newClient, store,
    account: { binding: accountBinding, isCurrent: () => current },
    request: async () => { ++httpCalls; throw new Error('Account HTTP fallback forbidden'); },
    transport: callbacks => { events = callbacks; return proxy; }, changed: () => {} });
  const wire = await AccountWire.create(events, original);
  return { session, wire, store, retire: () => { current = false; }, httpCalls: () => httpCalls,
    close: async () => { session.close(); await session.settled(); session.replica?.destroy(); wire.native.destroy(); } };
}

test('account session persists real native original edit and own Undo without HTTP or ephemeral credentials in IDB', async () => {
  const m = await setup();
  try {
    await m.session.start(); assert.equal(m.session.inspect().canEdit, true);
    assert.equal(m.store.snapshot.client?.version, 2);
    assert.equal(m.store.snapshot.client?.session.controlled, false);
    assert.ok(!JSON.stringify(m.store.snapshot.client).includes('expiresAt'));
    assert.equal(Object.hasOwn(m.store.snapshot.client!.session, 'access'), false);
    const change = edit(m.session); await m.session.settled();
    assert.deepEqual(base64ToBytes(m.store.snapshot.packets[0]!.request.packet.bytesBase64), change.update);
    assert.equal(m.session.inspect().confirmed, 1); assert.equal(value(m.wire.native), 9);
    const undo = m.session.replica!.undo(change.event.eventId); m.session.publish(undo.event.eventId, undo.update);
    await m.session.settled();
    assert.equal(value(m.session.replica!), 1); assert.equal(value(m.wire.native), 1);
    assert.equal(m.session.inspect().confirmed, 2); assert.equal(m.httpCalls(), 0);
  } finally { await m.close(); }
});

test('controlled or foreign issued authentication is refused before client persistence or HTTP fallback', async () => {
  for (const mode of ['controlled', 'foreign'] as const) {
    const m = await setup();
    try {
      m.wire.authentication = mode === 'controlled' ? { protocolVersion: 1, controlled: true, credential: m.wire.session.credential,
        context: m.wire.session.context, identity: m.wire.session.identity, access: 'read-write' } :
        { ...m.wire.session, accountBinding: { ...binding, subject: 'foreign-account' } };
      await m.session.start();
      assert.equal(m.session.inspect().phase, 'blocked'); assert.equal(m.session.replica, undefined);
      assert.equal(m.store.snapshot.client, null); assert.equal(m.wire.appends.length, 0); assert.equal(m.httpCalls(), 0);
    } finally { await m.close(); }
  }
});

test('retirement while original store load awaits prevents authentication and replica creation', async () => {
  const store = new MemoryStore(), gate = deferred<void>(); store.loadGate = gate.promise;
  const m = await setup(store);
  try {
    const opening = m.session.start(); await store.loaded.promise;
    m.retire(); gate.resolve(); await opening;
    assert.equal(m.wire.calls.length, 0); assert.equal(m.session.replica, undefined); assert.equal(m.session.inspect().canEdit, false);
  } finally { gate.resolve(); await m.close(); }
});

test('retirement after native COMMIT but before held ACK cannot confirm or change accepted history', async () => {
  const m = await setup(), gate = deferred<void>(); m.wire.appendGate = gate.promise;
  try {
    await m.session.start(); const initial = m.session.inspect();
    edit(m.session); await m.wire.appendStarted.promise;
    assert.equal(value(m.wire.native), 9);
    const original = structuredClone(m.store.snapshot);
    m.retire(); gate.resolve(); await m.session.settled();
    assert.equal(m.session.inspect().confirmed, 0); assert.equal(m.session.inspect().canEdit, false);
    assert.equal(m.session.inspect().acceptedSequence, initial.acceptedSequence);
    assert.equal(m.session.inspect().acceptedStateHash, initial.acceptedStateHash);
    assert.deepEqual(m.store.snapshot, original); assert.equal(m.store.marks, 0);
  } finally { gate.resolve(); await m.close(); }
});

test('pending original cannot be adopted by a new login SID or legacy controlled client', async () => {
  const original = await setup();
  try {
    await original.session.start(); original.session.setOutgoingPaused(true); edit(original.session); await original.session.settled();
    assert.equal(original.store.snapshot.packets.length, 1);
    for (const legacy of [false, true]) {
      const store = new MemoryStore(); store.snapshot = structuredClone(original.store.snapshot);
      if (legacy) {
        const client = store.snapshot.client!;
        store.snapshot = { ...store.snapshot, client: { ...client, version: 1, session: { protocolVersion: 1, controlled: true,
          credential: client.session.credential, identity: client.session.identity, context: client.session.context } } };
      }
      const snapshot = structuredClone(store.snapshot);
      const next = await setup(store, legacy ? binding : { ...binding, loginBindingId: 'c'.repeat(64) }, true);
      try {
        await next.session.start();
        assert.equal(next.session.inspect().phase, 'blocked'); assert.equal(next.wire.calls.length, 0);
        assert.equal(next.wire.appends.length, 0); assert.equal(next.session.replica, undefined); assert.deepEqual(store.snapshot, snapshot);
      } finally { await next.close(); }
    }
  } finally { await original.close(); }
});

test('same original login resumes pending packet with original credential and native bytes', async () => {
  const first = await setup();
  try {
    await first.session.start(); first.session.setOutgoingPaused(true);
    const change = edit(first.session); await first.session.settled();
    const snapshot = structuredClone(first.store.snapshot);
    const store = new MemoryStore(); store.snapshot = snapshot;
    const next = await setup(store, binding, false, first.wire);
    try {
      await next.session.start();
      assert.equal(next.session.inspect().canEdit, true);
      assert.deepEqual(next.wire.calls, [{ protocolVersion: 1, resumeCredential: snapshot.client!.session.credential }]);
      assert.equal(next.wire.appends.length, 1);
      assert.deepEqual(next.wire.appends[0], snapshot.packets[0]!.request);
      assert.deepEqual(base64ToBytes(next.wire.appends[0]!.packet.bytesBase64), change.update);
      assert.deepEqual(store.snapshot.client!.session, snapshot.client!.session);
      assert.equal(next.session.inspect().confirmed, 1); assert.equal(value(next.session.replica!), 9); assert.equal(next.httpCalls(), 0);
    } finally { await next.close(); }
  } finally { await first.close(); }
});

test('missing original in an existing account link refuses before native session issuance', async () => {
  const m = await setup(new MemoryStore(), binding, false);
  try {
    await m.session.start(); assert.equal(m.session.inspect().phase, 'blocked');
    assert.equal(m.wire.calls.length, 0); assert.equal(m.session.replica, undefined); assert.equal(m.store.snapshot.client, null);
  } finally { await m.close(); }
});

test('retirement between controller native commit and publish retains exact local-only input and unload count', async () => {
  const m = await setup();
  try {
    await m.session.start(); assert.ok(m.session.replica);
    const stored = structuredClone(m.store.snapshot);
    const priorEvents = m.session.replica.events.length;
    let original: { eventId: string; update: Uint8Array } | undefined;
    const controller = new SheetController(m.session.replica, change => {
      original = { eventId: change.event.eventId, update: change.update.slice() };
      // The native event already exists. Current auth retires before its observer delivers bytes.
      m.retire(); m.session.close();
      m.session.publish(change.event.eventId, change.update);
      change.update.fill(0); // An observer's mutable buffer cannot alter the retained copy.
    }, 'durable');
    controller.startEdit('9'); assert.equal(controller.commit(), true);
    await m.session.settled(); assert.ok(original);
    assert.equal(m.session.replica.events.length, priorEvents + 1);
    assert.equal(m.session.replica.events.some(event => event.eventId === original!.eventId), true);
    assert.equal(value(m.session.replica), 9);
    const retained = m.session.inspect();
    assert.equal(retained.phase, 'closed'); assert.equal(retained.canEdit, false);
    assert.equal(retained.localOnly, 1); assert.equal(retained.packets[0]!.persisted, false);
    assert.equal(retained.packets[0]!.updateId, original.eventId);
    assert.equal(retained.packets[0]!.byteLength, original.update.length);
    // The existing page's warning reads this count; this model does not dispatch beforeunload.
    assert.ok(retained.localOnly + retained.pending + retained.ackUnknown > 0);
    assert.deepEqual(m.store.snapshot, stored); assert.equal(m.wire.appends.length, 0); assert.equal(m.store.marks, 0);
    m.session.publish(original.eventId, original.update);
    await m.session.settled();
    assert.equal(m.session.inspect().localOnly, 1);
    assert.deepEqual(m.session.inspect().packets, retained.packets);
    assert.ok(!m.session.inspect().notice.includes('reused an update ID'));
    assert.deepEqual(m.store.snapshot, stored); assert.equal(m.wire.appends.length, 0);
  } finally { await m.close(); }
});
