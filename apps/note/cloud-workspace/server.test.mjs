import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleWorkspaceApi } from './dist/api/workspace-api.mjs';
import { openTestDB } from './test-db.mjs';

const origin = 'https://workspace.test';
const native = (text = 'First authored paragraph') => ({ stype: 'note', attributes: { title: 'Fictional product brief', pageId: 'note-cloud-test-original' }, content: [
  { stype: 'paragraph', metadata: { loadedAt: 'authored', retained: ['keep'] }, content: [{ stype: 'inline-text', text, marks: [] }] },
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated rich content', marks: [{ stype: 'bold', range: [0, 9] }] }] }
] });
const snapshot = text => JSON.stringify({ format: 'barocss-note', version: 1, document: native(text) }, null, 2) + '\n';
const attempt = (baseRevision = 0, documentId = randomUUID(), text) => ({ documentId, baseRevision, requestId: randomUUID(), snapshotText: snapshot(text) });
function request(db, path, method = 'GET', input, owner = 'fictional-owner-a', extra = {}) {
  return handleWorkspaceApi(new Request(`${origin}/api/workspace${path}`, { method,
    headers: { ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
      ...(input === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...extra },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) }), db);
}
const save = (db, input, owner) => request(db, input.baseRevision ? `/documents/${input.documentId}` : '/documents', input.baseRevision ? 'PUT' : 'POST', input, owner);
const count = db => db.sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_document_revisions').get().n;

test('anonymous requests cannot read or write; missing storage is explicitly unavailable', async () => {
  const db = openTestDB();
  try {
    for (const path of ['/session', '/documents', `/documents/${randomUUID()}`, `/receipts/${randomUUID()}`]) assert.equal((await request(db.api, path, 'GET', undefined, '')).status, 401);
    assert.equal((await save(db.api, attempt(), '')).status, 401);
    assert.equal(count(db), 0);
    assert.equal((await request(undefined, '/documents')).status, 503);
    const session = await (await request(undefined, '/session')).json();
    assert.equal(session.storageAvailable, false); assert.equal(session.ai.available, false);
  } finally { db.close(); }
});

test('structured full Note bytes survive save/reopen and a database close/restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cloud-workspace-db-'));
  let db = openTestDB(join(dir, 'durable.sqlite'));
  const input = attempt();
  try {
    const result = await save(db.api, input); assert.equal(result.status, 200);
    const receipt = await result.json(); assert.equal(receipt.snapshotText, input.snapshotText); assert.equal(receipt.revision, 1);
    assert.deepEqual(JSON.parse(receipt.snapshotText).document, native());
    assert.equal(result.headers.get('X-Workspace-User-Scope'), 'fictional-owner-a');
    db.close(); db = openTestDB(join(dir, 'durable.sqlite'));
    const reopened = await (await request(db.api, `/documents/${input.documentId}`)).json();
    assert.deepEqual(reopened, receipt); assert.equal(count(db), 1);
    const listing = await (await request(db.api, '/documents')).json();
    assert.equal(listing.documents.length, 1); assert.equal(listing.documents[0].revision, 1);
    assert.equal('snapshotText' in listing.documents[0], false);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});

test('each identity has isolated list, document, receipt and write authority', async () => {
  const db = openTestDB(), input = attempt();
  try {
    assert.equal((await save(db.api, input)).status, 200);
    assert.equal((await request(db.api, `/documents/${input.documentId}`, 'GET', undefined, 'fictional-owner-b')).status, 404);
    assert.equal((await request(db.api, `/receipts/${input.requestId}`, 'GET', undefined, 'fictional-owner-b')).status, 404);
    assert.deepEqual((await (await request(db.api, '/documents', 'GET', undefined, 'fictional-owner-b')).json()).documents, []);
    assert.equal((await save(db.api, attempt(1, input.documentId, 'Unauthorized update'), 'fictional-owner-b')).status, 404);
    assert.equal(count(db), 1);
    // Equal client identifiers in two identities remain two unrelated documents.
    assert.equal((await save(db.api, { ...input, snapshotText: snapshot('Owner B original') }, 'fictional-owner-b')).status, 200);
    assert.equal((await (await request(db.api, `/documents/${input.documentId}`)).json()).snapshotText, input.snapshotText);
    assert.equal(count(db), 2);
  } finally { db.close(); }
});

