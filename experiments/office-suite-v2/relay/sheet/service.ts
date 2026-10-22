import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as Y from 'yjs';
import { DisposableDurableStore, updateHash } from '../../src/durable-store.ts';
import type { StoreOptions } from '../../src/durable-store.ts';
import { sheetUpdateValidator } from '../../src/collaboration.ts';
import { createPreviewReplica } from '../../preview/sheet/fixture.ts';
import { base64ToBytes, bytesToBase64, isRelayCredential, parseSheetRelayAppendRequest, parseSheetRelaySessionRequest,
  relayAdmission, sameRelayContext, SHEET_RELAY_LIMITS } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayAppendRequest, SheetRelayAppendResult, SheetRelayCheckpoint, SheetRelayReceipt,
  SheetRelaySessionRequest, SheetRelayState, SheetRelayIdentity, SheetRelayWsSession } from '../../src/sheet-preview-protocol.ts';
import { persistAudit, readStartup, writeManifest, writeRegistry } from './storage.ts';
import type { RelayManifest, SessionRegistry, StoredSession } from './storage.ts';
import { checkOwner, claimOwner, releaseOwner, initializeReceiptMarkers, recordReceipt, validateReceiptMarkers } from './control-files.ts';

export class RelayError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
const credentialHash = (credential: string): string => updateHash(new TextEncoder().encode(credential));
const sameIdentity = (a: SheetRelayIdentity, b: SheetRelayIdentity): boolean => a.actorId === b.actorId && a.sessionId === b.sessionId;
type AccessState = { registry: SessionRegistry; bootstrap: boolean };
function options(manifest: RelayManifest, access: AccessState): StoreOptions {
  const native = sheetUpdateValidator(manifest.context);
  return {
    admission: manifest.admission,
    currentAccess: identity => (access.bootstrap && sameIdentity(identity, manifest.bootstrap.identity)) || access.registry.sessions.some(session => session.active && session.access === 'read-write' && sameIdentity(session.identity, identity)),
    validateDocument: (candidate, previous, update, authenticated) => {
      if (Y.encodeStateAsUpdate(candidate).length > SHEET_RELAY_LIMITS.updateBytes) throw new Error('relay-full-state-limit');
      if (Y.encodeStateVector(candidate).length > SHEET_RELAY_LIMITS.frontierBytes) throw new Error('relay-frontier-limit');
      native(candidate, previous, update, authenticated);
    },
  };
}
function receipt(manifest: RelayManifest, value: { updateId: string; hash: string; sequence: number; frontier: Uint8Array }): SheetRelayReceipt {
  return Object.freeze({ context: manifest.context, admission: manifest.admission, updateId: value.updateId,
    sha256: value.hash, sequence: value.sequence, frontierBase64: bytesToBase64(value.frontier, SHEET_RELAY_LIMITS.frontierBytes) });
}

export class SheetRelayService {
  readonly directory: string;
  readonly context: RelayManifest['context'];
  #manifest: RelayManifest;
  #access: AccessState;
  #store: DisposableDurableStore;
  #receipts: SheetRelayReceipt[];
  #closed = false;
  #ownerToken: string;
  #accessListeners = new Set<(credential: string) => void>();

