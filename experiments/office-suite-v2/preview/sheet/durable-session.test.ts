import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { DurableSession } from './durable-session.ts';
import type { DurableTransport, DurableTransportEvents } from './durable-session.ts';
import type { WebSocketTransportView } from './websocket-transport.ts';
import { createPreviewReplica } from './fixture.ts';
import { SheetController } from './controller.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import { SHEET_RELAY_PATH, bytesToBase64, base64ToBytes, parseSheetRelayAppendRequest, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelaySession, SheetRelayState, SheetRelayReceipt, SheetRelayAppendRequest, SheetRelayIdentity, SheetRelaySessionRequest, SheetRelayAccess } from '../../src/sheet-preview-protocol.ts';
import { prepareOutboxEnqueue, prepareOutboxMark } from './outbox.ts';
import type { OutboxStore, OutboxSnapshot, StoredClient, StoredPacket, PacketResult } from './outbox.ts';

// Controlled HTTP and memory-outbox models only. These tests prove no real IndexedDB, server or restart behavior.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice())), byte => byte.toString(16).padStart(2, '0')).join('');
}
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

class MemoryOutbox implements OutboxStore {
  snapshot: OutboxSnapshot = { client: null, packets: [] };
  readonly events: string[] = [];
  readonly loadStarted = deferred<void>();
  readonly createStarted = deferred<void>();
  readonly enqueueStarted = deferred<void>();
  loadGate: Promise<void> | undefined;
  createGate: Promise<void> | undefined;
  enqueueGate: Promise<void> | undefined;
  failEnqueue = false;
  failMark = false;
  enqueued: ((packet: StoredPacket) => void) | undefined;
  async load(_clientId: string): Promise<OutboxSnapshot> {
    this.events.push('load'); this.loadStarted.resolve(undefined); await this.loadGate;
    return structuredClone(this.snapshot);
  }
  async createClient(client: StoredClient): Promise<void> {
    this.createStarted.resolve(undefined); await this.createGate;
    assert.equal(this.snapshot.client, null);
    this.snapshot = { client: structuredClone(client), packets: [] }; this.events.push('client-complete');
  }
  async enqueue(_clientId: string, request: SheetRelayAppendRequest, identity: SheetRelayIdentity): Promise<StoredPacket> {
    this.enqueueStarted.resolve(undefined); await this.enqueueGate;
    if (this.failEnqueue) throw new Error('controlled-outbox-failure');
    const plan = await prepareOutboxEnqueue(this.snapshot, request, identity);
    if (plan.changed) this.snapshot = { client: plan.client, packets: [...this.snapshot.packets, plan.packet] };
    this.events.push(`packet-complete:${request.packet.updateId}`);
    this.enqueued?.(plan.packet);
    return structuredClone(plan.packet);
  }
  async mark(_clientId: string, updateId: string, result: PacketResult): Promise<StoredPacket> {
    if (this.failMark) throw new Error('controlled-mark-failure');
    const original = this.snapshot.packets.find(packet => packet.request.packet.updateId === updateId);
    assert.ok(original);
    const packet = prepareOutboxMark(original, result);
    this.snapshot = { ...this.snapshot, packets: this.snapshot.packets.map(item => item === original ? packet : item) };
    return structuredClone(packet);
  }
  close(): void { this.events.push('store-close'); }
}
type Call = { path: string; init: RequestInit; body: unknown };
class ControlledHTTP {
  readonly native: SheetReplica;
  readonly session: SheetRelaySession;
  readonly descriptor: SheetRelayState['bootstrap'];
  readonly calls: Call[] = [];
  readonly receipts = new Map<string, SheetRelayReceipt>();
  sequence = 1;
  intercept: ((call: Call, next: () => Promise<Response>) => Promise<Response>) | undefined;
  private constructor(native: SheetReplica, session: SheetRelaySession, descriptor: SheetRelayState['bootstrap']) {
    this.native = native; this.session = session; this.descriptor = descriptor;
  }
  static async create(): Promise<ControlledHTTP> {
    const bootstrap = createPreviewReplica('durable-controlled-generation');
    try {
      const bytes = bootstrap.exportUpdate();
      const session: SheetRelaySession = { protocolVersion: 1, controlled: true, credential: 'a'.repeat(64),
        identity: { actorId: 'controlled-client-actor', sessionId: 'controlled-client-session' }, context: bootstrap.context };
      const native = new SheetReplica(bootstrap.context, { actorId: 'controlled-model', sessionId: 'controlled-model-session' }, bytes);
      return new ControlledHTTP(native, session, { updateId: 'original-bootstrap', sha256: await hash(bytes), byteLength: bytes.length, identity: bootstrap.identity });
    } finally { bootstrap.destroy(); }
  }
  async state(): Promise<SheetRelayState> {
    const bytes = this.native.exportUpdate();
    return { protocolVersion: 1, context: this.session.context, admission: relayAdmission(this.session.context), latestSequence: this.sequence,
      state: { bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: await hash(bytes), frontierBase64: bytesToBase64(this.native.frontier()) }, bootstrap: this.descriptor };
  }
  readonly request: typeof fetch = async (input, init = {}) => {
    const call: Call = { path: String(input).slice(SHEET_RELAY_PATH.length), init, body: typeof init.body === 'string' ? JSON.parse(init.body) as unknown : null };
    this.calls.push(call);
    const next = () => this.respond(call);
    return this.intercept ? this.intercept(call, next) : next();
  };
  private async respond(call: Call): Promise<Response> {
    if (call.path === '/session') {
      const body = call.body as { protocolVersion: number; resumeCredential?: string };
      assert.equal(body.protocolVersion, 1);
      if (body.resumeCredential !== undefined && body.resumeCredential !== this.session.credential) return json({ code: 'DENIED' }, 403);
      return json(this.session);
    }
    assert.equal(new Headers(call.init.headers).get('Authorization'), `Bearer ${this.session.credential}`);
    if (call.path === '/open' || call.path === '/state') return json(await this.state());
    assert.equal(call.path, '/append');
    const request = parseSheetRelayAppendRequest(call.body);
    const bytes = base64ToBytes(request.packet.bytesBase64);
    assert.equal(await hash(bytes), request.packet.sha256);
    let receipt = this.receipts.get(request.packet.updateId);
    if (!receipt) {
      this.native.receive(bytes); this.sequence++;
      receipt = { context: request.context, admission: request.admission, updateId: request.packet.updateId, sha256: request.packet.sha256,
        sequence: this.sequence, frontierBase64: bytesToBase64(this.native.frontier()) };
      this.receipts.set(request.packet.updateId, receipt);
    }
    return json({ protocolVersion: 1, status: 'durable', receipt });
  }
  inject(bytes: Uint8Array): void { this.native.receive(bytes); this.sequence++; }
  close(): void { this.native.destroy(); }
}
async function setup(store = new MemoryOutbox()) {
  const http = await ControlledHTTP.create();
  const session = new DurableSession({ clientId: 'client-1', newClient: true, store, request: http.request, changed: () => {} });
  await session.start(); assert.equal(session.inspect().phase, 'ready');
  return { store, http, session, close: () => { session.close(); session.replica?.destroy(); http.close(); } };
}
function key(replica: SheetReplica, sheet = 'sheet-budget', row = 2, column = 2) {
  const cell = new ReferenceIndex(replica.projection).keyAt(sheet, row - 1, column - 1); assert.ok(cell); return cell;
}
function value(replica: SheetReplica, cell = key(replica)) {
  const calculation = new CalculationEngine(replica.projection); calculation.recalculate();
  const result = calculation.read(cell); assert.ok(result.status === 'fresh'); return result.value;
}
function publish(session: DurableSession, number = 9, id?: string) {
  assert.ok(session.replica);
  const change = session.replica.commit({ kind: 'cell.commit', key: key(session.replica), input: { kind: 'literal', value: number } }, id);
  session.publish(change.event.eventId, change.update); return change;
}
function pendingFixture(template: SheetReplica, eventId: string, dependencies: readonly string[]): Uint8Array {
  const read = new Y.Doc(), fixture = new Y.Doc();
  try {
    read.getMap('native-events-v1'); Y.applyUpdate(read, template.exportUpdate());
    const original = template.events.find(event => event.command.kind === 'sheet.insert'); assert.ok(original);
    const encoded = read.getMap<string>('native-events-v1').get(original.eventId); assert.ok(encoded);
    const event = JSON.parse(encoded) as { eventId: string; dependencies: readonly string[]; command: { sheetId: string; name: string } };
    event.eventId = eventId; event.dependencies = dependencies; event.command.sheetId = `sheet-${eventId}`; event.command.name = eventId;
    fixture.getMap('native-events-v1').set(eventId, JSON.stringify(event)); return Y.encodeStateAsUpdate(fixture);
  } finally { read.destroy(); fixture.destroy(); }
}

