import { randomUUID } from 'node:crypto';
import { constants, closeSync, existsSync, fsyncSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, opendirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import type { WorkbookContext } from '../../src/contracts.ts';
import { sheetUpdateValidator } from '../../src/collaboration.ts';
import { DURABLE_LIMITS, updateHash } from '../../src/durable-store.ts';
import { SHEET_RELAY_LIMITS, base64ToBytes, isSha256, isSheetRelayAdmission, isSheetRelayContext, parseSheetRelayAppendRequest, relayAdmission, sameRelayAdmission, sameRelayContext } from '../../src/sheet-preview-protocol.ts';
import { parseSheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayAdmission, SheetRelayIdentity, SheetRelayPacket, SheetRelayReceipt, SheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';

export type AccountScope = Readonly<Pick<SheetRelayAccountBinding, 'tenantId' | 'workspaceId' | 'documentId'>>;
export type RelayManifest = Readonly<{
  version: 1 | 2; mode?: 'account'; scope?: AccountScope; context: WorkbookContext; admission: SheetRelayAdmission;
  bootstrap: Readonly<{ packet: SheetRelayPacket; identity: SheetRelayIdentity }>;
}>;
export type StoredSession = Readonly<{ credentialHash: string; identity: SheetRelayIdentity; active: boolean; access: SheetRelayAccess; accountBinding?: SheetRelayAccountBinding }>;
export type SessionRegistry = Readonly<{ version: 1 | 2; mode?: 'account'; sessions: readonly StoredSession[] }>;
export type AuditPacket = Readonly<{
  version: 1; context: WorkbookContext; admission: SheetRelayAdmission;
  packet: SheetRelayPacket; identity: SheetRelayIdentity;
}>;

const manifestName = 'relay-manifest.json';
const registryName = 'relay-sessions.json';
const auditName = 'packet-audit';
const jsonLimit = SHEET_RELAY_LIMITS.httpBodyBytes;
/** Includes bootstrap, accepted packets and every prepared/rejected orphan. */
export const RELAY_AUDIT_LIMITS = Object.freeze({ files: DURABLE_LIMITS.updates, encodedBytes: 32_000_000 });

function fail(code: string): never { throw new Error(`relay-storage:${code}`); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function identity(value: unknown): SheetRelayIdentity {
  if (!fields(value, ['actorId', 'sessionId']) || ![value.actorId, value.sessionId].every(part => typeof part === 'string' && part.length > 0 && part.length <= 128)) fail('identity');
  return { actorId: value.actorId as string, sessionId: value.sessionId as string };
}
function identityKey(value: SheetRelayIdentity): string { return JSON.stringify([value.actorId, value.sessionId]); }
function sameIdentity(left: SheetRelayIdentity, right: SheetRelayIdentity): boolean { return identityKey(left) === identityKey(right); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined) fail('json-value');
  return result;
}
function packet(value: unknown, context: WorkbookContext, admission: SheetRelayAdmission): SheetRelayPacket {
  const parsed = parseSheetRelayAppendRequest({ protocolVersion: 1, context, admission, packet: value }).packet;
  if (updateHash(base64ToBytes(parsed.bytesBase64)) !== parsed.sha256) fail('packet-hash');
  return parsed;
}
function binding(context: unknown, admission: unknown): { context: WorkbookContext; admission: SheetRelayAdmission } {
  if (!isSheetRelayContext(context) || !isSheetRelayAdmission(admission) || !sameRelayAdmission(relayAdmission(context), admission)) fail('context-admission');
  return { context, admission };
}
function manifest(value: unknown): RelayManifest {
  if (!object(value)) fail('manifest');
  const account = value.version === 2;
  if (!fields(value, account ? ['version', 'mode', 'scope', 'context', 'admission', 'bootstrap'] : ['version', 'context', 'admission', 'bootstrap']) ||
      (!account && value.version !== 1) || (account && value.mode !== 'account') || !fields(value.bootstrap, ['packet', 'identity'])) fail('manifest');
  const bound = binding(value.context, value.admission);
  let scope: AccountScope | undefined;
  if (account) {
    if (!fields(value.scope, ['tenantId', 'workspaceId', 'documentId']) ||
        ![value.scope.tenantId, value.scope.workspaceId, value.scope.documentId, bound.context.workbookId, bound.context.generation].every(part => typeof part === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(part)) || value.scope.documentId !== bound.context.documentId) fail('account-manifest');
    scope = value.scope as unknown as AccountScope;
  }
  return { version: account ? 2 : 1, ...(scope ? { mode: 'account' as const, scope } : {}), ...bound,
    bootstrap: { packet: packet(value.bootstrap.packet, bound.context, bound.admission), identity: identity(value.bootstrap.identity) } };
}
function registry(value: unknown): SessionRegistry {
  if (!object(value)) fail('registry');
  const account = value.version === 2;
  if (!fields(value, account ? ['version', 'mode', 'sessions'] : ['version', 'sessions']) || (!account && value.version !== 1) ||
      (account && value.mode !== 'account') || !Array.isArray(value.sessions) || value.sessions.length > SHEET_RELAY_LIMITS.sessions) fail('registry');
  const credentials = new Set<string>(), identities = new Set<string>();
  const sessions = Array.from(value.sessions, session => {
    if ((account ? !fields(session, ['credentialHash', 'identity', 'active', 'access', 'accountBinding']) :
        (!fields(session, ['credentialHash', 'identity', 'active']) && !fields(session, ['credentialHash', 'identity', 'active', 'access']))) ||
        !isSha256(session.credentialHash) || typeof session.active !== 'boolean' ||
        (Object.hasOwn(session, 'access') && session.access !== 'read-write' && session.access !== 'read-only')) fail('session');
    const authenticated = identity(session.identity), key = identityKey(authenticated);
    if (credentials.has(session.credentialHash) || identities.has(key)) fail('duplicate-session');
    credentials.add(session.credentialHash); identities.add(key);
    // Legacy P1 records predate the server-only ACL seam. New writes always
    // include access; absence is the one supported legacy default.
    const access: SheetRelayAccess = session.access === 'read-only' ? 'read-only' : 'read-write';
    let accountBinding: SheetRelayAccountBinding | undefined;
    if (account) {
      try { accountBinding = parseSheetRelayAccountBinding(session.accountBinding); } catch { fail('account-binding'); }
      if (accountBinding.userId !== authenticated.actorId) fail('account-actor');
    }
    return { credentialHash: session.credentialHash, identity: authenticated, active: session.active, access, ...(accountBinding ? { accountBinding } : {}) };
  });
  return { version: account ? 2 : 1, ...(account ? { mode: 'account' as const } : {}), sessions };
}
function audit(value: unknown): AuditPacket {
  if (!fields(value, ['version', 'context', 'admission', 'packet', 'identity']) || value.version !== 1) fail('audit');
  const bound = binding(value.context, value.admission);
  return { version: 1, ...bound, packet: packet(value.packet, bound.context, bound.admission), identity: identity(value.identity) };
}

function owned(stats: NonNullable<ReturnType<typeof lstatSync>>): void {
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) fail('foreign-owner');
}
function directoryPath(directory: string): string {
  const supplied = resolve(directory), stats = lstatSync(supplied);
  owned(stats);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('directory');
  const resolved = realpathSync(supplied);
  if (dirname(resolved) !== realpathSync(tmpdir()) || !basename(resolved).startsWith('office-v2-m0-')) fail('disposable-directory-required');
  return resolved;
}
function regular(path: string): void {
  const stats = lstatSync(path);
  owned(stats);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) fail('regular-file-required');
}
function optionalRegular(path: string): void {
  try { regular(path); } catch (error) {
    if (!object(error) || error.code !== 'ENOENT') throw error;
  }
}
function readJson(path: string, limit: number = jsonLimit): unknown {
  regular(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    owned(stats);
    if (!stats.isFile() || stats.nlink !== 1 || stats.size < 1 || stats.size > limit) fail('json-file-bounds');
    return JSON.parse(readFileSync(fd, 'utf8')) as unknown;
  } finally { closeSync(fd); }
}
function syncDirectory(directory: string): void {
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function auditDirectory(directory: string, create: boolean): string {
  const path = join(directory, auditName);
  if (create && !existsSync(path)) { mkdirSync(path, { mode: 0o700 }); syncDirectory(directory); }
  const stats = lstatSync(path);
  owned(stats);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('audit-directory');
  return path;
}
function auditUsage(directory: string): { files: number; encodedBytes: number } {
  const entries = opendirSync(directory);
  let files = 0, encodedBytes = 0;
  try {
    for (let entry = entries.readSync(); entry !== null; entry = entries.readSync()) {
      if (++files > RELAY_AUDIT_LIMITS.files) fail('audit-count-limit');
      if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) fail('audit-filename');
      const path = join(directory, entry.name); regular(path);
      const size = lstatSync(path).size;
      if (size < 1 || size > jsonLimit) fail('json-file-bounds');
      encodedBytes += size;
      if (encodedBytes > RELAY_AUDIT_LIMITS.encodedBytes) fail('audit-byte-limit');
    }
    return { files, encodedBytes };
  } finally { entries.closeSync(); }
}
function atomicJson(directory: string, filename: string, value: unknown, immutable: boolean): void {
  const path = join(directory, filename), encoded = `${canonical(value)}\n`;
  if (Buffer.byteLength(encoded) > jsonLimit) fail('json-file-bounds');
  optionalRegular(path);
  const temporary = join(directory, `.relay-write-${randomUUID()}`);
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, encoded, 'utf8'); fsyncSync(fd); }
  catch (error) { closeSync(fd); unlinkSync(temporary); throw error; }
  closeSync(fd);
  try {
    if (immutable) linkSync(temporary, path);
    else renameSync(temporary, path);
    syncDirectory(directory);
  } finally {
    if (existsSync(temporary)) { unlinkSync(temporary); syncDirectory(directory); }
  }
}

