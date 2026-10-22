import { SheetReplica, SHEET_UPDATE_BYTES } from '../../src/collaboration.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { createPreviewReplica } from './fixture.ts';

export interface PeerView {
  roomId: string; sessionId: string; phase: 'waiting' | 'ready' | 'paused' | 'closed';
  peers: number; pending: number; received: number; recovered: number; notice: string;
  queuedPackets: readonly { updateId: string; bytes: number; hash: string | null }[];
}

type Packet = { v: 1; roomId: string; from: string; kind: string; to?: string; id?: string; bytes?: Uint8Array; bootstrap?: Uint8Array };
const MAX_PACKETS = 256;
const MAX_BYTES = 8 * SHEET_UPDATE_BYTES;
const MAX_PEERS = 64;
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function bytes(value: unknown): value is Uint8Array { return value instanceof Uint8Array && value.length > 0 && value.length <= SHEET_UPDATE_BYTES; }
function equal(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((value, i) => value === b[i]); }
function size(map: ReadonlyMap<string, Uint8Array>): number { let total = 0; for (const item of map.values()) total += item.length; return total; }

function readPacket(value: unknown, roomId: string, sessionId: string): Packet | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const room: unknown = Reflect.get(value, 'roomId');
  if (room !== roomId) return undefined;
  const from: unknown = Reflect.get(value, 'from');
  if (from === sessionId) return undefined;
  const to: unknown = Reflect.get(value, 'to');
  if (to !== undefined && !id(to)) throw new Error('Invalid peer target');
  if (to !== undefined && to !== sessionId) return undefined;
  const version: unknown = Reflect.get(value, 'v');
  const kind: unknown = Reflect.get(value, 'kind');
  if (version !== 1 || !id(from) || typeof kind !== 'string' || !['hello', 'state', 'update', 'ack', 'leave'].includes(kind)) throw new Error('Invalid peer envelope');
  const packet: Packet = { v: 1, roomId, from, kind, ...(to === undefined ? {} : { to }) };
  if (kind === 'update' || kind === 'ack') {
    const eventId: unknown = Reflect.get(value, 'id');
    if (!id(eventId)) throw new Error('Invalid peer packet ID');
    packet.id = eventId;
  }
  if (kind === 'update' || kind === 'state') {
    const update: unknown = Reflect.get(value, 'bytes');
    if (!bytes(update)) throw new Error('Invalid native update bounds');
    packet.bytes = update;
  }
  if (kind === 'state') {
    const bootstrap: unknown = Reflect.get(value, 'bootstrap');
    if (!bytes(bootstrap) || bootstrap.length + packet.bytes!.length > SHEET_UPDATE_BYTES) throw new Error('Invalid native state bounds');
    packet.bootstrap = bootstrap;
  }
  return packet;
}

/** Controlled, same-origin peer transport. It confers no authentication or durability. */
export class PeerSession {
  readonly #options: { roomId: string; sessionId?: string; create: boolean; send: (packet: unknown) => void; changed: () => void };
  readonly #sessionId: string;
  readonly #context;
  #replica: SheetReplica | undefined;
  #bootstrap: Uint8Array | undefined;
  #closed = false;
  #started = false;
  #paused = false;
  #notice = 'Waiting for the room creator. Nothing is saved.';
  #peers = new Set<string>();
  #pending = new Map<string, Uint8Array>();
  #seen = new Map<string, Uint8Array>();
  #deferred = new Map<string, Packet>();
  #hashes = new Map<string, string | null>();
  #blocked: string | undefined;
  #received = 0;
  #recovered = 0;

