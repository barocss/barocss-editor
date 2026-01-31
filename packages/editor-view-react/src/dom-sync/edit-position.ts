/**
 * DOM ↔ model position utilities for MutationObserver path.
 * Ported from editor-view-dom edit-position-converter; uses @barocss/text-run-index.
 */
import { buildTextRunIndex } from '@barocss/text-run-index';

export function findClosestInlineTextNode(node: Node): Element | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as Element;
      if (el.getAttribute('data-bc-sid')) return el;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Reconstruct full text of an inline-text container from DOM (all text nodes in order).
 */
export function reconstructModelTextFromDOM(inlineTextNode: Element): string {
  const runs = buildTextRunIndex(inlineTextNode, undefined, {
    normalizeWhitespace: false,
  });
  return runs.runs.map((r) => r.domTextNode.textContent ?? '').join('');
}