/** Call mutations only while the parent owns the native store's exclusive writer. */
export function writeManifest(directory: string, value: RelayManifest): void {
  const parsed = manifest(value);
  atomicJson(directoryPath(directory), manifestName, parsed, true);
}
/** The parent preserves existing credential-to-identity mappings and persists before issuance. */
export function writeRegistry(directory: string, value: SessionRegistry): void {
  const parsed = registry(value);
  atomicJson(directoryPath(directory), registryName, parsed, false);
}
/** Audit precedes native append. Rejected orphan audits remain separate from accepted state. */
export function persistAudit(directory: string, value: AuditPacket): void {
  const parsed = audit(value), root = directoryPath(directory);
  const bound = manifest(readJson(join(root, manifestName)));
  if (!sameRelayContext(parsed.context, bound.context) || !sameRelayAdmission(parsed.admission, bound.admission)) fail('audit-binding');
  const target = auditDirectory(root, true), filename = `${updateHash(Buffer.from(parsed.packet.updateId, 'utf8'))}.json`;
  const path = join(target, filename);
  // Never overwrite an existing packet identity, including an unaccepted orphan.
  if (existsSync(path)) {
    if (canonical(audit(readJson(path))) !== canonical(parsed)) fail('audit-collision');
    // A matching link may remain after an earlier directory fsync failed.
    // Repeat that barrier before native append or a durable retry can proceed.
    syncDirectory(target);
    return;
  }
  const usage = auditUsage(target);
  if (usage.files >= RELAY_AUDIT_LIMITS.files) fail('audit-count-limit');
  if (usage.encodedBytes + Buffer.byteLength(`${canonical(parsed)}\n`) > RELAY_AUDIT_LIMITS.encodedBytes) fail('audit-byte-limit');
  atomicJson(target, filename, parsed, true);
}

