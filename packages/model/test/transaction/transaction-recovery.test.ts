import { describe, expect, it, vi } from 'vitest';
import { DataStore, type INode } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { HistoryManager, SelectionManager, type Editor, type ModelSelection } from '@barocss/editor-core';
import { TransactionManager } from '../../src/transaction';
import { transaction } from '../../src/transaction-dsl';
import { defineOperation } from '../../src/operations/define-operation';
import { setText } from '../../src/operations/setText';
import { batch } from '../../src/operations/batch';
import { addChild } from '../../src/operations/addChild';
import '../../src/operations/register-operations';

function fixture() {
  const schema = new Schema('recovery', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' }
    },
    marks: {}
  });
  const dataStore = new DataStore(undefined, schema);
  for (const node of [
    { sid: 'doc', stype: 'document', content: ['p'], attributes: {} },
    { sid: 'p', stype: 'paragraph', content: ['t'], parentId: 'doc', attributes: {} },
    { sid: 't', stype: 'inline-text', text: 'before', parentId: 'p', attributes: {} }
  ]) dataStore.setNode(node as INode, false);
  dataStore.setRootNodeId('doc');
  const selectionManager = new SelectionManager({ dataStore });
  selectionManager.setSelection({ type: 'range', startNodeId: 't', endNodeId: 't', startOffset: 1, endOffset: 1 });
  const historyManager = new HistoryManager({ coalesceMs: 0 });
  const extensions: { onTransaction?: () => void }[] = [];
  const editor = {
    dataStore, selectionManager, historyManager,
    get selection() { return selectionManager.getCurrentSelection(); },
    getActiveSchema: () => schema,
    getSortedExtensions: () => extensions,
    emit: vi.fn(),
    updateSelection: vi.fn((selection: ModelSelection | null) => selectionManager.setSelection(selection))
  };
  const editorInstance = editor as unknown as Editor;
  const manager = new TransactionManager(editorInstance);
  const observed = vi.fn();
  dataStore.onOperation(observed);
  return { dataStore, editor, editorInstance, manager, extensions, observed };
}

for (const kind of ['refusal', 'exception'] as const) {
  defineOperation(`recovery-${kind}`, async (_op, context) => {
    context.selection.setCaret('t', 3);
    if (kind === 'exception') throw new Error('Injected operation exception');
    return { ok: false, error: 'Injected operation refusal' };
  });
}

