import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(root, 'package.json'));
const cli = join(dirname(require.resolve('@changesets/cli/package.json')), 'bin.js');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

for (const channel of [null, 'alpha']) test(`Changesets versions private product (${channel ?? 'stable'}) independently`, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'wonffice-version-'));
  const put = (path, value) => {
    const target = join(fixture, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  };
  try {
    const product = json(join(root, 'packages/wonffice-release/package.json'));
    const config = json(join(root, '.changeset/config.json'));
    assert.equal(product.private, true);
    assert.equal(config.privatePackages.version, true);
    assert.equal(config.privatePackages.tag, false);
    assert(!config.ignore.includes(product.name));
    put('package.json', { name: 'version-fixture', private: true, packageManager: 'pnpm@8.15.0' });
    put('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    put('packages/product/package.json', { ...product, version: '0.0.0' });
    put('packages/public/package.json', { name: '@barocss/example-public', version: '2.3.4' });
    put('.changeset/config.json', { ...config, ignore: [] });
    put('.changeset/product-release.md', `---\n"${product.name}": major\n---\n\nFirst product release.\n`);
    if (channel) {
      const pre = spawnSync(process.execPath, [cli, 'pre', 'enter', channel], { cwd: fixture, encoding: 'utf8' });
      assert.equal(pre.status, 0, pre.stdout + pre.stderr);
    }
    const run = spawnSync(process.execPath, [cli, 'version'], {
      cwd: fixture, encoding: 'utf8', env: { ...process.env, CI: 'true' },
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(json(join(fixture, 'packages/product/package.json')).version, channel ? '1.0.0-alpha.0' : '1.0.0');
    assert.match(readFileSync(join(fixture, 'packages/product/CHANGELOG.md'), 'utf8'), /First product release/);
    assert.equal(json(join(fixture, 'packages/product/package.json')).private, true);
    assert.equal(json(join(fixture, 'packages/public/package.json')).version, '2.3.4');
    // This test intentionally never invokes publish or creates release tags.
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