function bytes(value: unknown, limit: number, code: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length < 1 || value.length > limit) fail(code);
  return new Uint8Array(value);
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return Buffer.from(left).equals(Buffer.from(right)); }
function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail('sequence');
  return value;
}
const expectedSchema = new Map([
  ['metadata', 'CREATE TABLE metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1), admission TEXT NOT NULL) STRICT'],
  ['updates', 'CREATE TABLE updates(seq INTEGER PRIMARY KEY, update_id TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, payload BLOB, frontier BLOB NOT NULL) STRICT'],
  ['checkpoint', 'CREATE TABLE checkpoint(singleton INTEGER PRIMARY KEY CHECK(singleton=1), through_seq INTEGER NOT NULL, payload BLOB NOT NULL, hash TEXT NOT NULL, frontier BLOB NOT NULL) STRICT'],
]);
function normalizedSql(value: string): string { return value.toLowerCase().replace(/\s+/g, '').replace('createtableifnotexists', 'createtable'); }
function schema(db: DatabaseSync): void {
  const rows = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY name').all();
  if (rows.length !== 4) fail('schema');
  for (const row of rows) {
    if (row.type === 'index' && row.name === 'sqlite_autoindex_updates_1' && row.tbl_name === 'updates' && row.sql === null) continue;
    const expected = typeof row.name === 'string' ? expectedSchema.get(row.name) : undefined;
    if (row.type !== 'table' || row.tbl_name !== row.name || expected === undefined || typeof row.sql !== 'string' || normalizedSql(row.sql) !== normalizedSql(expected)) fail('schema');
  }
}
function admissionKey(value: SheetRelayAdmission): string {
  return JSON.stringify([value.documentId, value.generation, value.engineId, value.contractVersion, value.engineVersion, value.schemaVersion, value.adapterVersion]);
}

