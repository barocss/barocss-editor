import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * insertText operation (runtime)
 *
 * Purpose
 * - Inserts a string (text) at an arbitrary position (pos) within a single text node.
 * - Handles DataStore operations and Selection movement consistently.
 *
 * Input format (DSL)
 * - control chain: control(nodeId, [ insertText(pos, text) ]) → payload: { pos, text }
 * - direct call: insertText(nodeId, pos, text) → payload: { nodeId, pos, text }
 *   - Builder injects target as nodeId in control(target, …).
 *
 * payload fields
 * - pos: number (using 'pos' key to match test spec, not 'position')
 * - text: string (string to insert)
 * - nodeId?: string (included in direct call, injected by builder in control chain)
 *
 * DataStore integration
 * - Calls DataStore.range.insertText(range, text).
 *   - range: { startNodeId, startOffset, endNodeId, endOffset } (for single node insertion, start=end=pos)
 *   - return value: inserted string (tests verify this return value)
 * - Assumes that the node text in DataStore is immediately reflected after insertion.
 *
 * Selection mapping
 * - Moves selection anchor/focus after insertion position (pos) in the same node forward by insertion length.
 * - Does not affect selection in other nodes.
 *
 * Return value (runtime)
 * - Inserted string (tests directly compare this result)
 */

type InsertTextOperationPayload = {
  nodeId: string;
  pos: number;
  text: string;
};

// Inserts text at the specified position in a text node.
// Uses DataStore.range.insertText and returns the inserted string.
defineOperation('insertText', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, pos, text } = operation.payload as InsertTextOperationPayload;

    try {
      // Check if node exists
      const node = context.dataStore.getNode(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // 1) DataStore update: insert at pos position within single node
      //    Construct range as start=end=pos and call DataStore.range.insertText
      const insertedText = context.dataStore.range.insertText({
        startNodeId: nodeId,
        startOffset: pos,
        endNodeId: nodeId,
        endOffset: pos
      }, text);
      
      // 2) Selection mapping: directly update context.selection.current
      if (context.selection?.current) {
        const sel = context.selection.current;
        const textLength = text.length;
        
        // Handle start
        if (sel.startNodeId === nodeId && sel.startOffset >= pos) {
          sel.startOffset += textLength;
        }
        
        // Handle end
        if (sel.endNodeId === nodeId && sel.endOffset >= pos) {
          sel.endOffset += textLength;
        }
        
        // Collapsed state does not change (only offset moves)
      }
      
      // 3) Return inserted text + inverse
      return { ok: true, data: insertedText, inverse: { type: 'deleteTextRange', payload: { nodeId, startPosition: pos, endPosition: pos + text.length } } };

    } catch (error) {
      throw new Error(`Failed to insert text into node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * insertText operation DSL
 *
 * Supported forms:
 * - Direct specification: insertText(nodeId, pos, text) → { type: 'insertText', payload: { nodeId, pos, text } }
 * - control chain: control(nodeId, [ insertText(pos, text) ]) → { type: 'insertText', payload: { pos, text } }
 *
 * Note
 * - Uses 'pos' as key name (matches test spec).
 * - Does not inject nodeId in control chain (builder injects it).
 */
