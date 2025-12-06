/**
 * PositionCalculator: Utility for calculating Decorator position
 */
import type { Decorator, DecoratorTarget } from './types';
import { DOMQuery } from './dom-query';

export interface DecoratorPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export class PositionCalculator {
  constructor(private domQuery: DOMQuery) {}

  /**
   * Calculate Decorator position
   */
  calculatePosition(decorator: Decorator): DecoratorPosition | null {
    if (!decorator.target) {
      // Layer decorator without target (overlay)
      if (decorator.data?.position) {
        return decorator.data.position as DecoratorPosition;
      }
      return null;
    }

    const target = decorator.target;
    
    // Block decorator: entire element area
    if (target.startOffset === undefined && target.endOffset === undefined) {
      const rect = this.domQuery.getBoundingRect(target.sid);
      if (!rect) return null;
      
      // Support 'before' / 'after' relative placement (for block target)
      const pos = (decorator as any)?.position as ('before' | 'after' | undefined);
      const margin = (decorator as any)?.data?.margin ?? 0;
      if (pos === 'after') {
        return {
          top: rect.top + rect.height + margin,
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      }
      if (pos === 'before') {
        return {
          top: Math.max(0, rect.top - rect.height - margin),
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      }
      
      // Default: same position/size as target area (overlay)
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    }
    
    // Inline decorator: text range
    if (target.startOffset !== undefined && target.endOffset !== undefined) {
      const startPos = this.domQuery.calculateTextPosition(
        target.sid,
        target.startOffset
      );
      const endPos = this.domQuery.calculateTextPosition(
        target.sid,
        target.endOffset
      );
      
      if (!startPos || !endPos) return null;
      
      // If same line
      if (Math.abs(startPos.top - endPos.top) < 1) {
        return {
          top: startPos.top,
          left: startPos.left,
          width: endPos.left - startPos.left,
          height: startPos.height
        };
      }
      
      // If multiple lines: from start of first line to end of last line
      const elementRect = this.domQuery.getBoundingRect(target.sid);
      if (!elementRect) return null;
      
      const startRect = {
        top: startPos.top,
        left: startPos.left,
        height: startPos.height
      };
      const endRect = {
        top: endPos.top,
        left: endPos.left,
        height: endPos.height
      };
      
      return {
        top: startRect.top,
        left: startRect.left,
        width: elementRect.width - startRect.left,
        height: endRect.top + endRect.height - startRect.top
      };
    }
    
    return null;
  }
}