test('fixed retries recover lost acknowledgments without a second revision; key reuse is refused', async () => {
  const db = openTestDB(), first = attempt();
  try {
    const receipt = await (await save(db.api, first)).json();
    assert.deepEqual(await (await save(db.api, first)).json(), receipt); assert.equal(count(db), 1);
    assert.equal((await save(db.api, { ...first, snapshotText: snapshot('Different payload') })).status, 409);
    const update = attempt(1, first.documentId, 'Reviewed author edit');
    const updated = await (await save(db.api, update)).json(); assert.equal(updated.revision, 2);
    assert.deepEqual(await (await save(db.api, update)).json(), updated); assert.equal(count(db), 2);
    assert.deepEqual(await (await request(db.api, `/receipts/${update.requestId}`)).json(), updated);
  } finally { db.close(); }
});

test('concurrent writers use an atomic optimistic revision guard; stale and wrong-page updates create no rows', async () => {
  const db = openTestDB(), first = attempt();
  try {
    assert.equal((await save(db.api, first)).status, 200);
    const outcomes = await Promise.all([save(db.api, attempt(1, first.documentId, 'Concurrent A')), save(db.api, attempt(1, first.documentId, 'Concurrent B'))]);
    assert.deepEqual(outcomes.map(item => item.status).sort(), [200, 409]); assert.equal(count(db), 2);
    const wrongPage = JSON.parse(snapshot('Wrong page')); wrongPage.document.attributes.pageId = 'note-other-page';
    assert.equal((await save(db.api, { ...attempt(2, first.documentId), snapshotText: JSON.stringify(wrongPage) })).status, 409);
    assert.equal((await save(db.api, attempt(1, first.documentId, 'Stale'))).status, 409); assert.equal(count(db), 2);
  } finally { db.close(); }
});

test('cross-origin, malformed, unsupported and oversized writes are refused without mutations', async () => {
  const db = openTestDB();
  try {
    assert.equal((await request(db.api, '/documents', 'POST', attempt(), undefined, { Origin: 'https://other.test' })).status, 403);
    assert.equal((await save(db.api, { ...attempt(), snapshotText: 'malformed' })).status, 422);
    const unsupported = JSON.parse(snapshot()); unsupported.version = 2;
    assert.equal((await save(db.api, { ...attempt(), snapshotText: JSON.stringify(unsupported) })).status, 422);
    assert.equal((await save(db.api, { ...attempt(), snapshotText: snapshot('x'.repeat(262144)) })).status, 413);
    assert.equal((await save(db.api, { ...attempt(), owner: 'visitor-supplied' })).status, 400);
    assert.equal(count(db), 0);
  } finally { db.close(); }
});

test('database failure is honest, does not leak provider errors, and supports the same retry', async () => {
  const db = openTestDB(), input = attempt();
  try {
    const broken = { prepare() { throw new Error('Provider secret should never leave the server'); } };
    const failed = await save(broken, input); assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { code: 'storage_error' }); assert.equal(count(db), 0);
    assert.equal((await save(db.api, input)).status, 200); assert.equal(count(db), 1);
  } finally { db.close(); }
});

test('page identity cannot alias a second document and discovery paginates without leaking snapshots', async () => {
  const db = openTestDB(), original = attempt();
  try {
    assert.equal((await save(db.api, original)).status, 200);
    assert.equal((await save(db.api, attempt())).status, 409); assert.equal(count(db), 1);
    for (let index = 0; index < 50; index++) {
      const input = attempt(), file = JSON.parse(input.snapshotText);
      file.document.attributes.pageId = `note-page-${index}`;
      input.snapshotText = JSON.stringify(file);
      assert.equal((await save(db.api, input)).status, 200);
    }
    const first = await (await request(db.api, '/documents')).json();
    assert.equal(first.documents.length, 50); assert.equal(first.nextCursor, first.documents.at(-1).documentId);
    const second = await (await request(db.api, `/documents?after=${first.nextCursor}`)).json();
    assert.equal(second.documents.length, 1); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.documents, ...second.documents].map(one => one.documentId)).size, 51);
    assert.equal(first.documents.some(one => 'snapshotText' in one), false);
  } finally { db.close(); }
});
