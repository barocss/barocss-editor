import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { deploymentLock } from './deployment-lock.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const app = fileURLToPath(new URL('../../apps/office-api/', import.meta.url));
const output = `${app}.container`;
const run = (args, cwd = root) => execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
const lock = deploymentLock(parse(readFileSync(`${root}pnpm-lock.yaml`, 'utf8')), 'apps/office-api');
run(['--filter', '@barocss/office-api', 'build']);
// This path is exclusively generated deployment output, never source or user data.
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
cpSync(`${app}dist`, `${output}/dist`, { recursive: true });
cpSync(`${app}package.json`, `${output}/package.json`);
writeFileSync(`${output}/pnpm-lock.yaml`, stringify(lock));
// Install only the API graph. Do not re-resolve versions, download, or run package scripts.
run(['install', '--ignore-workspace', '--frozen-lockfile', '--prod', '--offline', '--ignore-scripts'], output);
console.log('Packaged API and frozen production dependencies in apps/office-api/.container');
