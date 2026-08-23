import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordFrameExtension, frameNode } from '../src/frame-commands';

/**
 * Putting a layout box in a document.
 *
 * What is worth pinning here is not the transaction — it is one `addChild` —
 * but the two decisions around it that are wrong in ways a reader only meets
 * later: *where* the frame lands, and *what is in it* when it arrives.
 *
 * An empty frame is the failure worth naming. A `<div>` with no blocks in it
 * has nowhere to put a caret: there is no text node to click into, so a reader
 * who inserts one is looking at a box they cannot use and whose only exit is
 * undo. So the frame arrives with paragraphs, and this says so.
 */
const committed: any[][] = [];

vi.mock('@barocss/model', () => ({
  transaction: (_editor: unknown, operations: any[]) => ({
    commit: async () => (committed.push(operations), { success: true })
  })
}));

const editorOf = (nodes: Record<string, any>) => {
  const commands = new Map<string, any>();
  const editor: any = {
    dataStore: { getNode: (id: string) => nodes[id] },
    getRootId: () => 'root',
    selection: null,
    registerCommand: (command: any) => commands.set(command.name, command)
  };
  new WordFrameExtension().onCreate(editor);
  return { editor, commands };
};

const caret = (nodeId: string) =>
  ({ type: 'range', startNodeId: nodeId, startOffset: 0, endNodeId: nodeId, endOffset: 0 }) as any;

/** A body of two paragraphs, the first holding a text node. */
const doc = () => ({
  root: { sid: 'root', stype: 'document', content: ['body'] },
  body: { sid: 'body', stype: 'body', content: ['p1', 'p2'] },
  p1: { sid: 'p1', stype: 'paragraph', parentId: 'body', content: ['t1'] },
  t1: { sid: 't1', stype: 'inline-text', text: 'one', parentId: 'p1' },
  p2: { sid: 'p2', stype: 'paragraph', parentId: 'body', content: [] }
});

beforeEach(() => {
  // Braces, not an expression body: an arrow that *returns* the new length hands
  // vitest a number where it expects a cleanup function, which the compiler says and
  // nothing else would.
  committed.length = 0;
});

describe('the frame a reader gets', () => {
  it('arrives with somewhere to type in each part of it', () => {
    const frame = frameNode({ layoutMode: 'row', columns: 2 });
    expect(frame.stype).toBe('frame');
    expect(frame.content?.map((child: any) => child.stype)).toEqual(['paragraph', 'paragraph']);
  });

  it('states no width, so it is as wide as the column it sits in', () => {
    const attrs = frameNode().attributes as Record<string, unknown>;
    expect('width' in attrs).toBe(false);
    expect('x' in attrs).toBe(false);
  });

  /**
   * Only a grid is told how many columns it has. A row is however many children
   * it has, and a `columns` written on one would be a number that means nothing
   * and disagrees with what is on screen the moment a child is added.
   */
  it('writes a column count only where one is read', () => {
    expect((frameNode({ layoutMode: 'grid', columns: 3 }).attributes as any).columns).toBe(3);
    expect('columns' in (frameNode({ layoutMode: 'row', columns: 3 }).attributes as any)).toBe(false);
  });

  it('takes a layout it does not recognise as a row', () => {
    expect((frameNode({ layoutMode: 'sideways' }).attributes as any).layoutMode).toBe('row');
  });

  it('keeps the number of parts to something a page can hold', () => {
    expect(frameNode({ layoutMode: 'grid', columns: 99 }).content).toHaveLength(8);
    expect(frameNode({ layoutMode: 'grid', columns: 0 }).content).toHaveLength(1);
  });
});

describe('where the frame lands', () => {
  it('goes after the block the caret is in, not among its words', () => {
    // The caret is in `t1`, which is inside `p1`. A frame between two text nodes
    // is not a place a frame can be — it has to land among the paragraph's
    // siblings, immediately after the one being read.
    const { editor, commands } = editorOf(doc());
    editor.selection = caret('t1');
    commands.get('insertFrame').execute(editor, { layoutMode: 'row' });

    expect(committed[0][0].type).toBe('addChild');
    expect(committed[0][0].payload.parentId).toBe('body');
    expect(committed[0][0].payload.position).toBe(1);
    expect(committed[0][0].payload.child.stype).toBe('frame');
  });

  it('is unavailable when there is no caret to insert at', () => {
    const { editor, commands } = editorOf(doc());
    expect(commands.get('insertFrame').canExecute(editor)).toBe(false);

    editor.selection = caret('t1');
    expect(commands.get('insertFrame').canExecute(editor)).toBe(true);
  });

  it('carries the layout the toolbar asked for', async () => {
    const { editor, commands } = editorOf(doc());
    editor.selection = caret('p2');
    await commands.get('insertFrame').execute(editor, { layoutMode: 'grid', columns: 4 });

    const child = committed[0][0].payload.child;
    expect(child.attributes.layoutMode).toBe('grid');
    expect(child.attributes.columns).toBe(4);
    expect(child.content).toHaveLength(4);
  });
});