test('controlled seams: load precedes issuance, private session persistence precedes editing, packet completion precedes append', async () => {
  const store = new MemoryOutbox(), load = deferred<void>(), create = deferred<void>(), enqueue = deferred<void>();
  store.loadGate = load.promise; store.createGate = create.promise; store.enqueueGate = enqueue.promise;
  const http = await ControlledHTTP.create();
  const session = new DurableSession({ clientId: 'client-1', newClient: true, store, request: http.request, changed: () => {} });
  try {
    const start = session.start(); await store.loadStarted.promise;
    assert.equal(http.calls.length, 0); load.resolve(undefined);
    await store.createStarted.promise;
    assert.equal(session.replica, undefined); assert.equal(session.inspect().phase, 'opening');
    assert.ok(!JSON.stringify(session.inspect()).includes(http.session.credential));
    create.resolve(undefined); await start;
    const change = publish(session);
    assert.equal(session.inspect().localOnly, 1);
    assert.equal(session.inspect().packets[0]?.persisted, false);
    await store.enqueueStarted.promise;
    assert.equal(http.calls.filter(call => call.path === '/append').length, 0);
    enqueue.resolve(undefined); await session.settled();
    assert.equal(store.events.includes(`packet-complete:${change.event.eventId}`), true);
    const sent = http.calls.find(call => call.path === '/append'); assert.ok(sent);
    assert.deepEqual(base64ToBytes(parseSheetRelayAppendRequest(sent.body).packet.bytesBase64), change.update);
    assert.equal(session.inspect().confirmed, 1); assert.equal(session.inspect().localOnly, 0);
    assert.equal(session.inspect().packets[0]?.persisted, true);
    assert.match(session.inspect().packets[0]?.receiptFrontierSha256 ?? '', /^[a-f0-9]{64}$/);
  } finally { session.close(); await session.settled(); session.replica?.destroy(); http.close(); }
});

