import assert from 'node:assert/strict';
import { rmSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { SheetRelayService } from './service.ts';
import { SheetReplica, sheetUpdateValidator } from '../../src/collaboration.ts';
import { DisposableDurableStore, updateHash } from '../../src/durable-store.ts';
import { persistAudit } from './storage.ts';
import { encodeCellKey } from '../../src/contracts.ts';
import { base64ToBytes, bytesToBase64, relayAdmission, SHEET_RELAY_LIMITS } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayAppendRequest, SheetRelaySession } from '../../src/sheet-preview-protocol.ts';

const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
function packet(session: SheetRelaySession, bytes: Uint8Array, updateId: string): SheetRelayAppendRequest {
  return { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) } };
}
function cleanup(service: SheetRelayService): void { service.close(); rmSync(service.directory, { recursive: true, force: true }); }

test('same immutable bootstrap, two controlled sessions, ACK loss retry, checkpoint/tail and original-session resume', () => {
  let service = SheetRelayService.create();
  const first = service.issueSession({ protocolVersion: 1 }), second = service.issueSession({ protocolVersion: 1 });
  const initial = service.open(first.credential);
  const a = new SheetReplica(first.context, first.identity, base64ToBytes(initial.state.bytesBase64));
  const b = new SheetReplica(second.context, second.identity, base64ToBytes(initial.state.bytesBase64));
  try {
    assert.notEqual(first.identity.sessionId, second.identity.sessionId);
    assert.equal(initial.bootstrap.sha256, service.open(second.credential).bootstrap.sha256);
    const change = a.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'a-edit');
    const request = packet(first, change.update, 'packet-a');
    assert.equal(service.append(first.credential, { ...request, loseAck: true }).status, 'acknowledgment-unknown');
    const retry = service.append(first.credential, request); assert.equal(retry.status, 'durable');
    if (retry.status !== 'durable') throw new Error('receipt-required');
    const checkpoint = service.checkpoint(first.credential); assert.equal(checkpoint.throughSequence, 2);
    b.receive(base64ToBytes(service.open(second.credential).state.bytesBase64));
    const tail = b.commit({ kind: 'cell.commit', key: { ...key, rowId: 'row-6' }, input: { kind: 'literal', value: 'B-note' } }, 'b-tail');
    assert.equal(service.append(second.credential, packet(second, tail.update, 'packet-b')).status, 'durable');
    const directory = service.directory; service.close(); service = SheetRelayService.resume(directory);
    assert.equal(service.issueSession({ protocolVersion: 1, resumeCredential: first.credential }).identity.sessionId, first.identity.sessionId);
    assert.deepEqual(service.append(first.credential, request), retry);
    assert.equal(service.open(first.credential).bootstrap.sha256, initial.bootstrap.sha256);
    a.receive(base64ToBytes(service.open(first.credential).state.bytesBase64));
    b.receive(base64ToBytes(service.open(second.credential).state.bytesBase64)); assert.deepEqual(a.projection, b.projection);
    const undo = a.undo('a-edit', 'undo-a'); assert.equal(service.append(first.credential, packet(first, undo.update, 'undo-packet')).status, 'durable');
    b.receive(base64ToBytes(service.open(second.credential).state.bytesBase64)); assert.deepEqual(a.projection, b.projection);
    assert.deepEqual(b.projection.cells[encodeCellKey({ ...key, rowId: 'row-6' })]?.winner?.input, { kind: 'literal', value: 'B-note' });
  } finally { a.destroy(); b.destroy(); cleanup(service); }
});

