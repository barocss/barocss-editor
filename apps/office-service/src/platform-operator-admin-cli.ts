import { readFileSync, realpathSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyPlatformOperatorChange, type PlatformOperatorChange } from './platform-operator-admin.js';

async function main() {
  const file = process.env.OFFICE_OPERATOR_MANIFEST_PATH;
  const databaseUrl = process.env.OFFICE_MIGRATION_DATABASE_URL;
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  if (!file || !databaseUrl) {
    throw new Error('missing_or_unsafe_platform_operator_configuration');
  }
  const location = relative(root, realpathSync(file));
  if (location === '' || (!location.startsWith('..') && !location.startsWith('/'))) {
    throw new Error('missing_or_unsafe_platform_operator_configuration');
  }
  if (statSync(file).mode & 0o077) throw new Error('unsafe_platform_operator_manifest_permissions');
  const input = JSON.parse(readFileSync(file, 'utf8')) as PlatformOperatorChange;
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const result = await applyPlatformOperatorChange(client, input);
    console.log(JSON.stringify({ event: 'platform_operator_change_complete', applied: result.applied }));
  } finally {
    await client.end();
  }
}

main().catch(() => {
  // Actor, approval, manifest and credentials are not copied to logs.
  console.error(JSON.stringify({ event: 'platform_operator_change_failed' }));
  process.exitCode = 1;
});
