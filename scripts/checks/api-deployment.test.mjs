import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentLock } from '../backend/deployment-lock.mjs';

const fixture = () => ({
  lockfileVersion: '6.0',
  settings: { autoInstallPeers: true },
  importers: {
    '.': { dependencies: { playwright: { version: '1.58.0' } } },
    'apps/office-api': { dependencies: { fastify: { specifier: '5.12.5', version: '5.12.5' } } },
  },
  packages: { '/fastify@5.12.5': { resolution: { integrity: 'recorded-integrity' } } },
});
test('standalone install excludes root dependencies and preserves exact package resolutions', () => {
  const original = fixture();
  const before = structuredClone(original);
  const result = deploymentLock(original, 'apps/office-api');
  assert.deepEqual(Object.keys(result.importers), ['.']);
  assert.equal(result.importers['.'].dependencies.playwright, undefined);
  assert.deepEqual(result.importers['.'], original.importers['apps/office-api']);
  assert.deepEqual(result.packages, original.packages);
  assert.deepEqual(original, before);
});
test('packaging refuses incompatible locks and unresolved workspace dependencies', () => {
  assert.throws(() => deploymentLock({ ...fixture(), lockfileVersion: '9.0' }, 'apps/office-api'));
  assert.throws(() => deploymentLock(fixture(), 'missing-app'));
  const lock = fixture();
  lock.importers['apps/office-api'].dependencies.fastify.version = 'link:../../packages/service';
  assert.throws(() => deploymentLock(lock, 'apps/office-api'), /explicit deployment/);
});
