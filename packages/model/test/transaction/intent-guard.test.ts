import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { op, transaction } from '../../src/transaction-dsl';
import { registerPreCommitGuard, registerPreExecutionGuard } from '../../src/transaction';
import { setText } from '../../src/operations/setText';
import '../../src/operations/register-operations';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });
function fixture() {
  const editor = new Editor({ schema: new Schema('intent-guard', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' }
    }, marks: {}
  }) });
  editors.push(editor);
  editor.loadDocument({ sid: 'doc', stype: 'document', content: [
    { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before' }] }
  ] });
  editor.updateSelection({ type: 'range', collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2 });
  return editor;
}
const snapshot = (editor: Editor) => structuredClone({
  nodes: editor.dataStore.getAllNodes(), selection: editor.selection,
  history: editor.historyManager.getHistory(), stats: editor.getHistoryStats()
});

it('refuses a retired intent after the lock without running host checks or operations', async () => {
  const editor = fixture(); let current = true; const before = snapshot(editor);
  const preExecution = vi.fn(); registerPreExecutionGuard(editor, preExecution);
  const host = vi.fn(); registerPreCommitGuard(editor, host);
  const operation = vi.fn();
  const lock = await editor.dataStore.acquireLock('held');
  const pending = transaction(editor, op(operation), { validateIntent: () => current ? undefined : 'retired' }).commit();
  current = false; editor.dataStore.releaseLock(lock);
  expect(await pending).toMatchObject({ success: false, committed: false, errors: ['retired'] });
  expect(operation).not.toHaveBeenCalled(); expect(preExecution).not.toHaveBeenCalled(); expect(host).not.toHaveBeenCalled();
  expect(snapshot(editor)).toEqual(before);
});

it('rechecks scope after an awaited pre-execution guard', async () => {
  const editor = fixture(); let current = true; const before = snapshot(editor);
  registerPreExecutionGuard(editor, async () => { await Promise.resolve(); current = false; });
  const operation = vi.fn();
  expect(await transaction(editor, op(operation), { validateIntent: () => current ? undefined : 'retired' }).commit())
    .toMatchObject({ success: false, committed: false, errors: ['retired'] });
  expect(operation).not.toHaveBeenCalled(); expect(snapshot(editor)).toEqual(before);
});

it('checks after preparation before a synchronous host can write its durable intent', async () => {
  const editor = fixture(); let current = true; const before = snapshot(editor);
  const host = vi.fn(); registerPreCommitGuard(editor, host);
  const result = await transaction(editor, [setText('t', 'candidate'), op(() => { current = false; })], {
    validateIntent: () => current ? undefined : 'retired'
  }).commit();
  expect(result).toMatchObject({ success: false, committed: false, errors: ['retired'] });
  expect(host).not.toHaveBeenCalled(); expect(snapshot(editor)).toEqual(before);
});

it('rechecks after an asynchronous host guard and preserves a rejected draft for clean retry', async () => {
  const editor = fixture(); let current = true; const before = snapshot(editor);
  const changed = vi.fn(); editor.on('editor:content.change', changed);
  const dispose = registerPreCommitGuard(editor, async () => { await Promise.resolve(); current = false; });
  const options = { validateIntent: () => current ? undefined : 'retired' };
  expect(await transaction(editor, [setText('t', 'candidate')], options).commit())
    .toMatchObject({ success: false, committed: false, errors: ['retired'] });
  expect(snapshot(editor)).toEqual(before); expect(changed).not.toHaveBeenCalled();
  dispose(); current = true;
  expect((await transaction(editor, [setText('t', 'candidate')], options).commit()).success).toBe(true);
  expect(editor.dataStore.getNode('t')?.text).toBe('candidate');
  expect(editor.historyManager.getHistory()).toHaveLength(1);
});

it('keeps a synchronous durable host decision and commit in the same turn', async () => {
  const editor = fixture(); let current = true; let committedWhenMicrotaskRan = false;
  registerPreCommitGuard(editor, () => {
    queueMicrotask(() => { current = false; committedWhenMicrotaskRan = editor.dataStore.getNode('t')?.text === 'accepted'; });
  });
  expect((await transaction(editor, [setText('t', 'accepted')], {
    validateIntent: () => current ? undefined : 'retired'
  }).commit()).success).toBe(true);
  expect(committedWhenMicrotaskRan).toBe(true);
  expect(editor.dataStore.getNode('t')?.text).toBe('accepted');
});

it('does not replace an existing host authority refusal', async () => {
  const editor = fixture(); const before = snapshot(editor);
  registerPreCommitGuard(editor, () => 'viewer cannot write');
  expect(await transaction(editor, [setText('t', 'denied')], { validateIntent: () => undefined }).commit())
    .toMatchObject({ success: false, committed: false, errors: ['viewer cannot write'] });
  expect(snapshot(editor)).toEqual(before);
});

it('rejects an accidentally asynchronous intent predicate without mutating state', async () => {
  const editor = fixture(); const before = snapshot(editor);
  const asynchronous = async () => undefined;
  expect(await transaction(editor, [setText('t', 'denied')], {
    validateIntent: asynchronous as unknown as () => string | void
  }).commit()).toMatchObject({ success: false, committed: false, errors: ['Transaction intent check must be synchronous'] });
  expect(snapshot(editor)).toEqual(before);
});
