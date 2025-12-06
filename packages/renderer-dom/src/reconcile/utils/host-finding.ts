import { VNode } from '../../vnode/types';
import { findChildHost } from './dom-utils';
import { getVNodeId, normalizeClasses } from './vnode-utils';

/**
 * Find existing host element for a child VNode
 * 
 * This function implements React-style reconciliation matching:
 * 
 * 1. Key-based matching (SID/decoratorSID) - React's key prop
 * 2. Type-based matching (tag) + Index - React's type + index fallback
 * 
 * @param parent - Parent DOM element
 * @param childVNode - Child VNode to find host for
 * @param childIndex - Index where child should be positioned
 * @param prevChildVNodes - Previous child VNodes for type/index matching
 * @param prevChildToElement - Map of prevChildVNode -> DOM element for fallback lookup
 * @returns Existing host element or null if not found
 */
export function findHostForChildVNode(
  parent: HTMLElement,
  childVNode: VNode,
  childIndex: number,
  prevChildVNodes: (VNode | string | number)[],
  prevChildToElement: Map<VNode | string | number, HTMLElement | Text>
): HTMLElement | null {
  let host: HTMLElement | null = null;
  
  // Strategy 1: Key-based matching (React's key prop)
  // VNode identifier (sid or data-decorator-sid from attrs) acts as key
  // Compare only unified ID with getVNodeId() without domain knowledge
  const vnodeId = getVNodeId(childVNode);
  if (vnodeId) {
    // Try index-based matching first (prevChildVNode at same index)
    if (childIndex < prevChildVNodes.length) {
      const prevChild = prevChildVNodes[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        // Reuse if prevChildVNode at same index has same ID
        if (prevId === vnodeId) {
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            host = prevChildVNode.meta.domElement;
          } else {
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              host = candidateElement as HTMLElement;
            }
          }
        }
      }
    }
    
    // Fallback: find VNode with same ID in prevChildVNodes (index-based)
    // IMPORTANT: when multiple VNodes have same ID, select one closest to index
    if (!host) {
      let bestMatch: HTMLElement | null = null;
      let minIndexDiff = Infinity;
      
      for (let i = 0; i < prevChildVNodes.length; i++) {
        const prevChild = prevChildVNodes[i];
        if (typeof prevChild !== 'object' || prevChild === null) continue;
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        if (prevId !== vnodeId) continue;
        
        // Calculate index difference
        const indexDiff = Math.abs(i - childIndex);
        if (indexDiff < minIndexDiff) {
          minIndexDiff = indexDiff;
          
          // Use DOM element from prevVNode meta if available
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            bestMatch = prevChildVNode.meta.domElement;
          } else {
            // Fallback: use prevChildToElement map
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              bestMatch = candidateElement as HTMLElement;
            }
          }
        }
      }
      
      if (bestMatch) {
        host = bestMatch;
      }
    }
    
    // If not found from prevChildVNodes, try local search within parent
    // IMPORTANT: when prevChildVNodes is missing, don't search for elements with same ID,
    // always create new (to create different DOM elements for each when multiple VNodes have same ID)
    // findChildHost is only used when prevVNode exists (to find already matched elements)
    // If prevChildVNodes is missing, don't call findChildHost and return null to create new
    if (!host && prevChildVNodes.length > 0) {
      host = findChildHost(parent, childVNode, childIndex);
    }
    
    // Remove global search: compare only based on children like React
    // Cross-parent move creates new (React style)
  } else {
    // Strategy 2: Type-based matching + Index (React's type + index fallback)
    // Same tag at same index means same element
    // Check only structural properties without domain knowledge
    // VNodes with ID are already processed above, so only structural matching for VNodes without ID
    if (!vnodeId) {
      const prevChild = prevChildVNodes[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        // Check if same type (tag) - React's type comparison
        if (prevChildVNode.tag === childVNode.tag) {
          // Use DOM element from prevVNode meta if available
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            host = prevChildVNode.meta.domElement;
          } else {
            // Fallback: use prevChildToElement map
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              host = candidateElement as HTMLElement;
            }
          }
        }
      }
    }
    
    // Strategy 3: Index-based fallback (same tag at same index in DOM)
    // This is React's last resort when key is missing
    // Check only structural properties without domain knowledge
    // VNodes with ID are already processed above, so only structural matching for VNodes without ID
    if (!host && childVNode.tag && !vnodeId) {
      host = findChildHost(parent, childVNode, childIndex);
    }
  }
  
  return host;
}

/**
 * Find host element in parent's children only (no global search)
 * React-style: compare only based on children
 * 
 * @param parent - Parent DOM element
 * @param vnode - VNode to find host for
 * @param prevVNode - Previous VNode (for matching)
 * @param childIndex - Index where child should be positioned
 * @returns Existing host element or null if not found
 */
