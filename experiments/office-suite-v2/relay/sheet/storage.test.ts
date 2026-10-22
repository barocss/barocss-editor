import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as Y from 'yjs';
import { SheetReplica, sheetAdmission, sheetUpdateValidator } from '../../src/collaboration.ts';
import { DisposableDurableStore, updateHash } from '../../src/durable-store.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { bytesToBase64, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayIdentity, SheetRelayPacket } from '../../src/sheet-preview-protocol.ts';
import { persistAudit, readStartup, writeManifest, writeRegistry } from './storage.ts';
import type { AuditPacket, RelayManifest, SessionRegistry } from './storage.ts';

const bootstrapIdentity = { actorId: 'fixture-bootstrap', sessionId: 'fixture-bootstrap-session' };
const writer = { actorId: 'fixture-writer', sessionId: 'fixture-writer-session' };
function packet(updateId: string, bytes: Uint8Array): SheetRelayPacket {
  return { updateId, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) };
}
type Fixture = { directory: string; manifest: RelayManifest; registry: SessionRegistry; audits: AuditPacket[]; expectedExport: Uint8Array };
function fixture(checkpoint = false, tail = true, crashWal = false): Fixture {
  const context = createWorkbookContext({ documentId: 'storage-controlled-document', workbookId: 'storage-workbook', generation: randomUUID() });
  const store = DisposableDurableStore.create({ admission: sheetAdmission(context), currentAccess: () => true, validateDocument: sheetUpdateValidator(context) });
  const seed = new SheetReplica(context, bootstrapIdentity);
  let client: SheetReplica | undefined;
  let crashImage: { database: Buffer; wal: Buffer } | undefined;
  try {
    seed.commit({ kind: 'sheet.insert', sheetId: 'sheet', name: 'Sheet', afterSheetId: null }, 'bootstrap-sheet');
    seed.commit({ kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'row', afterId: null }, 'bootstrap-row');
    seed.commit({ kind: 'axis.insert', sheetId: 'sheet', axis: 'column', id: 'column', afterId: null }, 'bootstrap-column');
    const admission = relayAdmission(context);
    const manifest: RelayManifest = { version: 1, context, admission, bootstrap: { packet: packet('bootstrap-packet', seed.exportUpdate()), identity: bootstrapIdentity } };
    const registry: SessionRegistry = { version: 1, sessions: [{ credentialHash: updateHash(Buffer.from('controlled-test-credential')), identity: writer, active: true, access: 'read-write' }] };
    writeManifest(store.directory, manifest); writeRegistry(store.directory, registry);
    const audits: AuditPacket[] = [];
    const append = (supplied: SheetRelayPacket, identity: SheetRelayIdentity): void => {
      const audit: AuditPacket = { version: 1, context, admission, packet: supplied, identity };
      persistAudit(store.directory, audit); audits.push(audit);
      assert.equal(store.append(identity, { admission, updateId: supplied.updateId, bytes: Buffer.from(supplied.bytesBase64, 'base64') }).status, 'durable');
    };
    append(manifest.bootstrap.packet, bootstrapIdentity);
    client = new SheetReplica(context, writer, seed.exportUpdate());
    append(packet('edit-packet', client.commit({ kind: 'cell.commit', key: { sheetId: 'sheet', rowId: 'row', columnId: 'column' }, input: { kind: 'literal', value: 'persisted' } }, 'edit-event').update), writer);
    if (checkpoint) store.checkpoint();
    if (tail) append(packet('tail-packet', client.commit({ kind: 'unsupported', operation: 'row.move' }, 'refused-event').update), writer);
    if (crashWal) crashImage = { database: readFileSync(join(store.directory, 'updates.sqlite')), wal: readFileSync(join(store.directory, 'updates.sqlite-wal')) };
    return { directory: store.directory, manifest, registry, audits, expectedExport: store.exportUpdate() };
  } catch (error) { store.close(); rmSync(store.directory, { recursive: true, force: true }); throw error; }
  finally {
    client?.destroy(); seed.destroy(); store.close();
    // Recreate a consistent native COMMIT image whose latest rows exist only in WAL.
    if (crashImage !== undefined) {
      writeFileSync(join(store.directory, 'updates.sqlite'), crashImage.database);
      writeFileSync(join(store.directory, 'updates.sqlite-wal'), crashImage.wal, { mode: 0o600 });
    }
  }
}
function withFixture(body: (value: Fixture) => void, checkpoint = false, tail = true, crashWal = false): void {
  const value = fixture(checkpoint, tail, crashWal);
  try { body(value); } finally { rmSync(value.directory, { recursive: true, force: true }); }
}
function json(path: string): Record<string, unknown> { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; }
function save(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); }
function auditPath(value: Fixture, index: number): string {
  const entry = value.audits[index]; assert(entry);
  return join(value.directory, 'packet-audit', `${updateHash(Buffer.from(entry.packet.updateId))}.json`);
}
function mutateDatabase(value: Fixture, body: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(join(value.directory, 'updates.sqlite'));
  try { body(db); } finally { db.close(); }
}
function files(directory: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name), relative = `${prefix}${name}`, stats = lstatSync(path);
    if (stats.isSymbolicLink()) result[relative] = `link:${readlinkSync(path)}`;
    else if (stats.isDirectory()) Object.assign(result, files(path, `${relative}/`));
    else result[relative] = `${stats.size}:${updateHash(readFileSync(path))}`;
  }
  return result;
}
function rejectsUnchanged(value: Fixture): void {
  const before = files(value.directory);
  assert.throws(() => readStartup(value.directory));
  assert.deepEqual(files(value.directory), before, 'failed startup must preserve source bytes and file set');
}