test('controlled resume uses only the original credential and blocks missing, orphaned or denied credentials without fresh fallback', async () => {
  const f = await setup();
  try {
    f.session.close(); await f.session.settled();
    const original = structuredClone(f.store.snapshot);
    const resumed = new DurableSession({ clientId: 'client-1', newClient: true, store: f.store, request: f.http.request, changed: () => {} });
    await resumed.start();
    assert.equal(resumed.inspect().phase, 'ready');
    assert.deepEqual(f.http.calls.filter(call => call.path === '/session').at(-1)?.body, { protocolVersion: 1, resumeCredential: f.http.session.credential });
    resumed.close(); resumed.replica?.destroy();
    const before = f.http.calls.length;
    for (const corrupt of [
      { client: null, packets: [] },
      { client: { ...original.client, session: { ...original.client!.session, credential: '' } }, packets: [] },
      { client: null, packets: [undefined] },
    ]) {
      const store = new MemoryOutbox(); store.snapshot = corrupt as unknown as OutboxSnapshot;
      const blocked = new DurableSession({ clientId: 'client-1', newClient: false, store, request: f.http.request, changed: () => {} });
      await blocked.start(); assert.equal(blocked.inspect().phase, 'blocked'); assert.equal(blocked.replica, undefined); blocked.close();
    }
    assert.equal(f.http.calls.length, before);
    f.store.snapshot = original;
    f.http.intercept = async (call, next) => call.path === '/session' ? json({ code: 'DENIED' }, 403) : next();
    const denied = new DurableSession({ clientId: 'client-1', newClient: true, store: f.store, request: f.http.request, changed: () => {} });
    await denied.start(); assert.equal(denied.inspect().phase, 'blocked'); denied.close();
    assert.equal(f.http.calls.length, before + 1);
    assert.deepEqual(f.http.calls.at(-1)?.body, { protocolVersion: 1, resumeCredential: f.http.session.credential });
    assert.deepEqual(f.store.snapshot, original);
  } finally { f.close(); }
});

test('controlled ACK loss retries exactly the original ID, bytes, credential and ordinal', async () => {
  const f = await setup();
  try {
    let lost = false;
    f.http.intercept = async (call, next) => {
      const response = await next();
      if (call.path === '/append' && !lost) { lost = true; throw new Error('controlled-after-commit-reply-loss'); }
      return response;
    };
    const change = publish(f.session, 8); await f.session.settled();
    assert.equal(f.session.inspect().ackUnknown, 1); assert.equal(f.session.inspect().confirmed, 0);
    assert.equal(value(f.session.replica!), 8);
    assert.equal(f.http.receipts.size, 1);
    const original = structuredClone(f.store.snapshot.packets[0]!);
    await f.session.retry();
    const sends = f.http.calls.filter(call => call.path === '/append'); assert.equal(sends.length, 2);
    assert.deepEqual(sends[0]!.body, sends[1]!.body);
    assert.equal(parseSheetRelayAppendRequest(sends[1]!.body).packet.updateId, change.event.eventId);
    assert.equal(f.store.snapshot.packets[0]?.ordinal, original.ordinal);
    assert.equal(f.session.inspect().confirmed, 1); assert.equal(f.session.inspect().ackUnknown, 0);
    assert.equal(f.http.receipts.size, 1);
  } finally { f.close(); }
});

test('controlled pending fetch cannot block newer outbox persistence; late ACK confirms only its own packet', async () => {
  const f = await setup(), reply = deferred<void>(), entered = deferred<void>(), secondReply = deferred<void>(), secondEntered = deferred<void>();
  try {
    let count = 0;
    f.http.intercept = async (call, next) => {
      const response = await next();
      if (call.path === '/append') {
        count++;
        if (count === 1) { entered.resolve(undefined); await reply.promise; }
        if (count === 2) { secondEntered.resolve(undefined); await secondReply.promise; }
      }
      return response;
    };
    const earlier = publish(f.session, 8); await entered.promise;
    const persisted = deferred<void>(); f.store.enqueued = () => persisted.resolve(undefined);
    const newer = publish(f.session, 10);
    assert.equal(f.session.inspect().localOnly, 1); await persisted.promise;
    assert.equal(f.store.snapshot.packets.length, 2, 'a hanging fetch cannot keep later edits only in RAM');
    assert.equal(f.session.inspect().persistenceBlocked, false);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 1);
    reply.resolve(undefined); await secondEntered.promise;
    const view = f.session.inspect();
    assert.equal(view.localOnly, 0);
    assert.equal(view.confirmed, 1); assert.equal(view.pending, 1);
    assert.equal(view.packets.find(packet => packet.updateId === earlier.event.eventId)?.state, 'durable');
    assert.equal(view.packets.find(packet => packet.updateId === newer.event.eventId)?.state, 'pending');
    assert.match(view.notice, /Pending: 1/); assert.equal(value(f.session.replica!), 10);
    secondReply.resolve(undefined); await f.session.settled(); assert.equal(f.session.inspect().confirmed, 2);
  } finally { reply.resolve(undefined); secondReply.resolve(undefined); f.close(); }
});