  private constructor(manifest: RelayManifest, access: AccessState, store: DisposableDurableStore, receipts: readonly SheetRelayReceipt[]) {
    this.directory = store.directory; this.context = Object.freeze({ ...manifest.context });
    this.#manifest = Object.freeze({ ...manifest, context: this.context, admission: Object.freeze({ ...manifest.admission }),
      bootstrap: Object.freeze({ identity: Object.freeze({ ...manifest.bootstrap.identity }), packet: Object.freeze({ ...manifest.bootstrap.packet }) }) });
    this.#access = access; this.#store = store; this.#receipts = [...receipts];
    this.#ownerToken = claimOwner(this.directory);
  }

  static create(): SheetRelayService {
    const initial = createPreviewReplica(); // Exactly once, never on resume.
    let store: DisposableDurableStore | undefined;
    try {
      const bytes = initial.exportUpdate();
      const manifest: RelayManifest = { version: 1, context: initial.context, admission: relayAdmission(initial.context),
        bootstrap: { identity: initial.identity, packet: { updateId: `bootstrap-${randomUUID()}`, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) } } };
      const access: AccessState = { registry: { version: 1, sessions: [] }, bootstrap: true };
      store = DisposableDurableStore.create(options(manifest, access));
      writeManifest(store.directory, manifest); writeRegistry(store.directory, access.registry);
      initializeReceiptMarkers(store.directory);
      persistAudit(store.directory, { version: 1, context: manifest.context, admission: manifest.admission, packet: manifest.bootstrap.packet, identity: manifest.bootstrap.identity });
      const result = store.append(manifest.bootstrap.identity, { admission: manifest.admission, updateId: manifest.bootstrap.packet.updateId, bytes });
      if (result.status !== 'durable') throw new RelayError('bootstrap-not-durable', 500);
      recordReceipt(store.directory, receipt(manifest, result.receipt));
      access.bootstrap = false;
      return new SheetRelayService(manifest, access, store, [receipt(manifest, result.receipt)]);
    } catch (error) { store?.close(); throw error; }
    finally { initial.destroy(); }
  }

  static resume(directory: string): SheetRelayService {
    // All persisted files/receipts are validated read-only BEFORE this constructor
    // can create a missing DB/metadata. No fixture, directory or seed fallback.
    checkOwner(directory);
    const persisted = readStartup(directory);
    validateReceiptMarkers(directory, persisted.receipts);
    const access: AccessState = { registry: persisted.registry, bootstrap: false };
    const store = DisposableDurableStore.reopen(directory, options(persisted.manifest, access));
    try {
      // The first diagnostic copy is not a lease. Re-inspect after acquiring
      // the ORIGINAL native exclusive writer; no registry/audit writes precede
      // this check. Another writer may have issued/revoked a session and closed
      // without changing any CRDT bytes during the earlier acquisition gap.
      const locked = readStartup(directory);
      validateReceiptMarkers(directory, locked.receipts);
      if (!isDeepStrictEqual(persisted, locked)) throw new RelayError('resume-authority-mismatch', 409);
      if (!isDeepStrictEqual(store.exportUpdate(), locked.expectedExport) ||
          !isDeepStrictEqual(store.includedUpdateIds(), locked.receipts.map(value => value.updateId))) throw new RelayError('resume-state-mismatch', 409);
      access.registry = locked.registry;
      return new SheetRelayService(locked.manifest, access, store, locked.receipts);
    } catch (error) { store.close(); throw error; }
  }

  #open(): void { if (this.#closed) throw new RelayError('relay-closed', 503); }
  #session(credential: string, write = false): StoredSession {
    this.#open();
    if (!isRelayCredential(credential)) throw new RelayError('session-denied', 401);
    const session = this.#access.registry.sessions.find(value => value.credentialHash === credentialHash(credential));
    if (!session) throw new RelayError('session-denied', 401);
    if (!session.active) throw new RelayError('current-access-denied', 403);
    if (write && session.access !== 'read-write') throw new RelayError('read-only-denied', 403);
    return session;
  }

  issueSession(value: SheetRelaySessionRequest): SheetRelayWsSession {
    this.#open();
    const request = parseSheetRelaySessionRequest(value);
    if (request.resumeCredential !== undefined) {
      const stored = this.#session(request.resumeCredential);
      return { protocolVersion: 1, controlled: true, credential: request.resumeCredential, identity: Object.freeze({ ...stored.identity }), context: this.context, access: stored.access };
    }
    if (this.#access.registry.sessions.length >= SHEET_RELAY_LIMITS.sessions) throw new RelayError('session-count-limit', 409);
    const credential = randomBytes(32).toString('hex');
    const identity = Object.freeze({ actorId: `controlled-${randomUUID()}`, sessionId: randomUUID() });
    const stored: StoredSession = { credentialHash: credentialHash(credential), identity, active: true, access: 'read-write' };
    const registry: SessionRegistry = { version: 1, sessions: [...this.#access.registry.sessions, stored] };
    writeRegistry(this.directory, registry); // Durable before credential response.
    this.#access.registry = registry;
    return { protocolVersion: 1, controlled: true, credential, identity, context: this.context, access: stored.access };
  }

  revokeSession(credential: string): void {
    const stored = this.#session(credential);
    const registry: SessionRegistry = { version: 1, sessions: this.#access.registry.sessions.map(value => value.credentialHash === stored.credentialHash ? { ...value, active: false } : value) };
    writeRegistry(this.directory, registry); this.#access.registry = registry;
    this.#notifyAccess(credential);
  }

  /** Trusted local server seam only. Session requests never choose their access. */
  setSessionAccess(credential: string, access: SheetRelayAccess): void {
    const stored = this.#session(credential);
    if (access !== 'read-write' && access !== 'read-only') throw new RelayError('invalid-session-access');
    if (stored.access === access) return;
    const registry: SessionRegistry = { version: 1, sessions: this.#access.registry.sessions.map(value => value.credentialHash === stored.credentialHash ? { ...value, access } : value) };
    writeRegistry(this.directory, registry); this.#access.registry = registry;
    this.#notifyAccess(credential);
  }

  /** Trusted transport subscribers only; credentials never enter logs or events sent to peers. */
  subscribeAccess(listener: (credential: string) => void): () => void {
    this.#open(); this.#accessListeners.add(listener);
    return () => { this.#accessListeners.delete(listener); };
  }
  #notifyAccess(credential: string): void {
    // Persisted authority is already committed. A transport callback failure
    // cannot roll it back or report that the registry mutation was rejected.
    for (const listener of [...this.#accessListeners]) {
      try { listener(credential); } catch { /* Isolate each trusted transport. */ }
    }
  }

  open(credential: string): SheetRelayState {
    this.#session(credential);
    const bytes = this.#store.exportUpdate();
    const original = this.#manifest.bootstrap;
    return { protocolVersion: 1, context: this.context, admission: this.#manifest.admission, latestSequence: this.#receipts.length,
      state: { bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes), frontierBase64: bytesToBase64(this.#store.frontier(), SHEET_RELAY_LIMITS.frontierBytes) },
      bootstrap: { updateId: original.packet.updateId, sha256: original.packet.sha256, byteLength: original.packet.byteLength, identity: original.identity } };
  }

  append(credential: string, value: SheetRelayAppendRequest): SheetRelayAppendResult {
    const session = this.#session(credential, true); // Current write permission before parsing/hash/dedup/audit.
    const request = parseSheetRelayAppendRequest(value);
    const reject = (code: string): SheetRelayAppendResult => ({ protocolVersion: 1, status: 'rejected', code, updateId: request.packet.updateId });
    if (!sameRelayContext(request.context, this.context)) return reject('context-mismatch');
    const bytes = base64ToBytes(request.packet.bytesBase64);
    if (updateHash(bytes) !== request.packet.sha256) return reject('packet-hash-mismatch');
    try {
      persistAudit(this.directory, { version: 1, context: this.context, admission: request.admission, packet: request.packet, identity: session.identity });
    } catch (error) {
      if (error instanceof Error && error.message === 'relay-storage:audit-collision') return reject('update-id-collision');
      throw error;
    }
    const result = this.#store.append(session.identity, { admission: request.admission, updateId: request.packet.updateId, bytes });
    if (result.status === 'rejected') return reject(/^[A-Za-z0-9_:#-]{1,200}$/.test(result.code) ? result.code : 'native-update-rejected');
    if (result.status !== 'durable') throw new RelayError('unexpected-native-ack', 500);
    const accepted = receipt(this.#manifest, result.receipt);
    if (!this.#receipts.some(previous => previous.updateId === accepted.updateId)) this.#receipts.push(accepted);
    try { recordReceipt(this.directory, accepted); }
    catch {
      // Native COMMIT has already succeeded. A confirmation-file failure cannot
      // turn accepted input into a rejection; retain the exact pending identity.
      return { protocolVersion: 1, status: 'acknowledgment-unknown', updateId: request.packet.updateId };
    }
    // Fault injection is AFTER COMMIT and receipt construction. Audit already
    // existed before COMMIT, so process exit now can verify compacted retries.
    return request.loseAck === true ? { protocolVersion: 1, status: 'acknowledgment-unknown', updateId: request.packet.updateId } : { protocolVersion: 1, status: 'durable', receipt: accepted };
  }

  checkpoint(credential: string): SheetRelayCheckpoint {
    this.#session(credential, true);
    const result = this.#store.checkpoint();
    return { protocolVersion: 1, throughSequence: result.throughSequence, includedCount: result.includedUpdateIds.length,
      frontierBase64: bytesToBase64(result.frontier, SHEET_RELAY_LIMITS.frontierBytes), stateSha256: updateHash(this.#store.exportUpdate()) };
  }

  /** Nonsecret runner binding. Main DB hash excludes WAL; accepted-state hash does not. */
  binding(): Readonly<Record<string, unknown>> {
    this.#open();
    const bootstrap = this.#manifest.bootstrap;
    return Object.freeze({ protocolVersion: 1, controlled: true, ownerPid: process.pid, directory: this.directory, context: this.context,
      databasePath: join(this.directory, 'updates.sqlite'), databaseMainFileSha256: updateHash(readFileSync(join(this.directory, 'updates.sqlite'))),
      manifestSha256: updateHash(readFileSync(join(this.directory, 'relay-manifest.json'))), registrySha256: updateHash(readFileSync(join(this.directory, 'relay-sessions.json'))),
      acceptedStateSha256: updateHash(this.#store.exportUpdate()), latestSequence: this.#receipts.length,
      bootstrap: { updateId: bootstrap.packet.updateId, sha256: bootstrap.packet.sha256, byteLength: bootstrap.packet.byteLength, identity: bootstrap.identity } });
  }
  close(): void { if (!this.#closed) { try { releaseOwner(this.directory, this.#ownerToken); } finally { this.#store.close(); this.#accessListeners.clear(); this.#closed = true; } } }
}