for (const [name, checkpoint, tail] of [['without checkpoint', false, true], ['with checkpoint and tail', true, true], ['with checkpoint only', true, false]] as const) {
  test(`read-only startup replays original audits ${name}`, () => withFixture(value => {
    const before = files(value.directory), result = readStartup(value.directory);
    assert.deepEqual(result.manifest, value.manifest); assert.deepEqual(result.registry, value.registry);
    assert.deepEqual(result.expectedExport, value.expectedExport);
    assert.deepEqual(result.receipts.map(receipt => [receipt.sequence, receipt.updateId, receipt.sha256]), value.audits.map((entry, index) => [index + 1, entry.packet.updateId, entry.packet.sha256]));
    assert.deepEqual(files(value.directory), before, 'read-only startup must preserve source bytes and file set');
  }, checkpoint, tail));
}

test('immutable manifest and original packet audits refuse overwrites; atomic JSON files use mode 0600', () => withFixture(value => {
  const before = files(value.directory);
  assert.throws(() => writeManifest(value.directory, value.manifest));
  const original = value.audits[1]; assert(original);
  persistAudit(value.directory, original);
  assert.throws(() => persistAudit(value.directory, { ...original, identity: { ...writer, sessionId: 'changed-session' } }), /audit-collision/);
  assert.deepEqual(files(value.directory), before);
  for (const path of [join(value.directory, 'relay-manifest.json'), join(value.directory, 'relay-sessions.json'), auditPath(value, 0)]) assert.equal(lstatSync(path).mode & 0o777, 0o600);
}));

test('revoked sessions remain known history, and orphan packet audits do not enter accepted state', () => withFixture(value => {
  writeRegistry(value.directory, { version: 1, sessions: value.registry.sessions.map(session => ({ ...session, active: false })) });
  const orphan = new SheetReplica(value.manifest.context, writer, value.expectedExport);
  try {
    const update = orphan.commit({ kind: 'unsupported', operation: 'column.move' }, 'orphan-event').update;
    persistAudit(value.directory, { version: 1, context: value.manifest.context, admission: value.manifest.admission, packet: packet('orphan-packet', update), identity: writer });
    const result = readStartup(value.directory);
    assert.deepEqual(result.expectedExport, value.expectedExport);
    assert.equal(result.receipts.length, value.audits.length); assert.equal(result.registry.sessions[0]?.active, false);
    assert(existsSync(join(value.directory, 'packet-audit', `${updateHash(Buffer.from('orphan-packet'))}.json`)));
  } finally { orphan.destroy(); }
}, true));

test('native dependency-pending events remain accepted', () => withFixture(value => {
  const native = new Y.Doc(), source = new Y.Doc();
  try {
    Y.applyUpdate(source, value.expectedExport);
    const body = source.getMap<string>('native-events-v1').get('bootstrap-sheet'); assert(body);
    const event = JSON.parse(body);
    event.eventId = 'native-pending'; event.actorId = writer.actorId; event.sessionId = writer.sessionId;
    event.dependencies = ['unseen-native-dependency']; event.command.sheetId = 'pending-sheet';
    native.getMap('native-events-v1').set(event.eventId, JSON.stringify(event));
    const supplied = packet('pending-packet', Y.encodeStateAsUpdate(native));
    const original: AuditPacket = { version: 1, context: value.manifest.context, admission: value.manifest.admission, packet: supplied, identity: writer };
    persistAudit(value.directory, original);
    const store = DisposableDurableStore.reopen(value.directory, { admission: value.manifest.admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(value.manifest.context) });
    let expected: Uint8Array;
    try { assert.equal(store.append(writer, { admission: value.manifest.admission, updateId: supplied.updateId, bytes: Y.encodeStateAsUpdate(native) }).status, 'durable'); expected = store.exportUpdate(); }
    finally { store.close(); }
    assert.deepEqual(readStartup(value.directory).expectedExport, expected);
  } finally { native.destroy(); source.destroy(); }
}));

