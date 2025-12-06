/**
 * DOMQuery: Utility for finding DOM elements in Content layer
 * Prioritize ComponentManager cache for performance optimization
 */
import { DOMRenderer } from '@barocss/renderer-dom';

export class DOMQuery {
  constructor(
    private contentLayer: HTMLElement,
    private contentRenderer?: DOMRenderer
  ) {}

  /**
   * Find DOM element by sid
   * Prioritize ComponentManager cache, fallback to querySelector
   */
  findElementBySid(sid: string): HTMLElement | null {
    // 1. Use ComponentManager cache (priority) - O(1)
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
   * Calculate specific offset position of text node (relative coordinates based on contentLayer)
   */
  calculateTextPosition(
    sid: string,
    offset: number
  ): { top: number; left: number; height: number } | null {
    const element = this.findElementBySid(sid);
    if (!element) return null;
    
    // Find text node
    const textNode = this.findTextNode(element, offset);
    if (!textNode) return null;
    
    // Calculate position with Range
    const range = document.createRange();
    range.setStart(textNode.node, Math.min(offset, textNode.length));
    range.collapse(true);
    
    const rect = range.getBoundingClientRect();
    const contentLayerRect = this.contentLayer.getBoundingClientRect();
    
    // Convert to relative coordinates based on contentLayer
    return {
      top: rect.top - contentLayerRect.top,
      left: rect.left - contentLayerRect.left,
      height: rect.height || 18
    };
  }

  /**
   * Calculate element's bounding box (relative coordinates based on contentLayer)
   */
  getBoundingRect(sid: string): DOMRect | null {
    const element = this.findElementBySid(sid);
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    const containerRect = this.contentLayer.getBoundingClientRect();
    
    // Convert to relative coordinates based on contentLayer
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
   * Find text node and offset
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

