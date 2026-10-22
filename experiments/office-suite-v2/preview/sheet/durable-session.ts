import { SheetReplica } from '../../src/collaboration.ts';
import * as Y from 'yjs';
import { validateEvent } from '../../src/workbook.ts';
import { SHEET_RELAY_PATH, SHEET_RELAY_LIMITS, base64ToBytes, bytesToBase64, isRelayCredential,
  isSha256, isSheetRelayContext, isSheetRelayAdmission, relayAdmission, sameRelayContext,
  sameRelayAdmission, parseSheetRelayAppendRequest } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayIdentity, SheetRelaySession, SheetRelayState, SheetRelayAppendRequest, SheetRelayAccess,
  SheetRelayReceipt } from '../../src/sheet-preview-protocol.ts';
import { validateOutboxSnapshot } from './outbox.ts';
import type { OutboxStore, StoredClient, StoredPacket, PacketResult } from './outbox.ts';
import type { WorkbookContext } from '../../src/contracts.ts';
import type { WebSocketTransport, WebSocketTransportOptions, WebSocketTransportView } from './websocket-transport.ts';

export type DurableTransport = Pick<WebSocketTransport, 'authenticate' | 'open' | 'append' | 'state' | 'setPaused' | 'close' | 'inspect'>;
export type DurableTransportEvents = Pick<WebSocketTransportOptions, 'accepted' | 'access' | 'disconnected' | 'changed'>;

export interface DurableView {
  clientId: string; phase: 'opening' | 'ready' | 'paused' | 'blocked' | 'closed'; notice: string;
  sessionId: string | null; actorId: string | null; acceptedSequence: number;
  bootstrap: SheetRelayState['bootstrap'] | null; acceptedStateHash: string | null;
  context: WorkbookContext | null; identity: SheetRelayIdentity | null;
  localOnly: number; pending: number; ackUnknown: number; rejected: number; confirmed: number;
  persistenceBlocked: boolean;
  access: SheetRelayAccess | 'denied' | null; canEdit: boolean; outgoingPaused: boolean; transport: WebSocketTransportView | null;
  packets: readonly { updateId: string; sha256: string; byteLength: number; state: string; sequence: number | null; persisted: boolean; receiptFrontierSha256: string | null }[];
}
type Options = { clientId: string; newClient: boolean; store: OutboxStore; request?: typeof fetch;
  transport?: (events: DurableTransportEvents) => DurableTransport; changed: () => void };
