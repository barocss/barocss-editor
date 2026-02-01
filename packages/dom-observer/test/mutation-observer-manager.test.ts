import { describe, it, expect } from 'vitest';
import { MutationObserverManagerImpl } from '../src/mutation-observer-manager';

describe('MutationObserverManagerImpl', () => {
  it('instantiates and exposes setup/disconnect', () => {
    const manager = new MutationObserverManagerImpl();
    expect(manager.setup).toBeDefined();
    expect(typeof manager.setup).toBe('function');
    expect(manager.disconnect).toBeDefined();
    expect(typeof manager.disconnect).toBe('function');
    expect(manager.handleMutation).toBeDefined();
    expect(typeof manager.handleMutation).toBe('function');
  });
});
