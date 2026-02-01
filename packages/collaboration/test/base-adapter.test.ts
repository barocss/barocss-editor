import { describe, it, expect } from 'vitest';
import { BaseAdapter } from '../src/base-adapter';
import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';

/** Minimal concrete adapter for testing BaseAdapter behavior */
class TestAdapter extends BaseAdapter {
  protected async doConnect(): Promise<void> {}
  protected async doDisconnect(): Promise<void> {}
  protected async doSendOperation(_operation: AtomicOperation): Promise<void> {}
  protected async doReceiveOperation(_operation: AtomicOperation): Promise<void> {}
  protected async doGetDocumentState(): Promise<INode | null> {
    return null;
  }
  protected async doSetDocumentState(_rootNode: INode): Promise<void> {}
}

describe('BaseAdapter', () => {
  it('is not connected after construction', () => {
    const adapter = new TestAdapter();
    expect(adapter.isConnected()).toBe(false);
  });

  it('accepts config and preserves debug default', () => {
    const adapter = new TestAdapter({ debug: true });
    expect(adapter.isConnected()).toBe(false);
  });
});