const corruptions: readonly [string, (value: Fixture) => void][] = [
  ['missing DB', value => renameSync(join(value.directory, 'updates.sqlite'), join(value.directory, 'saved.sqlite'))],
  ['empty DB', value => writeFileSync(join(value.directory, 'updates.sqlite'), new Uint8Array())],
  ['invalid DB bytes', value => writeFileSync(join(value.directory, 'updates.sqlite'), 'not a SQLite database')],
  ['missing metadata', value => mutateDatabase(value, db => { db.exec('DELETE FROM metadata'); })],
  ['changed metadata admission', value => mutateDatabase(value, db => { db.exec("UPDATE metadata SET admission='wrong'"); })],
  ['missing native table', value => mutateDatabase(value, db => { db.exec('DROP TABLE checkpoint'); })],
  ['unexpected trigger', value => mutateDatabase(value, db => { db.exec('CREATE TRIGGER unexpected AFTER INSERT ON updates BEGIN DELETE FROM metadata; END'); })],
  ['missing manifest', value => rmSync(join(value.directory, 'relay-manifest.json'))],
  ['invalid manifest JSON', value => writeFileSync(join(value.directory, 'relay-manifest.json'), '{')],
  ['missing bootstrap', value => { const path = join(value.directory, 'relay-manifest.json'), data = json(path); delete data.bootstrap; save(path, data); }],
  ['changed bootstrap packet', value => { const path = join(value.directory, 'relay-manifest.json'); save(path, { ...value.manifest, bootstrap: { ...value.manifest.bootstrap, packet: { ...value.manifest.bootstrap.packet, updateId: 'different-bootstrap' } } }); }],
  ['changed bootstrap identity', value => { const path = join(value.directory, 'relay-manifest.json'); save(path, { ...value.manifest, bootstrap: { ...value.manifest.bootstrap, identity: writer } }); }],
  ['changed workbook ID', value => save(join(value.directory, 'relay-manifest.json'), { ...value.manifest, context: { ...value.manifest.context, workbookId: 'another-workbook' } })],
  ['missing registry', value => rmSync(join(value.directory, 'relay-sessions.json'))],
  ['invalid registry JSON', value => writeFileSync(join(value.directory, 'relay-sessions.json'), '{')],
  ['missing historical session', value => save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions: [] })],
  ['duplicate credential', value => save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions: [...value.registry.sessions, { ...value.registry.sessions[0], identity: { ...writer, sessionId: 'second-session' } }] })],
  ['duplicate identity', value => save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions: [...value.registry.sessions, { ...value.registry.sessions[0], credentialHash: '0'.repeat(64) }] })],
  ['raw credential field', value => save(join(value.directory, 'relay-sessions.json'), { ...value.registry, credential: 'forbidden' })],
  ['invalid session access', value => save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions: value.registry.sessions.map(session => ({ ...session, access: 'administrator' })) })],
  ['null session access', value => save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions: value.registry.sessions.map(session => ({ ...session, access: null })) })],
  ['missing covered audit', value => rmSync(auditPath(value, 0))],
  ['invalid audit JSON', value => writeFileSync(auditPath(value, 1), '{')],
  ['changed audit bytes', value => { const entry = value.audits[1]; assert(entry); save(auditPath(value, 1), { ...entry, packet: { ...entry.packet, bytesBase64: 'AA==', byteLength: 1 } }); }],
  ['unknown audit identity', value => { const entry = value.audits[1]; assert(entry); save(auditPath(value, 1), { ...entry, identity: { ...writer, sessionId: 'unknown-session' } }); }],
  ['changed compacted receipt hash', value => mutateDatabase(value, db => { db.prepare('UPDATE updates SET hash=? WHERE seq=1').run('0'.repeat(64)); })],
  ['changed receipt ID', value => mutateDatabase(value, db => { db.exec("UPDATE updates SET update_id='changed-id' WHERE seq=2"); })],
  ['receipt sequence gap', value => mutateDatabase(value, db => { db.exec('DELETE FROM updates WHERE seq=2'); })],
  ['changed receipt frontier', value => mutateDatabase(value, db => { db.prepare('UPDATE updates SET frontier=? WHERE seq=2').run(new Uint8Array([0])); })],
  ['oversized receipt frontier', value => mutateDatabase(value, db => { db.prepare('UPDATE updates SET frontier=? WHERE seq=2').run(new Uint8Array(64_001)); })],
  ['missing tail payload', value => mutateDatabase(value, db => { db.exec('UPDATE updates SET payload=NULL WHERE seq=3'); })],
  ['changed tail payload', value => mutateDatabase(value, db => { db.prepare('UPDATE updates SET payload=? WHERE seq=3').run(new Uint8Array([0, 0])); })],
  ['raw incomplete tail with matching audit and hash', value => {
    const client = new SheetReplica(value.manifest.context, writer, value.expectedExport);
    try {
      client.commit({ kind: 'unsupported', operation: 'row.move' }, 'first-unseen-event');
      const supplied = packet('tail-packet', client.commit({ kind: 'unsupported', operation: 'column.move' }, 'second-unseen-event').update);
      const original = value.audits[2]; assert(original);
      save(auditPath(value, 2), { ...original, packet: supplied });
      mutateDatabase(value, db => { db.prepare('UPDATE updates SET payload=?, hash=? WHERE seq=3').run(Buffer.from(supplied.bytesBase64, 'base64'), supplied.sha256); });
    } finally { client.destroy(); }
  }],
  ['non-compacted prefix payload', value => mutateDatabase(value, db => { db.prepare('UPDATE updates SET payload=? WHERE seq=1').run(Buffer.from(value.manifest.bootstrap.packet.bytesBase64, 'base64')); })],
  ['checkpoint through ahead', value => mutateDatabase(value, db => { db.exec('UPDATE checkpoint SET through_seq=4'); })],
  ['checkpoint through behind', value => mutateDatabase(value, db => { db.exec('UPDATE checkpoint SET through_seq=1'); })],
  ['checkpoint through negative', value => mutateDatabase(value, db => { db.exec('UPDATE checkpoint SET through_seq=-1'); })],
  ['checkpoint hash changed', value => mutateDatabase(value, db => { db.prepare('UPDATE checkpoint SET hash=?').run('0'.repeat(64)); })],
  ['checkpoint frontier changed', value => mutateDatabase(value, db => { db.prepare('UPDATE checkpoint SET frontier=?').run(new Uint8Array([0])); })],
  ['checkpoint payload and hash replaced by bootstrap', value => mutateDatabase(value, db => { db.prepare('UPDATE checkpoint SET payload=?, hash=?').run(Buffer.from(value.manifest.bootstrap.packet.bytesBase64, 'base64'), value.manifest.bootstrap.packet.sha256); })],
  ['DB symlink', value => { const path = join(value.directory, 'updates.sqlite'), saved = join(value.directory, 'saved.sqlite'); renameSync(path, saved); symlinkSync(saved, path); }],
  ['manifest symlink', value => { const path = join(value.directory, 'relay-manifest.json'), saved = join(value.directory, 'saved-manifest.json'); renameSync(path, saved); symlinkSync(saved, path); }],
  ['audit symlink', value => { const path = auditPath(value, 1), saved = join(value.directory, 'saved-audit.json'); renameSync(path, saved); symlinkSync(saved, path); }],
];
for (const [name, corrupt] of corruptions) test(`startup refuses ${name} before native reopen and preserves files`, () => withFixture(value => { corrupt(value); rejectsUnchanged(value); }, true));

