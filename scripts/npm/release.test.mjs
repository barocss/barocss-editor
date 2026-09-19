import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from './packages.mjs';
import { assertContext, assertChecks, planPublication, publicationOrder } from './publish.mjs';
const manifest = { name: '@barocss/example', version: '1.0.1', license: 'MIT', type: 'module', main: './dist/index.js', types: './dist/index.d.ts', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } };
const files = new Set(['package/dist/index.js', 'package/dist/index.d.ts', 'package/README.md', 'package/dist/LICENSE']);
test('packed declarations and JS must exist; workspace references cannot escape', () => {
  assert.deepEqual(validateManifest(manifest, files), []);
  assert.ok(validateManifest({ ...manifest, types: './src/index.ts' }, files).length);
  assert.ok(validateManifest(manifest, new Set([...files].filter((file) => !file.endsWith('.d.ts')))).length);
  assert.ok(validateManifest({ ...manifest, dependencies: { '@barocss/missing': 'workspace:*' } }, files).length);
  assert.ok(validateManifest({ ...manifest, private: true }, files).length);
  for (const publishConfig of [{ registry: 'https://example.invalid' }, { tag: 'other' }, { access: 'restricted' }, { directory: '../other' }]) assert.ok(validateManifest({ ...manifest, publishConfig }, files).length);
});
test('publication is limited to the exact manual workflow and main branch', () => {
  const env = { GITHUB_REPOSITORY: 'barocss/barocss-editor', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: 'barocss/barocss-editor/.github/workflows/npm-release.yml@refs/heads/main', GITHUB_SHA: 'a'.repeat(40) };
  assert.doesNotThrow(() => assertContext(env));
  for (const key of Object.keys(env)) assert.throws(() => assertContext({ ...env, [key]: 'invalid' }));
});
test('all required checks must be from Actions and latest attempt must succeed', () => {
  const checks = ['Lint, type-check, unit test', 'E2E (editor-react)', 'Npm package consumers'].map((name, id) => ({ name, id, status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }));
  assert.doesNotThrow(() => assertChecks(checks));
  assert.throws(() => assertChecks(checks.slice(1)));
  assert.throws(() => assertChecks([...checks, { ...checks[0], id: 99, conclusion: 'failure' }]));
  assert.throws(() => assertChecks(checks.map((check) => ({ ...check, app: { slug: 'other' } }))));
});
test('new packages are allowed; overwritten versions and latest downgrades are rejected', () => {
  assert.equal(planPublication(manifest, null, 'sha512-ok'), 'publish');
  const metadata = { 'dist-tags': { latest: '1.0.1' }, versions: { '1.0.1': { dist: { integrity: 'sha512-ok' } } } };
  assert.equal(planPublication(manifest, metadata, 'sha512-ok'), 'skip-identical');
  assert.throws(() => planPublication(manifest, metadata, 'sha512-different'));
  assert.throws(() => planPublication(manifest, { ...metadata, 'dist-tags': { latest: '2.0.0' } }, 'sha512-ok'));
});
test('runtime dependency order excludes type-only peer cycles', () => {
  const a = { name: 'a', manifest: { dependencies: { b: '^1' } } };
  const b = { name: 'b', manifest: { peerDependencies: { a: '^1' } } };
  assert.deepEqual(publicationOrder([a, b]).map((entry) => entry.name), ['b', 'a']);
  assert.throws(() => publicationOrder([a, { ...b, manifest: { dependencies: { a: '^1' } } }]));
});

test('installed siblings cannot hide undeclared runtime or declaration imports', async () => {
  const { undeclaredImports } = await import('./imports.mjs');
  const source = "import x from '@barocss/shared'; export { y } from 'react/jsx-runtime'; type Z = import('@barocss/schema').Node; import './style.css'; store.require('note'); store.import('word');";
  assert.deepEqual(undeclaredImports(source, { name: '@barocss/example' }), ['@barocss/shared', 'react/jsx-runtime', '@barocss/schema']);
  assert.deepEqual(undeclaredImports(source, { name: '@barocss/example', dependencies: { '@barocss/shared': '^1', '@barocss/schema': '^1' }, peerDependencies: { react: '>=18' } }), []);
});
