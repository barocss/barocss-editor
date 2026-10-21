// Test infrastructure only. Production uses Sites-provisioned D1, never node:sqlite.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function openTestDB(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_document_revisions'").get()) {
    const journal = JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    for (const entry of journal.entries) {
      sqlite.exec(readFileSync(new URL(`./drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
    }
  } else if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='office_owner_workspaces'").get()) {
    const journal = JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    for (const entry of journal.entries.slice(1)) sqlite.exec(readFileSync(new URL(`./drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  }
  const api = { prepare(sql) {
    let values = [];
    return {
      bind(...input) { values = input; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return sqlite.prepare(sql).run(...values); }
    };
  } };
  return { api, sqlite, close: () => sqlite.close() };
}
