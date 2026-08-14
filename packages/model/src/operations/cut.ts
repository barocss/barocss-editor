import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

export interface CutResult {
  json: INode[];
  text: string;
  deletedRange: any;
}

type CutOperation = {
  range: any; // ModelSelection
};

defineOperation(
  'cut',
  async (operation: any, context: TransactionContext) => {
    const { range } = operation.payload as CutOperation;
    if (!range) {
      throw new Error('[cut] range is required');
    }

    const json = context.dataStore.serializeRange(range);
    const text = context.dataStore.range.extractText(range);

    /**
     * What the run carried, before the cut takes it.
     *
     * Read now because the store edits text by replacing it, which re-derives
     * the marks: a bold word cut and put back came back plain.
     */
    const startNode = context.dataStore.getNode(range.startNodeId);
    const marksBefore = Array.isArray((startNode as any)?.marks)
      ? JSON.parse(JSON.stringify((startNode as any).marks))
      : undefined;

    // Text deletion is performed via RangeOperations.deleteRange
    context.dataStore.range.deleteRange(range);

    const result: CutResult = {
      json,
      text,
      deletedRange: range
    };

    /**
     * Putting the text back where it was taken from.
     *
     * Cutting had no inverse at all, so Ctrl+X followed by Ctrl+Z left the text
     * gone. The same limit `deleteRange` keeps applies: only a cut inside one
     * run can be restored by writing the characters back at the offset they
     * came from. A cut spanning several runs takes structure with it, and
     * re-inserting a string would not rebuild it — so it offers nothing rather
     * than an inverse that half-works, and undo leaves it alone instead of
     * making it worse.
     */
    const withinOneNode = range.startNodeId === range.endNodeId;

    return {
      ...result,
      ok: true,
      ...(withinOneNode && text.length > 0
        ? {
            inverse: {
              type: 'insertText',
              payload: {
                nodeId: range.startNodeId,
                // `pos`, which is the key that operation reads
                pos: range.startOffset,
                text,
                ...(marksBefore ? { marksAfter: marksBefore } : {})
              }
            }
          }
        : {})
    } as any;
  }
);