test('server recomputes hash, binds context/actor/session and checks revocation before duplicate retry', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    const update = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 7 } }, 'change');
    const request = packet(session, update.update, 'exact-id');
    assert.equal(service.append(session.credential, { ...request, packet: { ...request.packet, sha256: '0'.repeat(64) } }).status, 'rejected');
    assert.equal(service.open(session.credential).latestSequence, 1);
    const wrongContext = { ...request.context, workbookId: 'wrong-book' };
    assert.equal(service.append(session.credential, { ...request, context: wrongContext }).status, 'rejected');
    const other = service.issueSession({ protocolVersion: 1 });
    assert.equal(service.append(other.credential, { ...request, packet: { ...request.packet, updateId: 'forged' } }).status, 'rejected');
    assert.equal(service.append(session.credential, request).status, 'durable');
    const newer = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 8 } }, 'newer');
    assert.equal(service.append(session.credential, packet(session, newer.update, 'exact-id')).status, 'rejected');
    service.revokeSession(session.credential);
    assert.throws(() => service.append(session.credential, request), /current-access-denied/);
    assert.throws(() => service.issueSession({ protocolVersion: 1, resumeCredential: session.credential }), /current-access-denied/);
    const directory = service.directory; service.close(); const resumed = SheetRelayService.resume(directory);
    try { assert.throws(() => resumed.open(session.credential), /current-access-denied/); }
    finally { resumed.close(); }
  } finally { client.destroy(); cleanup(service); }
});

test('full accepted export cap rejects before native COMMIT even if the exact packet is below 1MB', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const before = service.open(session.credential);
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(before.state.bytesBase64));
  try {
    const changes = Array.from({ length: 32 }, (_, row) => ({ key: { ...key, rowId: `row-${row + 1}` }, input: { kind: 'literal' as const, value: 'x'.repeat(31_000) } }));
    const result = client.commit({ kind: 'cells.commit', changes }, 'large-native-batch');
    assert(result.update.length <= SHEET_RELAY_LIMITS.updateBytes, 'fixture packet must fit');
    assert(client.exportUpdate().length > SHEET_RELAY_LIMITS.updateBytes, 'fixture complete state must exceed limit');
    const rejection = service.append(session.credential, packet(session, result.update, 'large-packet'));
    assert.equal(rejection.status, 'rejected');
    if (rejection.status === 'rejected') assert.match(rejection.code, /full-state-limit/);
    assert.equal(service.open(session.credential).state.sha256, before.state.sha256);
    assert.equal(service.open(session.credential).latestSequence, 1);
    const directory = service.directory; service.close(); const resumed = SheetRelayService.resume(directory);
    try { assert.equal(resumed.open(session.credential).state.sha256, before.state.sha256); }
    finally { resumed.close(); }
  } finally { client.destroy(); cleanup(service); }
});