describe('transaction failure recovery', () => {
  it.each(['refusal', 'exception'])('restores state after a later operation %s and permits reuse', async (kind) => {
    const { dataStore, editor, manager, observed } = fixture();
    const before = structuredClone(dataStore.getAllNodes());
    const selection = structuredClone(editor.selection);
    const result = await manager.execute([
      setText('t', 'partial'),
      addChild('p', { stype: 'inline-text', text: 'new', attributes: {} } as INode),
      { type: `recovery-${kind}` }
    ]);
    expect(result.success).toBe(false);
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(result.selectionAfter).toEqual(selection);
    expect(editor.historyManager.getHistory()).toHaveLength(0);
    expect(dataStore.isTransactionActive()).toBe(false);
    expect(dataStore.isLocked()).toBe(false);
    expect(observed).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
    expect(await manager.execute([setText('t', 'next')])).toMatchObject({ success: true, committed: true });
    expect(dataStore.getNode('t')?.text).toBe('next');
    const undo = editor.historyManager.undo();
    expect(undo).not.toBeNull();
    manager._isUndoRedoOperation = true;
    expect((await manager.execute(undo!.inverseOperations)).success).toBe(true);
    expect(dataStore.getAllNodes()).toEqual(before);
  });

  it('cleans up after schema refusal for the same manager and a fresh DSL manager', async () => {
    const { dataStore, editor, editorInstance, manager, observed } = fixture();
    const before = structuredClone(dataStore.getAllNodes());
    const invalid = () => addChild('p', { stype: 'paragraph', content: [], attributes: {} } as INode);
    expect((await manager.execute([invalid()])).success).toBe(false);
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(observed).not.toHaveBeenCalled();
    expect(await manager.execute([setText('t', 'same')])).toMatchObject({ success: true, committed: true });
    expect((await manager.execute([invalid()])).success).toBe(false);
    expect(await transaction(editorInstance, [setText('t', 'fresh')]).commit()).toMatchObject({ success: true, committed: true });
    expect(dataStore.getNode('t')?.text).toBe('fresh');
    expect(editor.historyManager.getHistory()).toHaveLength(2);
  });

  it.each(['hook', 'event', 'history', 'lock release'])('reports a %s failure after commit without rolling back or stopping later effects', async (stage) => {
    const { dataStore, editor, manager, extensions } = fixture();
    const laterHook = vi.fn();
    extensions.push({ onTransaction: () => { if (stage === 'hook') throw new Error('hook failed'); } }, { onTransaction: laterHook });
    if (stage === 'event') editor.emit.mockImplementationOnce(() => { throw new Error('event failed'); });
    if (stage === 'history') vi.spyOn(editor.historyManager, 'push').mockImplementationOnce(() => { throw new Error('history failed'); });
    if (stage === 'lock release') {
      const release = dataStore.releaseLock.bind(dataStore);
      vi.spyOn(dataStore, 'releaseLock').mockImplementationOnce((lockId) => {
        release(lockId);
        throw new Error('lock release failed');
      });
    }
    const rollback = vi.spyOn(dataStore, 'rollback');
    const result = await manager.execute([setText('t', 'committed')]);
    expect(result).toMatchObject({ success: true, committed: true, errors: [], postCommitErrors: [expect.stringContaining(`${stage} failed`)] });
    expect(dataStore.getNode('t')?.text).toBe('committed');
    expect(rollback).not.toHaveBeenCalled();
    expect(laterHook).toHaveBeenCalledOnce();
    expect(editor.updateSelection).toHaveBeenCalled();
    expect(dataStore.isLocked()).toBe(false);
    if (stage !== 'history') expect(editor.historyManager.getHistory()).toHaveLength(1);
    expect((await manager.execute([setText('t', 'next')])).success).toBe(true);
  });

  it('does not discard another transaction when lock acquisition fails', async () => {
    const { dataStore, manager } = fixture();
    dataStore.begin();
    dataStore.updateNode('t', { text: 'owned elsewhere' }, false);
    vi.spyOn(dataStore, 'acquireLock').mockRejectedValueOnce(new Error('lock unavailable'));
    expect((await manager.execute([setText('t', 'wrong')])).success).toBe(false);
    expect(dataStore.isTransactionActive()).toBe(true);
    expect(dataStore.getNode('t')?.text).toBe('owned elsewhere');
    dataStore.rollback();
  });

  it('rolls back a batch even when its completed step has no inverse', async () => {
    const { dataStore, manager, observed } = fixture();
    defineOperation('recovery-no-inverse', async (_op, context) => {
      context.dataStore.updateNode('t', { text: 'no inverse' }, false);
      return { ok: true };
    });
    const before = structuredClone(dataStore.getAllNodes());
    const result = await manager.execute([batch([{ type: 'recovery-no-inverse' }, { type: 'recovery-refusal' }])]);
    expect(result).toMatchObject({ success: false, committed: false });
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(observed).not.toHaveBeenCalled();
    expect(dataStore.isLocked()).toBe(false);
  });

  it('publishes committed operations only after the overlay closes', async () => {
    const { dataStore, manager } = fixture();
    const states: boolean[] = [];
    dataStore.onOperation(() => states.push(dataStore.isTransactionActive()));
    expect((await manager.execute([setText('t', 'committed')])).success).toBe(true);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every(active => !active)).toBe(true);
  });
});
