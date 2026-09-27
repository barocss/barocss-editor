import { describe, expect, it, vi } from 'vitest';
import { type INode } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { registerPreCommitGuard, TransactionManager } from '../../src/transaction';
import { transaction, op } from '../../src/transaction-dsl';
import { setText } from '../../src/operations/setText';
import { addChild } from '../../src/operations/addChild';
import { splitBlockNode } from '../../src/operations/splitBlockNode';
import { paste } from '../../src/operations/paste';
import '../../src/operations/register-operations';

function fixture() {
  const schema = new Schema('guard', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline', marks: ['strong'] }
    },
    marks: { strong: { name: 'strong' } }
  });
  const editor = new Editor({ schema, history: { coalesceMs: 0 } });
  editor.loadDocument({ sid: 'doc', stype: 'document', content: [
    { sid: 'p', stype: 'paragraph', content: [
      { sid: 't', stype: 'inline-text', text: 'before' },
      { sid: 't2', stype: 'inline-text', text: 'after' }
    ] }
  ] });
  editor.updateSelection({ type: 'range', collapsed: true,
    startNodeId: 't', endNodeId: 't', startOffset: 1, endOffset: 1 });
  const dataStore = editor.dataStore;
  vi.spyOn(editor, 'emit');
  vi.spyOn(editor, 'updateSelection');
  const observed = vi.fn();
  dataStore.onOperation(observed);
  return { dataStore, editor, editorInstance: editor, observed };
}

const pasteRange = {
  type: 'range', collapsed: true, direction: 'forward',
  startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2
};

