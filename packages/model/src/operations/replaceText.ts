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
 * - When replacing a range in the same node, selection after the replacement moves by the length change (newText.length - (end-start)).
 * - This implementation omits SelectionManager integration and delegates responsibility to DataStore (can be extended later if needed).
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
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      
      // Store the original text for inverse operation
      const originalText = context.dataStore.range.extractText(range);
      
      const rangeWithType = { type: 'range' as const, ...range };
      const deleted = context.dataStore.range.replaceText(rangeWithType, newText);
      return {
        ok: true,
        data: deleted,
        inverse: { type: 'replaceText', payload: { range: { startNodeId: range.startNodeId, startOffset: range.startOffset, endNodeId: range.endNodeId, endOffset: range.endOffset + newText.length }, newText: originalText } }
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


