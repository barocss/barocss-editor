import { chmodSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as tar from 'tar';
import { inspectTarball } from './packages.mjs';

/** pnpm resolves workspace dependencies concurrently; their insertion order can vary. */
export function normalizeTarball(file) {
  inspectTarball(file);
  const temporary = mkdtempSync(resolve(dirname(file), '.normalize-'));
  try {
    tar.x({ file, cwd: temporary, sync: true, strict: true });
    const manifestPath = resolve(temporary, 'package/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (manifest[section]) manifest[section] = Object.fromEntries(Object.keys(manifest[section]).sort().map((name) => [name, manifest[section][name]]));
    }
    // Do not sort conditional exports: their key order changes module resolution.
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const files = [];
    const collect = (directory) => {
      for (const entry of readdirSync(resolve(temporary, directory), { withFileTypes: true })) {
        const name = `${directory}/${entry.name}`;
        if (entry.isDirectory()) collect(name);
        else if (entry.isFile()) {
          const path = resolve(temporary, name);
          chmodSync(path, statSync(path).mode & 0o111 ? 0o755 : 0o644);
          files.push(name);
        } else throw new Error(`Unsupported archive entry: ${name}`);
      }
    };
    collect('package');
    const normalized = resolve(temporary, 'normalized.tgz');
    tar.c({ file: normalized, cwd: temporary, sync: true, gzip: true, portable: true, noMtime: true, noDirRecurse: true }, files.sort());
    inspectTarball(normalized);
    renameSync(normalized, file);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