test('audited packet identity must match its new native events, even for a known session', () => withFixture(value => {
  const another = { actorId: 'other-known-actor', sessionId: 'other-known-session' };
  writeRegistry(value.directory, { version: 1, sessions: [...value.registry.sessions, { credentialHash: '0'.repeat(64), identity: another, active: true, access: 'read-write' }] });
  const original = value.audits[1]; assert(original);
  save(auditPath(value, 1), { ...original, identity: another });
  rejectsUnchanged(value);
}, true));

test('diagnostic validation is separate from the original native exclusive writer gate', () => withFixture(value => {
  const store = DisposableDurableStore.reopen(value.directory, { admission: value.manifest.admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(value.manifest.context) });
  try {
    const before = files(value.directory);
    assert.deepEqual(readStartup(value.directory).expectedExport, store.exportUpdate());
    assert.deepEqual(files(value.directory), before);
    assert.throws(() => DisposableDurableStore.reopen(value.directory, { admission: value.manifest.admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(value.manifest.context) }), /locked|busy/);
  }
  finally { store.close(); }
  assert.deepEqual(readStartup(value.directory).expectedExport, value.expectedExport);
}));

test('diagnostic copy includes durable crash WAL and preserves every original file', () => withFixture(value => {
  assert(lstatSync(join(value.directory, 'updates.sqlite-wal')).size > 0);
  const before = files(value.directory), result = readStartup(value.directory);
  assert.deepEqual(result.expectedExport, value.expectedExport);
  assert.equal(result.receipts.length, value.audits.length);
  assert.deepEqual(files(value.directory), before);
  assert.equal(existsSync(join(value.directory, 'updates.sqlite-shm')), false);
}, true, true, true));

