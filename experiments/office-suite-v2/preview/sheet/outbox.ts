import { base64ToBytes, isRelayCredential, isSha256, isSheetRelayContext, parseSheetRelayAppendRequest,
  relayAdmission, sameRelayAdmission, sameRelayContext } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAppendRequest, SheetRelayIdentity, SheetRelayReceipt, SheetRelaySession, SheetRelayState } from '../../src/sheet-preview-protocol.ts';

export type DeliveryState = 'pending' | 'acknowledgment-unknown' | 'rejected' | 'durable';
export interface StoredClient { readonly version: 1; readonly clientId: string; readonly session: SheetRelaySession; readonly bootstrap: SheetRelayState['bootstrap']; readonly nextOrdinal: number; }
export interface StoredPacket { readonly version: 1; readonly clientId: string; readonly ordinal: number; readonly request: SheetRelayAppendRequest; readonly identity: SheetRelayIdentity; readonly state: DeliveryState; readonly receipt?: SheetRelayReceipt; readonly error?: string; }
export interface OutboxSnapshot { readonly client: StoredClient | null; readonly packets: readonly StoredPacket[]; }
export interface PacketResult { readonly state: DeliveryState; readonly receipt?: SheetRelayReceipt; readonly error?: string; }
export interface OutboxStore {
  load(clientId: string): Promise<OutboxSnapshot>; createClient(client: StoredClient): Promise<void>;
  enqueue(clientId: string, request: SheetRelayAppendRequest, identity: SheetRelayIdentity): Promise<StoredPacket>;
  mark(clientId: string, updateId: string, result: PacketResult): Promise<StoredPacket>; close(): void;
}