test('actual child process exits after COMMIT without closing DB; a new service resumes original credential and receipt', () => {
  let service = SheetRelayService.create(); const session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    const result = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'crash-edit');
    const request = packet(session, result.update, 'crash-packet'), directory = service.directory;
    service.close();
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import {readFileSync} from 'node:fs'; import {SheetRelayService} from './relay/sheet/service.ts';
      const input=JSON.parse(readFileSync(0,'utf8')); const service=SheetRelayService.resume(input.directory);
      const result=service.append(input.credential,{...input.request,loseAck:true});
      console.log(JSON.stringify({pid:process.pid,status:result.status})); process.exit(result.status==='acknowledgment-unknown'?0:1);
    `], { cwd: process.cwd(), input: JSON.stringify({ directory, credential: session.credential, request }), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); const outcome = JSON.parse(child.stdout);
    assert.notEqual(outcome.pid, process.pid); assert.equal(outcome.status, 'acknowledgment-unknown');
    service = SheetRelayService.resume(directory);
    const retry = service.append(session.credential, request); assert.equal(retry.status, 'durable');
    if (retry.status === 'durable') assert.equal(retry.receipt.sequence, 2);
    assert.equal(service.issueSession({ protocolVersion: 1, resumeCredential: session.credential }).identity.sessionId, session.identity.sessionId);
    const restored = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
    try { assert.deepEqual(restored.projection, client.projection); } finally { restored.destroy(); }
  } finally { client.destroy(); cleanup(service); }
});

test('prepared audit is not durable; COMMIT before receipt marker can resume/retry without inventing an old ACK', () => {
  let service = SheetRelayService.create(); const session = service.issueSession({ protocolVersion: 1 });
  const initial = service.open(session.credential), client = new SheetReplica(session.context, session.identity, base64ToBytes(initial.state.bytesBase64));
  try {
    const update = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'prepared-event');
    const request = packet(session, update.update, 'prepared-packet');
    persistAudit(service.directory, { version: 1, context: request.context, admission: request.admission, packet: request.packet, identity: session.identity });
    const directory = service.directory; service.close(); service = SheetRelayService.resume(directory);
    assert.equal(service.open(session.credential).latestSequence, 1); assert.equal(service.open(session.credential).state.sha256, initial.state.sha256);
    service.close();
    const native = DisposableDurableStore.reopen(directory, { admission: request.admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(request.context) });
    try { assert.equal(native.append(session.identity, { admission: request.admission, updateId: request.packet.updateId, bytes: update.update }).status, 'durable'); }
    finally { native.close(); }
    service = SheetRelayService.resume(directory);
    assert.equal(service.open(session.credential).latestSequence, 2);
    const retry = service.append(session.credential, request); assert.equal(retry.status, 'durable');
    if (retry.status === 'durable') assert.equal(retry.receipt.sequence, 2);
  } finally { client.destroy(); cleanup(service); }
});

test('confirmed receipt-tail removal fails closed; a live relay cannot acquire another writer', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    assert.throws(() => SheetRelayService.resume(service.directory), /writer-active/);
    assert.throws(() => service.issueSession({ protocolVersion: 1, resumeCredential: '0'.repeat(64) }), /session-denied/);
    const update = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'confirmed');
    assert.equal(service.append(session.credential, packet(session, update.update, 'confirmed-packet')).status, 'durable');
    const directory = service.directory; service.close();
    const database = new DatabaseSync(join(directory, 'updates.sqlite'));
    try { database.exec('DELETE FROM updates WHERE seq=2'); } finally { database.close(); }
    const before = updateHash(readFileSync(join(directory, 'updates.sqlite')));
    assert.throws(() => SheetRelayService.resume(directory), /confirmed-receipt-missing-or-changed/);
    assert.equal(updateHash(readFileSync(join(directory, 'updates.sqlite'))), before);
  } finally { client.destroy(); cleanup(service); }
});

test('receipt persistence failure after actual COMMIT stays ACK-unknown and never claims rejection', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    const change = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'receipt-fault');
    const request = packet(session, change.update, 'receipt-fault-packet');
    const blockedMarker = join(service.directory, 'receipt-audit', `${updateHash(new TextEncoder().encode(request.packet.updateId))}.json`);
    mkdirSync(blockedMarker); // Real test-owned filesystem fault, not a fake receipt.
    assert.equal(service.append(session.credential, request).status, 'acknowledgment-unknown');
    assert.equal(service.open(session.credential).latestSequence, 2, 'COMMIT must have happened despite missing confirmation');
    assert.equal(service.append(session.credential, request).status, 'acknowledgment-unknown');
    rmSync(blockedMarker, { recursive: true }); // Explicit test-harness fault removal only.
    const retry = service.append(session.credential, request); assert.equal(retry.status, 'durable');
    if (retry.status === 'durable') assert.equal(retry.receipt.sequence, 2);
  } finally { client.destroy(); cleanup(service); }
});

for (const change of ['revoke', 'issue', 'read-only', 'orphan-audit', 'noop-receipt', 'marker-removal', 'manifest-rewrite'] as const) test(`resume refuses stale inspected authority after another native writer performs ${change} and closes`, () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const stateHash = service.open(session.credential).state.sha256, directory = service.directory;
  service.close();
  const actualOpen = DisposableDurableStore.reopen;
  let injected = false, resumed: SheetRelayService | undefined;
  // This phase seam calls the genuine native constructor after a separate process
  // has acquired/released that same database. No receipt or COMMIT is mocked.
  DisposableDurableStore.reopen = (candidate, options) => {
    if (!injected) {
      injected = true;
      const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
        import {readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs'; import {join} from 'node:path';
        import {SheetRelayService} from './relay/sheet/service.ts'; import {persistAudit} from './relay/sheet/storage.ts';
        import {SheetReplica} from './src/collaboration.ts'; import {updateHash} from './src/durable-store.ts';
        import {base64ToBytes,bytesToBase64,relayAdmission} from './src/sheet-preview-protocol.ts';
        const input=JSON.parse(readFileSync(0,'utf8')), service=SheetRelayService.resume(input.directory);
        if(input.change==='revoke')service.revokeSession(input.credential);
        else if(input.change==='issue')service.issueSession({protocolVersion:1});
        else if(input.change==='read-only')service.setSessionAccess(input.credential,'read-only');
        else if(input.change==='marker-removal'){
          const target=join(input.directory,'receipt-audit'); rmSync(join(target,readdirSync(target)[0]));
        }else if(input.change==='manifest-rewrite'){
          const target=join(input.directory,'relay-manifest.json');writeFileSync(target,readFileSync(target,'utf8')+String.fromCharCode(10));
        }else{
          const session=service.issueSession({protocolVersion:1,resumeCredential:input.credential}), state=service.open(input.credential);
          let bytes=new Uint8Array([0,0]);
          if(input.change==='orphan-audit'){
            const replica=new SheetReplica(session.context,session.identity,base64ToBytes(state.state.bytesBase64));
            try{bytes=replica.commit({kind:'unsupported',operation:'row.move'},'race-orphan-event').update;}finally{replica.destroy();}
          }
          const packet={updateId:'race-prepared-packet',bytesBase64:bytesToBase64(bytes),byteLength:bytes.length,sha256:updateHash(bytes)};
          const request={protocolVersion:1,context:session.context,admission:relayAdmission(session.context),packet};
          if(input.change==='orphan-audit')persistAudit(input.directory,{version:1,context:session.context,admission:request.admission,packet,identity:session.identity});
          else if(service.append(input.credential,request).status!=='durable')throw new Error('genuine-noop-COMMIT-required');
        }
        console.log(JSON.stringify({sameState:service.binding().acceptedStateSha256===input.stateHash})); service.close();
      `], { cwd: process.cwd(), input: JSON.stringify({ directory, credential: session.credential, stateHash, change }), encoding: 'utf8' });
      assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).sameState, true);
    }
    return actualOpen(candidate, options);
  };
  try {
    assert.throws(() => { resumed = SheetRelayService.resume(directory); }, /resume-authority-mismatch/);
    assert.equal(injected, true);
  } finally { resumed?.close(); DisposableDurableStore.reopen = actualOpen; cleanup(service); }
});

