import type { DataStore } from '../data-store';

/**
 * Decorator Range 인터페이스
 * editor-view-dom의 DecoratorRange와 동일한 구조
 */
export interface DecoratorRange {
  sid: string;
  stype: string;
  category: 'inline' | 'block' | 'layer';
  target: {
    sid: string;           // sid of target inline-text node
    startOffset: number;   // Start offset
    endOffset: number;     // End offset
  };
}

/**
 * Text Edit information interface
 */
export interface TextEdit {
  nodeId: string;        // sid of edited inline-text node
  oldText: string;       // Text before edit
  newText: string;       // Text after edit
  editPosition: number;  // Model offset where edit started
  editType: 'insert' | 'delete' | 'replace';
  insertedLength: number;
  deletedLength: number;
  insertedText: string;  // Text content to insert/replace
}

/**
 * Decorator Management operations
 * 
 * Provides decorator range adjustment functionality.
 * Actual storage is managed in editor-view-dom,
 * but provides logic to automatically adjust decorator ranges during text editing.
 */
export class DecoratorOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * Adjust decorator ranges according to text editing
   * 
   * @param decorators - Array of decorators to adjust
   * @param nodeId - sid of edited inline-text node
   * @param edit - Text edit information
   * @returns Adjusted decorator array
   */
  adjustRanges(
    decorators: DecoratorRange[],
    nodeId: string,
    edit: TextEdit
  ): DecoratorRange[] {
    if (!decorators || decorators.length === 0) return decorators;
    
    const { editPosition, insertedLength, deletedLength } = edit;
    const delta = insertedLength - deletedLength;
    const editEnd = editPosition + deletedLength;  // End position of deletion
    
    return decorators.map(decorator => {
      // Only adjust decorators applied to this node
      if (decorator.target.sid !== nodeId) {
        return decorator;
      }
      
      const { startOffset, endOffset } = decorator.target;
      
      // If edit completely erases decorator range
      if (editPosition <= startOffset && editEnd >= endOffset) {
        // Decorator range is completely deleted → remove (handled in filter)
        return {
          ...decorator,
          target: {
            ...decorator.target,
            startOffset: 0,
            endOffset: 0  // Set to invalid range to remove in filter
          }
        };
      }
      
      // If edit position is before decorator range
      if (editPosition <= startOffset) {
        return {
          ...decorator,
          target: {
            ...decorator.target,
            startOffset: startOffset + delta,
            endOffset: endOffset + delta
          }
        };
      }
      
      // If edit position is within decorator range
      if (editPosition < endOffset) {
        // If deletion erases part of decorator range
        if (deletedLength > 0 && editEnd > startOffset && editEnd < endOffset) {
          // Reduce end by deleted portion
          return {
            ...decorator,
            target: {
              ...decorator.target,
              endOffset: endOffset + delta
            }
          };
        }
        // If only insertion or deletion ends outside decorator range
        return {
          ...decorator,
          target: {
            ...decorator.target,
            endOffset: endOffset + delta
          }
        };
      }
      
      // If edit position is after decorator range
      // Decorator range remains unchanged
      return decorator;
    }).filter(decorator => {
      // Remove invalid ranges
      const { startOffset, endOffset } = decorator.target;
      return startOffset >= 0 && endOffset > startOffset;
    });
  }
}

