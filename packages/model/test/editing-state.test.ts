import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('imports without request entropy and retains stable, distinct editing identities once used', async () => {
  let inRequest = false;
  const getRandomValues = vi.fn((array: Uint32Array) => {
    if (!inRequest) throw new Error('Disallowed operation called within global scope');
    return webcrypto.getRandomValues(array);
  });
  vi.stubGlobal('crypto', { getRandomValues });
  vi.resetModules();
  const firstSession = await import('../src/editing/state');
  expect(getRandomValues).not.toHaveBeenCalled();
  inRequest = true;
  const object = {}, other = {};
  const id = firstSession.identity(object);
  expect(firstSession.identity(object)).toBe(id);
  expect(firstSession.identity(other)).not.toBe(id);
  expect(getRandomValues).toHaveBeenCalledTimes(1);
  // Independent editing sessions still receive different identities, even for the same object.
  inRequest = false;
  vi.resetModules();
  const secondSession = await import('../src/editing/state');
  expect(getRandomValues).toHaveBeenCalledTimes(1);
  inRequest = true;
  expect(secondSession.identity(object)).not.toBe(id);
  expect(getRandomValues).toHaveBeenCalledTimes(2);
});
