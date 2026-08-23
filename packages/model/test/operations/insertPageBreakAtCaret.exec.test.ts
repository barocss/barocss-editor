import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Ctrl+Enter: a page break where the caret is.
 *
 * The same thing Enter means plus a page — split here, and carry on at the top of
 * the next one. The shared kit's `insertPageBreak` puts the break after the whole
 * block and leaves the caret alone, which is right for a product where a break is
 * a marker in the flow and wrong for one whose layout *is* pages: measured in the
 * browser, it left the paragraph whole and the caret on the break node itself,
 * with nowhere for the next keystroke to go.
 *
 * Three positions, because they are the three a reader can be in, and they are
 * not the same operation.
 */
describe('a page break at the caret', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;

  beforeEach(() => {
    const schema = new Schema('break-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        pageBreak: { name: 'pageBreak', group: 'block', content: '' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);

    const nodes: INode[] = [
      { sid: 'doc', stype: 'document', content: ['p1', 'p2'] } as INode,
      { sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc' } as INode,
      { sid: 't1', stype: 'inline-text', text: 'ABCDEF', parentId: 'p1' } as INode,
      { sid: 'p2', stype: 'paragraph', content: ['t2'], parentId: 'doc' } as INode,
      { sid: 't2', stype: 'inline-text', text: 'after', parentId: 'p2' } as INode
    ];
    for (const node of nodes) dataStore.setNode(node);
  });

  const run = async (offset: number) => {
    context.selection.setCaret('t1', offset);
    const op = globalOperationRegistry.get('insertPageBreakAtCaret');
    return op!.execute({ type: 'insertPageBreakAtCaret', payload: {} } as never, context);
  };

  const order = () =>
    (dataStore.getNode('doc')!.content as string[]).map((sid) => {
      const node = dataStore.getNode(sid)!;
      const text = (node.content as string[] | undefined)
        ?.map((child) => dataStore.getNode(child)?.text ?? '')
        .join('');
      return `${node.stype}:${text ?? ''}`;
    });

  it('splits the text, and the break goes between the halves', async () => {
    const result = await run(3);
    expect(result.ok).toBe(true);
    expect(order()).toEqual(['paragraph:ABC', 'pageBreak:', 'paragraph:DEF', 'paragraph:after']);
  });

  /**
   * The caret goes with the text that moved, which is the whole point of the
   * shortcut: the reader carries on writing at the top of the new page.
   */
  it('leaves the caret at the start of what moved', async () => {
    const result = await run(3);
    const moved = dataStore.getNode('doc')!.content as string[];
    const secondHalf = dataStore.getNode(moved[2])!;
    expect(result.selectionAfter?.nodeId).toBe((secondHalf.content as string[])[0]);
    expect(result.selectionAfter?.offset).toBe(0);
  });

  /**
   * At the end there is nothing to move, so the new page needs somewhere to
   * type — an empty block of the same kind, with the caret in it. Without this
   * the reader gets a page they cannot write on.
   */
  it('gives the new page somewhere to type, when pressed at the end', async () => {
    const result = await run(6);
    expect(order()).toEqual(['paragraph:ABCDEF', 'pageBreak:', 'paragraph:', 'paragraph:after']);

    const created = (dataStore.getNode('doc')!.content as string[])[2];
    const text = (dataStore.getNode(created)!.content as string[])[0];
    expect(result.selectionAfter?.nodeId).toBe(text);
  });

  /**
   * At the start the whole block moves, so the break goes *before* it and the
   * caret stays exactly where it is — in the text the reader was in, which is
   * now at the top of the page. Splitting here would leave an empty paragraph
   * behind on the old page.
   */
  it('moves the whole block when pressed at its start', async () => {
    const result = await run(0);
    expect(order()).toEqual(['pageBreak:', 'paragraph:ABCDEF', 'paragraph:after']);
    expect(result.selectionAfter?.nodeId).toBe('t1');
  });

  it('says what to insert, so a column break is the same operation', async () => {
    context.selection.setCaret('t1', 3);
    const op = globalOperationRegistry.get('insertPageBreakAtCaret');
    await op!.execute(
      { type: 'insertPageBreakAtCaret', payload: { stype: 'paragraph' } } as never,
      context
    );
    expect(order()[1]).toBe('paragraph:');
  });

  /**
   * One press to undo, and the halves rejoin as they were. The inverse is a
   * batch because two things happened: the break came in and the block was cut.
   */
  it('undoes as one thing', async () => {
    const result = await run(3);
    expect(result.inverse?.type).toBe('batch');
    const operations = (result.inverse as any).payload.operations.map((o: any) => o.type);
    expect(operations).toEqual(['removeChild', 'mergeBlockNodes']);
  });
});
