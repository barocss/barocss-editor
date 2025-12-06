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
    operation: any
  ): ModelSelection | null {
    return currentSelection;
  }
  
  /**
   * Adjust Selection after range deletion
   * Adjusts Selection after deleting a specific range.
   */
  static adjustForRangeDelete(
    currentSelection: Selection,
    operation: { nodeId: string; startPosition: number; endPosition: number }
  ): Selection | null {
    if (currentSelection.nodeId !== operation.nodeId) return currentSelection;
    
    const deleteLength = operation.endPosition - operation.startPosition;
    
    // If Selection overlaps with deletion range
    if (currentSelection.start >= operation.startPosition && 
        currentSelection.start < operation.endPosition) {
      // Move to deletion range start
      return {
        ...currentSelection,
        start: operation.startPosition,
        end: operation.startPosition
      };
    }
    
    // Adjust offset if Selection is after deletion range
    if (currentSelection.start >= operation.endPosition) {
      return {
        ...currentSelection,
        start: currentSelection.start - deleteLength,
        end: currentSelection.end - deleteLength
      };
    }
    
    return currentSelection;
  }
}