type Local = { readonly eventId: string; readonly bytes: Uint8Array; request?: SheetRelayAppendRequest };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const sequence = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const fields = (value: Record<string, unknown>, names: readonly string[]): boolean =>
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const sameIdentity = (a: SheetRelayIdentity, b: SheetRelayIdentity): boolean => a.actorId === b.actorId && a.sessionId === b.sessionId;
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);
function identity(value: unknown): value is SheetRelayIdentity {
  return object(value) && fields(value, ['actorId', 'sessionId']) && id(value.actorId) && id(value.sessionId);
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice());
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
function frontier(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(SHEET_RELAY_LIMITS.frontierBytes / 3)) throw new Error('frontier-limit');
  // The P1 codec's default parameter is a literal type. Use its default, then enforce the smaller frontier cap.
  const bytes = base64ToBytes(value);
  if (bytes.length < 1 || bytes.length > SHEET_RELAY_LIMITS.frontierBytes) throw new Error('frontier-limit');
  const vector = Y.decodeStateVector(bytes);
  if (!equalBytes(Y.encodeStateVector(vector), bytes)) throw new Error('noncanonical-native-frontier');
  return bytes;
}
function session(value: unknown): SheetRelaySession {
  if (!object(value) || !fields(value, ['protocolVersion', 'controlled', 'credential', 'identity', 'context']) || value.protocolVersion !== 1 ||
      value.controlled !== true || !isRelayCredential(value.credential) || !identity(value.identity) || !isSheetRelayContext(value.context)) throw new Error('invalid-session');
  return { protocolVersion: 1, controlled: true, credential: value.credential, identity: value.identity, context: value.context };
}
function bootstrap(value: unknown): SheetRelayState['bootstrap'] {
  if (!object(value) || !fields(value, ['updateId', 'sha256', 'byteLength', 'identity']) || !id(value.updateId) || !isSha256(value.sha256) ||
      !sequence(value.byteLength) || value.byteLength < 1 || value.byteLength > SHEET_RELAY_LIMITS.updateBytes || !identity(value.identity)) throw new Error('invalid-bootstrap');
  return { updateId: value.updateId, sha256: value.sha256, byteLength: value.byteLength, identity: value.identity };
}
function sameBootstrap(a: SheetRelayState['bootstrap'], b: SheetRelayState['bootstrap']): boolean {
  return a.updateId === b.updateId && a.sha256 === b.sha256 && a.byteLength === b.byteLength && sameIdentity(a.identity, b.identity);
}
function sameRequest(a: SheetRelayAppendRequest, b: SheetRelayAppendRequest): boolean {
  return a.protocolVersion === b.protocolVersion && sameRelayContext(a.context, b.context) && sameRelayAdmission(a.admission, b.admission) &&
    a.packet.updateId === b.packet.updateId && a.packet.sha256 === b.packet.sha256 && a.packet.byteLength === b.packet.byteLength &&
    a.packet.bytesBase64 === b.packet.bytesBase64 && a.loseAck === b.loseAck;
}
function packetEvent(bytes: Uint8Array, updateId: string, owner: SheetRelaySession): void {
  let found = false;
  for (const item of Y.decodeUpdate(bytes).structs) {
    if (!(item instanceof Y.Item) || !(item.content instanceof Y.ContentAny) || item.content.arr.length !== 1 || typeof item.content.arr[0] !== 'string') throw new Error('packet-native-item');
    const checked = validateEvent(JSON.parse(item.content.arr[0]) as unknown, owner.context);
    if (!checked.ok || !sameIdentity(checked.event, owner.identity) || checked.event.eventId !== item.parentSub) throw new Error('packet-native-identity');
    if (checked.event.eventId === updateId) found = true;
  }
  if (!found) throw new Error('packet-native-id-mismatch');
}

/** Native/outbox authority shared by explicit HTTP and WebSocket transports. */
export class DurableSession {
  readonly #options: Options;
  readonly #request: typeof fetch | undefined;
  readonly #transport: DurableTransport | undefined;
  #client: StoredClient | null = null;
  #replica: SheetReplica | undefined;
  readonly #packets = new Map<string, StoredPacket>();
  readonly #local = new Map<string, Local>();
  readonly #receiptFrontiers = new Map<string, string>();
  #phase: 'opening' | 'ready' | 'blocked' = 'opening';
  #notice = 'Opening the original client.';
  #acceptedSequence = 0;
  #stateSequence = -1;
  #stateHash: string | null = null;
  #started = false;
  #closed = false;
  #paused = false;
  #network: AbortController | undefined;
  #work: Promise<void> = Promise.resolve();
  #writes: Promise<void> = Promise.resolve();
  #persistenceBlocked = false;
  #refreshJob: Promise<void> | undefined;
  #access: SheetRelayAccess | 'denied' | null = null;
  #socketAdmitted = false;
  #outgoingPaused = false;
  #incoming: Promise<void> = Promise.resolve();
  #incomingJob: Promise<void> | undefined;
  #pushDrainJob: Promise<void> | undefined;
  #pendingState: SheetRelayState | undefined;

