/**
 * Read-only measurement helpers: read positions/sizes without mutating the DOM
 */
export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Snapshot of getBoundingClientRect for an element */
export function getElementRect(el: Element): Rect {
  const r = (el as HTMLElement).getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height
  };
}

/** clientRects list for a Node (text/element) */
export function getClientRectsOfNode(node: Node): Rect[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const list = typeof (range as any).getClientRects === 'function'
      ? Array.from((range as any).getClientRects())
      : [] as any[];
    range.detach?.();
    return list.map((r) => ({
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    }));
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const list = Array.from((node as Element).getClientRects?.() || []);
    if (list.length) {
      return list.map(r => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }));
    }
    return [getElementRect(node as Element)];
  }
  return [];
}

/** Read scroll offsets (window or scroll container) */
export function getScrollOffsets(target: Element | Window = window): { x: number; y: number } {
  if (target === window) {
    return { x: window.scrollX || 0, y: window.scrollY || 0 };
  }
  const el = target as Element;
  return { x: (el as HTMLElement).scrollLeft || 0, y: (el as HTMLElement).scrollTop || 0 };
}