const DATABASE = 'wonffice-sheet-preview-outbox-v1';
const MAX_PACKETS = 256;
const MAX_BYTES = 8_000_000;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const ordinal = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function identity(value: unknown): value is SheetRelayIdentity {
  return object(value) && fields(value, ['actorId', 'sessionId']) && id(value.actorId) && id(value.sessionId);
}
function sameIdentity(left: SheetRelayIdentity, right: SheetRelayIdentity): boolean { return left.actorId === right.actorId && left.sessionId === right.sessionId; }
function state(value: unknown): value is DeliveryState { return value === 'pending' || value === 'acknowledgment-unknown' || value === 'rejected' || value === 'durable'; }
function errorText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 4096; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('outbox-non-json-record'); return encoded;
}
function parseClient(value: unknown): StoredClient {
  if (!object(value) || !fields(value, ['version', 'clientId', 'session', 'bootstrap', 'nextOrdinal']) || value.version !== 1 || !id(value.clientId) || !ordinal(value.nextOrdinal)) throw new Error('outbox-invalid-client');
  const session = value.session, bootstrap = value.bootstrap;
  if (!object(session) || !fields(session, ['protocolVersion', 'controlled', 'credential', 'identity', 'context']) || session.protocolVersion !== 1 || session.controlled !== true ||
      !isRelayCredential(session.credential) || !identity(session.identity) || !isSheetRelayContext(session.context)) throw new Error('outbox-invalid-session');
  if (!object(bootstrap) || !fields(bootstrap, ['updateId', 'sha256', 'byteLength', 'identity']) || !id(bootstrap.updateId) || !isSha256(bootstrap.sha256) ||
      !ordinal(bootstrap.byteLength) || bootstrap.byteLength < 1 || bootstrap.byteLength > 1_000_000 || !identity(bootstrap.identity)) throw new Error('outbox-invalid-bootstrap');
  return { version: 1, clientId: value.clientId, nextOrdinal: value.nextOrdinal,
    session: { protocolVersion: 1, controlled: true, credential: session.credential, identity: session.identity, context: session.context },
    bootstrap: { updateId: bootstrap.updateId, sha256: bootstrap.sha256, byteLength: bootstrap.byteLength, identity: bootstrap.identity } };
}
function receipt(value: unknown, request: SheetRelayAppendRequest): SheetRelayReceipt {
  if (!object(value) || !fields(value, ['context', 'admission', 'updateId', 'sha256', 'sequence', 'frontierBase64']) || !isSheetRelayContext(value.context) ||
      !sameRelayContext(value.context, request.context) || !object(value.admission) || canonical(value.admission) !== canonical(request.admission) ||
      value.updateId !== request.packet.updateId || value.sha256 !== request.packet.sha256 || !ordinal(value.sequence) || value.sequence < 1 ||
      typeof value.frontierBase64 !== 'string' || value.frontierBase64.length > 4 * Math.ceil(64_000 / 3)) throw new Error('outbox-receipt-mismatch');
  const frontier = base64ToBytes(value.frontierBase64);
  if (frontier.length < 1 || frontier.length > 64_000) throw new Error('outbox-frontier-limit');
  return { context: value.context, admission: request.admission, updateId: request.packet.updateId, sha256: request.packet.sha256, sequence: value.sequence, frontierBase64: value.frontierBase64 };
}
function parsePacket(value: unknown): StoredPacket {
  if (!object(value) || !fields(value, ['version', 'clientId', 'ordinal', 'request', 'identity', 'state'], ['receipt', 'error']) || value.version !== 1 || !id(value.clientId) ||
      !ordinal(value.ordinal) || !identity(value.identity) || !state(value.state) || (Object.hasOwn(value, 'error') && !errorText(value.error))) throw new Error('outbox-invalid-packet');
  const request = parseSheetRelayAppendRequest(value.request);
  if (value.state !== 'durable' && Object.hasOwn(value, 'receipt')) throw new Error('outbox-receipt-without-durable-state');
  if (value.state === 'durable' && Object.hasOwn(value, 'error')) throw new Error('outbox-durable-error');
  return { version: 1, clientId: value.clientId, ordinal: value.ordinal, request, identity: value.identity, state: value.state,
    ...(value.state === 'durable' ? { receipt: receipt(value.receipt, request) } : {}), ...(typeof value.error === 'string' ? { error: value.error } : {}) };
}
function snapshotShape(clientId: string, clientValue: unknown, packetValues: unknown): OutboxSnapshot {
  if (!id(clientId) || !Array.isArray(packetValues) || !Array.from({ length: packetValues.length }, (_, i) => Object.hasOwn(packetValues, i)).every(Boolean)) throw new Error('outbox-invalid-record-list');
  if (packetValues.length > MAX_PACKETS) throw new Error('outbox-record-limit');
  const client = clientValue === null || clientValue === undefined ? null : parseClient(clientValue);
  const packets = Array.from(packetValues, parsePacket);
  if (client === null && packets.length !== 0) throw new Error('outbox-orphan-packets; existing records preserved');
  if (client && client.clientId !== clientId) throw new Error('outbox-client-key-mismatch');
  const ids = new Set<string>(), ordinals = new Set<number>(); let total = 0;
  for (const packet of packets) {
    if (!client || packet.clientId !== clientId || !sameRelayContext(packet.request.context, client.session.context) ||
        !sameRelayAdmission(packet.request.admission, relayAdmission(client.session.context)) || !sameIdentity(packet.identity, client.session.identity)) throw new Error('outbox-client-packet-mismatch');
    if (ids.has(packet.request.packet.updateId) || ordinals.has(packet.ordinal) || packet.ordinal >= client.nextOrdinal) throw new Error('outbox-duplicate-id-or-ordinal');
    ids.add(packet.request.packet.updateId); ordinals.add(packet.ordinal); total += packet.request.packet.byteLength;
  }
  if (total > MAX_BYTES) throw new Error('outbox-byte-limit');
  if (client && (packets.length !== client.nextOrdinal || Array.from({ length: client.nextOrdinal }, (_, index) => ordinals.has(index)).some(present => !present))) throw new Error('outbox-missing-ordinal; existing records preserved');
  return { client, packets: packets.sort((left, right) => left.ordinal - right.ordinal) };
}
async function checkHash(request: SheetRelayAppendRequest): Promise<void> {
  const bytes = base64ToBytes(request.packet.bytesBase64, 1_000_000);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice());
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== request.packet.sha256) throw new Error('outbox-packet-hash-mismatch');
}
/** Unknown IndexedDB values are checked after the read transaction completes. No repair or deletion. */
export async function validateOutboxSnapshot(clientId: string, client: unknown, packets: unknown): Promise<OutboxSnapshot> {
  const result = snapshotShape(clientId, structuredClone(client), structuredClone(packets));
  await Promise.all(result.packets.map(packet => checkHash(packet.request))); return result;
}
export async function prepareOutboxEnqueue(snapshot: OutboxSnapshot, value: SheetRelayAppendRequest, eventIdentity: SheetRelayIdentity): Promise<{ client: StoredClient; packet: StoredPacket; changed: boolean }> {
  const request = parseSheetRelayAppendRequest(structuredClone(value));
  if (!identity(eventIdentity)) throw new Error('outbox-invalid-identity');
  const owner = structuredClone(eventIdentity);
  await checkHash(request);
  const client = snapshot.client;
  if (!client) throw new Error('outbox-client-missing');
  if (!sameRelayContext(request.context, client.session.context) || !sameRelayAdmission(request.admission, relayAdmission(client.session.context)) || !sameIdentity(owner, client.session.identity)) throw new Error('outbox-enqueue-session-mismatch');
  const previous = snapshot.packets.find(packet => packet.request.packet.updateId === request.packet.updateId);
  if (previous) {
    if (canonical(previous.request) !== canonical(request) || !sameIdentity(previous.identity, owner)) throw new Error('outbox-update-id-collision');
    return { client, packet: previous, changed: false };
  }
  if (snapshot.packets.length >= MAX_PACKETS || snapshot.packets.reduce((sum, packet) => sum + packet.request.packet.byteLength, request.packet.byteLength) > MAX_BYTES) throw new Error('outbox-capacity; original native packet remains in caller memory');
  if (client.nextOrdinal >= Number.MAX_SAFE_INTEGER) throw new Error('outbox-ordinal-limit');
  return { client: { ...client, nextOrdinal: client.nextOrdinal + 1 }, packet: { version: 1, clientId: client.clientId, ordinal: client.nextOrdinal, request, identity: owner, state: 'pending' }, changed: true };
}
export function prepareOutboxMark(packet: StoredPacket, value: PacketResult): StoredPacket {
  if (!object(value) || !fields(value, ['state'], ['receipt', 'error']) || !state(value.state) || (Object.hasOwn(value, 'error') && !errorText(value.error))) throw new Error('outbox-invalid-result');
  const result: PacketResult = { state: value.state, ...(Object.hasOwn(value, 'receipt') ? { receipt: receipt(value.receipt, packet.request) } : {}), ...(typeof value.error === 'string' ? { error: value.error } : {}) };
  if (result.state === 'durable' && (!result.receipt || result.error !== undefined)) throw new Error('outbox-durable-receipt-required');
  if (result.state !== 'durable' && result.receipt !== undefined) throw new Error('outbox-receipt-without-durable-state');
  if (packet.state === 'durable') {
    if (result.state === 'durable' && canonical(packet.receipt) !== canonical(result.receipt)) throw new Error('outbox-durable-receipt-changed');
    return packet;
  }
  return { version: packet.version, clientId: packet.clientId, ordinal: packet.ordinal, request: packet.request, identity: packet.identity, state: result.state, ...(result.receipt ? { receipt: structuredClone(result.receipt) } : {}), ...(result.error ? { error: result.error } : {}) };
}