test('controlled mismatched receipts remain ACK unknown and never confirm another packet', async () => {
  for (const fault of ['protocol', 'id', 'sha', 'context', 'admission', 'sequence', 'frontier', 'malformed-vector', 'empty-vector', 'trailing-vector'] as const) {
    const f = await setup();
    try {
      f.http.intercept = async (call, next) => {
        const response = await next(); if (call.path !== '/append') return response;
        const result = await response.json() as { protocolVersion: number; receipt: SheetRelayReceipt };
        const receipt = { ...result.receipt };
        if (fault === 'protocol') result.protocolVersion = 2;
        if (fault === 'id') receipt.updateId = 'unrelated-packet';
        if (fault === 'sha') receipt.sha256 = 'b'.repeat(64);
        if (fault === 'context') receipt.context = { ...receipt.context, generation: 'other-generation' };
        if (fault === 'admission') receipt.admission = { ...receipt.admission, generation: 'other-generation' };
        if (fault === 'sequence') receipt.sequence = 0;
        if (fault === 'frontier') receipt.frontierBase64 = '!!!!';
        if (fault === 'malformed-vector') receipt.frontierBase64 = bytesToBase64(new Uint8Array([255]));
        if (fault === 'empty-vector') receipt.frontierBase64 = bytesToBase64(new Uint8Array([0]));
        if (fault === 'trailing-vector') receipt.frontierBase64 = bytesToBase64(new Uint8Array([...base64ToBytes(receipt.frontierBase64), 0]));
        return json({ ...result, receipt });
      };
      const change = publish(f.session); await f.session.settled();
      assert.equal(f.session.inspect().confirmed, 0, fault);
      assert.equal(f.session.inspect().ackUnknown, 1, fault);
      assert.equal(f.store.snapshot.packets[0]?.request.packet.updateId, change.event.eventId);
      assert.equal(value(f.session.replica!), 9);
    } finally { f.close(); }
  }
});

test('controlled decreasing or corrupt accepted-state polls preserve native and outbox history', async () => {
  const f = await setup();
  try {
    const old = await f.http.state();
    publish(f.session, 7); await f.session.settled();
    const projection = f.session.replica!.projection, records = structuredClone(f.store.snapshot);
    for (const fault of ['decrease', 'hash', 'length', 'frontier', 'bootstrap', 'body-limit', 'utf8'] as const) {
      f.http.intercept = async (call, next) => {
        if (call.path !== '/state') return next();
        if (fault === 'body-limit') return new Response(' '.repeat(1_500_001));
        if (fault === 'utf8') return new Response(new Uint8Array([0xff]));
        const original = structuredClone(fault === 'decrease' ? old : await f.http.state());
        const state = { ...original, state: { ...original.state }, bootstrap: { ...original.bootstrap } };
        if (fault === 'hash') state.state.sha256 = 'c'.repeat(64);
        if (fault === 'length') state.state.byteLength++;
        if (fault === 'frontier') state.state.frontierBase64 = bytesToBase64(new Uint8Array([0]));
        if (fault === 'bootstrap') state.bootstrap.updateId = 'new-bootstrap';
        return json(state);
      };
      await f.session.refresh();
      assert.deepEqual(f.session.replica!.projection, projection, fault);
      assert.deepEqual(f.store.snapshot, records, fault);
      assert.equal(f.session.inspect().confirmed, 1, fault);
      assert.match(f.session.inspect().notice, /refresh refused or unavailable/, fault);
    }
  } finally { f.close(); }
});

test('controlled persistence failure retains original memory; retry and duplicate callbacks do not re-author', async () => {
  const f = await setup();
  try {
    f.store.failEnqueue = true;
    const change = publish(f.session, 6); const original = change.update.slice();
    change.update.fill(255); await f.session.settled();
    assert.equal(f.session.inspect().localOnly, 1); assert.equal(f.store.snapshot.packets.length, 0);
    assert.equal(f.session.inspect().persistenceBlocked, true);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 0);
    assert.equal(value(f.session.replica!), 6);
    f.session.publish(change.event.eventId, original);
    assert.equal(f.session.inspect().localOnly, 1);
    f.store.failEnqueue = false; await f.session.retry();
    assert.equal(f.store.snapshot.packets.length, 1);
    assert.deepEqual(base64ToBytes(f.store.snapshot.packets[0]!.request.packet.bytesBase64), original);
    assert.equal(f.store.snapshot.packets[0]?.ordinal, 0);
    assert.equal(f.session.inspect().persistenceBlocked, false);
    f.session.publish(change.event.eventId, original); await f.session.settled();
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 1);
    assert.equal(f.session.inspect().confirmed, 1);
  } finally { f.close(); }
});

