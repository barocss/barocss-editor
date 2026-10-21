import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestDB } from '../../note/cloud-workspace/test-db.mjs';
const worker = (await import(pathToFileURL(process.env.OFFICE_WORKER_PATH ?? new URL('./dist/server/index.js', import.meta.url).pathname).href)).default;
const origin = 'https://office.test', root = '/api/office-storage';
async function request(db, owner, path, payload, expected = owner) {
  const response = await worker.fetch(new Request(origin + root + path, {
    method: payload === undefined ? 'GET' : 'POST', headers: {
      ...(owner ? { 'oai-authenticated-user-id': owner, 'X-Office-Expected-Scope': expected } : {}),
      ...(payload === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' })
    }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  }), { DB: db.api });
  return { status: response.status, value: await response.json() };
}
const session = async (db, owner) => (await request(db, owner, '/session')).value;
const commit = (db, owner, workspace, kind, items, requestId = crypto.randomUUID()) =>
  request(db, owner, `/${workspace}/${kind}/commit`, { requestId, items });
function note(name = crypto.randomUUID(), text = 'Exact original bytes', revision = null, metadata = {}) {
  return { entry: { name, title: 'QA native Note', metadata }, expectedRevision: revision,
    text: JSON.stringify({ format: 'barocss-note', version: 1, savedAt: 'authored', document: {
      stype: 'note', attributes: { title: 'QA native Note', pageId: name },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }]
    } }) };
}
test('anonymous and changed identity are rejected before any database/body access', async () => {
  const db = { api: { prepare() { throw new Error('Identity rejection touched D1'); } } };
  assert.equal((await request(db, null, '/session')).status, 401);
  assert.equal((await request(db, 'B', '/unknown/note/commit', { bad: true }, 'A')).status, 401);
});
test('workspace identity survives database reopen and isolates every owner route/receipt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'office-d1-')), path = join(directory, 'db.sqlite');
  let db = openTestDB(path);
  try {
    const a = await session(db, 'A'), b = await session(db, 'B'); assert.notEqual(a.workspaceId, b.workspaceId);
    const item = note(), key = crypto.randomUUID();
    assert.equal((await commit(db, 'A', a.workspaceId, 'note', [item], key)).status, 200);
    db.close(); db = openTestDB(path);
    assert.equal((await session(db, 'A')).workspaceId, a.workspaceId);
    const opened = await request(db, 'A', `/${a.workspaceId}/note/item?name=${item.entry.name}`);
    assert.equal(opened.value.snapshot.text, item.text);
    assert.equal((await request(db, 'B', `/${a.workspaceId}/note/item?name=${item.entry.name}`)).status, 403);
    assert.equal((await request(db, 'B', `/${b.workspaceId}/receipts/${key}`)).status, 404);
    assert.deepEqual((await request(db, 'B', `/${b.workspaceId}/note/snapshots`)).value.snapshots, []);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('keepMany is all-or-nothing and fixed receipts preserve bytes after later saves', async () => {
  const db = openTestDB();
  try {
    const { workspaceId } = await session(db, 'A'), one = note(), two = note(), key = crypto.randomUUID();
    const saved = await commit(db, 'A', workspaceId, 'note', [one, two], key); assert.equal(saved.status, 200);
    assert.deepEqual(saved.value.snapshots.map(row => row.text), [one.text, two.text]);
    const changed = note(one.entry.name, 'winner', 1); assert.equal((await commit(db, 'A', workspaceId, 'note', [changed])).status, 200);
    const losing = await commit(db, 'A', workspaceId, 'note', [note(one.entry.name, 'stale', 1), note(two.entry.name, 'must not commit', 1)]);
    assert.equal(losing.status, 409);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM office_store_revisions').get().n, 3);
    const replay = await commit(db, 'A', workspaceId, 'note', [one, two], key); assert.deepEqual(replay, saved);
    assert.equal((await commit(db, 'A', workspaceId, 'note', [changed], key)).status, 409);
  } finally { db.close(); }
});
test('simultaneous writers have exactly one winner; deletion cannot reset the revision clock', async () => {
  const db = openTestDB();
  try {
    const { workspaceId } = await session(db, 'A'), item = note(); await commit(db, 'A', workspaceId, 'note', [item]);
    const results = await Promise.all(['first', 'second'].map(text => commit(db, 'A', workspaceId, 'note', [note(item.entry.name, text, 1)])));
    assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
    assert.equal((await commit(db, 'A', workspaceId, 'note', [{ entry: { name: item.entry.name }, text: '', expectedRevision: 2, deleted: true }])).status, 200);
    const recreated = await commit(db, 'A', workspaceId, 'note', [item]); assert.equal(recreated.value.snapshots[0].row.revision, 4);
    assert.equal((await commit(db, 'A', workspaceId, 'note', [note(item.entry.name, 'old epoch', 1)])).status, 409);
  } finally { db.close(); }
});
test('Note parent batches cannot reference foreign data or introduce cycles', async () => {
  const db = openTestDB();
  try {
    const { workspaceId } = await session(db, 'A'), b = await session(db, 'B'), foreign = note();
    await commit(db, 'B', b.workspaceId, 'note', [foreign]);
    assert.equal((await commit(db, 'A', workspaceId, 'note', [note(undefined, 'bad parent', null, { parentId: foreign.entry.name })])).status, 409);
    const one = note(), two = note(); one.entry.metadata.parentId = two.entry.name; two.entry.metadata.parentId = one.entry.name;
    assert.equal((await commit(db, 'A', workspaceId, 'note', [one, two])).status, 409);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM office_store_revisions WHERE owner_id='A'").get().n, 0);
    one.entry.metadata.parentId = null;
    assert.equal((await commit(db, 'A', workspaceId, 'note', [one, two])).status, 200);
  } finally { db.close(); }
});
test('catalog revisions stay separate and project pins require exact owned immutable sources', async () => {
  const db = openTestDB();
  try {
    const { workspaceId } = await session(db, 'A'), item = note(); await commit(db, 'A', workspaceId, 'note', [item]);
    const catalog = { entry: { name: `note:${item.entry.name}` }, text: JSON.stringify({ folder: 'QA folder', favorite: true, references: [] }), expectedRevision: null };
    assert.equal((await commit(db, 'A', workspaceId, 'catalog', [catalog])).status, 200);
    assert.equal((await request(db, 'A', `/${workspaceId}/note/item?name=${item.entry.name}`)).value.snapshot.row.revision, 1);
    const project = { id: crypto.randomUUID(), title: 'QA project', goal: 'Preserve source', archived: false,
      results: [{ id: crypto.randomUUID(), name: 'QA result', document: { product: 'note', id: item.entry.name }, inputs: [] }],
      comments: [], works: [], activities: [], drafts: {} };
    const proposal = { entry: { name: `project:${project.id}`, title: project.title }, text: JSON.stringify(project), expectedRevision: null };
    assert.equal((await commit(db, 'A', workspaceId, 'catalog', [proposal])).status, 200);
    project.results[0].inputs.push({ id: crypto.randomUUID(), document: { product: 'note', id: item.entry.name }, revision: 1, text: item.text, title: item.entry.title });
    proposal.text = JSON.stringify(project); proposal.expectedRevision = 1;
    assert.equal((await commit(db, 'A', workspaceId, 'catalog', [proposal])).status, 200);
    project.results[0].inputs[0].title = 'fabricated'; proposal.text = JSON.stringify(project); proposal.expectedRevision = 2;
    const invalid = await commit(db, 'A', workspaceId, 'catalog', [proposal]); assert.equal(invalid.status, 422); assert.equal(invalid.value.code, 'immutable_pin');
  } finally { db.close(); }
});
test('new generated migration adds tables without modifying the applied Note schema or original bytes', () => {
  const db = openTestDB();
  try {
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('office_owner_workspaces','office_store_revisions','workspace_document_revisions')").get().n, 3);
    const oldSQL = readFileSync(new URL('../../note/cloud-workspace/drizzle/0000_document_revisions.sql', import.meta.url), 'utf8');
    assert.match(oldSQL, /workspace_document_revisions/);
    const nextSQL = readFileSync(new URL('../../note/cloud-workspace/drizzle/0001_document_revisions.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(nextSQL, /\b(DROP|ALTER|DELETE|UPDATE|INSERT|REPLACE)\b/i);
  } finally { db.close(); }
});
