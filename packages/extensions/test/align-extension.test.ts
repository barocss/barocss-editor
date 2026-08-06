import { describe, it, expect } from 'vitest';
import { AlignExtension } from '../src/align';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * Which blocks an alignment command would touch.
 *
 * Written after a real failure that only a browser caught: a toolbar asks every
 * control whether it can run, on every content change, and one of those changes
 * is an undo — which removes nodes and leaves the selection pointing at them.
 * Asking the store to walk a range from a removed node threw, the throw came out
 * of a React render, and the whole document unmounted. A question about a button
 * should never be able to do that, so the cases are pinned here rather than in a
 * page that has to be loaded to find out.
 */
const store = (nodes: Record<string, any>) =>
  ({
    getNode: (sid: string) => nodes[sid],
    getNodesInRange: (start: string, end: string) => {
      if (!nodes[start] || !nodes[end]) throw new Error('Nodes are not in the same document tree');
      const order = Object.keys(nodes);
      return order.slice(order.indexOf(start), order.indexOf(end) + 1);
    }
  }) as any;

const editorWith = (nodes: Record<string, any>) => {
  const commands = new Map<string, any>();
  const editor: any = {
    dataStore: store(nodes),
    selection: null,
    registerCommand: (command: any) => commands.set(command.name, command)
  };
  new AlignExtension().onCreate(editor);
  return { editor, commands };
};

const range = (startNodeId: string, endNodeId: string): ModelSelection =>
  ({
    type: 'range',
    startNodeId,
    startOffset: 0,
    endNodeId,
    endOffset: 1,
    collapsed: startNodeId === endNodeId
  }) as ModelSelection;

const document = () => ({
  p1: { sid: 'p1', stype: 'paragraph' },
  t1: { sid: 't1', stype: 'inline-text', text: 'one', parentId: 'p1' },
  p2: { sid: 'p2', stype: 'paragraph' },
  t2: { sid: 't2', stype: 'inline-text', text: 'two', parentId: 'p2' }
});

describe('alignment', () => {
  it('can run when the caret is in a block', () => {
    const { editor, commands } = editorWith(document());
    expect(commands.get('alignCenter').canExecute(editor, { selection: range('t1', 't1') })).toBe(
      true
    );
  });

  it('covers every block a selection spans, not just the one the caret is in', () => {
    // A selection across two paragraphs that centres one of them is a
    // half-applied edit, so the range has to resolve to both blocks.
    const { editor } = editorWith(document());
    expect((new AlignExtension() as any)['_blocksOf'](editor, range('t1', 't2'))).toEqual([
      'p1',
      'p2'
    ]);
  });

  it('answers no rather than throwing when the selection points at a removed node', () => {
    // Exactly what an undo leaves behind: the selection still names t2, and t2
    // is gone.
    const nodes = document();
    delete (nodes as any).t2;
    const { editor, commands } = editorWith(nodes);

    expect(() =>
      commands.get('alignCenter').canExecute(editor, { selection: range('t2', 't2') })
    ).not.toThrow();
    expect(commands.get('alignCenter').canExecute(editor, { selection: range('t2', 't2') })).toBe(
      false
    );
  });

  it('falls back to the caret block when the two ends cannot be ordered', () => {
    // Both ends exist but the store refuses to order them — one in the body, one
    // in back matter. Aligning the block the caret is in is the smallest correct
    // answer; throwing is not an answer at all.
    const nodes = document();
    const dataStore = store(nodes);
    dataStore.getNodesInRange = () => {
      throw new Error('Nodes are not in the same document tree');
    };
    const editor: any = { dataStore, selection: null, registerCommand: () => {} };

    const blocks = (new AlignExtension() as any)['_blocksOf'](editor, range('t1', 't2'));
    expect(blocks).toEqual(['p1']);
  });

  it('answers no when there is no selection at all', () => {
    const { editor, commands } = editorWith(document());
    expect(commands.get('alignCenter').canExecute(editor, {})).toBe(false);
    expect(commands.get('setAlignment').canExecute(editor, { alignment: 'left' })).toBe(false);
  });
});
