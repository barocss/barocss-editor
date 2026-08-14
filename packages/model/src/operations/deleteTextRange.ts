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

      /**
       * The marks the deletion would lose entirely, before it goes.
       *
       * Only those wholly inside the span. A mark that merely overlaps it
       * shrinks and survives, and putting the characters back stretches it over
       * them again — restoring it as well would leave the run carrying the same
       * mark twice, once long and once short.
       *
       * Ranges are made relative to the span so the inverse can shift them to
       * wherever it restores the text.
       */
      const deletedMarks = (Array.isArray((node as any).marks) ? (node as any).marks : [])
        .map((mark: any) => {
          const [markStart, markEnd] = Array.isArray(mark.range)
            ? mark.range
            : [0, ((node as any).text ?? '').length];
          if (markStart < start || markEnd > end) return null;
          return { ...mark, range: [markStart - start, markEnd - start] as [number, number] };
        })
        .filter(Boolean);

      // 1) DataStore update: delete range [startPosition, endPosition) within single node
      const deletedText = context.dataStore.range.deleteText({
        type: 'range',
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
            text: deletedText,
            /**
             * What was over the characters being removed.
             *
             * Restoring the letters alone made Ctrl+Z after deleting a bold
             * word give the word back in plain text. Captured before the
             * deletion, clipped to the span, and made relative to it — the
             * insert shifts them to wherever it puts the text back.
             */
            restoreMarks: deletedMarks
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
