import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMutationObserverManager } from '../src/mutation-observer-manager';

describe('createMutationObserverManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setup() observes the given element and invokes callback with batched mutations', async () => {
    const onMutations = vi.fn();
    const manager = createMutationObserverManager(onMutations);

    const el = document.createElement('div');
    document.body.appendChild(el);

    manager.setup(el);

    const text = document.createTextNode('hello');
    el.appendChild(text);
    text.textContent = 'world';

    await new Promise((r) => setTimeout(r, 10));

    expect(onMutations).toHaveBeenCalledTimes(1);
    const mutations = onMutations.mock.calls[0][0] as MutationRecord[];
    expect(Array.isArray(mutations)).toBe(true);
    expect(mutations.length).toBeGreaterThanOrEqual(1);

    manager.disconnect();
    document.body.removeChild(el);
  });

  it('disconnect() stops observing and clears pending', async () => {
    const onMutations = vi.fn();
    const manager = createMutationObserverManager(onMutations);

    const el = document.createElement('div');
    document.body.appendChild(el);
    manager.setup(el);
    manager.disconnect();

    el.appendChild(document.createTextNode('x'));
    await new Promise((r) => setTimeout(r, 10));

    expect(onMutations).not.toHaveBeenCalled();
    document.body.removeChild(el);
  });
});
