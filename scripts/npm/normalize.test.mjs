import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import * as tar from 'tar';
import { normalizeTarball } from './normalize.mjs';
import { digest, inspectTarball, run } from './packages.mjs';

test('dependency order and archive metadata produce identical bytes without changing exports or file contents', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'npm-reproducible-'));
  const exports = { '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' } };
  const manifest = { name: '@barocss/example', version: '1.0.1', license: 'MIT', type: 'module', main: './dist/index.js', types: './dist/index.d.ts', exports };
  try {
    mkdirSync(resolve(directory, 'package/dist'), { recursive: true });
    for (const [name, contents] of Object.entries({ 'README.md': 'Example', 'dist/LICENSE': 'MIT', 'dist/index.js': 'export const value = 1;', 'dist/index.d.ts': 'export declare const value = 1;' })) writeFileSync(resolve(directory, 'package', name), contents);
    chmodSync(resolve(directory, 'package/dist/index.js'), 0o755);
    const a = resolve(directory, 'a.tgz'), b = resolve(directory, 'b.tgz');
    writeFileSync(resolve(directory, 'package/package.json'), JSON.stringify({ ...manifest, dependencies: { z: '^1', a: '^2' } }));
    tar.c({ file: a, cwd: directory, sync: true, gzip: true, mtime: new Date(0) }, ['package']);
    writeFileSync(resolve(directory, 'package/package.json'), JSON.stringify({ ...manifest, dependencies: { a: '^2', z: '^1' } }));
    tar.c({ file: b, cwd: directory, sync: true, gzip: true, mtime: new Date('2025-01-01') }, ['package/package.json', 'package/README.md', 'package/dist']);
    assert.notEqual(digest(a), digest(b));
    normalizeTarball(a); normalizeTarball(b);
    assert.equal(digest(a), digest(b));
    const first = digest(a);
    normalizeTarball(a);
    assert.equal(digest(a), first, 'normalization must be idempotent');
    assert.deepEqual(inspectTarball(a), { ...manifest, dependencies: { a: '^2', z: '^1' } });
    assert.deepEqual(Object.keys(inspectTarball(a).exports['.']), ['types', 'import', 'default']);
    assert.equal(run('tar', ['-xOf', a, 'package/dist/index.js']), 'export const value = 1;');
    assert.match(run('tar', ['-tvzf', a]), /-rwxr-xr-x.*package\/dist\/index.js/);
    assert.ok(readFileSync(a).length);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
