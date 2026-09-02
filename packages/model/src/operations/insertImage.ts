import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

export const insertImage = defineOperationDSL(
  (src: string, alt?: string) => ({
    type: 'insertImage',
    payload: { src, ...(alt != null && { alt }) }
  } as any),
  { atom: true, category: 'content' }
);

defineOperation('insertImage', async (operation: any, context: TransactionContext) => {
  const { src, alt } = operation.payload;
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!src) throw new Error('insertImage: src is required');
  if (!selection || selection.type !== 'range') {
    throw new Error('insertImage: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertImage: start node not found');

  /**
   * The block to put this beside, which is not always the run's parent.
   *
   * A link wraps its text, so inside one the parent is the link — and a block
   * inserted "beside" it went inside the paragraph, next to a run. Nine
   * operations shared the idiom and so shared the fault.
   */
  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = findBlockAncestor(dataStore, context.schema, startNode.sid!);
    if (parent) blockNode = parent;
  }

  /*
   * The check that the target can hold anything is **after** the two branches below, not before
   * them: an atom's `content` is missing rather than empty, so a caret on a picture threw here — and
   * the branch that knows to look at the picture's holder never ran. The command said it could run,
   * ran, and the paragraph did not change.
   */

  const textNodeId = selection.startNodeId;
  const textNode = dataStore.getNode(textNodeId);
  let insertIndex: number;
  /** The right half, when the caret fell inside a run — see the inverse. */
  let splitRight: string | undefined;

  if (textNode && typeof textNode.text === 'string' && Array.isArray(blockNode.content)) {
    insertIndex = blockNode.content.indexOf(textNodeId);
    if (insertIndex === -1) {
      insertIndex = blockNode.content.length;
    } else {
      /**
       * **At the caret**, which this did not read.
       *
       * The offset was thrown away and the picture went after the **whole run**: a caret in the
       * middle of *문서 한 벌로 세 가지를 만듭니다* put the image at the end of the sentence, which is
       * not where the reader was. Measured on the sample, in the site builder.
       *
       * So the run is split where the caret is and the picture goes into the seam. The two edges are
       * left alone — a caret at 0 or at the end of the run has nothing to split, and splitting there
       * would leave an empty run behind for every picture anybody ever inserted.
       */
      const offset = typeof selection.startOffset === 'number' ? selection.startOffset : 0;
      const text = textNode.text as string;
      if (offset > 0 && offset < text.length) {
        /*
         * And the halves are remembered, because **undoing this has to put them back together**.
         * Taking the picture out of the seam leaves 가나 and 다라 side by side, which is a paragraph
         * that reads the same and is not the document the reader had — and `roster` compares the
         * document, so it said so on the first run.
         */
        splitRight = dataStore.splitMerge.splitTextNode(textNodeId, offset);
      }
      insertIndex = (offset === 0 ? blockNode.content.indexOf(textNodeId) : blockNode.content.indexOf(textNodeId) + 1);
    }
  } else {
    /**
     * **Beside it, not inside it** — which is where a picture went when the caret was on one.
     *
     * A caret on an `inline-image` made that image the block: it is an atom, its `content` is an
     * empty array, and `Array.isArray` is happy with one. So the new picture was added *into* the
     * old picture — a node the schema says can hold nothing and no renderer draws. Measured by
     * putting two pictures in a paragraph and asking for a third between them: the command said it
     * could run, ran, and the paragraph did not change.
     *
     * The block is the one that holds it, and the place is the seam the caret is in — after the
     * atom when the caret is past it, before when it is not, which is what an offset means on a node
     * with no text.
     */
    const holder = startNode.parentId ? dataStore.getNode(startNode.parentId) : undefined;
    if (holder && Array.isArray(holder.content) && startNode.sid === blockNode.sid) {
      blockNode = holder;
    }
    if (!Array.isArray(blockNode.content)) {
      throw new Error('insertImage: target block has no content array');
    }
    const beside = blockNode.content.indexOf(startNode.sid as string);
    insertIndex =
      beside === -1
        ? blockNode.content.length
        : beside + (typeof selection.startOffset === 'number' && selection.startOffset > 0 ? 1 : 0);
  }

  if (!Array.isArray(blockNode.content)) {
    throw new Error('insertImage: target block has no content array');
  }

  const imageId = dataStore.content.addChild(blockNode.sid!, {
    stype: 'inline-image',
    attributes: { src, ...(alt != null && { alt }) }
  } as any, insertIndex);

  return {
    ok: true,
    data: dataStore.getNode(imageId),
    /*
     * Taking the picture out **and joining the run back up**, in that order: the two halves are only
     * adjacent once the picture between them is gone.
     */
    inverse: splitRight
      ? {
          type: 'batch',
          payload: {
            operations: [
              { type: 'removeChild', payload: { parentId: blockNode.sid, childId: imageId } },
              { type: 'mergeTextNodes', payload: { leftNodeId: textNodeId, rightNodeId: splitRight } }
            ]
          }
        }
      : { type: 'removeChild', payload: { parentId: blockNode.sid, childId: imageId } }
  };
});