/** Request success alone is never a persistence receipt. Exported for a Node transaction model. */
export function outboxTransactionComplete(transaction: EventTarget & { readonly error: DOMException | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('outbox-transaction-aborted')), { once: true });
  });
}
function requestValue(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => { const value: unknown = request.result; resolve(value); }, { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('outbox-request-failed')), { once: true });
  });
}
class IndexedOutbox implements OutboxStore {
  readonly #db: IDBDatabase;
  #closed = false;
  constructor(db: IDBDatabase) { this.#db = db; }
  #transaction(mode: IDBTransactionMode): IDBTransaction {
    if (this.#closed) throw new Error('outbox-closed');
    return this.#db.transaction(['clients', 'packets'], mode);
  }
  async #records(transaction: IDBTransaction, clientId: string): Promise<{ client: unknown; packets: unknown }> {
    const [client, packets] = await Promise.all([requestValue(transaction.objectStore('clients').get(clientId)), requestValue(transaction.objectStore('packets').index('clientId').getAll(clientId))]);
    return { client, packets };
  }
  async load(clientId: string): Promise<OutboxSnapshot> {
    if (!id(clientId)) throw new Error('outbox-invalid-client-id');
    const transaction = this.#transaction('readonly'), completed = outboxTransactionComplete(transaction);
    try {
      const records = await this.#records(transaction, clientId); await completed;
      return await validateOutboxSnapshot(clientId, records.client, records.packets);
    } catch (error) { await completed.catch(() => {}); throw error; }
  }
  async createClient(value: StoredClient): Promise<void> {
    const client = parseClient(structuredClone(value));
    if (client.nextOrdinal !== 0) throw new Error('outbox-new-client-ordinal');
    const transaction = this.#transaction('readwrite'), completed = outboxTransactionComplete(transaction);
    try {
      const records = await this.#records(transaction, client.clientId);
      if (records.client !== undefined || !Array.isArray(records.packets) || records.packets.length !== 0) throw new Error('outbox-client-namespace-not-empty; records preserved');
      transaction.objectStore('clients').add(client); await completed;
    } catch (error) { try { transaction.abort(); } catch { /* Already completed or aborted. */ } await completed.catch(() => {}); throw error; }
  }
  async #replace(clientId: string, expected: OutboxSnapshot, client: StoredClient, packet: StoredPacket): Promise<void> {
    const transaction = this.#transaction('readwrite'), completed = outboxTransactionComplete(transaction);
    try {
      const records = await this.#records(transaction, clientId);
      const current = snapshotShape(clientId, records.client, records.packets);
      if (canonical(current) !== canonical(expected)) throw new Error('outbox-concurrent-change');
      transaction.objectStore('clients').put(client);
      transaction.objectStore('packets').put(packet);
      await completed;
    } catch (error) { try { transaction.abort(); } catch { /* Already completed or aborted. */ } await completed.catch(() => {}); throw error; }
  }
  async enqueue(clientId: string, request: SheetRelayAppendRequest, eventIdentity: SheetRelayIdentity): Promise<StoredPacket> {
    const original = structuredClone(request), owner = structuredClone(eventIdentity);
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await this.load(clientId), plan = await prepareOutboxEnqueue(before, original, owner);
      if (!plan.changed) return plan.packet;
      try { await this.#replace(clientId, before, plan.client, plan.packet); return plan.packet; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'outbox-concurrent-change') throw error; }
    }
    throw new Error('outbox-concurrent-change; retry original packet');
  }
  async mark(clientId: string, updateId: string, result: PacketResult): Promise<StoredPacket> {
    if (!id(updateId)) throw new Error('outbox-invalid-update-id');
    const original = structuredClone(result);
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await this.load(clientId), packet = before.packets.find(item => item.request.packet.updateId === updateId);
      if (!before.client || !packet) throw new Error('outbox-packet-missing');
      const next = prepareOutboxMark(packet, original);
      if (next === packet) return packet;
      try { await this.#replace(clientId, before, before.client, next); return next; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'outbox-concurrent-change') throw error; }
    }
    throw new Error('outbox-concurrent-change; retry original packet result');
  }
  close(): void { if (!this.#closed) { this.#closed = true; this.#db.close(); } }
}
export function openOutbox(): Promise<OutboxStore> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('outbox-indexeddb-unavailable; native packets remain in caller memory')); return; }
    const request = globalThis.indexedDB.open(DATABASE, 1); let settled = false;
    const fail = (error: unknown): void => { if (!settled) { settled = true; reject(error); } };
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      db.createObjectStore('clients', { keyPath: 'clientId' });
      const packets = db.createObjectStore('packets', { keyPath: ['clientId', 'request.packet.updateId'] });
      packets.createIndex('clientId', 'clientId', { unique: false });
    });
    request.addEventListener('error', () => fail(request.error ?? new Error('outbox-open-failed')), { once: true });
    request.addEventListener('blocked', () => fail(new Error('outbox-open-blocked; existing database preserved')), { once: true });
    request.addEventListener('success', () => {
      if (settled) { request.result.close(); return; }
      settled = true; request.result.addEventListener('versionchange', () => request.result.close()); resolve(new IndexedOutbox(request.result));
    }, { once: true });
  });
}