describe('pre-commit collaboration guard', () => {
  it('sees an overlay candidate and refuses a direct text edit without history, selection, or notifications', async () => {
    const { dataStore, editor, editorInstance, observed } = fixture();
    const before = structuredClone(dataStore.getAllNodes());
    const selection = structuredClone(editor.selection);
    const editRevision = dataStore.getEditRevision();
    const guard = vi.fn(({ operations, candidate }) => {
      expect(operations.map((operation: { type: string }) => operation.type)).toEqual(['setText']);
      expect(candidate.rootId).toBe('doc');
      expect(candidate.getNode('t')?.text).toBe('changed');
      return 'Only collaborative text deltas are allowed';
    });
    const dispose = registerPreCommitGuard(editorInstance, guard);
    const result = await new TransactionManager(editorInstance).execute([setText('t', 'changed')]);
    expect(result).toMatchObject({ success: false, committed: false, errors: ['Only collaborative text deltas are allowed'] });
    expect(guard).toHaveBeenCalledOnce();
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(editor.historyManager.getHistory()).toHaveLength(0);
    expect(editor.emit).not.toHaveBeenCalled();
    expect(editor.updateSelection).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
    // The datastore's internal counter is monotonic even for a rejected
    // overlay. A collaboration host must use commit/result events for saved
    // status and publication, never this counter alone.
    expect(dataStore.getEditRevision()).toBeGreaterThan(editRevision);
    dispose();
    expect((await transaction(editorInstance, [setText('t', 'normal')]).commit()).success).toBe(true);
    expect(dataStore.getNode('t')?.text).toBe('normal');
  });

  it.each([
    ['split/Enter', () => [splitBlockNode('p', 1)]],
    ['paste', () => [paste([{ stype: 'inline-text', text: 'pasted' } as INode], pasteRange)]],
    ['mark', () => [{ type: 'setMarks', payload: { nodeId: 't', marks: [{ stype: 'strong', range: [0, 2] }] } }]],
    ['structure', () => [addChild('doc', { stype: 'paragraph', content: [] } as INode)]]
  ])('rolls back a valid %s operation when the host refuses its candidate', async (_name, makeOperations) => {
    const { dataStore, editor, editorInstance, observed } = fixture();
    const before = structuredClone(dataStore.getAllNodes());
    const selection = structuredClone(editor.selection);
    const guard = vi.fn(({ operations, candidate }) => {
      expect(operations).toHaveLength(1);
      if (_name === 'structure') {
        const childIds = candidate.getNode('doc')?.content as string[];
        expect(childIds).toHaveLength(2);
        expect(candidate.getNode(childIds[1])?.stype).toBe('paragraph');
      }
      return 'unsupported collaborative edit';
    });
    registerPreCommitGuard(editorInstance, guard);
    const result = await transaction(editorInstance, makeOperations() as any).commit();
    expect(guard).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ success: false, committed: false, errors: ['unsupported collaborative edit'] });
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(editor.historyManager.getHistory()).toHaveLength(0);
    expect(editor.emit).not.toHaveBeenCalled();
    expect(editor.updateSelection).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
  });

  it('inspects an OpFunction candidate, even when no descriptor is returned', async () => {
    const { dataStore, editor, editorInstance, observed } = fixture();
    const before = structuredClone(dataStore.getAllNodes());
    const guard = vi.fn(({ operations, candidate }) => {
      expect(operations).toEqual([]);
      expect(candidate.getNode('t')?.text).toBe('from function');
      return 'unsupported function edit';
    });
    registerPreCommitGuard(editorInstance, guard);
    const result = await transaction(editorInstance, op((context) => {
      context.dataStore.updateNode('t', { text: 'from function' });
    })).commit();
    expect(result).toMatchObject({ success: false, committed: false });
    expect(guard).toHaveBeenCalledOnce();
    expect(dataStore.getAllNodes()).toEqual(before);
    expect(observed).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('intercepts both public editor transaction entry points', async () => {
    const editor = new Editor({ schema: new Schema('editor-guard', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    }) });
    editor.loadDocument({ stype: 'document', content: [
      { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before' }] }
    ] });
    const before = structuredClone(editor.dataStore.getAllNodes());
    const guard = vi.fn(() => 'host refusal');
    const contentChanged = vi.fn();
    editor.on('editor:content.change', contentChanged);
    registerPreCommitGuard(editor, guard);

    const direct = await editor.transaction([setText('t', 'direct')]).commit();
    const delegated = await editor.executeTransaction({ operations: [setText('t', 'delegated')] });
    editor.registerCommand({
      name: 'guarded-menu-action',
      canExecute: () => true,
      execute: async (target) => (await target.transaction([
        setText('t', 'menu')
      ]).commit()).success
    });
    const menu = await editor.executeCommand('guarded-menu-action');
    expect(direct).toMatchObject({ success: false, committed: false });
    expect(delegated).toMatchObject({ success: false, committed: false });
    expect(menu).toBe(false);
    expect(guard).toHaveBeenCalledTimes(3);
    expect(editor.dataStore.getAllNodes()).toEqual(before);
    expect(contentChanged).not.toHaveBeenCalled();
    editor.destroy();
  });

  it.each([
    ['undo', 'allow'], ['undo', 'deny'], ['undo', 'throw'],
    ['redo', 'allow'], ['redo', 'deny'], ['redo', 'throw']
  ] as const)('does not let queued %s disturb an in-flight %s guarded edit', async (direction, policyMode) => {
    const editor = new Editor({ schema: new Schema('history-race', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      }, marks: {}
    }), history: { coalesceMs: 0 } });
    editor.loadDocument({ stype: 'document', content: [
      { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before' }] }
    ] });
    expect((await editor.transaction([setText('t', 'accepted')]).commit()).success).toBe(true);
    if (direction === 'redo') expect(await editor.undo()).toBe(true);

    let entered!: () => void;
    const inGuard = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispose = registerPreCommitGuard(editor, async ({ candidate }) => {
      if (candidate.getNode('t')?.text === 'newer') {
        entered();
        await gate;
        if (policyMode === 'throw') throw new Error('edit guard unavailable');
        return policyMode === 'deny' ? 'edit denied' : undefined;
      }
      return 'history denied';
    });
    const edit = editor.transaction([setText('t', 'newer')]).commit();
    await inGuard;
    const replay = editor[direction]();
    release();
    const [editResult, replayResult] = await Promise.all([edit, replay]);
    expect(editResult).toMatchObject({ success: policyMode === 'allow', committed: policyMode === 'allow' });
    expect(replayResult).toBe(false);
    const expectedText = policyMode === 'allow' ? 'newer' : direction === 'undo' ? 'accepted' : 'before';
    const expectedIndex = policyMode === 'allow'
      ? direction === 'undo' ? 1 : 0
      : direction === 'undo' ? 0 : -1;
    expect(editor.dataStore.getNode('t')?.text).toBe(expectedText);
    expect(editor.historyManager.getStats()).toMatchObject({
      totalEntries: policyMode === 'allow' && direction === 'undo' ? 2 : 1,
      currentIndex: expectedIndex
    });

    dispose();
    if (policyMode === 'allow') {
      expect(await editor.undo()).toBe(true);
      expect(editor.dataStore.getNode('t')?.text).toBe(direction === 'undo' ? 'accepted' : 'before');
      expect(await editor.redo()).toBe(true);
      expect(editor.dataStore.getNode('t')?.text).toBe('newer');
    } else {
      expect(await editor[direction]()).toBe(true);
      expect(editor.dataStore.getNode('t')?.text).toBe(direction === 'undo' ? 'before' : 'accepted');
      expect(await editor[direction === 'undo' ? 'redo' : 'undo']()).toBe(true);
      expect(editor.dataStore.getNode('t')?.text).toBe(direction === 'undo' ? 'accepted' : 'before');
    }
    editor.destroy();
  });

  it('supports a host text policy and lets remote provenance use an explicit policy', async () => {
    const { dataStore, editor, editorInstance } = fixture();
    const guard = vi.fn(({ operations, provenance, candidate }) => {
      if (provenance.origin === 'remote') return;
      return operations.every((operation: { type: string }) => operation.type === 'setText') &&
        candidate.getNode('p')?.content?.length === 2 ? undefined : 'unsupported';
    });
    registerPreCommitGuard(editorInstance, guard);
    expect((await transaction(editorInstance, [setText('t', 'local')]).commit()).success).toBe(true);
    expect((await transaction(editorInstance, [setText('t', 'remote')], {
      provenance: { origin: 'remote', editId: 'r1', actorId: 'bob', sessionId: 'b' }
    }).commit()).success).toBe(true);
    expect(dataStore.getNode('t')?.text).toBe('remote');
    expect(editor.historyManager.getHistory()).toHaveLength(1);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(vi.mocked(editor.emit).mock.calls.filter(([name]) => name === 'editor:content.change')).toHaveLength(2);
  });

  it('fails closed if the policy throws and keeps normal behavior when no policy is installed', async () => {
    const { dataStore, editor, editorInstance } = fixture();
    const dispose = registerPreCommitGuard(editorInstance, () => { throw new Error('policy unavailable'); });
    const denied = await transaction(editorInstance, [setText('t', 'denied')]).commit();
    expect(denied).toMatchObject({ success: false, committed: false, errors: ['policy unavailable'] });
    expect(dataStore.getNode('t')?.text).toBe('before');
    dispose();
    const accepted = await transaction(editorInstance, [setText('t', 'accepted')]).commit();
    expect(accepted).toMatchObject({ success: true, committed: true });
    expect(dataStore.getNode('t')?.text).toBe('accepted');
    expect(vi.mocked(editor.emit).mock.calls.filter(([name]) => name === 'editor:content.change')).toHaveLength(1);
  });

  it('retains a successful guarded commit when a post-commit listener fails', async () => {
    const { dataStore, editor, editorInstance } = fixture();
    registerPreCommitGuard(editorInstance, () => {});
    editor.emit.mockImplementationOnce(() => { throw new Error('listener down'); });
    const result = await transaction(editorInstance, [setText('t', 'committed')]).commit();
    expect(result).toMatchObject({ success: true, committed: true,
      postCommitErrors: [expect.stringContaining('listener down')] });
    expect(dataStore.getNode('t')?.text).toBe('committed');
    expect(editor.historyManager.getHistory()).toHaveLength(1);
  });

  it.each([
    ['undo', 'refusal'], ['undo', 'throw'],
    ['redo', 'refusal'], ['redo', 'throw']
  ] as const)('preserves public %s availability on host %s', async (direction, policyMode) => {
    const editor = new Editor({ schema: new Schema('history-guard', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      }, marks: {}
    }), history: { coalesceMs: 0 } });
    editor.loadDocument({ stype: 'document', content: [
      { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before' }] }
    ] });
    editor.updateSelection({ type: 'range', collapsed: true,
      startNodeId: 't', endNodeId: 't', startOffset: 1, endOffset: 1 });
    expect((await editor.transaction([setText('t', 'accepted')]).commit()).success).toBe(true);
    if (direction === 'redo') expect(await editor.undo()).toBe(true);
    const beforeTree = structuredClone(editor.dataStore.getAllNodes());
    const beforeSelection = structuredClone(editor.selection);
    const beforeStats = editor.historyManager.getStats();
    const changed = vi.fn();
    editor.on('editor:content.change', changed);
    const dispose = registerPreCommitGuard(editor, () => {
      if (policyMode === 'throw') throw new Error('policy unavailable');
      return 'history denied';
    });
    expect(await editor[direction]()).toBe(false);
    expect(editor.historyManager.getStats()).toEqual(beforeStats);
    expect(editor.dataStore.getAllNodes()).toEqual(beforeTree);
    expect(editor.selection).toEqual(beforeSelection);
    expect(changed).not.toHaveBeenCalled();
    dispose();
    expect(await editor[direction]()).toBe(true);
    editor.destroy();
  });
});
