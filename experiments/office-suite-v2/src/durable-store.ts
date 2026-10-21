import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';

export type Admission = Readonly<{
  documentId: string;
  generation: string;
  engineId: 'sheet-v1' | 'prose-v1';
  contractVersion: 1;
  engineVersion: 1;
  schemaVersion: 1;
  adapterVersion: 1;
}>;
export type UpdatePacket = Readonly<{ admission: Admission; updateId: string; bytes: Uint8Array }>;
export type DurableReceipt = Readonly<{
  admission: Admission; updateId: string; hash: string; sequence: number; frontier: Uint8Array;
}>;
export type AppendResult = Readonly<{ status: 'durable'; receipt: DurableReceipt }> |
  Readonly<{ status: 'acknowledgment-unknown' }> |
  Readonly<{ status: 'rejected'; code: string }>;
export type AuthenticatedSession = Readonly<{ actorId: string; sessionId: string }>;
export type StoreOptions = Readonly<{
  admission: Admission;
  /** Trusted current server identity/access lookup, never a role from the packet. */
  currentAccess: (authenticated: AuthenticatedSession, admission: Admission) => boolean;
  /** authenticated is absent only for trusted persisted replay at construction. */
  validateDocument: (candidate: Y.Doc, previous: Y.Doc, update: Uint8Array, authenticated?: AuthenticatedSession) => void;
}>;
export const DURABLE_LIMITS = Object.freeze({ updateBytes: 1_000_000, stateBytes: 8_000_000, updates: 10_000 });

function identity(value: string): boolean { return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value); }
function admissionKey(value: Admission): string {
  if (!identity(value.documentId) || !identity(value.generation) || !['sheet-v1', 'prose-v1'].includes(value.engineId) ||
      value.contractVersion !== 1 || value.engineVersion !== 1 || value.schemaVersion !== 1 || value.adapterVersion !== 1) {
    throw new Error('incompatible-admission');
  }
  return JSON.stringify([value.documentId, value.generation, value.engineId, value.contractVersion, value.engineVersion, value.schemaVersion, value.adapterVersion]);
}
export function updateHash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function binary(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error('corrupt-stored-binary');
  return new Uint8Array(value);
}
function sequence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('corrupt-sequence');
  return value;
}

/** Controlled synchronous service; only an owned disposable temporary directory is accepted. */
export class DisposableDurableStore {
  readonly directory: string;
  readonly admission: Admission;
  #options: StoreOptions;
  #db: DatabaseSync;
  #doc: Y.Doc;
  #closed = false;

  static create(options: StoreOptions): DisposableDurableStore {
    return new DisposableDurableStore(mkdtempSync(join(tmpdir(), 'office-v2-m0-')), options);
  }

  static reopen(directory: string, options: StoreOptions): DisposableDurableStore {
    return new DisposableDurableStore(directory, options);
  }

