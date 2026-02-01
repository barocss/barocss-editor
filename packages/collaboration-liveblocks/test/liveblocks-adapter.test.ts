import { describe, it, expect } from 'vitest';
import { LiveblocksAdapter } from '../src/liveblocks-adapter';

describe('LiveblocksAdapter', () => {
  it('can be constructed with room', () => {
    const room = {};
    const adapter = new LiveblocksAdapter({ room });
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  it('accepts config with clientId', () => {
    const room = {};
    const adapter = new LiveblocksAdapter({
      room,
      config: { clientId: 'test-client' }
    });
    expect(adapter.isConnected()).toBe(false);
  });
});