test('controlled native pending replay uses original local bytes, then exact receipt and remote dependency permit calculation', async () => {
  const f = await setup(); let resumed: DurableSession | undefined;
  try {
    f.http.inject(pendingFixture(f.http.native, 'pending-head', ['missing-head']));
    await f.session.refresh(); f.session.setPaused(true);
    const change = publish(f.session, 9); await f.session.settled();
    assert.equal(f.session.replica!.projection.outcomes[change.event.eventId]?.status, 'pending');
    assert.equal(f.session.inspect().pending, 1);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 0);
    const packet = structuredClone(f.store.snapshot.packets[0]!);
    f.session.close(); await f.session.settled();
    resumed = new DurableSession({ clientId: 'client-1', newClient: false, store: f.store, request: f.http.request, changed: () => {} });
    await resumed.start(); assert.equal(resumed.inspect().phase, 'ready');
    assert.equal(resumed.replica!.projection.outcomes[change.event.eventId]?.status, 'pending');
    assert.equal(resumed.inspect().confirmed, 1, 'durable packet receipt is distinct from native pending outcome');
    assert.deepEqual(f.store.snapshot.packets[0]?.request, packet.request);
    f.http.inject(pendingFixture(f.http.native, 'missing-head', []));
    await resumed.refresh();
    assert.equal(resumed.replica!.projection.outcomes[change.event.eventId]?.status, 'applied');
    assert.equal(value(resumed.replica!), 9);
    const controller = new SheetController(resumed.replica!);
    assert.equal(controller.canUndo, false, 'a new controller never claims old tab history');
  } finally { resumed?.close(); resumed?.replica?.destroy(); f.close(); }
});

test('controlled native refused deltas still receive their own exact durable packet receipt', async () => {
  const f = await setup();
  try {
    const change = f.session.replica!.undo('missing-native-target');
    assert.equal(f.session.replica!.projection.outcomes[change.event.eventId]?.status, 'refused');
    f.session.publish(change.event.eventId, change.update); await f.session.settled();
    assert.equal(f.session.inspect().confirmed, 1);
    assert.equal(f.http.native.projection.outcomes[change.event.eventId]?.status, 'refused');
    assert.deepEqual(base64ToBytes(f.store.snapshot.packets[0]!.request.packet.bytesBase64), change.update);
    assert.equal(f.store.snapshot.packets[0]?.receipt?.updateId, change.event.eventId);
  } finally { f.close(); }
});

test('controlled server rejection keeps its original packet and code until an explicit exact retry', async () => {
  const f = await setup();
  try {
    f.http.intercept = async (call, next) => {
      if (call.path !== '/append') return next();
      const request = parseSheetRelayAppendRequest(call.body);
      return json({ protocolVersion: 1, status: 'rejected', code: 'CONTROLLED_REJECTION', updateId: request.packet.updateId }, 409);
    };
    publish(f.session); await f.session.settled();
    assert.equal(f.session.inspect().rejected, 1); assert.equal(f.session.inspect().confirmed, 0);
    assert.equal(f.store.snapshot.packets[0]?.error, 'CONTROLLED_REJECTION');
    const original = structuredClone(f.store.snapshot.packets[0]!.request);
    await f.session.refresh();
    assert.equal(f.session.inspect().rejected, 1, 'accepted polling cannot erase a rejected original packet');
    f.http.intercept = undefined; await f.session.retry();
    assert.deepEqual(f.http.calls.filter(call => call.path === '/append').at(-1)?.body, original);
    assert.equal(f.session.inspect().confirmed, 1); assert.equal(f.session.inspect().rejected, 0);
    assert.equal(f.store.snapshot.packets.length, 1);
  } finally { f.close(); }
});

test('controlled remote merge preserves composing draft and current-session Undo while cross-sheet calculation stays native', async () => {
  const f = await setup(); const replica = f.session.replica!;
  const controller = new SheetController(replica, change => f.session.publish(change.event.eventId, change.update));
  const remote = new SheetReplica(replica.context, { actorId: 'other-actor', sessionId: 'other-session' }, f.http.native.exportUpdate());
  try {
    const quantity = key(replica), rate = key(replica, 'sheet-rates');
    controller.select(quantity); controller.startEdit('5'); assert.equal(controller.commit(), true);
    await f.session.settled(); remote.receive(f.http.native.exportUpdate());
    controller.startEdit('draft 한국'); controller.setComposing(true); const draft = controller.draft;
    const change = remote.commit({ kind: 'cell.commit', key: rate, input: { kind: 'literal', value: 10 } });
    f.http.inject(change.update); await f.session.refresh(); controller.synchronize();
    assert.deepEqual(controller.draft, draft);
    assert.equal(value(replica, key(replica, 'sheet-budget', 4, 4)), 58);
    controller.setComposing(false); controller.cancel(); assert.equal(controller.undo(), true);
    await f.session.settled();
    assert.equal(value(replica, quantity), 3); assert.equal(value(replica, rate), 10);
    assert.equal(value(replica, key(replica, 'sheet-budget', 4, 4)), 38);
  } finally { remote.destroy(); f.close(); }
});