test('current read-only access denies append, duplicate retry and checkpoint before packet parsing or audit', () => {
  let service = SheetRelayService.create();
  const session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  try {
    assert.equal(session.access, 'read-write');
    assert.throws(() => service.issueSession(Object.assign({ protocolVersion: 1 as const }, { access: 'read-only' })), /invalid-session-request/);
    const change = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 'before-read-only' } }, 'before-read-only-event');
    const request = packet(session, change.update, 'before-read-only-packet');
    const accepted = service.append(session.credential, request); assert.equal(accepted.status, 'durable');
    const before = service.open(session.credential);
    service.setSessionAccess(session.credential, 'read-only');
    assert.equal(service.issueSession({ protocolVersion: 1, resumeCredential: session.credential }).access, 'read-only');
    assert.equal(service.open(session.credential).state.sha256, before.state.sha256);
    const auditFiles = readdirSync(join(service.directory, 'packet-audit')).sort();
    assert.throws(() => service.append(session.credential, request), /read-only-denied/);
    assert.throws(() => service.append(session.credential, {} as SheetRelayAppendRequest), /read-only-denied/);
    assert.throws(() => service.append(session.credential, { ...request, packet: { ...request.packet, updateId: 'denied-new-id', sha256: '0'.repeat(64) } }), /read-only-denied/);
    assert.throws(() => service.checkpoint(session.credential), /read-only-denied/);
    assert.deepEqual(readdirSync(join(service.directory, 'packet-audit')).sort(), auditFiles);
    assert.equal(service.open(session.credential).latestSequence, before.latestSequence);
    const directory = service.directory; service.close(); service = SheetRelayService.resume(directory);
    assert.equal(service.issueSession({ protocolVersion: 1, resumeCredential: session.credential }).access, 'read-only');
    assert.equal(service.open(session.credential).state.sha256, before.state.sha256);
    assert.throws(() => service.append(session.credential, request), /read-only-denied/);
    assert.throws(() => service.checkpoint(session.credential), /read-only-denied/);
    service.setSessionAccess(session.credential, 'read-write');
    assert.deepEqual(service.append(session.credential, request), accepted, 'exact durable receipt survives temporary read-only access');
    assert.equal(service.checkpoint(session.credential).throughSequence, before.latestSequence);
    service.setSessionAccess(session.credential, 'read-only'); service.revokeSession(session.credential);
    assert.throws(() => service.open(session.credential), /current-access-denied/);
    assert.throws(() => service.append(session.credential, request), /current-access-denied/);
    assert.throws(() => service.issueSession({ protocolVersion: 1, resumeCredential: session.credential }), /current-access-denied/);
  } finally { client.destroy(); cleanup(service); }
});

