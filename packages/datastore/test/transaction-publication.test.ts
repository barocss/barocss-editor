import { describe, expect, it, vi } from 'vitest';
import { DataStore } from '../src/data-store';

describe('transaction publication and recovery', () => {
  it('publishes nothing when applying buffered operations fails part way', () => {
    const store = new DataStore();
    store.setNode({ sid: 'old', stype: 'paragraph', attributes: {}, text: 'before' }, false);
    const before = structuredClone(store.getAllNodes());
    const observed = vi.fn();
    store.onOperation(observed);
    store.begin();
    store.setNode({ sid: 'new', stype: 'paragraph', attributes: {} }, false);
    store.updateNode('old', { text: 'after' }, false);
    const set = store.getNodes().set.bind(store.getNodes());
    vi.spyOn(store.getNodes(), 'set')
      .mockImplementationOnce(set)
      .mockImplementationOnce(() => { throw new Error('commit write failed'); });
    expect(() => store.commit()).toThrow('commit write failed');
    expect(store.getAllNodes()).toEqual(before);
    expect(store.isTransactionActive()).toBe(false);
    expect(observed).not.toHaveBeenCalled();
  });

  it('retains deleted nodes if a later delete fails during commit', () => {
    const store = new DataStore();
    for (const sid of ['one', 'two']) store.setNode({ sid, stype: 'paragraph', attributes: {} }, false);
    const before = structuredClone(store.getAllNodes());
    store.begin();
    store.deleteNode('one');
    store.deleteNode('two');
    const remove = store.getNodes().delete.bind(store.getNodes());
    vi.spyOn(store.getNodes(), 'delete')
      .mockImplementationOnce(remove)
      .mockImplementationOnce(() => { throw new Error('delete failed'); });
    expect(() => store.commit()).toThrow('delete failed');
    expect(store.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!))).toEqual(before);
    expect(store.isTransactionActive()).toBe(false);
  });

  it('keeps non-transaction writes immediate and transaction notifications in execution order', () => {
    const store = new DataStore();
    const observed = vi.fn();
    store.onOperation(observed);
    store.setNode({ sid: 't', stype: 'inline-text', text: 'a', attributes: {} }, false);
    expect(observed).toHaveBeenCalledOnce();
    observed.mockClear();
    store.begin();
    store.updateNode('t', { text: 'b' }, false);
    store.updateNode('t', { text: 'c' }, false);
    store.end();
    expect(observed).not.toHaveBeenCalled();
    store.commit();
    expect(observed.mock.calls.map(([op]) => op.data.text)).toEqual(['b', 'c']);
  });
});