test('controlled close during a state hash/request prevents late native merge and keeps durable records', async () => {
  const f = await setup(), entered = deferred<void>(), gate = deferred<void>();
  try {
    publish(f.session); await f.session.settled();
    const before = f.session.replica!.projection, records = structuredClone(f.store.snapshot);
    const remote = new SheetReplica(f.http.session.context, { actorId: 'late-actor', sessionId: 'late-session' }, f.http.native.exportUpdate());
    try { f.http.inject(remote.commit({ kind: 'cell.commit', key: key(remote), input: { kind: 'literal', value: 33 } }).update); }
    finally { remote.destroy(); }
    f.http.intercept = async (call, next) => {
      const response = await next(); if (call.path === '/state') { entered.resolve(undefined); await gate.promise; } return response;
    };
    const refresh = f.session.refresh(); await entered.promise; f.session.close(); gate.resolve(undefined);
    await refresh; await f.session.settled();
    assert.equal(f.session.inspect().phase, 'closed');
    assert.deepEqual(f.session.replica!.projection, before); assert.deepEqual(f.store.snapshot, records);
    const calls = f.http.calls.length;
    f.session.publish('after-close', new Uint8Array([0])); await f.session.retry(); await f.session.refresh();
    assert.equal(f.http.calls.length, calls);
  } finally { gate.resolve(undefined); f.close(); }
});

/** Operation-level model only. The real browser framing/reconnect model lives in websocket-transport.test.ts. */
class SocketOperations implements DurableTransport {
  phase: WebSocketTransportView['phase'] = 'idle';
  role: SheetRelayAccess = 'read-write';
  denied = false;
  readonly http: ControlledHTTP;
  readonly events: DurableTransportEvents;
  constructor(http: ControlledHTTP, events: DurableTransportEvents) { this.http = http; this.events = events; }
  async authenticate(request: SheetRelaySessionRequest) {
    const response = await this.http.request(`${SHEET_RELAY_PATH}/session`, { method: 'POST', body: JSON.stringify(request) });
    if (!response.ok || this.denied) { this.events.access('denied'); throw new Error('controlled-current-access-denied'); }
    this.phase = 'ready'; this.events.access(this.role);
    return { session: { ...structuredClone(this.http.session), access: this.role }, state: await this.http.state() };
  }
  async open(owner: SheetRelaySession) { assert.deepEqual(owner, this.http.session); return this.state(); }
  async state() {
    if (this.denied) { this.events.access('denied'); throw new Error('controlled-current-access-denied'); }
    assert.notEqual(this.phase, 'closed'); assert.notEqual(this.phase, 'paused');
    this.phase = 'ready'; this.events.access(this.role);
    return this.http.state();
  }
  async append(request: SheetRelayAppendRequest) {
    if (this.denied) { this.events.access('denied'); throw new Error('controlled-current-access-denied'); }
    if (this.role === 'read-only') {
      this.events.access('read-only');
      return { protocolVersion: 1 as const, status: 'rejected' as const, code: 'read-only-denied', updateId: request.packet.updateId };
    }
    const response = await this.http.request(`${SHEET_RELAY_PATH}/append`, { method: 'POST',
      headers: { Authorization: `Bearer ${this.http.session.credential}` }, body: JSON.stringify(request) });
    return await response.json() as Awaited<ReturnType<DurableTransport['append']>>;
  }
  setPaused(paused: boolean): void {
    this.phase = paused ? 'paused' : 'waiting';
    if (paused) this.events.disconnected('controlled-pause');
  }
  close(): void { this.phase = 'closed'; }
  inspect(): WebSocketTransportView {
    return { kind: 'websocket', phase: this.phase, access: this.denied ? 'denied' : this.role,
      generation: 1, framesSent: 0, framesReceived: 0, reconnectAttempt: 0, pending: [], history: [] };
  }
  permission(access: SheetRelayAccess | 'denied'): void {
    this.denied = access === 'denied';
    if (access !== 'denied') this.role = access;
    this.events.access(access);
  }
  async push(): Promise<void> { this.events.accepted(await this.http.state()); }
}
async function socketSetup(store = new MemoryOutbox(), role: SheetRelayAccess = 'read-write') {
  const http = await ControlledHTTP.create(); let socket!: SocketOperations;
  const session = new DurableSession({ clientId: 'client-1', newClient: true, store,
    request: async () => { throw new Error('HTTP fallback must not run'); },
    transport: events => { socket = new SocketOperations(http, events); socket.role = role; return socket; }, changed: () => {} });
  await session.start(); assert.equal(session.inspect().phase, 'ready');
  return { session, socket, http, store, close: async () => { session.close(); await session.settled(); session.replica?.destroy(); http.close(); } };
}

