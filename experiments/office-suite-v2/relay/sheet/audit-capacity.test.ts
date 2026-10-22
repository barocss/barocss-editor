import assert from 'node:assert/strict';
import fs, { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { SheetRelayService } from './service.ts';
import { DURABLE_LIMITS, updateHash } from '../../src/durable-store.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { base64ToBytes, bytesToBase64, relayAdmission, SHEET_RELAY_LIMITS } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAppendRequest } from '../../src/sheet-preview-protocol.ts';
import { readStartup, RELAY_AUDIT_LIMITS } from './storage.ts';

test('a full audit directory refuses a new rejected native packet without adding a permanent orphan', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const target = join(service.directory, 'packet-audit');
  const prepared = (updateId: string) => ({ version: 1, context: session.context, admission: relayAdmission(session.context),
    identity: session.identity, packet: { updateId, bytesBase64: bytesToBase64(new Uint8Array([255])), byteLength: 1, sha256: updateHash(new Uint8Array([255])) } });
  const replica = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    const change = replica.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 42 } }, 'quota-original-event');
    const originalRequest: SheetRelayAppendRequest = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId: 'quota-original-packet', bytesBase64: bytesToBase64(change.update), byteLength: change.update.length, sha256: updateHash(change.update) } };
    const originalReceipt = service.append(session.credential, originalRequest); assert.equal(originalReceipt.status, 'durable');
    for (let i = 0; i < 3; i++) {
      const invalid = prepared(`actually-rejected-${i}`);
      const rejected = service.append(session.credential, { protocolVersion: 1, context: session.context, admission: invalid.admission, packet: invalid.packet });
      assert.equal(rejected.status, 'rejected');
      assert.equal(existsSync(join(target, `${updateHash(Buffer.from(invalid.packet.updateId))}.json`)), true, 'actual native rejection retains its counted orphan audit');
    }
    // Explicit test-only population of prepared orphans, not fabricated receipts
    // or a claim that these packets were accepted by the native database.
    for (let i = readdirSync(target).length; i < DURABLE_LIMITS.updates; i++) {
      const audit = prepared(`prepared-${i}`);
      writeFileSync(join(target, `${updateHash(Buffer.from(audit.packet.updateId))}.json`), JSON.stringify(audit));
    }
    const before = service.open(session.credential), original = readdirSync(target)[0]; assert(original);
    const originalBytes = readFileSync(join(target, original)), denied = prepared('quota-new-rejected-packet');
    const result = service.append(session.credential, { protocolVersion: 1, context: session.context, admission: denied.admission, packet: denied.packet });
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.code, 'audit-count-limit');
    assert.equal(readdirSync(target).length, DURABLE_LIMITS.updates);
    assert.equal(existsSync(join(target, `${updateHash(Buffer.from(denied.packet.updateId))}.json`)), false);
    assert.deepEqual(readFileSync(join(target, original)), originalBytes);
    assert.deepEqual(service.open(session.credential), before);
    assert.deepEqual(service.append(session.credential, originalRequest), originalReceipt, 'exact accepted retry remains available at the total audit limit');
    // Explicit test-only corruption above quota must fail before diagnostic copy.
    writeFileSync(join(target, `${updateHash(Buffer.from('over-limit'))}.json`), JSON.stringify(prepared('over-limit')));
    const list = readdirSync(target).sort();
    assert.throws(() => readStartup(service.directory), /audit-count-limit/);
    assert.deepEqual(readdirSync(target).sort(), list);
    assert.deepEqual(readFileSync(join(target, original)), originalBytes);
  } finally { replica.destroy(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('aggregate encoded audit byte quota survives same-store resume and refuses new files without pruning', () => {
  let service = SheetRelayService.create();
  const session = service.issueSession({ protocolVersion: 1 }), target = join(service.directory, 'packet-audit');
  try {
    let remaining = RELAY_AUDIT_LIMITS.encodedBytes - readdirSync(target).reduce((total, name) => total + lstatSync(join(target, name)).size, 0);
    for (let i = 0; remaining > 0; i++) {
      const updateId = `byte-prepared-${i}`, text = JSON.stringify({ version: 1, context: session.context, admission: relayAdmission(session.context), identity: session.identity,
        packet: { updateId, bytesBase64: '/w==', byteLength: 1, sha256: updateHash(new Uint8Array([255])) } });
      const size = Math.min(remaining, SHEET_RELAY_LIMITS.httpBodyBytes); assert(size >= text.length);
      writeFileSync(join(target, `${updateHash(Buffer.from(updateId))}.json`), text.padEnd(size, ' ')); remaining -= size;
    }
    const before = readStartup(service.directory), directory = service.directory;
    service.close(); service = SheetRelayService.resume(directory);
    assert.equal(service.open(session.credential).state.sha256, updateHash(before.expectedExport));
    const snapshot = readdirSync(target).sort().map(name => [name, updateHash(readFileSync(join(target, name)))]);
    const result = service.append(session.credential, { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context),
      packet: { updateId: 'byte-quota-refused', bytesBase64: '/w==', byteLength: 1, sha256: updateHash(new Uint8Array([255])) } });
    assert.equal(result.status, 'rejected'); if (result.status === 'rejected') assert.equal(result.code, 'audit-byte-limit');
    assert.deepEqual(readdirSync(target).sort().map(name => [name, updateHash(readFileSync(join(target, name)))]), snapshot);
    // Test-only extra byte: startup refuses and preserves every existing byte.
    const orphan = snapshot.find(([name]) => lstatSync(join(target, String(name))).size < SHEET_RELAY_LIMITS.httpBodyBytes); assert(orphan);
    const path = join(target, String(orphan[0])); fs.appendFileSync(path, ' ');
    const badHash = updateHash(readFileSync(path));
    assert.throws(() => readStartup(directory), /audit-byte-limit/);
    assert.equal(updateHash(readFileSync(path)), badHash);
  } finally { service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('an identical prepared packet repeats a failed audit-directory durability barrier before native COMMIT', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const replica = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const originalSync = fs.fsyncSync, directory = lstatSync(join(service.directory, 'packet-audit'));
  try {
    const update = replica.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 43 } }, 'audit-barrier-event');
    const request: SheetRelayAppendRequest = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId: 'audit-barrier-packet', bytesBase64: bytesToBase64(update.update), byteLength: update.update.length, sha256: updateHash(update.update) } };
    fs.fsyncSync = fd => {
      const stat = fs.fstatSync(fd);
      if (stat.isDirectory() && stat.dev === directory.dev && stat.ino === directory.ino) throw new Error('injected-audit-directory-sync-failure');
      originalSync(fd);
    };
    syncBuiltinESMExports();
    assert.throws(() => service.append(session.credential, request), /injected-audit-directory-sync-failure/);
    const path = join(service.directory, 'packet-audit', `${updateHash(Buffer.from(request.packet.updateId))}.json`), bytes = readFileSync(path);
    assert.equal(service.open(session.credential).latestSequence, 1, 'audit barrier fails BEFORE native COMMIT');
    assert.throws(() => service.append(session.credential, request), /injected-audit-directory-sync-failure/);
    assert.equal(service.open(session.credential).latestSequence, 1);
    assert.deepEqual(readFileSync(path), bytes);
    fs.fsyncSync = originalSync; syncBuiltinESMExports();
    const accepted = service.append(session.credential, request); assert.equal(accepted.status, 'durable');
    if (accepted.status === 'durable') assert.equal(accepted.receipt.sequence, 2);
    assert.deepEqual(readFileSync(path), bytes);
  } finally { fs.fsyncSync = originalSync; syncBuiltinESMExports(); replica.destroy(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});