  constructor(options: { roomId: string; sessionId?: string; create: boolean; send: (packet: unknown) => void; changed: () => void }) {
    if (!id(options.roomId) || (options.sessionId !== undefined && !id(options.sessionId))) throw new Error('Invalid peer room/session ID');
    this.#options = options;
    this.#sessionId = options.sessionId ?? globalThis.crypto.randomUUID();
    this.#context = createWorkbookContext({ documentId: 'sheet-preview', workbookId: 'budget-example', generation: options.roomId });
    if (options.create) {
      const initial = createPreviewReplica(options.roomId);
      try { this.#bootstrap = initial.exportUpdate(); }
      finally { initial.destroy(); }
      this.#replica = new SheetReplica(this.#context, this.#identity(), this.#bootstrap);
      this.#notice = 'Room created. This session is local. Nothing is saved.';
    }
  }
  #identity(): { actorId: string; sessionId: string } { return { actorId: this.#sessionId, sessionId: this.#sessionId }; }
  get replica(): SheetReplica | undefined { return this.#replica; }
  get bootstrap(): Uint8Array | undefined { return this.#bootstrap?.slice(); }
  inspect(): PeerView {
    return { roomId: this.#options.roomId, sessionId: this.#sessionId,
      phase: this.#closed ? 'closed' : this.#paused ? 'paused' : this.#replica ? 'ready' : 'waiting',
      peers: this.#peers.size, pending: this.#pending.size, received: this.#received, recovered: this.#recovered, notice: this.#blocked ?? this.#notice,
      queuedPackets: [
        ...[...this.#pending].map(([updateId, update]) => ({ updateId, bytes: update.length, hash: this.#hashes.get(`out:${updateId}`) ?? null })),
        ...[...this.#deferred].map(([key, packet]) => ({ updateId: packet.id!, bytes: packet.bytes!.length, hash: this.#hashes.get(`in:${key}`) ?? null })),
      ] };
  }
  #hash(direction: 'in' | 'out', key: string, update: Uint8Array): void {
    const hashKey = `${direction}:${key}`;
    this.#hashes.set(hashKey, null);
    const current = (): Uint8Array | undefined => direction === 'out' ? this.#pending.get(key) : this.#deferred.get(key)?.bytes;
    const original = current();
    try {
      void globalThis.crypto.subtle.digest('SHA-256', update.slice()).then(digest => {
        if (this.#closed || current() !== original) return;
        this.#hashes.set(hashKey, [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''));
        this.#changed();
      }).catch(() => {});
    } catch { /* A hash is observation only; native bytes remain queued. */ }
  }
  #changed(): void { try { this.#options.changed(); } catch { /* Observation cannot change admission. */ } }
  #send(packet: Omit<Packet, 'v' | 'roomId' | 'from'>): void {
    if (this.#closed || this.#paused) return;
    try { this.#options.send({ v: 1, roomId: this.#options.roomId, from: this.#sessionId, ...packet }); }
    catch { this.#notice = 'Peer delivery failed. Local changes are not saved.'; }
  }
  start(): void {
    if (this.#started || this.#closed) return;
    this.#started = true; this.requestState(); this.#changed();
  }
  requestState(): void { this.#send({ kind: 'hello' }); }
  #state(to: string): void {
    if (!this.#replica || !this.#bootstrap) return;
    const update = this.#replica.exportUpdate();
    if (!bytes(update) || update.length + this.#bootstrap.length > SHEET_UPDATE_BYTES) { this.#notice = 'Native state exceeds the peer limit. Synchronization is blocked.'; return; }
    this.#send({ kind: 'state', to, bootstrap: this.#bootstrap.slice(), bytes: update });
    for (const [eventId, pending] of this.#pending) this.#send({ kind: 'update', to, id: eventId, bytes: pending.slice() });
  }
  publish(eventId: string, update: Uint8Array): void {
    if (this.#closed) return;
    if (!this.#replica || !id(eventId) || !bytes(update)) { this.#notice = 'Local update refused by peer bounds. Nothing is saved.'; this.#changed(); return; }
    const previous = this.#pending.get(eventId);
    if (previous && !equal(previous, update)) { this.#notice = 'Local packet ID has different bytes. Synchronization is blocked.'; this.#changed(); return; }
    if (!previous && (this.#pending.size >= MAX_PACKETS || size(this.#pending) + update.length > MAX_BYTES)) {
      this.#blocked = 'Pending peer queue is full. The native edit remains local; synchronization is blocked.'; this.#changed(); return;
    }
    this.#pending.set(eventId, update.slice());
    this.#hash('out', eventId, update);
    this.#notice = this.#paused ? 'Delivery paused. Changes remain local and are not saved.' : 'Waiting for peer acknowledgment. Nothing is saved.';
    this.#send({ kind: 'update', id: eventId, bytes: update.slice() });
    this.#changed();
  }
  #defer(packet: Packet): void {
    const key = JSON.stringify([packet.from, packet.id]);
    const existing = this.#deferred.get(key);
    if (existing?.bytes && packet.bytes && !equal(existing.bytes, packet.bytes)) throw new Error('Packet ID has different bytes');
    if (existing) return;
    let total = 0; for (const item of this.#deferred.values()) total += item.bytes?.length ?? 0;
    if (this.#deferred.size >= MAX_PACKETS || total + (packet.bytes?.length ?? 0) > MAX_BYTES) throw new Error('Incoming peer queue is full; synchronization is blocked');
    const update = packet.bytes;
    if (!update || !packet.id) throw new Error('Invalid queued native packet');
    this.#deferred.set(key, { ...packet, bytes: update.slice() });
    this.#hash('in', key, update);
  }
  #update(packet: Packet): boolean {
    if (!packet.id || !packet.bytes) throw new Error('Invalid native update packet');
    const key = JSON.stringify([packet.from, packet.id]);
    const deferred = this.#deferred.get(key);
    if (deferred?.bytes && !equal(deferred.bytes, packet.bytes)) throw new Error('Packet ID has different bytes');
    const previous = this.#seen.get(key);
    if (previous) {
      if (!equal(previous, packet.bytes)) throw new Error('Packet ID has different bytes');
      this.#send({ kind: 'ack', to: packet.from, id: packet.id }); return true;
    }
    if (this.#seen.size >= MAX_PACKETS || size(this.#seen) + packet.bytes.length > MAX_BYTES) throw new Error('Peer receipt queue is full; synchronization is blocked');
    if (!this.#replica) { this.#defer(packet); this.#send({ kind: 'hello', to: packet.from }); return false; }
    try { this.#replica.receive(packet.bytes); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'incomplete-update') throw error;
      this.#defer(packet); this.#notice = 'Missing native base. Waiting for the original peer state.';
      this.#send({ kind: 'hello', to: packet.from }); return false;
    }
    this.#seen.set(key, packet.bytes.slice()); this.#received++;
    this.#send({ kind: 'ack', to: packet.from, id: packet.id }); return true;
  }
  #retry(): void {
    for (const [key, packet] of [...this.#deferred]) {
      try {
        if (this.#update(packet)) { this.#deferred.delete(key); this.#hashes.delete(`in:${key}`); this.#recovered++; }
      } catch (error) {
        // Keep the original bounded record for inspection and explicit later recovery.
        this.#notice = `Peer data refused: ${error instanceof Error ? error.message : 'invalid queued update'}. Existing cells and queued bytes are preserved.`;
      }
    }
  }
  receive(value: unknown): void {
    if (this.#closed) return;
    try {
      const packet = readPacket(value, this.#options.roomId, this.#sessionId);
      if (!packet) return;
      if (packet.kind === 'leave') { this.#peers.delete(packet.from); this.#changed(); return; }
      if (!this.#peers.has(packet.from) && this.#peers.size >= MAX_PEERS) throw new Error('Observed peer limit reached');
      if (this.#paused) {
        if (packet.kind === 'update') this.#defer(packet);
        this.#changed(); return;
      }
      if (packet.kind === 'state') {
        const bootstrap = packet.bootstrap!;
        if (this.#bootstrap && !equal(this.#bootstrap, bootstrap)) throw new Error('Room bootstrap mismatch');
        // Validate a complete native state and its exact bootstrap before touching live cells.
        const trial = new SheetReplica(this.#context, this.#identity(), packet.bytes!);
        try {
          const before = trial.exportUpdate();
          trial.receive(bootstrap);
          if (!equal(before, trial.exportUpdate())) throw new Error('Native state omits the room bootstrap');
          if (this.#replica) { this.#replica.receive(packet.bytes!); trial.destroy(); }
          else { this.#replica = trial; this.#bootstrap = bootstrap.slice(); }
        } catch (error) { trial.destroy(); throw error; }
        this.#notice = 'Native peer state received. Nothing is saved.';
        this.#retry();
        for (const [eventId, update] of this.#pending) this.#send({ kind: 'update', id: eventId, bytes: update.slice() });
      } else if (packet.kind === 'update') {
        if (this.#update(packet)) this.#notice = 'Peer update synchronized. Nothing is saved.';
      } else if (packet.kind === 'ack') {
        if (this.#pending.delete(packet.id!)) { this.#hashes.delete(`out:${packet.id!}`); this.#notice = 'Peer acknowledged the native update. Nothing is saved.'; }
      } else if (packet.kind === 'hello') {
        const first = !this.#peers.has(packet.from);
        this.#peers.add(packet.from);
        this.#state(packet.from);
        // A creator must also fetch peer edits after returning from an inactive tab.
        if (first && this.#replica) this.#send({ kind: 'hello', to: packet.from });
      }
      this.#peers.add(packet.from);
    } catch (error) { this.#notice = `Peer data refused: ${error instanceof Error ? error.message : 'invalid data'}. Existing cells are preserved.`; }
    this.#changed();
  }
  setPaused(paused: boolean): void {
    if (this.#closed || paused === this.#paused) return;
    this.#paused = paused;
    if (paused) this.#notice = 'Delivery paused. Changes remain local and are not saved.';
    else {
      this.#notice = 'Delivery resumed. Requesting native peer state. Nothing is saved.';
      this.requestState(); this.#retry();
      for (const [eventId, update] of this.#pending) this.#send({ kind: 'update', id: eventId, bytes: update.slice() });
    }
    this.#changed();
  }
  close(): void {
    if (this.#closed) return;
    this.#send({ kind: 'leave' }); this.#closed = true;
    this.#pending.clear(); this.#deferred.clear(); this.#seen.clear(); this.#peers.clear(); this.#hashes.clear();
    this.#notice = 'Peer channel closed. Nothing is saved.'; this.#changed();
  }
}
