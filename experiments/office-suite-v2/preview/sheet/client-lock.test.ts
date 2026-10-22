import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireClientWriter } from './client-lock.ts';
import type { ClientLockManager } from './client-lock.ts';

function lockModel(): ClientLockManager {
  const owners = new Set<string>();
  return { request: async (name, _options, callback) => {
    if (owners.has(name)) return callback(null);
    owners.add(name);
    try { return await callback({}); } finally { owners.delete(name); }
  } };
}
test('one client writer excludes another until explicit release; different clients remain independent', async () => {
  const manager = lockModel();
  const first = await acquireClientWriter('client-a', manager);
  await assert.rejects(acquireClientWriter('client-a', manager), /already open/);
  const other = await acquireClientWriter('client-b', manager);
  other.release(); first.release(); first.release();
  await new Promise(resolve => setTimeout(resolve, 0));
  const reopened = await acquireClientWriter('client-a', manager);
  reopened.release();
});
test('invalid identity and locking backend failures refuse before acquiring a writer', async () => {
  await assert.rejects(acquireClientWriter('bad/client', lockModel()), /Invalid client/);
  const denied: ClientLockManager = { request: async () => { throw new Error('Lock backend failed'); } };
  await assert.rejects(acquireClientWriter('client', denied), /Lock backend failed/);
});
