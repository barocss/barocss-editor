import { describe, it, expect } from 'vitest';
import { YjsAdapter } from '../src/yjs-adapter';

describe('YjsAdapter', () => {
  it('can be constructed with ydoc and optional ymap', () => {
    const ydoc = { getMap: (name: string) => ({ _name: name }) };
    const adapter = new YjsAdapter({ ydoc });
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  it('accepts config with clientId', () => {
    const ydoc = { getMap: () => ({}) };
    const adapter = new YjsAdapter({
      ydoc,
      config: { clientId: 'test-client' }
    });
    expect(adapter.isConnected()).toBe(false);
  });
});
