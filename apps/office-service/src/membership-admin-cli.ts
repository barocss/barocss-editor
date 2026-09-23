import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyMembershipChange, type MembershipChange } from './membership-admin.js';

async function main() {
  const file = process.env.OFFICE_MEMBERSHIP_MANIFEST_PATH;
  const databaseUrl = process.env.OFFICE_MIGRATION_DATABASE_URL;
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  if (!file || !databaseUrl || resolve(file).startsWith(root)) {
    throw new Error('missing_or_unsafe_membership_configuration');
  }
  if (statSync(file).mode & 0o077) throw new Error('unsafe_membership_manifest_permissions');
  const input = JSON.parse(readFileSync(file, 'utf8')) as MembershipChange;
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const result = await applyMembershipChange(client, input);
    console.log(JSON.stringify({ event: 'membership_change_complete', applied: result.applied }));
  } finally {
    await client.end();
  }
}

main().catch(() => {
  // Manifest, URL, token and row values are never sent to logs or PRs.
  console.error(JSON.stringify({ event: 'membership_change_failed' }));
  process.exitCode = 1;
});
