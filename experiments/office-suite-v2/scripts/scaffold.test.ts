import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';

const require = createRequire(import.meta.url);

test('the standalone graph uses the fixed Node, TypeScript and Yjs versions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(process.versions.node, '22.22.0');
  assert.equal(require('typescript/package.json').version, '5.9.3');
  assert.equal(require('yjs/package.json').version, '13.6.29');
  assert.equal(require('@types/node/package.json').version, '22.20.2');
  assert.equal(manifest.packageManager, 'pnpm@8.15.0');
});

test('native Node executes erasable TypeScript without a test framework', () => {
  const profile: { phase: 'M0'; accepted: boolean } = { phase: 'M0', accepted: false };
  assert.deepEqual(profile, { phase: 'M0', accepted: false });
});

test('native SQLite is available without another database dependency', () => {
  assert.equal(typeof DatabaseSync, 'function');
});

test('the pinned primitive loads and encodes an update between disposable documents', () => {
  const first = new Y.Doc();
  const second = new Y.Doc();
  try {
    first.getMap<string>('scaffold').set('probe', 'dependency-only');
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    assert.equal(second.getMap<string>('scaffold').get('probe'), 'dependency-only');
  } finally {
    first.destroy();
    second.destroy();
  }
});