test('read-only sessions can read another writer without changing their credential or native identity', () => {
  const service = SheetRelayService.create(), reader = service.issueSession({ protocolVersion: 1 }), writer = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(writer.context, writer.identity, base64ToBytes(service.open(writer.credential).state.bytesBase64));
  try {
    service.setSessionAccess(reader.credential, 'read-only');
    const update = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 'writer-remains-active' } }, 'other-writer-event');
    assert.equal(service.append(writer.credential, packet(writer, update.update, 'other-writer-packet')).status, 'durable');
    assert.equal(service.open(reader.credential).state.sha256, service.open(writer.credential).state.sha256);
    const restored = service.issueSession({ protocolVersion: 1, resumeCredential: reader.credential });
    assert.deepEqual(restored.identity, reader.identity); assert.equal(restored.credential, reader.credential); assert.equal(restored.access, 'read-only');
    assert.throws(() => service.setSessionAccess(reader.credential, 'administrator' as SheetRelayAccess), /invalid-session-access/);
    assert.equal(service.issueSession({ protocolVersion: 1, resumeCredential: reader.credential }).access, 'read-only');
  } finally { client.destroy(); cleanup(service); }
});

test('trusted access subscribers observe persisted authority and isolate callback failures', () => {
  const service = SheetRelayService.create(), session = service.issueSession({ protocolVersion: 1 });
  const observed: string[] = [];
  const stopFailure = service.subscribeAccess(() => { throw new Error('controlled-subscriber-fault'); });
  const stopObserve = service.subscribeAccess(credential => {
    assert.equal(credential, session.credential);
    const file = JSON.parse(readFileSync(join(service.directory, 'relay-sessions.json'), 'utf8'));
    const persisted = file.sessions.find((entry: { identity: { sessionId: string } }) => entry.identity.sessionId === session.identity.sessionId);
    assert(persisted);
    observed.push(persisted.active ? service.issueSession({ protocolVersion: 1, resumeCredential: credential }).access : 'revoked');
  });
  try {
    assert.doesNotThrow(() => service.setSessionAccess(session.credential, 'read-only'));
    assert.deepEqual(observed, ['read-only']);
    service.setSessionAccess(session.credential, 'read-only'); assert.deepEqual(observed, ['read-only'], 'unchanged access has no notification');
    stopFailure(); service.setSessionAccess(session.credential, 'read-write');
    assert.deepEqual(observed, ['read-only', 'read-write']);
    service.revokeSession(session.credential); assert.deepEqual(observed, ['read-only', 'read-write', 'revoked']);
    stopObserve();
    const other = service.issueSession({ protocolVersion: 1 }); service.setSessionAccess(other.credential, 'read-only');
    assert.equal(observed.length, 3);
  } finally { stopFailure(); stopObserve(); cleanup(service); }
});
