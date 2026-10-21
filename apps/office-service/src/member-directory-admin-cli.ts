import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { provisionMemberDirectory, readMemberDirectory, type DirectoryProvision } from './member-directory-admin.js';

async function main() {
  const file = process.env.OFFICE_DIRECTORY_MANIFEST_PATH;
  const output = process.env.OFFICE_DIRECTORY_RESULT_PATH;
  const databaseUrl = process.env.OFFICE_MIGRATION_DATABASE_URL;
  const root = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
  const outside = (path: string) => {
    const location = relative(root, path);
    return location === '..' || location.startsWith('../');
  };
  if (!file || !output || !databaseUrl || !outside(realpathSync(file)) ||
    !outside(resolve(realpathSync(dirname(output)), output.split('/').pop()!))) {
    throw new Error('unsafe_directory_configuration');
  }
  const stats = lstatSync(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.mode & 0o077 || stats.size > 8192 ||
    lstatSync(dirname(output)).mode & 0o077 || lstatSync(dirname(file)).mode & 0o077) throw new Error('unsafe_directory_permissions');
  const input = JSON.parse(readFileSync(file, 'utf8')) as {
    action: 'provision' | 'read'; change?: DirectoryProvision;
    tenantId?: string; memberId?: string; approvalRef?: string;
  };
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    let result;
    if (input.action === 'provision' && Object.keys(input).sort().join(',') === 'action,change') {
      result = await provisionMemberDirectory(client, input.change!);
    } else if (input.action === 'read' && Object.keys(input).sort().join(',') ===
      'action,approvalRef,memberId,tenantId') {
      result = await readMemberDirectory(client, { tenantId: input.tenantId!, memberId: input.memberId!,
        approvalRef: input.approvalRef! });
    } else throw new Error('invalid_directory_action');
    writeFileSync(output, JSON.stringify(result) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ event: 'directory_operation_complete' }));
  } finally { await client.end(); }
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'directory_operation_failed' }));
  process.exitCode = 1;
});
