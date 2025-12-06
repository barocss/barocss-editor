import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * deleteTextRange operation (runtime)
 *
 * Purpose
 * - Deletes text in the range startPosition~endPosition within a single text node.
 * - Handles DataStore operations and Selection movement consistently.
 *
 * Input format (DSL)
 * - control chain: control(nodeId, [ deleteTextRange(start, end) ]) → payload: { start, end }
 * - direct call: deleteTextRange(nodeId, start, end) → payload: { nodeId, start, end }
 *   - Builder injects target as nodeId in control(target, …).
 *
 * payload fields (DSL)
 * - start: number
 * - end: number
 * - nodeId?: string (included in direct call)
 */

type DeleteTextRangeOperation = {
  nodeId: string;
  start: number;
  end: number;
};

// Deletes text in the specified range from a text node.
// Uses DataStore.range.deleteText and returns the deleted text.
defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload as DeleteTextRangeOperation;

    try {
      // Check if node exists
      const node = context.dataStore.getNode(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // 1) DataStore update: delete range [startPosition, endPosition) within single node
      const deletedText = context.dataStore.range.deleteText({
        startNodeId: nodeId,
        startOffset: start,
        endNodeId: nodeId,
        endOffset: end
      });
      
      // 2) Selection mapping: directly update context.selection.current
      if (context.selection?.current) {
        const sel = context.selection.current;
        const deleteLength = end - start;
        
        // Handle start
        if (sel.startNodeId === nodeId) {
          if (sel.startOffset >= start && sel.startOffset < end) {
            // Within deletion range → clamp to start
            sel.startOffset = start;
          } else if (sel.startOffset === end) {
            // Exactly at deletion range end → move to deletion start position
            sel.startOffset = start;
          } else if (sel.startOffset > end) {
            // After deletion range → shift
            sel.startOffset -= deleteLength;
          }
        }
        
        // Handle end
        if (sel.endNodeId === nodeId) {
          if (sel.endOffset >= start && sel.endOffset < end) {
            // Within deletion range → clamp to start
            sel.endOffset = start;
          } else if (sel.endOffset === end) {
            // Exactly at deletion range end → move to deletion start position
            sel.endOffset = start;
          } else if (sel.endOffset > end) {
            // After deletion range → shift
            sel.endOffset -= deleteLength;
          }
        }
        
        // Update collapsed state
        if ('collapsed' in sel) {
          sel.collapsed = sel.startNodeId === sel.endNodeId && 
                          sel.startOffset === sel.endOffset;
        }
      }
      
      // 3) Return deleted text + inverse + selection info
      return { 
        ok: true, 
        data: deletedText, 
        inverse: { 
          type: 'insertText', 
          payload: { 
            nodeId, 
            pos: start, 
            text: deletedText 
          } 
        },
        selection: context.selection?.current ? {
          startNodeId: context.selection.current.startNodeId,
          startOffset: context.selection.current.startOffset,
          endNodeId: context.selection.current.endNodeId,
          endOffset: context.selection.current.endOffset
        } : null
      };

    } catch (error) {
      throw new Error(`Failed to delete text range for node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * deleteTextRange operation DSL
 *
 * Supported forms:
 * - Direct specification: deleteTextRange(nodeId, start, end) → { type: 'deleteTextRange', payload: { nodeId, start, end } }
 * - control chain: control(nodeId, [ deleteTextRange(start, end) ]) → { type: 'deleteTextRange', payload: { start, end } }
 */
