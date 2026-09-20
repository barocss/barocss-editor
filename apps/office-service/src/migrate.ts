import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import { migrations, type Migration } from './migrations.js';

export function migrationPlan(entries: readonly Migration[]) {
  let previous = '';
  return entries.map(({ id, sql }) => {
    if (!/^\d{4}_[a-z0-9_]+$/.test(id) || id <= previous || !sql.trim()) {
      throw new Error('invalid_migration_plan');
    }
    previous = id;
    return { id, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

/** Use a dedicated owner connection. SQL is reviewed application code, never user input. */
export async function migrate(client: Client, entries: readonly Migration[] = migrations) {
  const plan = migrationPlan(entries);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL search_path = pg_catalog");
    const role = await client.query(`SELECT current_user = 'wonffice_owner'
      AND NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname = current_user`);
    if (!role.rows[0]?.safe) throw new Error('invalid_migration_role');
    // Serialize even first installation, before the history table exists.
    await client.query('SELECT pg_advisory_xact_lock(87142, 1)');
    await client.query(`CREATE SCHEMA IF NOT EXISTS wonffice_meta;
      REVOKE ALL ON SCHEMA wonffice_meta FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS wonffice_meta.migrations (
        id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = await client.query<{ id: string; checksum: string }>(
      'SELECT id, checksum FROM wonffice_meta.migrations ORDER BY id',
    );
    for (const [index, row] of applied.rows.entries()) {
      if (plan[index]?.id !== row.id || plan[index]?.checksum !== row.checksum) {
        throw new Error('migration_history_mismatch');
      }
    }
    const pending = plan.slice(applied.rows.length);
    for (const entry of pending) {
      await client.query(entry.sql);
      await client.query('INSERT INTO wonffice_meta.migrations (id, checksum) VALUES ($1, $2)',
        [entry.id, entry.checksum]);
    }
    await client.query('COMMIT');
    return pending.map(entry => entry.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