type LogicalStartup = Readonly<{
  manifest: RelayManifest; registry: SessionRegistry; receipts: readonly SheetRelayReceipt[]; expectedExport: Uint8Array;
}>;
type Startup = LogicalStartup & Readonly<{ authoritySha256: string }>;
type Inventory = Record<string, Readonly<{ kind: 'directory' }> | Readonly<{ kind: 'file'; size: number; sha256: string }>>;
function readRegular(path: string): Buffer {
  regular(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    owned(stats);
    if (!stats.isFile() || stats.nlink !== 1) fail('regular-file-required');
    const content = readFileSync(fd);
    if (content.length !== stats.size) fail('source-changed-during-read');
    return content;
  } finally { closeSync(fd); }
}
function inventory(directory: string, prefix = ''): Inventory {
  const result = Object.create(null) as Inventory;
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name), relative = `${prefix}${name}`, stats = lstatSync(path);
    owned(stats);
    if (stats.isSymbolicLink()) fail('source-symlink');
    if (stats.isDirectory()) {
      result[`${relative}/`] = { kind: 'directory' };
      Object.assign(result, inventory(path, `${relative}/`));
    } else {
      const content = readRegular(path);
      result[relative] = { kind: 'file', size: content.length, sha256: updateHash(content) };
    }
  }
  return result;
}
function copyInspected(root: string, target: string, relative: string, before: Inventory): void {
  const expected = before[relative];
  if (expected?.kind !== 'file') fail('missing-source-file');
  const content = readRegular(join(root, relative));
  if (content.length !== expected.size || updateHash(content) !== expected.sha256) fail('source-changed-during-copy');
  writeFileSync(join(target, relative), content, { mode: 0o600, flag: 'wx' });
}
function authorityHash(files: Inventory): string {
  const bound = Object.create(null) as Inventory;
  // Opening the native store may legitimately change SQLite's physical files.
  // Their exact LOGICAL receipts/state are independently replayed and compared.
  // PID ownership is checked separately and claimed only after these checks.
  const nativeManaged = new Set(['updates.sqlite', 'updates.sqlite-wal', 'updates.sqlite-shm', 'relay-owner.json']);
  for (const [name, entry] of Object.entries(files)) if (!nativeManaged.has(name)) bound[name] = entry;
  return updateHash(Buffer.from(canonical(bound), 'utf8'));
}

