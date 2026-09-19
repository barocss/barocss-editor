import { clipAnchorRect, observeElementAnchor } from './element-anchor';

function rangeElement(range: Range): HTMLElement | null {
  const node = range.commonAncestorContainer;
  return (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
}

/** First visible selected line, clipped to its scroll containers. Also accepts a caret. */
export function visibleRangeRect(range: Range): DOMRect | null {
  const element = rangeElement(range);
  if (!element?.isConnected) return null;
  const rects = Array.from(range.getClientRects());
  if (!rects.length) rects.push(range.getBoundingClientRect());
  for (const rect of rects) {
    const visible = clipAnchorRect(rect, element);
    if (visible) return visible;
  }
  return null;
}

/** Track range geometry on layout, ancestor transforms, viewport and selection changes. */
export function observeRangeAnchor(scope: HTMLElement, find: () => Range | null,
  onChange: (at: DOMRect | null) => void): () => void {
  const measure = () => { const range = find(); onChange(range ? visibleRangeRect(range) : null); };
  const stop = observeElementAnchor(scope, () => { const range = find(); return range ? rangeElement(range) : null; }, measure);
  scope.ownerDocument.addEventListener('selectionchange', measure);
  return () => { stop(); scope.ownerDocument.removeEventListener('selectionchange', measure); };
}