export function findHostInParentChildren(
  parent: HTMLElement,
  vnode: VNode,
  prevVNode: VNode | undefined,
  childIndex: number
): HTMLElement | null {
  const vnodeId = getVNodeId(vnode);
  
  // 1. Find VNode with same ID in prevVNode.children (index-based)
  // IMPORTANT: when multiple VNodes have same ID, select one closest to index
  if (prevVNode?.children && vnodeId) {
    // First check prevChildVNode at same index
    if (childIndex < prevVNode.children.length) {
      const prevChild = prevVNode.children[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        // Reuse if prevChildVNode at same index has same ID
        if (prevId === vnodeId) {
          if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
            const domEl = prevChildVNode.meta.domElement;
            // Check if child of current parent
            if (domEl.parentElement === parent) {
              return domEl;
            }
          }
        }
      }
    }
    
    // Fallback: find VNode with same ID closest to index
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < prevVNode.children.length; i++) {
      const prevChild = prevVNode.children[i];
      if (typeof prevChild !== 'object' || prevChild === null) continue;
      const prevChildVNode = prevChild as VNode;
      const prevId = getVNodeId(prevChildVNode);
      if (prevId === vnodeId) {
        if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
          const domEl = prevChildVNode.meta.domElement;
          // Check if child of current parent
          if (domEl.parentElement === parent) {
            // Calculate index difference
            const indexDiff = Math.abs(i - childIndex);
            if (indexDiff < minIndexDiff) {
              minIndexDiff = indexDiff;
              bestMatch = domEl;
            }
          }
        }
      }
    }
    
    if (bestMatch) {
      return bestMatch;
    }
  }
  
  // 2. Find element with same ID in parent.children (index-based)
  // IMPORTANT: when prevVNode is missing, don't search for elements with same ID,
  // always create new (to create different DOM elements for each when multiple VNodes have same ID)
  // Only search for elements with same ID when prevVNode exists (to find already matched elements)
  if (vnodeId && prevVNode) {
    const children = Array.from(parent.children);
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childEl = child as HTMLElement;
      const childSid = childEl.getAttribute('data-bc-sid');
      const childDecoratorSid = childEl.getAttribute('data-decorator-sid');
      if (childSid === vnodeId || childDecoratorSid === vnodeId) {
        // Calculate index difference
        const indexDiff = Math.abs(i - childIndex);
        if (indexDiff < minIndexDiff) {
          minIndexDiff = indexDiff;
          bestMatch = childEl;
        }
      }
    }
    
    if (bestMatch) {
      return bestMatch;
    }
  }
  
  // 3. Structural matching in prevVNode.children (when ID is missing)
  // Index alone is insufficient, so structural matching is needed
  if (!vnodeId && prevVNode?.children) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        // Exclude VNodes with ID (already processed above)
        if (getVNodeId(c)) return false;
        // Tag must match
        if (c.tag !== vnode.tag) return false;
        // Class matching (structural matching)
        if (vnode.attrs?.class || vnode.attrs?.className) {
          const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
          const prevClasses = normalizeClasses(c.attrs?.class || c.attrs?.className);
          return vnodeClasses.every(cls => prevClasses.includes(cls));
        }
        return true; // If no classes, match by tag only
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // Check if child of current parent
      if (domEl.parentElement === parent) {
        return domEl;
      }
    }
  }
  
  // 4. Index-based matching (fallback, when ID is missing)
  if (childIndex < parent.children.length) {
    const candidate = parent.children[childIndex] as HTMLElement;
    if (candidate && candidate.tagName.toLowerCase() === (vnode.tag || '').toLowerCase()) {
      // Class matching (structural matching)
      if (vnode.attrs?.class || vnode.attrs?.className) {
        const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
        const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
        if (vnodeClasses.every(cls => candidateClasses.includes(cls))) {
          return candidate;
        }
      } else {
        return candidate;
      }
    }
  }
  
  return null;
}

/**
 * Find previous child VNode for a given child VNode
 * 
 * This is used to get the previous VNode for comparison during reconciliation.
 * Implements React-style matching:
 * 1. Key-based matching (SID/decoratorSID)
 * 2. Type-based matching + Index
 * 
 * @param childVNode - Current child VNode
 * @param childIndex - Index of current child
 * @param prevChildVNodes - Previous child VNodes array
 * @returns Previous child VNode or undefined if not found
 */
export function findPrevChildVNode(
  childVNode: VNode,
  childIndex: number,
  prevChildVNodes: (VNode | string | number)[]
): VNode | undefined {
  // Strategy 1: Key-based matching (React's key prop)
  // VNode identifier (sid or data-decorator-sid from attrs) acts as key
  const vnodeId = getVNodeId(childVNode);
  if (vnodeId) {
    return prevChildVNodes.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        const prevId = getVNodeId(c);
        return prevId === vnodeId;
      }
    );
  }
  
  // Strategy 3: Type-based matching + Index (React's type + index fallback)
  const prevChild = prevChildVNodes[childIndex];
  if (prevChild && typeof prevChild === 'object') {
    const prevChildVNode = prevChild as VNode;
    // Same type (tag) at same index means same element
    if (prevChildVNode.tag === childVNode.tag) {
      return prevChildVNode;
    }
  }
  
  return undefined;
}

