/**
 * PositionCalculator: Decorator의 위치를 계산하는 유틸리티
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
   * Decorator의 위치 계산
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
    
    // Block decorator: 요소 전체 영역
    if (target.startOffset === undefined && target.endOffset === undefined) {
      const rect = this.domQuery.getBoundingRect(target.sid);
      if (!rect) return null;
      
      // 'before' / 'after' 상대 배치 지원 (block 대상)
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
      
      // 기본: 대상 영역과 동일 위치/크기 (overlay)
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    }
    
    // Inline decorator: 텍스트 범위
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
      
      // 같은 줄인 경우
      if (Math.abs(startPos.top - endPos.top) < 1) {
        return {
          top: startPos.top,
          left: startPos.left,
          width: endPos.left - startPos.left,
          height: startPos.height
        };
      }
      
      // 여러 줄인 경우: 첫 줄 시작부터 마지막 줄 끝까지
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

