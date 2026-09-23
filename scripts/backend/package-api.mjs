import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { deploymentLock } from './deployment-lock.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const app = fileURLToPath(new URL('../../apps/office-api/', import.meta.url));
const output = `${app}.container`;
const run = (args, cwd = root) => execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
const source = parse(readFileSync(`${root}pnpm-lock.yaml`, 'utf8'));
if (source.lockfileVersion !== '6.0' || !source.importers?.['apps/office-api']) {
  throw new Error('Unsupported API lockfile');
}
const dependencies = source.importers?.['apps/office-api']?.dependencies ?? {};
const workspaceDependencies = Object.entries(dependencies)
  .filter(([, entry]) => entry.version.startsWith('link:')).map(([name]) => name);
if (workspaceDependencies.some(name => name !== '@barocss/office-service')) {
  throw new Error('Unsupported API workspace dependency');
}
run(['--filter', '@barocss/office-api', 'build']);
// This path is exclusively generated deployment output, never source or user data.
rmSync(output, { recursive: true, force: true });
if (workspaceDependencies.length) {
  // pnpm deploy resolves the reviewed workspace link into a portable package.
  // Frozen resolution uses the repository lockfile. pnpm deploy may need
  // registry metadata even when every package tarball is already in the store.
  run(['--filter', '@barocss/office-api', 'deploy', '--prod', '--prefer-offline',
    '--frozen-lockfile', '--ignore-scripts', output]);
  console.log('Packaged API and office-service from the frozen workspace lock');
  process.exit(0);
}
const lock = deploymentLock(source, 'apps/office-api');
mkdirSync(output);
cpSync(`${app}dist`, `${output}/dist`, { recursive: true });
cpSync(`${app}package.json`, `${output}/package.json`);
writeFileSync(`${output}/pnpm-lock.yaml`, stringify(lock));
// Install only the API graph. Do not re-resolve versions, download, or run package scripts.
run(['install', '--ignore-workspace', '--frozen-lockfile', '--prod', '--offline', '--ignore-scripts'], output);
console.log('Packaged API and frozen production dependencies in apps/office-api/.container');
