import { describe, it, expect } from 'vitest';
import { BaseAdapter } from '../src/base-adapter';
import { DataStore, type AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';

/** Minimal concrete adapter for testing BaseAdapter behavior */
class TestAdapter extends BaseAdapter {
  readonly sent: AtomicOperation[] = [];
  protected async doConnect(): Promise<void> {}
  protected async doDisconnect(): Promise<void> {}
  protected async doSendOperation(operation: AtomicOperation): Promise<void> { this.sent.push(operation); }
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


describe('committed local changes', () => {
  it('does not send discarded edits and resumes sending on the next commit', async () => {
    const store = new DataStore();
    store.setNode({ sid: 't', stype: 'inline-text', text: 'before', attributes: {} }, false);
    const adapter = new TestAdapter();
    await adapter.connect(store);
    store.begin();
    store.updateNode('t', { text: 'rejected' }, false);
    store.end();
    expect(adapter.sent).toEqual([]);
    store.rollback();
    expect(adapter.sent).toEqual([]);
    store.begin();
    store.updateNode('t', { text: 'accepted' }, false);
    store.end();
    expect(adapter.sent).toEqual([]);
    store.commit();
    expect(adapter.sent.map(op => op.data?.text)).toEqual(['accepted']);
    await adapter.disconnect();
  });
});
