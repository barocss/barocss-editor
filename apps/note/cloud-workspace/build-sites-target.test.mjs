import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('the complete Sites target builds using installed local tools with no package manager on PATH', { timeout: 180000 }, t => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const stage = mkdtempSync(join(tmpdir(), 'workspace build without package manager '));
  try {
    const app = join(stage, 'apps/note'), workspace = join(app, 'cloud-workspace');
    mkdirSync(app, { recursive: true });
    // Reuse already-installed workspace packages and third-party dependencies; no installation.
    // The isolated publisher root owns the manifest, app build output and migration staging.
    symlinkSync(join(root, 'packages'), join(stage, 'packages'), 'dir');
    symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');
    symlinkSync(join(root, 'apps/note/node_modules'), join(app, 'node_modules'), 'dir');
    symlinkSync(join(root, 'apps/note/src'), join(app, 'src'), 'dir');
    for (const file of ['package.json', 'tsconfig.json']) copyFileSync(join(root, file), join(stage, file));
    for (const file of ['package.json', 'tsconfig.json']) copyFileSync(join(root, 'apps/note', file), join(app, file));
    cpSync(here, workspace, { recursive: true,
      filter: path => !['node_modules', 'dist', 'test-results'].includes(basename(path)) });
    mkdirSync(join(stage, '.openai'));
    copyFileSync(join(here, '.openai/hosting.json'), join(stage, '.openai/hosting.json'));
    const emptyPath = join(stage, 'empty-bin');
    mkdirSync(emptyPath);
    const env = { ...process.env, PATH: emptyPath };
    assert.throws(() => execFileSync('pnpm', ['--version'], { env, stdio: 'pipe' }), { code: 'ENOENT' });
    execFileSync(process.execPath, [join(workspace, 'build-sites-target.mjs')], {
      cwd: stage, env, stdio: 'pipe', timeout: 150000, maxBuffer: 8 * 1024 * 1024
    });
    assert.deepEqual(readFileSync(join(stage, 'dist/server/index.js')), readFileSync(join(workspace, 'dist/server/index.js')));
    t.diagnostic(`Node ${process.versions.node}; Worker SHA-256 ${createHash('sha256').update(readFileSync(join(stage, 'dist/server/index.js'))).digest('hex')}`);
    assert.deepEqual(readFileSync(join(stage, 'dist/.openai/hosting.json')), readFileSync(join(stage, '.openai/hosting.json')));
    for (const file of ['0000_document_revisions.sql', 'meta/_journal.json', 'meta/0000_snapshot.json']) {
      assert.deepEqual(readFileSync(join(stage, 'drizzle', file)), readFileSync(join(here, 'drizzle', file)));
    }
    // Exercise the new output, including module-init restrictions and persisted save/reopen.
    execFileSync(process.execPath, ['--experimental-vm-modules', '--test', join(workspace, 'worker.test.mjs')], {
      cwd: stage, env, stdio: 'pipe', timeout: 15000
    });
  } finally { rmSync(stage, { recursive: true, force: true }); }
});
