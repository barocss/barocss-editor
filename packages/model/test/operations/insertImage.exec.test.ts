import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

/**
 * **Where a picture lands, which is the whole of what this operation decides.**
 *
 * Two faults, both found by asking the question a reader asked — *can a picture go **between** two
 * pictures?* — and both in one function shared by the word processor, the deck and the site builder.
 */
describe('insertImage operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        doc: { name: 'doc', content: 'paragraph*' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] },
        'inline-image': {
          name: 'inline-image',
          group: 'inline',
          atom: true,
          attrs: { src: { type: 'string', required: true }, alt: { type: 'string', required: false } }
        }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined as never, schema);
    selectionManager = new SelectionManager({ dataStore } as never);
  });

  /*
   * The context holds the selection as it was when the context was **made** — which is the point of
   * a transaction — so every one of these builds it after putting the caret where the test is about.
   */
  const ready = () => {
    context = createTransactionContext(dataStore, selectionManager, schema);
  };

  /** A paragraph holding one run, and a caret in it at `at`. */
  const words = (said: string, at: number) => {
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['t'] } as never);
    dataStore.setNode({ sid: 't', stype: 'inline-text', text: said, parentId: 'p' } as never);
    selectionManager.setSelection({
      type: 'range',
      startNodeId: 't',
      startOffset: at,
      endNodeId: 't',
      endOffset: at
    } as never);
  };

  const run = async () => {
    ready();
    return await globalOperationRegistry
      .get('insertImage')!
      .execute({ type: 'insertImage', payload: { src: 'a.png' } } as never, context);
  };

  /** What the paragraph holds, as a list a person can read. */
  const held = () =>
    ((dataStore.getNode('p') as any).content as string[]).map((sid) => {
      const node = dataStore.getNode(sid) as any;
      return node.stype === 'inline-text' ? `text:${node.text}` : node.stype;
    });

  it('splits the run at the caret and puts the picture in the seam', async () => {
    /*
     * The offset was thrown away, so a caret in the middle of a sentence put the picture after the
     * **whole run** — at the end of the sentence, which is not where the reader was.
     */
    words('가나다라', 2);
    await run();
    expect(held()).toEqual(['text:가나', 'inline-image', 'text:다라']);
  });

  it('leaves the run whole at either edge, rather than splitting off nothing', async () => {
    // A caret at 0 or at the end has nothing to split, and splitting there would leave an empty run
    // behind for every picture anybody ever inserted.
    words('가나다라', 0);
    await run();
    expect(held()).toEqual(['inline-image', 'text:가나다라']);

    words('가나다라', 4);
    await run();
    expect(held()).toEqual(['text:가나다라', 'inline-image']);
  });

  it('puts a picture beside another picture, not inside it', async () => {
    /**
     * The fault the question found. A caret on an `inline-image` made that image the block: it is an
     * atom, so `Array.isArray(content)` was reached on a node whose `content` is missing, and the
     * operation threw before the branch that knows to look at the picture's holder ever ran. From
     * outside: the command said it could run, ran, and the paragraph did not change.
     */
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['a', 'b'] } as never);
    dataStore.setNode({ sid: 'a', stype: 'inline-image', attributes: { src: '1.png' }, parentId: 'p' } as never);
    dataStore.setNode({ sid: 'b', stype: 'inline-image', attributes: { src: '2.png' }, parentId: 'p' } as never);

    // A caret past the first picture, which is what a browser gives between two atoms.
    selectionManager.setSelection({
      type: 'range',
      startNodeId: 'a',
      startOffset: 1,
      endNodeId: 'a',
      endOffset: 1
    } as never);
    await run();

    expect(held()).toEqual(['inline-image', 'inline-image', 'inline-image']);
    // And nothing went inside the picture it was next to.
    expect((dataStore.getNode('a') as any).content ?? []).toHaveLength(0);
  });

  it('puts it before the picture when the caret is not past it', async () => {
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['a'] } as never);
    dataStore.setNode({ sid: 'a', stype: 'inline-image', attributes: { src: '1.png' }, parentId: 'p' } as never);
    selectionManager.setSelection({
      type: 'range',
      startNodeId: 'a',
      startOffset: 0,
      endNodeId: 'a',
      endOffset: 0
    } as never);
    await run();
    expect(((dataStore.getNode('p') as any).content as string[])[1]).toBe('a');
  });
});
