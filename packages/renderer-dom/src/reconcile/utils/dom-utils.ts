import { VNode } from '../../vnode/types';
import { normalizeClasses, getVNodeId } from './vnode-utils';

/**
 * Find child host element by VNode identifier
 * Falls back to structural matching by index and tag
 */
export function findChildHost(
  parent: HTMLElement,
  vnode: VNode,
  childIndex?: number
): HTMLElement | null {
  // Find by VNode identifier (sid or data-decorator-sid from attrs)
  const vnodeId = getVNodeId(vnode);
  if (vnodeId && childIndex !== undefined) {
    // Find in DOM by data-bc-sid or data-decorator-sid (index-based)
    // IMPORTANT: when multiple elements have the same ID, select the one closest to the index
    const children = Array.from(parent.children);
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!(child instanceof HTMLElement)) continue;
      const isMatch = child.getAttribute('data-bc-sid') === vnodeId ||
        child.getAttribute('data-decorator-sid') === vnodeId;
      if (!isMatch) continue;
      
      // Calculate index difference
      const indexDiff = Math.abs(i - childIndex);
      if (indexDiff < minIndexDiff) {
        minIndexDiff = indexDiff;
        bestMatch = child;
      }
    }
    
    if (bestMatch) return bestMatch;
  }
  
  // Fallback: if no ID, reuse element with same tag at same index
  // Check only structural properties without domain knowledge
  const vnodeIdForFallback = getVNodeId(vnode);
  if (childIndex !== undefined && vnode.tag && !vnodeIdForFallback) {
    const children = Array.from(parent.children);
    
    // IMPORTANT: check element at childIndex position first
    if (childIndex < children.length) {
      const candidate = children[childIndex] as HTMLElement;
      if (candidate && candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        // Same tag and no sid, reuse
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          // Also compare classes for more accurate matching (structural matching)
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
              if (classesMatch) {
                return candidate;
              }
            } else {
              // If no classes, reuse by tag only
              return candidate;
            }
        }
      }
    }
    
    // IMPORTANT: if not found at childIndex position, traverse all child elements
    // (index may not match when prevVNode is missing)
    for (const candidate of children) {
      if (candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          // Also compare classes for more accurate matching (structural matching)
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              return candidate as HTMLElement;
            }
          } else {
            // If no classes, reuse by tag only
            return candidate as HTMLElement;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Query host element by sid within parent scope
 */
export function queryHost(parent: HTMLElement, sid: string): HTMLElement | null {
  return parent.querySelector(`:scope > [data-bc-sid="${sid}"]`) as HTMLElement | null;
}

/**
 * Reorder DOM children to match the ordered array
 * Moves elements to correct positions without removing them
 */
export function reorder(parent: HTMLElement, ordered: (HTMLElement | Text)[]): void {
  // Place in DOM according to order in ordered array
  // Iterate through each element, check if it's in correct position, and move if needed
  const orderedSet = new Set(ordered);
  
  // Don't remove elements not in ordered (handled in removeStale)
  // Only reorder elements in ordered
  // IMPORTANT: Must get current array again each time (DOM changes due to insertBefore)
  for (let i = 0; i < ordered.length; i++) {
    const want = ordered[i];
    
    // Check current DOM state again
    const currentNow = Array.from(parent.childNodes);
    
    // Check if current position is correct
    if (currentNow[i] !== want) {
      // Move to correct position
      const referenceNode = i < currentNow.length ? currentNow[i] : null;
      parent.insertBefore(want, referenceNode);
    }
  }
}

