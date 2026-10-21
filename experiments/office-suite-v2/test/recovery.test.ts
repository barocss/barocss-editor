import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import * as Y from 'yjs';
import { DisposableDurableStore, PendingUpdates, DURABLE_LIMITS } from '../src/durable-store.ts';
import type { Admission, StoreOptions, UpdatePacket } from '../src/durable-store.ts';
import { ProseReplica, validateProseDocument } from '../src/prose.ts';

const admission: Admission = Object.freeze({ documentId: 'controlled-prose', generation: 'generation-1', engineId: 'prose-v1', contractVersion: 1, engineVersion: 1, schemaVersion: 1, adapterVersion: 1 });
const authenticated = Object.freeze({ actorId: 'controlled-user-a', sessionId: 'tab-a' });
const options: StoreOptions = { admission, currentAccess: session => session.actorId === authenticated.actorId, validateDocument: validateProseDocument };
function packet(updateId: string, bytes: Uint8Array): UpdatePacket { return { admission, updateId, bytes }; }
function close(store: DisposableDurableStore): void { store.close(); rmSync(store.directory, { recursive: true, force: true }); }

test('durable COMMIT, lost ACK, identical retry and checkpoint/tail restart are idempotent', () => {
  let store = DisposableDurableStore.create(options);
  const client = new ProseReplica('a'); const pending = new PendingUpdates();
  try {
    const first = packet('update-1', client.insert(0, 'one'));
    pending.add(first); assert.equal(pending.state('update-1'), 'local-pending');
    pending.synchronized('update-1'); assert.equal(pending.state('update-1'), 'synchronized');
    const unknown = store.append(authenticated, first, true); pending.result('update-1', unknown);
    assert.equal(pending.state('update-1'), 'acknowledgment-unknown');
    assert.deepEqual(store.includedUpdateIds(), ['update-1']);
    const checkpoint = store.checkpoint(); assert.equal(checkpoint.throughSequence, 1);
    assert.deepEqual(checkpoint.includedUpdateIds, ['update-1']);
    const second = packet('update-2', client.insert(3, '-two')); pending.add(second);
    const receipt2 = store.append(authenticated, second); assert.equal(receipt2.status, 'durable'); pending.result('update-2', receipt2);
    const directory = store.directory; store.close(); store = DisposableDurableStore.reopen(directory, options);
    const retry = store.append(authenticated, first); assert.equal(retry.status, 'durable'); pending.result('update-1', retry);
    if (retry.status !== 'durable') throw new Error('expected receipt');
    assert.equal(retry.receipt.sequence, 1); assert.deepEqual(store.includedUpdateIds(), ['update-1', 'update-2']);
    const restored = new ProseReplica('fresh', store.exportUpdate());
    try { assert.equal(restored.text, 'one-two'); assert.equal(restored.undo(), false); }
    finally { restored.destroy(); }
    assert.equal(pending.pending().length, 0);
    const third = packet('update-3', client.insert(7, '-local')); pending.add(third);
    pending.result('update-1', retry); // A late old ACK cannot confirm newer input.
    assert.equal(pending.state('update-3'), 'local-pending'); assert.equal(pending.pending().length, 1);
  } finally { client.destroy(); close(store); }
});

