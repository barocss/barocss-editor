import type { ModelSelection } from '@barocss/editor-core';

/**
 * Common utility functions for Selection mapping
 * Provides reusable patterns for Selection mapping logic per operation.
 */
export class SelectionMappingUtils {
  /**
   * Move Selection after insertion
   * Moves Selection after insertion position when text is inserted.
   */
  static shiftAfterInsert(
    currentSelection: ModelSelection, 
    operation: { nodeId: string; position: number; text: string }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    if (currentSelection.startOffset >= operation.position) {
      return {
        ...currentSelection,
        startOffset: currentSelection.startOffset + operation.text.length,
        endOffset: currentSelection.endOffset + operation.text.length
      };
    }
    return currentSelection;
  }
  
  /**
   * Move Selection after deletion
   * Moves Selection to deletion range start when text is deleted.
   */
  static collapseToStart(
    currentSelection: ModelSelection,
    operation: { nodeId: string; start: number; end: number }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    return {
      ...currentSelection,
      startOffset: operation.start,
      endOffset: operation.start
    };
  }
  
  /**
   * Move Selection after split
   * Moves Selection to split point when text is split.
   */
  static moveToSplitPoint(
    currentSelection: ModelSelection,
    operation: { nodeId: string; splitPosition: number }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    return {
      ...currentSelection,
      startOffset: operation.splitPosition,
      endOffset: operation.splitPosition
    };
  }
  
  /**
   * Clear Selection
   * Clears Selection for the node when node is deleted.
   */
  static clearSelection(
    currentSelection: ModelSelection,
    operation: { nodeId: string }
  ): ModelSelection | null {
    if (currentSelection.startNodeId === operation.nodeId || currentSelection.endNodeId === operation.nodeId) {
      return null; // Clear selection
    }
    return currentSelection;
  }
  
  /**
   * Preserve Selection
   * Used when operation does not affect Selection.
   */
  static preserveSelection(
    currentSelection: ModelSelection,
    _operation: unknown
  ): ModelSelection | null {
    return currentSelection;
  }

  /**
   * Adjust Selection after range deletion (same-node only).
   * Adjusts Selection after deleting a specific range.
   */
  static adjustForRangeDelete(
    currentSelection: ModelSelection,
    operation: { nodeId: string; startPosition: number; endPosition: number }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId || currentSelection.endNodeId !== operation.nodeId) {
      return currentSelection;
    }

    const deleteLength = operation.endPosition - operation.startPosition;
    const startOff = currentSelection.startOffset;
    const endOff = currentSelection.endOffset;

    if (startOff >= operation.startPosition && startOff < operation.endPosition) {
      return {
        ...currentSelection,
        startOffset: operation.startPosition,
        endOffset: operation.startPosition
      };
    }

    if (startOff >= operation.endPosition) {
      return {
        ...currentSelection,
        startOffset: startOff - deleteLength,
        endOffset: endOff - deleteLength
      };
    }

    return currentSelection;
  }
}
