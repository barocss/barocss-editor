import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * outdentText operation (runtime)
 *
 * 목적
 * - 지정 범위의 각 줄 앞에서 들여쓰기 문자열을 제거한다. DataStore.range.outdent 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ outdentText(start, end, indentStr?) ]) → payload: { start, end, indent? }
 * - outdentText(startId, startOffset, endId, endOffset, indentStr?) → payload: { range, indent? }
 * - outdentText(nodeId, start, end, indentStr?) → payload: { nodeId, start, end, indent? }
 */

type OutdentTextOperationPayload =
  | { type: 'outdentText'; nodeId: string; start: number; end: number; indent?: string }
  | { type: 'outdentText'; range: ModelSelection; indent?: string };

defineOperation('outdentText', async (operation: { payload: OutdentTextOperationPayload }, context: TransactionContext) => {
  try {
    const payload = operation.payload;
    const indent = payload.indent ?? '  ';
    
    if ('range' in payload) {
      const { range } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
        throw new Error('Invalid range');
      }
      /**
       * A range this leaves unchanged is not something to undo.
       *
       * Outdenting text that carries no indent, or indenting an empty stretch,
       * changed nothing, reported success, and handed back an `indentText`
       * inverse — so undo added an indent the text had never had.
       * The eighth operation here found succeeding at nothing and describing it
       * as something.
       */
      /**
       * What the run held, and what it carried, before this rewrites it.
       *
       * The store edits text by replacing it, which re-derives the marks — right
       * for a reader making the edit, and not reversible. Undo therefore writes
       * the original stretch back whole, marks and all, rather than asking the
       * opposite operation to work it out.
       */
      const markedNode = startNodeId === endNodeId ? context.dataStore.getNode(startNodeId) : null;
      const marksBefore = Array.isArray((markedNode as any)?.marks)
        ? JSON.parse(JSON.stringify((markedNode as any).marks))
        : [];
      const originalText =
        startNodeId === endNodeId
          ? ((markedNode as any).text as string).slice(startOffset, endOffset)
          : null;
      /**
       * Decided before anything is written.
       *
       * The store replaces the range's text whether or not the transform
       * changed it, and replacing re-derives the marks — so checking
       * afterwards and refusing left the marks destroyed by an operation
       * that reported doing nothing.
       */
      const textBefore = context.dataStore.range.extractText({ ...range, type: 'range' as const });
      const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const predicted = textBefore.replace(new RegExp(`(^|\\n)${escaped}`, 'g'), (_m, lineStart) => lineStart);
      if (textBefore.length === 0 || predicted === textBefore) {
        return { ok: false, error: 'outdentText: the range is unchanged by this' };
      }

      const result = context.dataStore.range.outdent(range, indent);
      return {
        ok: true,
        data: result,
        /**
         * The range the text now occupies, which is not the one it did.
         *
         * Indenting adds characters at the start of every line and outdenting
         * takes them away, so the stretch this wrote is `result.length` long
         * however long it was before. Passing the original range back meant the
         * inverse covered the wrong text — too little after an indent, too much
         * after an outdent.
         */
        // Written back whole: the range the text now occupies, the text that
        // was there, and the marks it carried. See the capture above.
        ...(originalText !== null
          ? {
              inverse: {
                type: 'replaceText',
                payload: {
                  range: {
                    startNodeId,
                    startOffset,
                    endNodeId: startNodeId,
                    endOffset: startOffset + (result ?? '').length
                  },
                  newText: originalText,
                  marksAfter: marksBefore
                }
              }
            }
          : {})
      };
    }
    
    const { nodeId, start, end } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') {
      throw new Error(`Node ${nodeId} is not a text node`);
    }
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    const range: ModelSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end,
      collapsed: false,
      direction: 'forward'
    };
    const result = context.dataStore.range.outdent(range, indent);
    return {
      ok: true,
      data: result,
      inverse: { type: 'indentText', payload: { nodeId, start, end, indent } }
    };
  } catch (e) {
    throw new Error(`Failed to outdent text: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