/** Inspect a new diagnostic copy; SQLite may create WAL/SHM only in that copy.
 * Inventory checks detect source changes during inspection, but do not acquire a
 * writer lease. Parent checks its persisted owner lease and later acquires the
 * ORIGINAL native store's exclusive writer before registry/audit mutations.
 * The original is never repaired or replaced. Orphans do not prove acceptance;
 * confirmed-receipt markers belong to the parent's separate commit journal.
 */
export function readStartup(directory: string): Startup {
  const root = directoryPath(directory);
  for (const name of [manifestName, registryName, 'updates.sqlite']) regular(join(root, name));
  optionalRegular(join(root, 'updates.sqlite-wal')); optionalRegular(join(root, 'updates.sqlite-shm'));
  const sourceAudits = auditDirectory(root, false);
  // Bound diagnostic work BEFORE hashing or copying any potentially large audit.
  auditUsage(sourceAudits);
  const before = inventory(root), beforeKey = canonical(before);
  const diagnostic = mkdtempSync(join(tmpdir(), 'office-v2-m0-relay-inspect-'));
  try {
    for (const name of [manifestName, registryName, 'updates.sqlite', 'updates.sqlite-wal', 'updates.sqlite-shm']) {
      if (before[name] !== undefined) copyInspected(root, diagnostic, name, before);
    }
    mkdirSync(join(diagnostic, auditName), { mode: 0o700 });
    for (const name of readdirSync(sourceAudits)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) fail('audit-filename');
      copyInspected(root, diagnostic, `${auditName}/${name}`, before);
    }
    return { ...readSnapshot(diagnostic), authoritySha256: authorityHash(before) };
  } finally {
    try { if (directoryPath(root) !== root || canonical(inventory(root)) !== beforeKey) fail('source-changed-during-inspection'); }
    finally { rmSync(diagnostic, { recursive: true, force: true }); }
  }
}

