import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('generated Drizzle journal/SQL preserves the independently authored schema constraints', () => {
  const generated = new DatabaseSync(':memory:'), oracle = new DatabaseSync(':memory:');
  try {
    const journal = JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    assert.equal(journal.dialect, 'sqlite'); assert.equal(journal.entries.length, 1);
    for (const entry of journal.entries) {
      assert.match(entry.tag, /^\d{4}_[a-z_]+$/);
      const sql = readFileSync(new URL(`./drizzle/${entry.tag}.sql`, import.meta.url), 'utf8');
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|REPLACE)\b/i);
      generated.exec(sql);
    }
    const snapshot = JSON.parse(readFileSync(new URL('./drizzle/meta/0000_snapshot.json', import.meta.url), 'utf8'));
    assert.equal(snapshot.dialect, 'sqlite');
    assert.deepEqual(Object.keys(snapshot.tables), ['workspace_document_revisions']);
    oracle.exec(readFileSync(new URL('./migrations/0000_document_revisions.sql', import.meta.url), 'utf8'));
    const columns = db => db.prepare('PRAGMA table_info(workspace_document_revisions)').all().map(row => ({
      name: row.name, type: row.type, notnull: row.notnull, defaultValue: row.dflt_value, primaryOrder: row.pk
    }));
    const unique = db => db.prepare('PRAGMA index_list(workspace_document_revisions)').all()
      .filter(row => row.unique).map(row => db.prepare(`PRAGMA index_info('${row.name}')`).all().map(column => column.name))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(columns(generated), columns(oracle)); assert.deepEqual(unique(generated), unique(oracle));
    const insert = db => db.prepare('INSERT INTO workspace_document_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const values = ['owner', 'document', 1, 'Title', 'note-page', '{}', 'hash', 'request', 'request-hash', 'authored-time'];
    for (const db of [generated, oracle]) {
      insert(db).run(...values);
      assert.throws(() => insert(db).run(...values));
      const duplicateRequest = [...values]; duplicateRequest[1] = 'other-document';
      assert.throws(() => insert(db).run(...duplicateRequest));
      const zeroRevision = [...values]; zeroRevision[2] = 0; zeroRevision[7] = 'other-request';
      assert.throws(() => insert(db).run(...zeroRevision));
    }
  } finally { generated.close(); oracle.close(); }
});