test('WS operation model resumes original P1 records and readonly admission cannot drain pending originals', async () => {
  const f = await socketSetup(); let resumed: DurableSession | undefined;
  try {
    f.session.setOutgoingPaused(true); const change = publish(f.session); await f.session.settled();
    const original = structuredClone(f.store.snapshot);
    assert.equal(f.session.inspect().canEdit, true, 'outgoing pause keeps local editing and persistence available');
    f.session.close(); await f.session.settled();
    resumed = new DurableSession({ clientId: 'client-1', newClient: false, store: f.store,
      request: async () => { throw new Error('HTTP fallback must not run'); },
      transport: events => { const socket = new SocketOperations(f.http, events); socket.role = 'read-only'; return socket; }, changed: () => {} });
    await resumed.start();
    assert.equal(resumed.inspect().access, 'read-only'); assert.equal(resumed.inspect().canEdit, false);
    assert.deepEqual(f.http.calls.filter(call => call.path === '/session').at(-1)?.body,
      { protocolVersion: 1, resumeCredential: f.http.session.credential });
    assert.equal(resumed.inspect().pending, 1); assert.equal(resumed.inspect().confirmed, 0);
    assert.equal(resumed.replica!.events.some(event => event.eventId === change.event.eventId), true);
    assert.deepEqual(f.store.snapshot, original);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 0);
  } finally { resumed?.close(); await resumed?.settled(); resumed?.replica?.destroy(); await f.close(); }
});

test('WS operation model outgoing pause preserves its old reply while a newer original persists unsent', async () => {
  const f = await socketSetup(), entered = deferred<void>(), reply = deferred<void>();
  try {
    f.http.intercept = async (call, next) => {
      const result = await next();
      if (call.path === '/append') { entered.resolve(undefined); await reply.promise; }
      return result;
    };
    const old = publish(f.session, 8); await entered.promise;
    f.session.setOutgoingPaused(true);
    const stored = deferred<void>(); f.store.enqueued = () => stored.resolve(undefined);
    const newer = publish(f.session, 10); await stored.promise;
    assert.equal(f.store.snapshot.packets.length, 2);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 1);
    assert.equal(f.session.inspect().canEdit, true); assert.equal(f.socket.phase, 'ready');
    reply.resolve(undefined); await f.session.settled();
    assert.equal(f.session.inspect().packets.find(packet => packet.updateId === old.event.eventId)?.state, 'durable');
    assert.equal(f.session.inspect().packets.find(packet => packet.updateId === newer.event.eventId)?.state, 'pending');
    assert.equal(f.session.inspect().confirmed, 1); assert.equal(f.session.inspect().outgoingPaused, true);
    f.socket.permission('read-only'); assert.equal(f.session.inspect().canEdit, false);
    f.socket.permission('read-write'); assert.equal(f.session.inspect().canEdit, true);
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 1, 'permission change cannot bypass the outgoing gate');
    f.session.setOutgoingPaused(false); await f.session.settled();
    assert.equal(f.session.inspect().confirmed, 2);
  } finally { reply.resolve(undefined); await f.close(); }
});

test('WS operation model push keeps composing draft and unconfirmed outbox; current Undo preserves remote edit', async () => {
  const f = await socketSetup();
  const controller = new SheetController(f.session.replica!, change => f.session.publish(change.event.eventId, change.update), 'durable');
  const remote = new SheetReplica(f.http.session.context, { actorId: 'ws-remote', sessionId: 'ws-remote-session' }, f.http.native.exportUpdate());
  try {
    f.session.setOutgoingPaused(true);
    controller.select(key(f.session.replica!)); controller.startEdit('5'); assert.equal(controller.commit(), true);
    await f.session.settled();
    controller.startEdit('kept 한국'); controller.setComposing(true); const draft = controller.draft;
    f.http.inject(remote.commit({ kind: 'cell.commit', key: key(remote, 'sheet-rates'), input: { kind: 'literal', value: 10 } }).update);
    await f.socket.push(); await f.session.settled(); controller.synchronize();
    assert.deepEqual(controller.draft, draft);
    assert.equal(value(f.session.replica!, key(f.session.replica!, 'sheet-budget', 4, 4)), 58);
    assert.equal(f.session.inspect().pending, 1); assert.equal(f.session.inspect().confirmed, 0);
    controller.setComposing(false); controller.cancel(); assert.equal(controller.undo(), true); await f.session.settled();
    assert.equal(value(f.session.replica!, key(f.session.replica!, 'sheet-rates')), 10);
    assert.equal(value(f.session.replica!, key(f.session.replica!, 'sheet-budget', 4, 4)), 38);
  } finally { remote.destroy(); await f.close(); }
});