test('diagnostic directories are removed after successful validation and rejected corruption', () => withFixture(value => {
  const diagnostics = (): string[] => readdirSync(tmpdir()).filter(name => name.startsWith('office-v2-m0-relay-inspect-')).sort();
  const before = diagnostics();
  readStartup(value.directory);
  assert.deepEqual(diagnostics(), before);
  writeFileSync(join(value.directory, 'relay-manifest.json'), '{');
  rejectsUnchanged(value);
  assert.deepEqual(diagnostics(), before);
}));

test('invalid write input leaves existing registry and audit bytes unchanged', () => withFixture(value => {
  const before = files(value.directory);
  const sparse = new Array<SessionRegistry['sessions'][number]>(1);
  assert.throws(() => writeRegistry(value.directory, { version: 1, sessions: sparse }));
  const original = value.audits[1]; assert(original);
  assert.throws(() => persistAudit(value.directory, { ...original, packet: { ...original.packet, sha256: '0'.repeat(64) } }));
  assert.deepEqual(files(value.directory), before);
}));

test('legacy registry access defaults to read-write without rewriting original bytes', () => withFixture(value => {
  const sessions = value.registry.sessions.map(({ access: _access, ...session }) => session);
  save(join(value.directory, 'relay-sessions.json'), { version: 1, sessions });
  const before = files(value.directory), result = readStartup(value.directory);
  assert.deepEqual(result.registry, value.registry);
  assert.equal(result.registry.sessions[0]?.access, 'read-write');
  assert.deepEqual(files(value.directory), before);
}));

test('read-only sessions remain known historical native event authors during replay', () => withFixture(value => {
  writeRegistry(value.directory, { version: 1, sessions: value.registry.sessions.map(session => ({ ...session, access: 'read-only' })) });
  const result = readStartup(value.directory);
  assert.equal(result.registry.sessions[0]?.access, 'read-only');
  assert.deepEqual(result.expectedExport, value.expectedExport); assert.equal(result.receipts.length, value.audits.length);
}, true));

test('authority binding includes session access, marker and orphan files, while native physical files and PID ownership are separate', () => withFixture(value => {
  const first = readStartup(value.directory);
  save(join(value.directory, 'relay-owner.json'), { version: 1, pid: process.pid, token: 'controlled-test-token' });
  const native = DisposableDurableStore.reopen(value.directory, { admission: value.manifest.admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(value.manifest.context) });
  try {
    const locked = readStartup(value.directory);
    assert.equal(locked.authoritySha256, first.authoritySha256);
    assert.deepEqual(locked.expectedExport, first.expectedExport); assert.deepEqual(locked.receipts, first.receipts);
  } finally { native.close(); }
  writeRegistry(value.directory, { version: 1, sessions: value.registry.sessions.map(session => ({ ...session, access: 'read-only' })) });
  const changedAccess = readStartup(value.directory);
  assert.notEqual(changedAccess.authoritySha256, first.authoritySha256);
  const markerDirectory = join(value.directory, 'receipt-audit'); mkdirSync(markerDirectory);
  save(join(markerDirectory, `${'0'.repeat(64)}.json`), { controlledMarker: true });
  const changedMarker = readStartup(value.directory);
  assert.notEqual(changedMarker.authoritySha256, changedAccess.authoritySha256);
  // The marker's semantic validation is separately owned by the service.
  const original = value.audits[1]; assert(original);
  persistAudit(value.directory, { ...original, packet: { ...original.packet, updateId: 'unaccepted-original-packet-copy' } });
  const changedOrphan = readStartup(value.directory);
  assert.notEqual(changedOrphan.authoritySha256, changedMarker.authoritySha256);
  assert.deepEqual(changedOrphan.receipts, first.receipts); assert.deepEqual(changedOrphan.expectedExport, first.expectedExport);
}));
