import { expect, it } from 'vitest';
import { createCommandSettlement } from '../src/command-settlement';
const deferred = () => {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
it('keeps the caller Promise and waits commands started while draining', async () => {
  const boundary = createCommandSettlement(() => 'owner'), first = deferred(), second = deferred();
  expect(boundary.track(first.promise)).toBe(first.promise);
  let done = false;
  const result = boundary.settle(() => true).then(value => { done = true; return value; });
  boundary.track(second.promise);
  first.resolve(true);
  await first.promise;
  expect(done).toBe(false);
  second.resolve(true);
  expect(await result).toBe(true);
});
it('preserves rejection and refuses repeated settlement until the native owner changes', async () => {
  let owner = 'a';
  const boundary = createCommandSettlement(() => owner), failed = deferred(), error = new Error('native failed');
  const result = boundary.track(failed.promise);
  const rejected = expect(result).rejects.toBe(error);
  failed.reject(error);
  await rejected;
  expect(await boundary.settle(() => true)).toBe(false);
  expect(await boundary.settle(() => true)).toBe(false);
  owner = 'b';
  expect(await boundary.settle(() => true)).toBe(true);
});
it('preserves refusal without latching it, and refuses disposed owners or stale intent', async () => {
  let owner: string | undefined = 'a';
  const boundary = createCommandSettlement(() => owner);
  expect(await boundary.track(Promise.resolve(false))).toBe(false);
  expect(await boundary.settle(() => true)).toBe(true);
  owner = 'b';
  expect(await boundary.settle(() => false)).toBe(false);
  owner = undefined;
  expect(await boundary.settle(() => true)).toBe(false);
});
it('refuses a replaced owner after waiting and does not poison the replacement with an old failure', async () => {
  let owner = 'a';
  const boundary = createCommandSettlement(() => owner), held = deferred();
  boundary.track(held.promise);
  const result = boundary.settle(() => true);
  owner = 'b'; held.reject(new Error('retired command'));
  expect(await result).toBe(false);
  expect(await boundary.settle(() => true)).toBe(true);
});

it('permits explicit recovery only for the exact settled failure and current owner', async () => {
  let owner = 'a';
  const boundary = createCommandSettlement(() => owner), first = new Error('first');
  boundary.fail(first);
  const recovery = boundary.failure()!;
  expect(recovery.error).toBe(first);
  const held = deferred(); boundary.track(held.promise);
  expect(recovery.acknowledge(() => true)).toBe(false);
  held.resolve(true); await boundary.settle(() => true);
  expect(recovery.acknowledge(() => false)).toBe(false);
  boundary.fail(new Error('second'));
  expect(recovery.acknowledge(() => true)).toBe(false);
  const latest = boundary.failure()!;
  expect(latest.acknowledge(() => true)).toBe(true);
  expect(await boundary.settle(() => true)).toBe(true);
  boundary.fail(first);
  const stale = boundary.failure()!; owner = 'b';
  expect(stale.acknowledge(() => true)).toBe(false);
});