  constructor(options: Options) {
    if (!id(options.clientId)) throw new Error('invalid-client-id');
    this.#options = options;
    this.#request = options.transport ? undefined : options.request ?? globalThis.fetch.bind(globalThis);
    this.#transport = options.transport?.({
      accepted: state => { if (!this.#closed) { this.#pendingState = state; this.#consumePush(); } },
      access: access => {
        if (this.#closed) return;
        this.#access = access;
        if (access === 'denied') { this.#socketAdmitted = false; this.#pendingState = undefined; }
        this.#notice = access === 'denied' ? 'Current session access denied. Original input and outbox are retained.' :
          access === 'read-only' ? 'Read-only access. New edits and delivery are disabled.' : 'Server granted write access. Native admission is checked separately.';
        this.#changed();
      },
      disconnected: () => {
        if (this.#closed) return;
        this.#socketAdmitted = false;
        if (this.#access !== 'denied') this.#access = null;
        this.#notice = 'WebSocket disconnected. Current permission is unconfirmed. Original records are retained.';
        this.#changed();
      },
      changed: () => this.#changed(),
    });
  }
  get replica(): SheetReplica | undefined { return this.#replica; }
  #changed(): void { try { this.#options.changed(); } catch { /* Observation has no write authority. */ } }
  #active(): boolean { return !this.#closed && !this.#paused && this.#phase !== 'blocked'; }
  #readable(): boolean { return this.#active() && this.#access !== 'denied'; }
  #editable(): boolean {
    return this.#active() && (!this.#transport || (this.#socketAdmitted && this.#access === 'read-write' && this.#transport.inspect().phase === 'ready'));
  }
  #writable(): boolean { return this.#editable() && !this.#outgoingPaused; }
  #queue(action: () => Promise<void>): Promise<void> {
    this.#work = this.#work.then(action).catch(() => {
      this.#notice = 'Operation stopped. Original native input and delivery records are retained.';
      this.#changed();
    });
    return this.#work;
  }
  async settled(): Promise<void> {
    // A completed persistence task may schedule a delivery task. Wait for a stable pair.
    for (;;) {
      const writes = this.#writes, network = this.#work, incoming = this.#incoming;
      await Promise.all([writes, network, incoming]);
      await Promise.resolve();
      if (writes === this.#writes && network === this.#work && incoming === this.#incoming) return;
    }
  }
  #write(): Promise<void> {
    this.#writes = this.#writes.then(() => this.#persist()).catch(() => {
      this.#persistenceBlocked = true;
      this.#notice = 'Local only. Outbox persistence stopped; original bytes remain in this tab.'; this.#changed();
    });
    return this.#writes;
  }
  inspect(): DurableView {
    const packets = [...this.#packets.values()].sort((a, b) => a.ordinal - b.ordinal);
    const pending = packets.filter(packet => packet.state === 'pending').length;
    const ackUnknown = packets.filter(packet => packet.state === 'acknowledgment-unknown').length;
    const rejected = packets.filter(packet => packet.state === 'rejected').length;
    const confirmed = packets.filter(packet => packet.state === 'durable').length;
    return { clientId: this.#options.clientId,
      phase: this.#closed ? 'closed' : this.#phase === 'blocked' ? 'blocked' : this.#paused ? 'paused' : this.#phase,
      notice: `Controlled ${this.#transport ? 'WebSocket ' : ''}relay. ${this.#notice}${this.#outgoingPaused ? ' New outgoing changes are paused.' : ''} Local only: ${this.#local.size}. Pending: ${pending}. ACK unknown: ${ackUnknown}. Rejected: ${rejected}. Server confirmed: ${confirmed}.`,
      sessionId: this.#client?.session.identity.sessionId ?? null, actorId: this.#client?.session.identity.actorId ?? null,
      acceptedSequence: this.#acceptedSequence, bootstrap: this.#client ? structuredClone(this.#client.bootstrap) : null,
      context: this.#client ? structuredClone(this.#client.session.context) : null,
      identity: this.#client ? structuredClone(this.#client.session.identity) : null,
      acceptedStateHash: this.#stateHash, localOnly: this.#local.size, persistenceBlocked: this.#persistenceBlocked,
      access: this.#access, canEdit: this.#phase === 'ready' && this.#editable() && !this.#persistenceBlocked,
      outgoingPaused: this.#outgoingPaused,
      transport: this.#transport?.inspect() ?? null,
      pending, ackUnknown, rejected, confirmed,
      packets: [...packets.map(packet => ({ updateId: packet.request.packet.updateId, sha256: packet.request.packet.sha256,
        byteLength: packet.request.packet.byteLength, state: packet.state, sequence: packet.receipt?.sequence ?? null,
        persisted: true, receiptFrontierSha256: this.#receiptFrontiers.get(packet.request.packet.updateId) ?? null })),
      ...[...this.#local.values()].map(local => ({ updateId: local.eventId, sha256: local.request?.packet.sha256 ?? '',
        byteLength: local.bytes.length, state: 'local-only', sequence: null, persisted: false, receiptFrontierSha256: null }))] };
  }
  async #json(path: string, init: RequestInit, allowRejection = false): Promise<unknown> {
    if (!this.#request) throw new Error('http-disabled-for-websocket');
    if (!this.#active()) throw new Error('delivery-inactive');
    const abort = new AbortController(); this.#network = abort;
    try {
      const response = await this.#request(`${SHEET_RELAY_PATH}${path}`, { ...init, signal: abort.signal,
        cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      if (!this.#active()) throw new Error('delivery-inactive');
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > SHEET_RELAY_LIMITS.httpBodyBytes)) throw new Error('http-body-limit');
      if (!response.body) throw new Error('missing-response-body');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > SHEET_RELAY_LIMITS.httpBodyBytes || !this.#active()) throw new Error('http-body-limit-or-inactive');
          chunks.push(part.value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      if (!response.ok && !allowRejection) throw new Error('http-refused');
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } finally { if (this.#network === abort) this.#network = undefined; }
  }
  async #wire<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.#active()) throw new Error('delivery-inactive');
    const abort = new AbortController(); this.#network = abort;
    try {
      const value = await action(abort.signal);
      if (!this.#active()) throw new Error('delivery-inactive');
      return value;
    } finally { if (this.#network === abort) this.#network = undefined; }
  }
  #headers(): Record<string, string> {
    if (!this.#client) throw new Error('missing-original-session');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#client.session.credential}` };
  }
  async #state(value: unknown, owner: SheetRelaySession): Promise<{ state: SheetRelayState; bytes: Uint8Array }> {
    if (!object(value) || !fields(value, ['protocolVersion', 'context', 'admission', 'latestSequence', 'state', 'bootstrap']) || value.protocolVersion !== 1 ||
        !isSheetRelayContext(value.context) || !sameRelayContext(value.context, owner.context) || !isSheetRelayAdmission(value.admission) ||
        !sameRelayAdmission(value.admission, relayAdmission(owner.context)) || !sequence(value.latestSequence) || !object(value.state) ||
        !fields(value.state, ['bytesBase64', 'byteLength', 'sha256', 'frontierBase64']) || !sequence(value.state.byteLength) ||
        value.state.byteLength < 1 || value.state.byteLength > SHEET_RELAY_LIMITS.updateBytes || !isSha256(value.state.sha256) ||
        typeof value.state.bytesBase64 !== 'string' || typeof value.state.frontierBase64 !== 'string') throw new Error('invalid-accepted-state');
    const descriptor = bootstrap(value.bootstrap);
    if (this.#client && !sameBootstrap(descriptor, this.#client.bootstrap)) throw new Error('bootstrap-changed');
    const decoded = base64ToBytes(value.state.bytesBase64);
    if (decoded.length !== value.state.byteLength || await sha256(decoded) !== value.state.sha256) throw new Error('accepted-state-hash-or-length');
    const expectedFrontier = frontier(value.state.frontierBase64);
    const trial = new SheetReplica(owner.context, owner.identity, decoded);
    try { if (!equalBytes(trial.frontier(), expectedFrontier)) throw new Error('accepted-state-frontier'); }
    finally { trial.destroy(); }
    const state: SheetRelayState = { protocolVersion: 1, context: value.context, admission: value.admission,
      latestSequence: value.latestSequence, bootstrap: descriptor, state: { bytesBase64: value.state.bytesBase64,
        byteLength: value.state.byteLength, sha256: value.state.sha256, frontierBase64: value.state.frontierBase64 } };
    return { state, bytes: decoded };
  }
  #receipt(value: unknown, packet: StoredPacket): SheetRelayReceipt {
    const request = packet.request;
    if (!object(value) || !fields(value, ['context', 'admission', 'updateId', 'sha256', 'sequence', 'frontierBase64']) ||
        !isSheetRelayContext(value.context) || !sameRelayContext(value.context, request.context) || !isSheetRelayAdmission(value.admission) ||
        !sameRelayAdmission(value.admission, request.admission) || value.updateId !== request.packet.updateId || value.sha256 !== request.packet.sha256 ||
        !sequence(value.sequence) || value.sequence < 1 || typeof value.frontierBase64 !== 'string') throw new Error('receipt-mismatch');
    const vector = Y.decodeStateVector(frontier(value.frontierBase64));
    for (const item of Y.decodeUpdate(base64ToBytes(request.packet.bytesBase64)).structs) {
      if ((vector.get(item.id.client) ?? 0) < item.id.clock + item.length) throw new Error('receipt-frontier-missing-packet');
    }
    for (const other of this.#packets.values()) {
      if (!other.receipt || other.request.packet.updateId === request.packet.updateId) continue;
      if (other.receipt.sequence === value.sequence || (other.ordinal < packet.ordinal && other.receipt.sequence >= value.sequence) ||
          (other.ordinal > packet.ordinal && other.receipt.sequence <= value.sequence)) throw new Error('receipt-sequence-mismatch');
    }
    if (packet.receipt && (packet.receipt.sequence !== value.sequence || packet.receipt.frontierBase64 !== value.frontierBase64)) throw new Error('receipt-changed');
    return { context: value.context, admission: value.admission, updateId: value.updateId, sha256: value.sha256,
      sequence: value.sequence, frontierBase64: value.frontierBase64 };
  }
  async #mergeAccepted(value: unknown): Promise<boolean> {
    if (!this.#readable() || !this.#replica || !this.#client) return false;
    const accepted = await this.#state(value, this.#client.session);
    if (!this.#readable()) return false;
    if (accepted.state.latestSequence < this.#acceptedSequence ||
        (accepted.state.latestSequence === this.#stateSequence && accepted.state.state.sha256 !== this.#stateHash)) throw new Error('accepted-sequence-regression');
    this.#replica.receive(accepted.bytes);
    this.#acceptedSequence = accepted.state.latestSequence;
    this.#stateSequence = accepted.state.latestSequence; this.#stateHash = accepted.state.state.sha256;
    this.#socketAdmitted = this.#transport?.inspect().phase === 'ready';
    this.#notice = 'Accepted native history merged. Local packets retain their own confirmation status.';
    this.#changed();
    return true;
  }
  #consumePush(): void {
    if (this.#incomingJob || this.#phase !== 'ready' || !this.#active() || this.#access === 'denied') return;
    const job = this.#incoming.then(async () => {
      let merged = false;
      while (this.#pendingState && this.#active() && this.#access !== 'denied') {
        const state = this.#pendingState; this.#pendingState = undefined;
        try { merged = await this.#mergeAccepted(state) || merged; }
        catch { this.#notice = 'Pushed state refused. Existing native history and original packets are retained.'; this.#changed(); }
      }
      if (merged && !this.#pushDrainJob) {
        const delivery = this.#queue(() => this.#drain(false)); this.#pushDrainJob = delivery;
        void delivery.then(() => { if (this.#pushDrainJob === delivery) this.#pushDrainJob = undefined; });
      }
    }).catch(() => { this.#notice = 'State delivery stopped. Original records are retained.'; this.#changed(); });
    this.#incoming = job; this.#incomingJob = job;
    void job.then(() => {
      if (this.#incomingJob === job) this.#incomingJob = undefined;
      if (this.#pendingState) this.#consumePush();
    });
  }
  start(): Promise<void> {
    if (this.#started || this.#closed) return this.#work;
    this.#started = true;
    return this.#queue(async () => {
      try {
        const loaded = await this.#options.store.load(this.#options.clientId);
        const snapshot = await validateOutboxSnapshot(this.#options.clientId, loaded.client, loaded.packets);
        if (this.#closed) return;
        const original = snapshot.client;
        if (!original && (!this.#options.newClient || snapshot.packets.length)) throw new Error('missing-original-client');
        if (original && (snapshot.packets.length !== original.nextOrdinal || snapshot.packets.some((packet, i) => packet.ordinal !== i))) throw new Error('incomplete-local-history');
        this.#client = original;
        for (const packet of snapshot.packets) {
          if (!original) throw new Error('orphan-packet');
          packetEvent(base64ToBytes(packet.request.packet.bytesBase64), packet.request.packet.updateId, original.session);
          this.#packets.set(packet.request.packet.updateId, packet);
        }
        for (const packet of snapshot.packets) if (packet.state === 'durable') {
          const receipt = this.#receipt(packet.receipt, packet);
          this.#receiptFrontiers.set(receipt.updateId, await sha256(frontier(receipt.frontierBase64)));
        }
        if (!this.#active()) return;
        const request = original ? { protocolVersion: 1 as const, resumeCredential: original.session.credential } : { protocolVersion: 1 as const };
        const authenticated = this.#transport ? await this.#wire(signal => this.#transport!.authenticate(request, signal)) : undefined;
        const issued = authenticated ? session({ protocolVersion: authenticated.session.protocolVersion, controlled: authenticated.session.controlled,
          credential: authenticated.session.credential, identity: authenticated.session.identity, context: authenticated.session.context }) :
          session(await this.#json('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }));
        if (original && (issued.credential !== original.session.credential || !sameIdentity(issued.identity, original.session.identity) ||
            !sameRelayContext(issued.context, original.session.context))) throw new Error('original-session-changed');
        // Keep the issued credential private. A fresh session is not exposed to editing before createClient completes.
        const initial = authenticated ? await this.#state(authenticated.state, issued) : undefined;
        const accepted = await this.#state(this.#transport ? await this.#wire(signal => this.#transport!.open(issued, signal)) :
          await this.#json('/open', { method: 'GET', headers: { Authorization: `Bearer ${issued.credential}` } }), issued);
        if (initial && (!sameBootstrap(initial.state.bootstrap, accepted.state.bootstrap) || accepted.state.latestSequence < initial.state.latestSequence)) throw new Error('opening-state-regression');
        if (snapshot.packets.some(packet => (packet.receipt?.sequence ?? 0) > accepted.state.latestSequence)) throw new Error('accepted-sequence-regression');
        if (this.#closed) return;
        const client: StoredClient = original ?? { version: 1, clientId: this.#options.clientId, session: issued, bootstrap: accepted.state.bootstrap, nextOrdinal: 0 };
        if (!original) await this.#options.store.createClient(structuredClone(client));
        if (this.#closed) return;
        const replica = new SheetReplica(issued.context, issued.identity, accepted.bytes);
        try {
          for (const packet of snapshot.packets) replica.receive(base64ToBytes(packet.request.packet.bytesBase64));
        } catch (error) { replica.destroy(); throw error; }
        this.#client = client; this.#replica = replica;
        this.#acceptedSequence = Math.max(accepted.state.latestSequence, ...snapshot.packets.map(packet => packet.receipt?.sequence ?? 0));
        this.#stateSequence = accepted.state.latestSequence; this.#stateHash = accepted.state.state.sha256;
        this.#socketAdmitted = this.#transport?.inspect().phase === 'ready';
        this.#phase = 'ready'; this.#notice = 'Original session and native history opened. Each packet has its own delivery status.';
        this.#changed(); this.#consumePush(); await this.#drain(false);
      } catch {
        if (!this.#closed) { this.#phase = 'blocked'; this.#notice = 'Opening blocked. Original credentials and records are preserved. No fresh-session fallback is allowed.'; this.#changed(); }
      }
    });
  }
  publish(eventId: string, bytes: Uint8Array): void {
    if (this.#closed) return;
    const existing = this.#local.get(eventId), stored = this.#packets.get(eventId);
    const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array();
    if (existing || stored) {
      const original = existing?.bytes ?? base64ToBytes(stored!.request.packet.bytesBase64);
      if (!equalBytes(original, copy)) { this.#phase = 'blocked'; this.#notice = 'A callback reused an update ID with different bytes. Original records are retained.'; this.#changed(); }
      return;
    }
    this.#local.set(eventId, { eventId, bytes: copy });
    this.#notice = 'Local only until the original native packet finishes outbox persistence.'; this.#changed();
    void this.#write().then(() => this.#queue(() => this.#drain(false)));
  }
  async #persist(): Promise<void> {
    if (!this.#client || !this.#replica || this.#phase !== 'ready') return;
    for (const local of this.#local.values()) {
      try {
        if (!id(local.eventId) || local.bytes.length < 1 || local.bytes.length > SHEET_RELAY_LIMITS.updateBytes) throw new Error('local-packet-bounds');
        const event = this.#replica.events.find(item => item.eventId === local.eventId);
        if (!event || !sameIdentity(event, this.#client.session.identity)) throw new Error('local-event-identity');
        packetEvent(local.bytes, local.eventId, this.#client.session);
        if (!local.request) local.request = parseSheetRelayAppendRequest({ protocolVersion: 1, context: this.#client.session.context,
          admission: relayAdmission(this.#client.session.context), packet: { updateId: local.eventId, bytesBase64: bytesToBase64(local.bytes),
            byteLength: local.bytes.length, sha256: await sha256(local.bytes) } });
        const packet = await this.#options.store.enqueue(this.#options.clientId, structuredClone(local.request), this.#client.session.identity);
        if (!sameRequest(packet.request, local.request) || packet.clientId !== this.#options.clientId ||
            packet.ordinal !== this.#client.nextOrdinal || !sameIdentity(packet.identity, this.#client.session.identity)) throw new Error('persisted-packet-mismatch');
        this.#packets.set(local.eventId, structuredClone(packet));
        this.#client = { ...this.#client, nextOrdinal: packet.ordinal + 1 };
        this.#local.delete(local.eventId);
        if (this.#local.size === 0) this.#persistenceBlocked = false;
        this.#notice = 'Pending. The original packet is in the outbox.'; this.#changed();
      } catch { this.#persistenceBlocked = true; this.#notice = 'Local only. Outbox persistence failed; original bytes remain in this tab. Retry persistence before delivery.'; this.#changed(); break; }
    }
  }
  async #mark(packet: StoredPacket, result: PacketResult): Promise<void> {
    const current = this.#packets.get(packet.request.packet.updateId)!;
    if (current.state === 'durable') return;
    try {
      const stored = await this.#options.store.mark(this.#options.clientId, packet.request.packet.updateId, structuredClone(result));
      if (!sameRequest(stored.request, packet.request) || stored.ordinal !== packet.ordinal || stored.clientId !== this.#options.clientId ||
          !sameIdentity(stored.identity, packet.identity)) throw new Error('marked-packet-mismatch');
      if (stored.state === 'durable') {
        const receipt = this.#receipt(stored.receipt, stored);
        if (result.receipt && (receipt.sequence !== result.receipt.sequence || receipt.frontierBase64 !== result.receipt.frontierBase64)) throw new Error('marked-receipt-mismatch');
        this.#receiptFrontiers.set(receipt.updateId, await sha256(frontier(receipt.frontierBase64)));
        this.#acceptedSequence = Math.max(this.#acceptedSequence, receipt.sequence);
      } else if (stored.state !== result.state) throw new Error('marked-state-mismatch');
      this.#packets.set(packet.request.packet.updateId, structuredClone(stored));
    } catch {
      if (this.#packets.get(packet.request.packet.updateId)?.state !== 'durable') this.#packets.set(packet.request.packet.updateId,
        { ...current, state: result.state === 'rejected' ? 'rejected' : 'acknowledgment-unknown', error: result.error ?? 'OUTBOX_RESULT_NOT_PERSISTED' });
      throw new Error('outbox-result-not-persisted');
    } finally { this.#changed(); }
  }
  async #drain(retryRejected: boolean): Promise<void> {
    if (!this.#writable() || !this.#replica || !this.#client) return;
    for (const original of [...this.#packets.values()].sort((a, b) => a.ordinal - b.ordinal)) {
      if (!this.#writable()) break;
      const packet = this.#packets.get(original.request.packet.updateId)!;
      if (packet.state === 'durable') continue;
      if (packet.state === 'rejected' && !retryRejected) break;
      try {
        const result: unknown = this.#transport ? await this.#wire(signal => this.#transport!.append(packet.request, signal)) :
          await this.#json('/append', { method: 'POST', headers: this.#headers(), body: JSON.stringify(packet.request) }, true);
        if (!object(result) || result.protocolVersion !== 1) throw new Error('invalid-append-result');
        if (result.status === 'durable' && fields(result, ['protocolVersion', 'status', 'receipt'])) {
          if (this.#transport && !this.#editable()) throw new Error('receipt-current-access-unconfirmed');
          const receipt = this.#receipt(result.receipt, packet);
          await this.#mark(packet, { state: 'durable', receipt });
          this.#notice = 'Server confirmed this original packet. Newer packets keep their separate status.';
        } else if (result.status === 'acknowledgment-unknown' && fields(result, ['protocolVersion', 'status', 'updateId']) && result.updateId === packet.request.packet.updateId) {
          await this.#mark(packet, { state: 'acknowledgment-unknown', error: 'ACK_UNKNOWN' });
          this.#notice = 'ACK unknown. Retry sends the same original packet.'; break;
        } else if (result.status === 'rejected' && (fields(result, ['protocolVersion', 'status', 'code']) || fields(result, ['protocolVersion', 'status', 'code', 'updateId'])) &&
            id(result.code) && (result.updateId === undefined || result.updateId === packet.request.packet.updateId)) {
          await this.#mark(packet, { state: 'rejected', error: result.code });
          this.#notice = 'Rejected. The original record and rejection code are retained.'; break;
        } else throw new Error('append-result-mismatch');
      } catch {
        if (this.#packets.get(packet.request.packet.updateId)?.state === 'rejected') {
          this.#notice = 'Rejected. Original record and rejection code remain in this tab; outbox result persistence failed.';
          this.#changed(); break;
        }
        if (this.#packets.get(packet.request.packet.updateId)?.state !== 'durable') {
          try { await this.#mark(packet, { state: 'acknowledgment-unknown', error: 'REPLY_OR_RECEIPT_UNVERIFIED' }); } catch { /* Original packet remains recorded and retryable. */ }
          this.#notice = 'ACK unknown. Response or receipt was not verified. Original packet retained for exact retry.';
        }
        this.#changed(); break;
      }
      this.#changed();
    }
  }
  async #refresh(): Promise<void> {
    if (!this.#active() || !this.#replica || !this.#client) return;
    try {
      const state: unknown = this.#transport ? await this.#wire(signal => this.#transport!.state(signal)) :
        await this.#json('/state', { method: 'GET', headers: this.#headers() });
      await this.#mergeAccepted(state);
    } catch { this.#notice = 'Accepted-state refresh refused or unavailable. Existing native history and local packets are preserved.'; }
    this.#changed();
  }
  refresh(): Promise<void> {
    if (this.#refreshJob) return this.#refreshJob;
    const job = this.#queue(() => this.#refresh()); this.#refreshJob = job;
    void job.then(() => { if (this.#refreshJob === job) this.#refreshJob = undefined; });
    return job;
  }
  retry(): Promise<void> {
    const persistence = this.#write();
    return this.#queue(async () => {
      await persistence;
      if (this.#active()) {
        if (this.#transport) await this.#refresh();
        await this.#drain(true);
        if (!this.#transport) await this.#refresh();
      }
    });
  }
  setOutgoingPaused(paused: boolean): void {
    if (!this.#transport || this.#closed || this.#outgoingPaused === paused) return;
    this.#outgoingPaused = paused;
    this.#notice = paused ? 'New outgoing changes paused. Local persistence, current replies and permission updates continue.' :
      'New outgoing changes resumed. Rejected packets require explicit Retry.';
    if (!paused) void this.#queue(() => this.#drain(false));
    this.#changed();
  }
  setPaused(paused: boolean): void {
    if (this.#closed || paused === this.#paused) return;
    this.#paused = paused;
    this.#transport?.setPaused(paused);
    if (paused) { this.#network?.abort(); this.#notice = 'Delivery paused. Local persistence may finish; no new request starts.'; }
    else {
      this.#notice = 'Resuming original delivery records.'; this.#consumePush();
      if (this.#transport) void this.#queue(async () => { await this.#refresh(); await this.#drain(false); });
      else void this.retry();
    }
    this.#changed();
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true; this.#network?.abort(); this.#transport?.close(); this.#pendingState = undefined;
    this.#notice = 'Delivery closed. Original local records and native state are retained.'; this.#changed();
  }
}
