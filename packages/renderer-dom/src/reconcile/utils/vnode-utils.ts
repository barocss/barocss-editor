import { VNode, DOMAttribute } from '../../vnode/types';

/**
 * Find the first element VNode in a VNode tree
 * Used to find the first element when root VNode has no tag
 */
export function findFirstElementVNode(node: VNode): VNode | null {
  if (node && node.tag) return node;
  const stack: any[] = Array.isArray(node.children) ? [...node.children] : [];
  while (stack.length) {
    const n = stack.shift();
    if (n && typeof n === 'object' && 'tag' in n && n.tag) return n as VNode;
    if (n && typeof n === 'object' && Array.isArray(n.children)) stack.unshift(...n.children);
  }
  return null;
}

/**
 * Normalize class value to array of strings
 * Handles string, array, and object formats
 */
export function normalizeClasses(classValue: any): string[] {
  if (typeof classValue === 'string') {
    return classValue.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(classValue)) {
    return classValue.flatMap(c => normalizeClasses(c)).filter(Boolean);
  }
  if (typeof classValue === 'object' && classValue !== null) {
    return Object.entries(classValue)
      .filter(([_, value]) => Boolean(value))
      .map(([key]) => key);
  }
  return [];
}

/**
 * Check if two VNodes have the same structure (for matching elements without sid)
 * Compares: tag, class, and children count/structure
 */
export function vnodeStructureMatches(prev: VNode, next: VNode): boolean {
  // Tag must match
  if (prev.tag !== next.tag) {
    return false;
  }
  
  // Class must match (structural matching)
  const prevClasses = normalizeClasses(prev.attrs?.class || prev.attrs?.className).sort();
  const nextClasses = normalizeClasses(next.attrs?.class || next.attrs?.className).sort();
  if (prevClasses.length !== nextClasses.length) {
    return false;
  }
  if (!prevClasses.every((cls, i) => cls === nextClasses[i])) {
    return false;
  }
  
  // Children count should match (rough structural similarity)
  const prevChildrenCount = Array.isArray(prev.children) ? prev.children.length : (prev.text !== undefined ? 1 : 0);
  const nextChildrenCount = Array.isArray(next.children) ? next.children.length : (next.text !== undefined ? 1 : 0);
  if (prevChildrenCount !== nextChildrenCount) {
    return false;
  }
  
  return true;
}

/**
 * Get VNode identifier (sid or data-decorator-sid from attrs)
 * 
 * At reconcile level, only use VNode identifier without distinguishing decorators
 * Return only identifier purely without domain knowledge
 * 
 * IMPORTANT: decorator info is stored in attrs, so also read from attrs
 */
export function getVNodeId(vnode: VNode | undefined | null): string | undefined {
  if (!vnode) return undefined;
  // sid is at top-level (component VNode)
  if (vnode.sid) return vnode.sid;
  // decorator info is stored in attrs (set in VNodeBuilder)
  return vnode.attrs?.[DOMAttribute.DECORATOR_SID];
}

