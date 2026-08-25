import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

/**
 * What the **builder** returns, which is not what the handler reads.
 *
 * Both files called their type `DeleteTextRangeOperation` and meant different things — the builder's
 * was the whole operation (`{ type, nodeId?, start, end }`) and the handler's is the *payload*
 * (`{ nodeId, start, end }`). Two meanings for one name is exactly the sort of thing a directory
 * split hides, and bringing them into one file is what made it visible.
 */
type DeleteTextRangeDescriptor = {
  type: 'deleteTextRange';
  nodeId?: string;
  start: number;
  end: number;
};

export const deleteTextRange = defineOperationDSL(
  (...args: [number, number] | [string, number, number]) => {
    if (args.length === 2) {
      const [start, end] = args as [number, number];
      return { type: 'deleteTextRange', payload: { start, end } } as unknown as DeleteTextRangeDescriptor;
    }
    const [nodeId, start, end] = args as [string, number, number];
    return { type: 'deleteTextRange', payload: { nodeId, start, end } } as unknown as DeleteTextRangeDescriptor;
  },
  { atom: true, category: 'text' }
);

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
       * Every mark the run carries, before the deletion touches any of them.
       *
       * Not just the ones that disappear. A deletion moves and shortens the
       * others, and putting the characters back does not move them back: the
       * store stretches a mark the insertion falls inside and shifts one that
       * starts at the insertion point, which is right for typing and is not
       * reversible. Deleting the first two letters of a bold word and undoing
       * gave them back unbolded.
       *
       * So undo does not re-derive the marks; it restores the list.
       */
      const marksBefore = Array.isArray((node as any).marks)
        ? JSON.parse(JSON.stringify((node as any).marks))
        : [];

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
            // What the run carried before, restored wholesale once the text is
            // back. See the note where this is captured.
            marksAfter: marksBefore
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
