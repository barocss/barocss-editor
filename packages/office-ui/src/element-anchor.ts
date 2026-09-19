/** The full anchor bounds, or null when hidden by the viewport or an overflow ancestor. */
export function visibleElementRect(element: HTMLElement): DOMRect | null {
  if (!element.isConnected || !element.getClientRects().length) return null;
  const at = element.getBoundingClientRect();
  if (at.width <= 0 || at.height <= 0) return null;
  return clipAnchorRect(at, element, false) ? at : null;
}

/** Intersect viewport coordinates with the visible client areas of the DOM ancestors. */
export function clipAnchorRect(at: DOMRect, element: HTMLElement, includeSelf = true): DOMRect | null {
  const win = element.ownerDocument.defaultView;
  if (!win || !element.isConnected || at.width < 0 || at.height <= 0) return null;
  const viewport = win.visualViewport;
  let left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  let right = left + (viewport?.width ?? win.innerWidth), bottom = top + (viewport?.height ?? win.innerHeight);
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = win.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return null;
    if (parent === element && !includeSelf) continue;
    const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const bounds = parent.getBoundingClientRect();
    const sx = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1;
    const sy = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1;
    if (clipX) {
      const edge = bounds.left + parent.clientLeft * sx;
      left = Math.max(left, edge); right = Math.min(right, edge + parent.clientWidth * sx);
    }
    if (clipY) {
      const edge = bounds.top + parent.clientTop * sy;
      top = Math.max(top, edge); bottom = Math.min(bottom, edge + parent.clientHeight * sy);
    }
  }
  left = Math.max(left, at.left); top = Math.max(top, at.top);
  // A collapsed text caret is a valid zero-width anchor.
  right = Math.min(right, at.right); bottom = Math.min(bottom, at.bottom);
  return (right > left || (at.width === 0 && right === left)) && bottom > top
    ? new DOMRect(left, top, right - left, bottom - top) : null;
}

/** Event-driven DOM geometry tracking. No editor or document model dependency. */
export function observeElementAnchor(scope: HTMLElement, find: () => HTMLElement | null,
  onChange: (element: HTMLElement | null, at: DOMRect | null) => void): () => void {
  const win = scope.ownerDocument.defaultView;
  if (!win) return () => {};
  let frame = 0, stopped = false, target: HTMLElement | null = null;
  const schedule = () => {
    if (stopped || frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; measure(); });
  };
  const resize = new ResizeObserver(schedule);
  const measure = () => {
    const next = find();
    if (next !== target) {
      if (target && target !== scope) resize.unobserve(target);
      target = next;
      if (target && target !== scope) resize.observe(target);
    }
    onChange(target, target ? visibleElementRect(target) : null);
  };
  const mutations = new MutationObserver(schedule);
  mutations.observe(scope, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  resize.observe(scope);
  for (let parent = scope.parentElement; parent; parent = parent.parentElement) {
    resize.observe(parent);
    mutations.observe(parent, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  win.addEventListener('scroll', schedule, true);
  win.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('scroll', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  measure();
  return () => {
    stopped = true; win.cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
    win.removeEventListener('scroll', schedule, true);
    win.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('scroll', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
  };
}