test('process exits after committed write without close; a fresh process/connection replays it', () => {
  const store = DisposableDurableStore.create(options); const directory = store.directory; store.close();
  try {
    const script = `
      import {DisposableDurableStore} from './src/durable-store.ts';
      import {ProseReplica, validateProseDocument} from './src/prose.ts';
      const admission = ${JSON.stringify(admission)};
      const service = DisposableDurableStore.reopen(${JSON.stringify(directory)}, {admission, currentAccess:()=>true, validateDocument:validateProseDocument});
      const client = new ProseReplica('child-session');
      const result = service.append({actorId:'controlled-user-a',sessionId:'child-session'}, {admission,updateId:'crash-update',bytes:client.insert(0,'crash-safe')}, true);
      console.log(result.status); process.exit(result.status === 'acknowledgment-unknown' ? 0 : 1);
    `;
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /acknowledgment-unknown/);
    const reopened = DisposableDurableStore.reopen(directory, options);
    try {
      const restored = new ProseReplica('parent', reopened.exportUpdate());
      try { assert.equal(restored.text, 'crash-safe'); } finally { restored.destroy(); }
      assert.deepEqual(reopened.includedUpdateIds(), ['crash-update']);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('current access is checked on every retry; rejected offline draft remains local', () => {
  let allowed = true; let calls = 0;
  const store = DisposableDurableStore.create({ ...options, currentAccess: () => { calls++; return allowed; } });
  const client = new ProseReplica('a'); const pending = new PendingUpdates();
  try {
    const first = packet('already-written', client.insert(0, 'base')); pending.add(first);
    assert.equal(store.append(authenticated, first).status, 'durable');
    allowed = false;
    assert.deepEqual(store.append(authenticated, first), { status: 'rejected', code: 'current-access-denied' });
    const offline = packet('offline', client.insert(4, '-offline')); pending.add(offline);
    pending.result('offline', store.append(authenticated, offline));
    assert.equal(pending.state('offline'), 'rejected'); assert.equal(pending.pending().length, 2);
    assert.deepEqual(pending.results('offline'), [{ status: 'rejected', code: 'current-access-denied' }]);
    assert.equal(client.text, 'base-offline'); assert.deepEqual(store.includedUpdateIds(), ['already-written']); assert.equal(calls, 3);
  } finally { client.destroy(); close(store); }
});

test('identity collision, wrong generation/version and snapshot replacement refuse without writes', () => {
  const store = DisposableDurableStore.create(options); const client = new ProseReplica('a');
  try {
    const first = packet('id', client.insert(0, 'safe'));
    assert.equal(store.append(authenticated, first).status, 'durable');
    assert.deepEqual(store.append(authenticated, packet('id', client.insert(4, '!'))), { status: 'rejected', code: 'update-id-collision' });
    for (const incompatible of [{ ...admission, generation: 'old-generation' }, { ...admission, schemaVersion: 2 }]) {
      const supplied = { ...first, updateId: 'wrong-admission', admission: incompatible };
      // Probe untyped wire data without weakening production types.
      const result = Reflect.apply(store.append, store, [authenticated, supplied]);
      assert.deepEqual(result, { status: 'rejected', code: 'incompatible-admission' });
    }
    assert.throws(() => store.replaceSnapshot(), /snapshot-replacement-refused/);
    assert.deepEqual(store.includedUpdateIds(), ['id']);
    const directory = store.directory; store.close();
    assert.throws(() => DisposableDurableStore.reopen(directory, { ...options, admission: { ...admission, generation: 'wrong' } }), /incompatible-admission/);
  } finally { client.destroy(); close(store); }
});

test('malformed, oversized, unknown-root and causally incomplete payloads do not enter durable state', () => {
  const store = DisposableDurableStore.create(options); const client = new ProseReplica('a');
  try {
    for (const bytes of [new Uint8Array(), new Uint8Array([255]), new Uint8Array(DURABLE_LIMITS.updateBytes + 1)]) {
      assert.equal(store.append(authenticated, packet('bad', bytes)).status, 'rejected');
    }
    const bad = new Y.Doc(); bad.getMap('other').set('replace', 'snapshot');
    try { assert.equal(store.append(authenticated, packet('other', Y.encodeStateAsUpdate(bad))).status, 'rejected'); }
    finally { bad.destroy(); }
    client.insert(0, 'missing-base');
    const tailOnly = client.insert(12, '-tail');
    assert.deepEqual(store.append(authenticated, packet('tail', tailOnly)), { status: 'rejected', code: 'incomplete-update' });
    assert.deepEqual(store.includedUpdateIds(), []);
  } finally { client.destroy(); close(store); }
});

test('one live SQLite writer owns disposable durable state; a second writer cannot open it', () => {
  const store = DisposableDurableStore.create(options);
  try { assert.throws(() => DisposableDurableStore.reopen(store.directory, options), /locked/); }
  finally { close(store); }
});

test('service identity strings stay opaque and bound, including Unicode and account punctuation', () => {
  const unicodeAdmission: Admission = { ...admission, documentId: '문서 1', generation: '세대 1' };
  const session = { actorId: '사람@example.test', sessionId: '새 탭' };
  const store = DisposableDurableStore.create({ ...options, admission: unicodeAdmission, currentAccess: actual => actual.actorId === session.actorId });
  const client = new ProseReplica(session.sessionId);
  try {
    const supplied = { admission: unicodeAdmission, updateId: '변경 1', bytes: client.insert(0, '한글') };
    assert.equal(store.append(session, supplied).status, 'durable');
    assert.deepEqual(store.includedUpdateIds(), ['변경 1']);
  } finally { client.destroy(); close(store); }
});
