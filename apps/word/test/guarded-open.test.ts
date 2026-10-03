import { describe, expect, it, vi } from 'vitest';
import { createWordOpenGate } from '../src/guarded-open';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const epoch = { value: 1 };
  const original = epoch.value;
  const native = { id: 'A', text: 'last native input' };
  const prepare = vi.fn(async () => true);
  const load = vi.fn(async () => ({ id: 'B', text: 'authorized native B' }));
  const commit = vi.fn((loaded: typeof native) => { Object.assign(native, loaded); return true; });
  return { epoch, native, request: { currentId: 'A', targetId: 'B', isCurrent: () => epoch.value === original, prepare, load, commit, same: () => true }, prepare, load, commit };
}

describe('guarded Word original opening', () => {
  it('retains the same original without preparation, loading or native replacement', async () => {
    const one = fixture();
    expect(await createWordOpenGate()({ ...one.request, targetId: 'A' })).toBe(true);
    expect(one.prepare).not.toHaveBeenCalled(); expect(one.load).not.toHaveBeenCalled(); expect(one.commit).not.toHaveBeenCalled();
    expect(one.native).toEqual({ id: 'A', text: 'last native input' });
  });
  it('refuses a retired registration even for the same identity', async () => {
    const one = fixture(); one.epoch.value++;
    expect(await createWordOpenGate()({ ...one.request, targetId: 'A' })).toBe(false);
    expect(one.commit).not.toHaveBeenCalled();
  });
  it('awaits deepest preparation before reading and installing the requested original', async () => {
    const one = fixture(), held = deferred<boolean>(); one.prepare.mockImplementation(() => held.promise);
    const pending = createWordOpenGate()(one.request);
    expect(one.load).not.toHaveBeenCalled(); expect(one.native.id).toBe('A');
    held.resolve(true); expect(await pending).toBe(true);
    expect(one.native).toEqual({ id: 'B', text: 'authorized native B' });
    expect(one.commit).toHaveBeenCalledTimes(1);
  });
  it.each(['refused', 'rejected'])('retains the old native input when preparation is %s', async failure => {
    const one = fixture(); one.prepare.mockImplementation(async () => { if (failure === 'rejected') throw new Error('unprotected draft'); return false; });
    expect(await createWordOpenGate()(one.request)).toBe(false);
    expect(one.load).not.toHaveBeenCalled(); expect(one.native.text).toBe('last native input');
  });
  it('refuses changed root/authority lifetime during preparation', async () => {
    const one = fixture(), held = deferred<boolean>(); one.prepare.mockImplementation(() => held.promise);
    const pending = createWordOpenGate()(one.request); one.epoch.value++; held.resolve(true);
    expect(await pending).toBe(false); expect(one.load).not.toHaveBeenCalled();
  });
  it('does not revive an A-B-A identity after the original lifetime retires', async () => {
    const one = fixture(), held = deferred<{ id: string; text: string }>(); one.load.mockImplementation(() => held.promise);
    const pending = createWordOpenGate()(one.request); await Promise.resolve();
    one.native.id = 'B'; one.epoch.value++; one.native.id = 'A'; one.epoch.value++;
    held.resolve({ id: 'B', text: 'stale B response' });
    expect(await pending).toBe(false); expect(one.commit).not.toHaveBeenCalled(); expect(one.native.text).toBe('last native input');
  });
  it('serializes duplicate opens and releases the lock after a rejected target read', async () => {
    const one = fixture(), held = deferred<boolean>(), gate = createWordOpenGate(); one.prepare.mockImplementation(() => held.promise);
    const first = gate(one.request); expect(await gate(one.request)).toBe(false);
    one.load.mockRejectedValueOnce(new Error('denied')); held.resolve(true);
    expect(await first).toBe(false); expect(one.commit).not.toHaveBeenCalled();
    expect(await gate(one.request)).toBe(true); expect(one.commit).toHaveBeenCalledTimes(1);
  });
  it('waits for native installation and returns its exact witness rather than a fresh capture', async () => {
    const one = fixture(), installed = deferred<{ generation: number }>(), gate = createWordOpenGate();
    const witness = { generation: 3 };
    const request = { ...one.request, same: () => witness, commit: () => installed.promise };
    const pending = gate(request);
    await Promise.resolve(); await Promise.resolve();
    expect(await gate(request)).toBe(false);
    installed.resolve(witness);
    expect(await pending).toBe(witness);
  });
  it('does not install a loaded target if authority retires during the target read', async () => {
    const one = fixture(), held = deferred<{ id: string; text: string }>();
    one.load.mockImplementation(() => held.promise);
    const pending = createWordOpenGate()(one.request); await Promise.resolve();
    one.epoch.value++; held.resolve({ id: 'B', text: 'new target' });
    expect(await pending).toBe(false); expect(one.commit).not.toHaveBeenCalled();
    expect(one.native).toEqual({ id: 'A', text: 'last native input' });
  });

});
