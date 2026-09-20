import { mkdirSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { checkArchiveImports } from './imports.mjs';
import { normalizeTarball } from './normalize.mjs';
import { root, packages, run, digest, inspectTarball } from './packages.mjs';

if (process.argv.length > 2) throw new Error('This command accepts no arguments and never publishes');
run('pnpm', ['--filter', './packages/**', '--workspace-concurrency=2', '-r', 'build'], root, { stdio: 'inherit' });
mkdirSync(resolve(root, 'output/npm'), { recursive: true });
const directory = mkdtempSync(resolve(root, 'output/npm/batch-'));
const entries = [];
for (const { directory: packageDirectory, manifest: source } of packages()) {
  const before = new Set(readdirSync(directory));
  run('pnpm', ['pack', '--pack-destination', directory], packageDirectory);
  const added = readdirSync(directory).filter((file) => !before.has(file) && file.endsWith('.tgz'));
  if (added.length !== 1) throw new Error(`Expected one archive for ${source.name}`);
  const file = resolve(directory, added[0]);
  normalizeTarball(file);
  const packed = inspectTarball(file);
  checkArchiveImports(file);
  if (source.name !== packed.name || source.version !== packed.version) throw new Error('Packed identity differs from source');
  entries.push({ name: packed.name, version: packed.version, file: basename(file), sha256: digest(file) });
  console.log(`Packed ${packed.name}@${packed.version}`);
}
const report = { schemaVersion: 1, sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(), packages: entries };
writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(root, 'output/npm/latest.json'), `${JSON.stringify({ directory }, null, 2)}\n`);
console.log(`Prepared ${entries.length} packages: ${directory}`);
