/**
 * DOMQuery: Content 레이어의 DOM 요소를 찾는 유틸리티
 * ComponentManager 캐시를 우선 활용하여 성능 최적화
 */
import { DOMRenderer } from '@barocss/renderer-dom';

export class DOMQuery {
  constructor(
    private contentLayer: HTMLElement,
    private contentRenderer?: DOMRenderer
  ) {}

  /**
   * sid로 DOM 요소 찾기
   * ComponentManager 캐시를 우선 사용, 없으면 querySelector
   */
  findElementBySid(sid: string): HTMLElement | null {
    // 1. ComponentManager 캐시 활용 (우선) - O(1)
    if (this.contentRenderer) {
      const componentManager = this.contentRenderer.getComponentManager();
      const instance = componentManager?.getComponentInstance(sid as any);
      if (instance?.element) {
        return instance.element;
      }
    }
    
    // 2. Fallback: querySelector - O(n)
    return this.contentLayer.querySelector(`[data-bc-sid="${sid}"]`);
  }

  /**
   * 텍스트 노드의 특정 offset 위치 계산 (contentLayer 기준 상대 좌표)
   */
  calculateTextPosition(
    sid: string,
    offset: number
  ): { top: number; left: number; height: number } | null {
    const element = this.findElementBySid(sid);
    if (!element) return null;
    
    // 텍스트 노드 찾기
    const textNode = this.findTextNode(element, offset);
    if (!textNode) return null;
    
    // Range로 위치 계산
    const range = document.createRange();
    range.setStart(textNode.node, Math.min(offset, textNode.length));
    range.collapse(true);
    
    const rect = range.getBoundingClientRect();
    const contentLayerRect = this.contentLayer.getBoundingClientRect();
    
    // contentLayer 기준 상대 좌표로 변환
    return {
      top: rect.top - contentLayerRect.top,
      left: rect.left - contentLayerRect.left,
      height: rect.height || 18
    };
  }

  /**
   * 요소의 경계 상자 계산 (contentLayer 기준 상대 좌표)
   */
  getBoundingRect(sid: string): DOMRect | null {
    const element = this.findElementBySid(sid);
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    const containerRect = this.contentLayer.getBoundingClientRect();
    
    // contentLayer 기준 상대 좌표로 변환
    return {
      top: rect.top - containerRect.top,
      left: rect.left - containerRect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom - containerRect.top,
      right: rect.right - containerRect.left,
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      toJSON: rect.toJSON
    } as DOMRect;
  }

  /**
   * 텍스트 노드와 offset 찾기
   */
  private findTextNode(
    element: HTMLElement,
    offset: number
  ): { node: Text; length: number } | null {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let currentOffset = 0;
    let node: Text | null;
    
    while ((node = walker.nextNode() as Text | null)) {
      const nodeLength = node.textContent?.length || 0;
      if (currentOffset + nodeLength >= offset) {
        return {
          node,
          length: nodeLength
        };
      }
      currentOffset += nodeLength;
    }
    
    return null;
  }
}

