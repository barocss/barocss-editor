import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { SheetRelayService } from './service.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { updateHash } from '../../src/durable-store.ts';
import { base64ToBytes, bytesToBase64, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAppendRequest } from '../../src/sheet-preview-protocol.ts';

test('matching marker retry must cross its directory barrier after actual COMMIT and an injected fsync failure', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const replica = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const actualFsync = fs.fsyncSync;
  try {
    const update = replica.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 10 } }, 'marker-barrier-event');
    const request: SheetRelayAppendRequest = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context),
      packet: { updateId: 'marker-barrier-packet', bytesBase64: bytesToBase64(update.update), byteLength: update.update.length, sha256: updateHash(update.update) } };
    const name = `${updateHash(new TextEncoder().encode(request.packet.updateId))}.json`;
    const marker = join(service.directory, 'receipt-audit', name), audit = join(service.directory, 'packet-audit', name);
    const directory = fs.lstatSync(join(service.directory, 'receipt-audit'));
    let barrierFailures = 0;
    // Controlled filesystem-barrier injection only. SQLite performs its REAL
    // COMMIT; neither native acceptance nor durable receipt bodies are mocked.
    fs.fsyncSync = fd => {
      const stat = fs.fstatSync(fd);
      if (stat.isDirectory() && stat.dev === directory.dev && stat.ino === directory.ino) {
        barrierFailures++; throw new Error('injected-receipt-directory-fsync');
      }
      actualFsync(fd);
    };
    syncBuiltinESMExports();
    const first = service.append(session.credential, request);
    assert.equal(first.status, 'acknowledgment-unknown');
    assert.equal(service.open(session.credential).latestSequence, 2, 'the original native packet must already be accepted');
    const markerBytes = fs.readFileSync(marker), auditBytes = fs.readFileSync(audit);
    assert.equal(fs.lstatSync(marker).nlink, 1, 'temporary hard link must have been removed');
    const retry = service.append(session.credential, request);
    assert.equal(retry.status, 'acknowledgment-unknown', 'matching marker is not proof that its previously failed directory barrier succeeded');
    assert(barrierFailures >= 3, 'retry must attempt its own real directory fsync');
    assert.equal(service.open(session.credential).latestSequence, 2);
    assert.deepEqual(fs.readFileSync(marker), markerBytes); assert.deepEqual(fs.readFileSync(audit), auditBytes);
    fs.fsyncSync = actualFsync; syncBuiltinESMExports();
    const confirmed = service.append(session.credential, request);
    assert.equal(confirmed.status, 'durable');
    if (confirmed.status === 'durable') { assert.equal(confirmed.receipt.sequence, 2); assert.equal(confirmed.receipt.updateId, request.packet.updateId); assert.equal(confirmed.receipt.sha256, request.packet.sha256); }
    assert.equal(service.open(session.credential).latestSequence, 2);
    assert.deepEqual(fs.readFileSync(marker), markerBytes); assert.deepEqual(fs.readFileSync(audit), auditBytes);
  } finally {
    fs.fsyncSync = actualFsync; syncBuiltinESMExports();
    replica.destroy(); service.close(); fs.rmSync(service.directory, { recursive: true, force: true });
  }
});
