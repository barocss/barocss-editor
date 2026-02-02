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
    const targetSid = 'sid' in target ? target.sid : target.startSid;

    // Block decorator: entire element area
    if (('sid' in target ? target.startOffset === undefined && target.endOffset === undefined : false) ||
        ('startSid' in target && target.startOffset === undefined && target.endOffset === undefined)) {
      const rect = this.domQuery.getBoundingRect(targetSid);
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
    
    // Inline decorator: text range (single-node or range target)
    const startOff = 'sid' in target ? target.startOffset : target.startOffset;
    const endOff = 'sid' in target ? target.endOffset : target.endOffset;
    if (startOff !== undefined && endOff !== undefined) {
      const startPos = this.domQuery.calculateTextPosition(targetSid, startOff);
      const endPos = this.domQuery.calculateTextPosition(targetSid, endOff);

      if (!startPos || !endPos) return null;

      if (Math.abs(startPos.top - endPos.top) < 1) {
        return {
          top: startPos.top,
          left: startPos.left,
          width: endPos.left - startPos.left,
          height: startPos.height
        };
      }

      const elementRect = this.domQuery.getBoundingRect(targetSid);
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