  private constructor(directory: string, options: StoreOptions) {
    const key = admissionKey(options.admission);
    const resolved = realpathSync(directory);
    if (dirname(resolved) !== realpathSync(tmpdir()) || !basename(resolved).startsWith('office-v2-m0-')) throw new Error('disposable-directory-required');
    this.directory = resolved;
    this.admission = Object.freeze({ ...options.admission });
    this.#options = { ...options, admission: this.admission };
    this.#db = new DatabaseSync(join(resolved, 'updates.sqlite'));
    this.#doc = new Y.Doc();
    try {
      this.#db.exec(`PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        BEGIN EXCLUSIVE; COMMIT;
        CREATE TABLE IF NOT EXISTS metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1), admission TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS updates(seq INTEGER PRIMARY KEY, update_id TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, payload BLOB, frontier BLOB NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS checkpoint(singleton INTEGER PRIMARY KEY CHECK(singleton=1), through_seq INTEGER NOT NULL, payload BLOB NOT NULL, hash TEXT NOT NULL, frontier BLOB NOT NULL) STRICT;`);
      const metadata = this.#db.prepare('SELECT admission FROM metadata WHERE singleton=1').get();
      if (metadata === undefined) this.#db.prepare('INSERT INTO metadata VALUES(1, ?)').run(key);
      else if (metadata.admission !== key) throw new Error('incompatible-admission');
      const checkpoint = this.#db.prepare('SELECT through_seq, payload, hash, frontier FROM checkpoint WHERE singleton=1').get();
      let through = 0;
      if (checkpoint !== undefined) {
        through = sequence(checkpoint.through_seq);
        const payload = binary(checkpoint.payload);
        if (updateHash(payload) !== checkpoint.hash) throw new Error('corrupt-checkpoint-hash');
        Y.applyUpdate(this.#doc, payload);
        if (updateHash(Y.encodeStateVector(this.#doc)) !== updateHash(binary(checkpoint.frontier))) throw new Error('corrupt-checkpoint-frontier');
      }
      for (const row of this.#db.prepare('SELECT payload, hash FROM updates WHERE seq > ? ORDER BY seq').all(through)) {
        const payload = binary(row.payload);
        if (updateHash(payload) !== row.hash) throw new Error('corrupt-update-hash');
        Y.applyUpdate(this.#doc, payload);
      }
      if (this.#doc.store.pendingStructs !== null || this.#doc.store.pendingDs !== null) throw new Error('incomplete-replay');
      const previous = new Y.Doc();
      try { options.validateDocument(this.#doc, previous, Y.encodeStateAsUpdate(this.#doc)); }
      finally { previous.destroy(); }
    } catch (error) { this.#doc.destroy(); this.#db.close(); throw error; }
  }

  #open(): void { if (this.#closed) throw new Error('store-closed'); }

  #receipt(row: Record<string, unknown>): DurableReceipt {
    if (typeof row.update_id !== 'string' || typeof row.hash !== 'string') throw new Error('corrupt-receipt');
    return Object.freeze({ admission: this.admission, updateId: row.update_id, hash: row.hash, sequence: sequence(row.seq), frontier: binary(row.frontier) });
  }

  append(authenticated: AuthenticatedSession, packet: UpdatePacket, loseAck = false): AppendResult {
    this.#open();
    // Recheck before deduplication: an old receipt is not permission for a revoked client.
    if (!identity(authenticated.actorId) || !identity(authenticated.sessionId) || !this.#options.currentAccess(authenticated, this.admission)) return { status: 'rejected', code: 'current-access-denied' };
    try {
      if (admissionKey(packet.admission) !== admissionKey(this.admission)) return { status: 'rejected', code: 'incompatible-admission' };
    } catch { return { status: 'rejected', code: 'incompatible-admission' }; }
    if (!identity(packet.updateId) || !(packet.bytes instanceof Uint8Array) || packet.bytes.length === 0 || packet.bytes.length > DURABLE_LIMITS.updateBytes) {
      return { status: 'rejected', code: 'update-bounds' };
    }
    const hash = updateHash(packet.bytes);
    const old = this.#db.prepare('SELECT seq, update_id, hash, frontier FROM updates WHERE update_id=?').get(packet.updateId);
    if (old !== undefined) {
      if (old.hash !== hash) return { status: 'rejected', code: 'update-id-collision' };
      return loseAck ? { status: 'acknowledgment-unknown' } : { status: 'durable', receipt: this.#receipt(old) };
    }
    if (this.includedUpdateIds().length >= DURABLE_LIMITS.updates) return { status: 'rejected', code: 'update-count-limit' };
    const trial = new Y.Doc();
    try {
      Y.applyUpdate(trial, this.exportUpdate());
      Y.applyUpdate(trial, packet.bytes);
      if (trial.store.pendingStructs !== null || trial.store.pendingDs !== null) return { status: 'rejected', code: 'incomplete-update' };
      if (Y.encodeStateAsUpdate(trial).length > DURABLE_LIMITS.stateBytes) return { status: 'rejected', code: 'state-limit' };
      this.#options.validateDocument(trial, this.#doc, packet.bytes, authenticated);
      const frontier = Y.encodeStateVector(trial);
      this.#db.exec('BEGIN IMMEDIATE');
      let seq: number;
      try {
        const result = this.#db.prepare('INSERT INTO updates(update_id, hash, payload, frontier) VALUES(?, ?, ?, ?)').run(packet.updateId, hash, packet.bytes, frontier);
        seq = Number(result.lastInsertRowid);
        this.#db.exec('COMMIT');
      } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
      // Replace only the service's private validated CRDT instance, never client source snapshots.
      const retired = this.#doc; this.#doc = trial; retired.destroy();
      if (loseAck) return { status: 'acknowledgment-unknown' };
      return { status: 'durable', receipt: Object.freeze({ admission: this.admission, updateId: packet.updateId, hash, sequence: seq, frontier: new Uint8Array(frontier) }) };
    } catch (error) {
      return { status: 'rejected', code: error instanceof Error ? `validation:${error.message}` : 'validation-failed' };
    } finally { if (trial !== this.#doc) trial.destroy(); }
  }

  checkpoint(): Readonly<{ throughSequence: number; frontier: Uint8Array; includedUpdateIds: readonly string[] }> {
    this.#open();
    const row = this.#db.prepare('SELECT coalesce(max(seq), 0) AS seq FROM updates').get();
    const throughSequence = sequence(row?.seq);
    const frontier = Y.encodeStateVector(this.#doc);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const payload = this.exportUpdate();
      this.#db.prepare('INSERT OR REPLACE INTO checkpoint VALUES(1, ?, ?, ?, ?)').run(throughSequence, payload, updateHash(payload), frontier);
      // Keep identity/hash/receipt rows for idempotency; compact only payloads covered by the checkpoint.
      this.#db.prepare('UPDATE updates SET payload=NULL WHERE seq <= ?').run(throughSequence);
      this.#db.exec('COMMIT');
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
    return Object.freeze({ throughSequence, frontier, includedUpdateIds: this.includedUpdateIds() });
  }

  includedUpdateIds(): readonly string[] {
    this.#open();
    return Object.freeze(this.#db.prepare('SELECT update_id FROM updates ORDER BY seq').all().map(row => {
      if (typeof row.update_id !== 'string') throw new Error('corrupt-update-id');
      return row.update_id;
    }));
  }
  exportUpdate(): Uint8Array { this.#open(); return Y.encodeStateAsUpdate(this.#doc); }
  frontier(): Uint8Array { this.#open(); return Y.encodeStateVector(this.#doc); }
  replaceSnapshot(): never { throw new Error('snapshot-replacement-refused'); }
  close(): void { if (!this.#closed) { this.#doc.destroy(); this.#db.close(); this.#closed = true; } }
}

export type UpdateState = 'local-pending' | 'synchronized' | 'durable' | 'acknowledgment-unknown' | 'rejected';
/** Per-update status prevents a late receipt from marking later local input saved. */
export class PendingUpdates {
  #packets = new Map<string, UpdatePacket>();
  #states = new Map<string, UpdateState>();
  add(packet: UpdatePacket): void {
    admissionKey(packet.admission);
    if (this.#packets.has(packet.updateId)) throw new Error('duplicate-local-update-id');
    this.#packets.set(packet.updateId, { ...packet, admission: Object.freeze({ ...packet.admission }), bytes: new Uint8Array(packet.bytes) });
    this.#states.set(packet.updateId, 'local-pending');
  }
  synchronized(updateId: string): void {
    if (!this.#packets.has(updateId)) throw new Error('unknown-local-update');
    if (this.#states.get(updateId) === 'local-pending') this.#states.set(updateId, 'synchronized');
  }
  result(updateId: string, result: AppendResult): void {
    const packet = this.#packets.get(updateId);
    if (packet === undefined) throw new Error('unknown-local-update');
    if (result.status === 'durable') {
      if (result.receipt.updateId !== updateId || result.receipt.hash !== updateHash(packet.bytes) || admissionKey(result.receipt.admission) !== admissionKey(packet.admission)) throw new Error('receipt-mismatch');
      this.#states.set(updateId, 'durable');
    } else if (this.#states.get(updateId) !== 'durable') this.#states.set(updateId, result.status);
  }
  state(updateId: string): UpdateState | undefined { return this.#states.get(updateId); }
  pending(): readonly UpdatePacket[] {
    return [...this.#packets].filter(([id]) => this.#states.get(id) !== 'durable').map(([, packet]) => ({ ...packet, bytes: new Uint8Array(packet.bytes) }));
  }
}
