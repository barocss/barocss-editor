// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { transaction } from '../../src/transaction-dsl';
import { insertText } from '../../src/operations/insertText';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { TransactionResult } from '../../src/transaction';
import '../../src/operations/register-operations';

const editors: Editor[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const editor of editors.splice(0)) editor.destroy();
});

function state(editor: Editor) {
  return {
    document: structuredClone(editor.exportDocument()),
    selection: structuredClone(editor.selection),
    history: structuredClone(editor.historyManager.getHistory()),
    stats: editor.getHistoryStats(),
    canUndo: editor.canUndo(),
    canRedo: editor.canRedo(),
  };
}

async function fixture(options: { nullSelection?: boolean; preserveSelectionInHistory?: boolean } = {}) {
  const schema = new Schema('replay-history', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: {},
  });
  const afterTransaction = vi.fn();
  const editor = new Editor({ schema, extensions: [{ name: 'replay-observer', onTransaction: afterTransaction }] });
  editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [
    { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before', marks: [] }] },
  ] });
  editor.updateSelection(options.nullSelection ? null : { type: 'range', collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 6, endOffset: 6 });
  const before = state(editor);
  expect(await transaction(editor, [insertText('t', 6, '!')], { preserveSelectionInHistory: options.preserveSelectionInHistory }).commit()).toMatchObject({ success: true, committed: true });
  const after = state(editor);
  expect(editor.dataStore.getNode('t')?.text).toBe('before!');
  expect(after.stats.totalEntries).toBe(1);
  afterTransaction.mockClear();
  return { editor, before, after, afterTransaction };
}

