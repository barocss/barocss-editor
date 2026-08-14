import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * replaceText operation (DSL + runtime)
 *
 * Purpose:
 * - Replaces the specified range (start, end) of a single text node with new text (newText).
 * - Delegates text/mark updates to DataStore.range.replaceText.
 *
 * Input format (DSL):
 * - control(nodeId, [ replaceText(start, end, newText) ]) → payload: { start, end, newText }
 * - control(nodeId, [ replaceText(startId, startOffset, endId, endOffset, newText) ]) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, newText }
 * - replaceText(nodeId, start, end, newText) → payload: { nodeId, start, end, newText }
 * - replaceText(startId, startOffset, endId, endOffset, newText) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, newText }
 *   - Builder injects target as nodeId in control(target, …).
 *
 * Selection mapping:
 * - The caret ends up after the text that was written, which is where a typist
 *   expects it and where the next keystroke has to land.
 * - It used to be left alone, on the theory that the browser had already moved
 *   the DOM caret and the model would pick that up. That holds only while the
 *   render leaves the text node the caret is in intact. Once anything makes the
 *   render rebuild it — a decorator splitting the text, for one — the caret is
 *   restored from a model that never advanced, the next character lands in front
 *   of the last, and a word comes out backwards.
 *
 * Exception handling:
 * - DataStore.range.replaceText may return an empty string if it fails due to invalid range, etc.
 * - This implementation strictly checks node existence and throws clear exceptions for non-existent nodes/invalid ranges.
 */

defineOperation('replaceText', async (operation: any, context: TransactionContext) => {
  try {
    // operation is in the form { type: 'replaceText', payload: { ... } }
    const payload = operation.payload;
    
    if (!payload) {
      throw new Error('Payload is required for replaceText operation');
    }
    
    if ('range' in payload) {
      const { range, newText } = payload;
      const marksAfter = (payload as any).marksAfter as any[] | undefined;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      
      /**
       * Store the original text for the inverse — with the range properly
       * formed, which it was not: `extractText` wants a selection and was
       * handed a bare range, so it returned nothing and the inverse restored
       * an empty string. Undoing a replacement deleted the text it replaced.
       */
      const originalText =
        startNodeId === endNodeId
          ? ((startNode as any).text as string).slice(startOffset, endOffset)
          : context.dataStore.range.extractText({ type: 'range' as const, ...range });
      /**
       * And what the start node carried, since the replacement rewrites it.
       *
       * The text can be put back by writing it again; the marks over it cannot
       * be re-derived, for the same reason a deletion's could not — the store's
       * rules for an edit are right for a reader making one and are not
       * reversible.
       */
      const marksBefore = Array.isArray((startNode as any).marks)
        ? JSON.parse(JSON.stringify((startNode as any).marks))
        : [];

      const rangeWithType = { type: 'range' as const, ...range };
      const deleted = context.dataStore.range.replaceText(rangeWithType, newText);

      // Exactly the marks the run is to end up with, when the caller knows —
      // which is the inverse putting back what it took. See where it is captured.
      if (Array.isArray(marksAfter)) {
        const current = context.dataStore.getNode(startNodeId);
        if (current) {
          context.dataStore.setNode(
            { ...current, marks: JSON.parse(JSON.stringify(marksAfter)) } as any,
            false
          );
        }
      }

      // After what was written, in the node the range started in: a range that
      // spanned several nodes has collapsed into that one.
      context.selection.setCaret(startNodeId, startOffset + newText.length);

      return {
        ok: true,
        data: deleted,
        /**
         * Where the replacement actually is, which is not where the range was.
         *
         * A range spanning several nodes collapses into the one it started in,
         * so the text just written occupies `[startOffset, startOffset + newText.length)`
         * of *that* node. The inverse used to name the old end node and add the
         * new length to the old end offset, which describes neither the text it
         * meant to replace nor anything else.
         */
        inverse: {
          type: 'replaceText',
          payload: {
            range: {
              startNodeId: range.startNodeId,
              startOffset: range.startOffset,
              endNodeId: range.startNodeId,
              endOffset: range.startOffset + newText.length
            },
            newText: originalText,
            marksAfter: marksBefore
          }
        }
      };
    }
    
    const { nodeId, start, end, newText } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    
    // Store the original text for inverse operation
    const prevText = (node.text as string).substring(start, end);
    
    const deleted = context.dataStore.range.replaceText({
      type: 'range',
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    }, newText);

    context.selection.setCaret(nodeId, start + newText.length);

    return {
      ok: true,
      data: deleted,
      inverse: { type: 'replaceText', payload: { nodeId, start, end: start + newText.length, newText: prevText } }
    };
  } catch (e) {
    console.log('replaceText error:', e);
    throw new Error(`Failed to replace text: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

// DSL definition will be separated into a separate file