/** Original audits permit full replay even after native payload compaction. */
function readSnapshot(directory: string): LogicalStartup {
  const root = directoryPath(directory);
  const parsedManifest = manifest(readJson(join(root, manifestName)));
  const parsedRegistry = registry(readJson(join(root, registryName)));
  if (parsedManifest.version !== parsedRegistry.version || parsedManifest.mode !== parsedRegistry.mode) fail('store-mode-mismatch');
  if (parsedManifest.version === 2 && parsedRegistry.sessions.some(session => !session.accountBinding ||
      session.accountBinding.tenantId !== parsedManifest.scope?.tenantId || session.accountBinding.workspaceId !== parsedManifest.scope?.workspaceId ||
      session.accountBinding.documentId !== parsedManifest.scope?.documentId)) fail('account-store-scope');
  const audits = auditDirectory(root, false);
  for (const entry of readdirSync(audits)) {
    if (!/^[a-f0-9]{64}\.json$/.test(entry)) fail('audit-filename');
    regular(join(audits, entry));
  }
  const databasePath = join(root, 'updates.sqlite');
  regular(databasePath);
  optionalRegular(`${databasePath}-wal`); optionalRegular(`${databasePath}-shm`);
  const db = new DatabaseSync(databasePath, { readOnly: true });
  let current = new Y.Doc();
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') fail('sqlite-integrity');
    schema(db);
    const metadata = db.prepare('SELECT singleton, admission FROM metadata').all();
    if (metadata.length !== 1 || metadata[0]?.singleton !== 1 || metadata[0].admission !== admissionKey(parsedManifest.admission)) fail('metadata');
    const rows = db.prepare('SELECT seq, update_id, hash, payload, frontier FROM updates ORDER BY seq LIMIT ?').all(DURABLE_LIMITS.updates + 1);
    if (rows.length < 1 || rows.length > DURABLE_LIMITS.updates) fail('receipt-count');
    const checkpoints = db.prepare('SELECT singleton, through_seq, payload, hash, frontier FROM checkpoint').all();
    if (checkpoints.length > 1) fail('checkpoint-count');
    const checkpoint = checkpoints[0];
    let through = 0, checkpointPayload: Uint8Array | undefined, checkpointFrontier: Uint8Array | undefined;
    if (checkpoint !== undefined) {
      if (checkpoint.singleton !== 1) fail('checkpoint-singleton');
      through = integer(checkpoint.through_seq, 1, rows.length);
      checkpointPayload = bytes(checkpoint.payload, SHEET_RELAY_LIMITS.updateBytes, 'checkpoint-payload');
      checkpointFrontier = bytes(checkpoint.frontier, SHEET_RELAY_LIMITS.frontierBytes, 'checkpoint-frontier');
      if (!isSha256(checkpoint.hash) || updateHash(checkpointPayload) !== checkpoint.hash) fail('checkpoint-hash');
    }
    const known = new Set(parsedRegistry.sessions.map(session => identityKey(session.identity)));
    known.add(identityKey(parsedManifest.bootstrap.identity));
    const validate = sheetUpdateValidator(parsedManifest.context), receipts: SheetRelayReceipt[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (row === undefined) fail('receipt');
      const seq = integer(row.seq, 1, rows.length);
      if (seq !== index + 1 || typeof row.update_id !== 'string' || row.update_id.length < 1 || row.update_id.length > 128 || !isSha256(row.hash)) fail('receipt');
      const auditPath = join(audits, `${updateHash(Buffer.from(row.update_id, 'utf8'))}.json`);
      const original = audit(readJson(auditPath));
      if (!sameRelayContext(original.context, parsedManifest.context) || !sameRelayAdmission(original.admission, parsedManifest.admission) ||
          original.packet.updateId !== row.update_id || original.packet.sha256 !== row.hash || !known.has(identityKey(original.identity))) fail('receipt-audit');
      if (index === 0 && (canonical(original.packet) !== canonical(parsedManifest.bootstrap.packet) || !sameIdentity(original.identity, parsedManifest.bootstrap.identity))) fail('bootstrap-receipt');
      const update = base64ToBytes(original.packet.bytesBase64);
      if (seq <= through) {
        if (row.payload !== null) fail('uncompacted-prefix');
      } else if (!equalBytes(bytes(row.payload, SHEET_RELAY_LIMITS.updateBytes, 'tail-payload'), update)) fail('tail-payload-mismatch');
      const frontier = bytes(row.frontier, SHEET_RELAY_LIMITS.frontierBytes, 'receipt-frontier');
      const candidate = new Y.Doc();
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
        Y.applyUpdate(candidate, update);
        validate(candidate, current, update, original.identity);
        const state = Y.encodeStateAsUpdate(candidate), computedFrontier = Y.encodeStateVector(candidate);
        if (state.length > SHEET_RELAY_LIMITS.updateBytes || computedFrontier.length > SHEET_RELAY_LIMITS.frontierBytes) fail('accepted-state-bounds');
        if (!equalBytes(frontier, computedFrontier)) fail('receipt-frontier-mismatch');
        if (seq === through && (checkpointPayload === undefined || checkpointFrontier === undefined || !equalBytes(state, checkpointPayload) || !equalBytes(computedFrontier, checkpointFrontier))) fail('checkpoint-prefix-mismatch');
      } catch (error) { candidate.destroy(); throw error; }
      current.destroy(); current = candidate;
      receipts.push({ context: parsedManifest.context, admission: parsedManifest.admission, updateId: row.update_id, sha256: row.hash, sequence: seq,
        frontierBase64: Buffer.from(frontier).toString('base64') });
    }
    return { manifest: parsedManifest, registry: parsedRegistry, receipts, expectedExport: Y.encodeStateAsUpdate(current) };
  } finally { current.destroy(); db.close(); }
}
