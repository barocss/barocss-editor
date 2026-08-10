import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionManager } from '../src/transaction';

/**
 * What happens to the caret when the text under it is deleted.
 *
 * Nothing used to. The selection went on naming a node the transaction had
 * removed, and everyone listening for the change was handed it: a toolbar
 * asking which of its commands could run walked from a removed node to a live
 * one, the store rightly refused to order two nodes in different trees, and the
 * throw came out of a React render and unmounted the editor.
 *
 * So it is answered before anyone is told. Dropped rather than moved: where a
 * caret belongs after its text is gone is the deleting operation's business,
 * and the operations that know say so. This is for the case nobody answered.
 */
const editorWith = (nodes: Record<string, unknown>) => {
  let selection: any = null;
  const emitted: string[] = [];
  const editor: any = {
    get selection() {
      return selection;
    },
    updateSelection: (next: any) => {
      selection = next;
    },
    emit: (name: string) => emitted.push(name),
    getSortedExtensions: () => []
  };
  const store: any = {
    getNode: (sid: string) => (nodes as any)[sid],
    getActiveSchema: () => ({}),
    acquireLock: async () => 'lock',
    releaseLock: async () => {}
  };
  editor.dataStore = store;
  return { editor, store, emitted, setSelection: (s: any) => (selection = s), read: () => selection };
};

const caret = (sid: string) =>
  ({ type: 'range', startNodeId: sid, startOffset: 0, endNodeId: sid, endOffset: 0, collapsed: true });

describe('a selection whose node the transaction removed', () => {
  let harness: ReturnType<typeof editorWith>;
  let manager: any;

  beforeEach(() => {
    harness = editorWith({ alive: { sid: 'alive', text: 'here' } });
    manager = new TransactionManager(harness.editor);
  });

  it('is dropped, because a caret in deleted text is not a position', () => {
    harness.setSelection(caret('gone'));
    manager['_clearDanglingSelection']();
    expect(harness.read()).toBeNull();
  });

  it('is left alone while its nodes are still there', () => {
    const selection = caret('alive');
    harness.setSelection(selection);
    manager['_clearDanglingSelection']();
    expect(harness.read()).toBe(selection);
  });

  it('is dropped when only one end of it is gone', () => {
    // Half a selection is not half valid: a range from a removed node to a live
    // one is what the store cannot order at all.
    harness.setSelection({ ...caret('alive'), endNodeId: 'gone' });
    manager['_clearDanglingSelection']();
    expect(harness.read()).toBeNull();
  });

  it('has nothing to say when there is no selection', () => {
    harness.setSelection(null);
    expect(() => manager['_clearDanglingSelection']()).not.toThrow();
    expect(harness.read()).toBeNull();
  });
});