describe('history replay failure recovery', () => {
  for (const direction of ['undo', 'redo'] as const) {
    for (const failure of ['throw', 'refusal'] as const) {
      it(`keeps history and editor state when ${direction} writes and then returns ${failure}`, async () => {
        const { editor, before, after } = await fixture();
        if (direction === 'redo') expect(await editor.undo()).toBe(true);
        const unchanged = state(editor);
        const definition = globalOperationRegistry.get(direction === 'undo' ? 'deleteTextRange' : 'insertText');
        if (!definition) throw new Error('Replay operation is not registered');
        const execute = definition.execute.bind(definition);
        let textAfterWrite: string | undefined;
        let overlayWasActive = false;
        const operation = vi.spyOn(definition, 'execute').mockImplementationOnce(async (value, context) => {
          await execute(value, context);
          // Inject only after the actual operation changed its transaction overlay.
          textAfterWrite = context.dataStore.getNode('t')?.text;
          overlayWasActive = context.dataStore.isTransactionActive();
          if (failure === 'throw') throw new Error('Injected replay operation failure after write');
          return { ok: false };
        });

        expect(await editor[direction]()).toBe(false);
        expect(operation).toHaveBeenCalledOnce();
        expect(overlayWasActive).toBe(true);
        expect(textAfterWrite).toBe(direction === 'undo' ? 'before' : 'before!');
        expect(state(editor)).toEqual(unchanged);
        expect(editor.dataStore.isTransactionActive()).toBe(false);
        expect(editor.dataStore.isLocked()).toBe(false);
        operation.mockRestore();

        expect(await editor[direction]()).toBe(true);
        expect(editor.exportDocument()).toEqual(direction === 'undo' ? before.document : after.document);
        expect(editor.selection).toEqual(direction === 'undo' ? before.selection : after.selection);
        expect(editor.getHistoryStats().currentIndex).toBe(direction === 'undo' ? -1 : 0);
        expect(await editor[direction === 'undo' ? 'redo' : 'undo']()).toBe(true);
        expect(state(editor)).toEqual(unchanged);
      });
    }

    for (const stage of ['after hook', 'selection notification'] as const) {
      it(`finishes ${direction} and advances history when its committed ${stage} throws`, async () => {
        const { editor, before, after, afterTransaction } = await fixture();
        if (direction === 'redo') expect(await editor.undo()).toBe(true);
        const published: TransactionResult[] = [];
        editor.on('editor:content.change', (event: { transaction?: TransactionResult }) => {
          // Keep the published result: later post-commit effects append their errors to it.
          if (event.transaction) published.push(event.transaction);
        });
        const rollback = vi.spyOn(editor.dataStore, 'rollback');
        let textAtFailure: string | undefined;
        let overlayAtFailure: boolean | undefined;
        const failAfterCommit = () => {
          textAtFailure = editor.dataStore.getNode('t')?.text;
          overlayAtFailure = editor.dataStore.isTransactionActive();
          throw new Error(`Injected committed ${stage} failure`);
        };
        if (stage === 'after hook') {
          afterTransaction.mockImplementationOnce(failAfterCommit);
        } else {
          const updateSelection = editor.updateSelection.bind(editor);
          vi.spyOn(editor, 'updateSelection').mockImplementationOnce((...args) => {
            updateSelection(...args);
            failAfterCommit();
          });
        }

        const success = await editor[direction]();
        expect(published).toHaveLength(1);
        expect(published[0]).toMatchObject({ success: true, committed: true,
          postCommitErrors: [expect.stringContaining(`Injected committed ${stage} failure`)] });
        expect(overlayAtFailure).toBe(false);
        expect(textAtFailure).toBe(direction === 'undo' ? 'before' : 'before!');
        expect(success).toBe(true);
        expect(rollback).not.toHaveBeenCalled();
        expect(editor.exportDocument()).toEqual(direction === 'undo' ? before.document : after.document);
        expect(editor.selection).toEqual(direction === 'undo' ? before.selection : after.selection);
        expect(editor.getHistoryStats()).toMatchObject({ totalEntries: 1, currentIndex: direction === 'undo' ? -1 : 0 });
        expect(editor.canUndo()).toBe(direction === 'redo');
        expect(editor.canRedo()).toBe(direction === 'undo');
        expect(editor.dataStore.isLocked()).toBe(false);

        expect(await editor[direction === 'undo' ? 'redo' : 'undo']()).toBe(true);
        expect(editor.exportDocument()).toEqual(direction === 'undo' ? after.document : before.document);
        expect(await editor[direction]()).toBe(true);
        expect(editor.exportDocument()).toEqual(direction === 'undo' ? before.document : after.document);
      });
    }
  }

  it('restores explicit null selections from history on both undo and redo', async () => {
    const { editor, before, after } = await fixture({ nullSelection: true });
    expect(editor.historyManager.getHistory()[0].metadata).toMatchObject({ selectionBefore: null, selectionAfter: null });
    const caret = { type: 'range' as const, collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2 };
    editor.updateSelection(caret);
    expect(await editor.undo()).toBe(true);
    expect(editor.selection).toBeNull();
    expect(editor.exportDocument()).toEqual(before.document);
    editor.updateSelection(caret);
    expect(await editor.redo()).toBe(true);
    expect(editor.selection).toBeNull();
    expect(editor.exportDocument()).toEqual(after.document);
  });

  it('keeps the current selection when history has no selection metadata keys', async () => {
    const { editor, before, after } = await fixture({ preserveSelectionInHistory: false });
    const metadata = editor.historyManager.getHistory()[0].metadata ?? {};
    expect(Object.hasOwn(metadata, 'selectionBefore')).toBe(false);
    expect(Object.hasOwn(metadata, 'selectionAfter')).toBe(false);
    const caret = { type: 'range' as const, collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2 };
    editor.updateSelection(caret);
    expect(await editor.undo()).toBe(true);
    expect(editor.selection).toEqual(caret);
    expect(editor.exportDocument()).toEqual(before.document);
    expect(await editor.redo()).toBe(true);
    expect(editor.selection).toEqual(caret);
    expect(editor.exportDocument()).toEqual(after.document);
  });

  for (const attempt of ['failed undo', 'unavailable redo'] as const) {
    for (const closed of [false, true]) {
      it(`preserves the ${closed ? 'closed' : 'open'} typing group after ${attempt}`, async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const { editor, before, after } = await fixture();
        if (closed) editor.historyManager.closeGroup();
        const unchanged = state(editor);
        if (attempt === 'failed undo') {
          const definition = globalOperationRegistry.get('deleteTextRange');
          if (!definition) throw new Error('Undo operation is not registered');
          const execute = definition.execute.bind(definition);
          vi.spyOn(definition, 'execute').mockImplementationOnce(async (value, context) => {
            await execute(value, context);
            return { ok: false };
          });
        }
        expect(await editor[attempt === 'failed undo' ? 'undo' : 'redo']()).toBe(false);
        expect(state(editor)).toEqual(unchanged);

        vi.setSystemTime(new Date('2026-01-01T00:00:00.050Z'));
        expect((await transaction(editor, [insertText('t', 7, '?')]).commit()).success).toBe(true);
        expect(editor.dataStore.getNode('t')?.text).toBe('before!?');
        expect(editor.getHistoryStats().totalEntries).toBe(closed ? 2 : 1);
        expect(await editor.undo()).toBe(true);
        expect(editor.exportDocument()).toEqual(closed ? after.document : before.document);
        if (closed) {
          expect(await editor.undo()).toBe(true);
          expect(editor.exportDocument()).toEqual(before.document);
        }
      });
    }
  }
});
