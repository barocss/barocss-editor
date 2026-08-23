import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '../src/editor';
import type { ModelSelection } from '../src/types';

/**
 * Asking whether a command can run.
 *
 * This is the question a toolbar asks constantly — for every control, on every
 * content change — so it is on the path of every edit, and it has to be safe on
 * that path. Two ways it was not:
 *
 * A predicate that threw took its caller with it. Asked from inside a React
 * render, the throw unmounted the whole editor and the document went blank on a
 * Ctrl+Z. And the selection it was asked about could name nodes that no longer
 * existed, because an undo removes nodes and nothing puts the selection back
 * anywhere live — `editor:content.change` is emitted from inside the
 * transaction, which is exactly when a listener would look.
 */
const caret = (nodeId: string): ModelSelection =>
  ({
    type: 'range',
    startNodeId: nodeId,
    startOffset: 0,
    endNodeId: nodeId,
    endOffset: 0,
    collapsed: true
  }) as ModelSelection;

/** The selection lives in the selection manager, so it is set where it is read. */
const setSelection = (editor: Editor, selection: ModelSelection) => {
  (editor as any)._selectionManager.getCurrentSelection = () => selection;
};

afterEach(() => {
  // Braces: the arrow's value would be handed to vitest as a cleanup function.
  vi.restoreAllMocks();
});

describe('canRun', () => {
  it('answers no when a command predicate throws, rather than propagating', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new Editor();
    editor.registerCommand({
      name: 'broken',
      execute: async () => true,
      canExecute: () => {
        throw new Error('Nodes are not in the same document tree');
      }
    } as never);

    expect(() => editor.canRun('broken')).not.toThrow();
    expect(editor.canRun('broken')).toBe(false);
    // Warned, not swallowed: the command is still broken and that stays visible.
    expect(warn).toHaveBeenCalled();
  });

  it('answers no for a command nobody registered', () => {
    expect(new Editor().canRun('noSuchCommand')).toBe(false);
  });

  it('withholds a selection whose node has been removed', () => {
    const editor = new Editor();
    const seen: any[] = [];
    editor.registerCommand({
      name: 'observe',
      execute: async () => true,
      canExecute: (_editor: Editor, payload?: any) => (seen.push(payload), true)
    } as never);

    // A store where the selected node is gone — what an undo leaves behind.
    (editor as any)._dataStore = { getNode: (sid: string) => (sid === 'live' ? { sid } : undefined) };

    setSelection(editor, caret('removed'));
    editor.canRun('observe');
    expect(seen.at(-1)?.selection).toBeUndefined();

    setSelection(editor, caret('live'));
    editor.canRun('observe');
    expect(seen.at(-1)?.selection?.startNodeId).toBe('live');
  });

  it('still fills in the selection when the store cannot answer', () => {
    // No store, or one without getNode, is not evidence that the selection is
    // dead — withholding it there would disable every button.
    const editor = new Editor();
    const seen: any[] = [];
    editor.registerCommand({
      name: 'observe',
      execute: async () => true,
      canExecute: (_editor: Editor, payload?: any) => (seen.push(payload), true)
    } as never);

    (editor as any)._dataStore = undefined;
    setSelection(editor, caret('anything'));
    editor.canRun('observe');
    expect(seen.at(-1)?.selection?.startNodeId).toBe('anything');
  });

  it('lets an explicit payload selection win over the current one', () => {
    const editor = new Editor();
    const seen: any[] = [];
    editor.registerCommand({
      name: 'observe',
      execute: async () => true,
      canExecute: (_editor: Editor, payload?: any) => (seen.push(payload), true)
    } as never);

    setSelection(editor, caret('current'));
    editor.canRun('observe', { selection: caret('explicit') });
    expect(seen.at(-1)?.selection?.startNodeId).toBe('explicit');
  });
});