test('WS operation model revoke freezes editing, preserves draft/outbox and refuses a queued state push', async () => {
  const f = await socketSetup(); const controller = new SheetController(f.session.replica!, change => f.session.publish(change.event.eventId, change.update), 'durable');
  try {
    f.session.setOutgoingPaused(true); publish(f.session); await f.session.settled();
    controller.synchronize(); controller.startEdit('retained draft'); const draft = controller.draft;
    const original = structuredClone(f.store.snapshot), native = f.session.replica!.projection;
    const remote = new SheetReplica(f.http.session.context, { actorId: 'denied-remote', sessionId: 'denied-remote-session' }, f.http.native.exportUpdate());
    try { f.http.inject(remote.commit({ kind: 'cell.commit', key: key(remote), input: { kind: 'literal', value: 77 } }).update); }
    finally { remote.destroy(); }
    const state = await f.http.state();
    f.socket.events.accepted(state); f.socket.permission('denied');
    await f.session.settled();
    assert.equal(f.session.inspect().canEdit, false); assert.equal(f.session.inspect().access, 'denied');
    assert.deepEqual(controller.draft, draft); assert.deepEqual(f.store.snapshot, original);
    assert.deepEqual(f.session.replica!.projection, native);
  } finally { await f.close(); }
});

test('WS operation model access grant and lifecycle resume never automatically retry a rejected original', async () => {
  const f = await socketSetup();
  try {
    f.http.intercept = async (call, next) => call.path === '/append' ? json({ protocolVersion: 1, status: 'rejected',
      code: 'read-only-denied', updateId: parseSheetRelayAppendRequest(call.body).packet.updateId }) : next();
    const change = publish(f.session); await f.session.settled();
    assert.equal(f.session.inspect().rejected, 1); const first = structuredClone(f.store.snapshot.packets[0]!.request);
    f.socket.permission('read-only'); f.socket.permission('read-write'); await f.socket.push(); await f.session.settled();
    f.session.setPaused(true); f.session.setPaused(false); await f.session.settled();
    assert.equal(f.http.calls.filter(call => call.path === '/append').length, 1);
    f.http.intercept = undefined; await f.session.retry();
    assert.equal(f.session.inspect().confirmed, 1);
    assert.deepEqual(f.store.snapshot.packets[0]!.request, first);
    assert.equal(f.store.snapshot.packets[0]!.request.packet.updateId, change.event.eventId);
  } finally { await f.close(); }
});

test('WS operation model readonly access during a held reply cannot confirm the older packet', async () => {
  const f = await socketSetup(), entered = deferred<void>(), reply = deferred<void>();
  try {
    f.http.intercept = async (call, next) => {
      const result = await next();
      if (call.path === '/append') { entered.resolve(undefined); await reply.promise; }
      return result;
    };
    const change = publish(f.session); await entered.promise;
    f.socket.permission('read-only'); reply.resolve(undefined); await f.session.settled();
    assert.equal(f.session.inspect().confirmed, 0);
    assert.equal(f.session.inspect().ackUnknown, 1);
    assert.equal(f.session.inspect().canEdit, false);
    assert.equal(f.store.snapshot.packets[0]!.request.packet.updateId, change.event.eventId);
  } finally { reply.resolve(undefined); await f.close(); }
});

for (const role of ['read-write', 'read-only'] as const) test(`controlled WS completed receipt fresh Open restores original history with ${role} access`, async () => {
  const first = await socketSetup();
  try {
    const change = publish(first.session); await first.session.settled();
    assert.equal(first.session.inspect().confirmed, 1);
    const original = structuredClone(first.store.snapshot);
    const originalHash = await hash(new TextEncoder().encode(JSON.stringify(original)));
    first.session.close(); await first.session.settled();
    let socket!: SocketOperations;
    const next = new DurableSession({ clientId: 'client-1', newClient: false, store: first.store,
      request: async () => { throw new Error('HTTP fallback forbidden'); },
      transport: events => { socket = new SocketOperations(first.http, events); socket.role = role; return socket; }, changed: () => {} });
    try {
      await next.start();
      assert.equal(next.inspect().phase, 'ready'); assert.equal(next.inspect().canEdit, role === 'read-write');
      assert.equal(next.inspect().confirmed, 1); assert.equal(next.inspect().access, role);
      assert.ok(next.replica); assert.equal(value(next.replica), 9);
      assert.deepEqual(next.replica.identity, original.client!.session.identity);
      assert.equal(next.replica.events.some(event => event.eventId === change.event.eventId), true);
      assert.equal(next.inspect().packets[0]!.receiptFrontierSha256, await hash(base64ToBytes(original.packets[0]!.receipt!.frontierBase64)));
      assert.deepEqual(first.store.snapshot, original);
      assert.equal(await hash(new TextEncoder().encode(JSON.stringify(first.store.snapshot))), originalHash);
      assert.deepEqual(base64ToBytes(first.store.snapshot.packets[0]!.request.packet.bytesBase64), change.update);
      assert.equal(first.http.calls.filter(call => call.path === '/append').length, 1);
    } finally { next.close(); await next.settled(); next.replica?.destroy(); }
  } finally { await first.close(); }
});
