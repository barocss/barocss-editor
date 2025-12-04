/**
 * DOM Reconcile Utils
 * Implements ReconcileUtils interface for DOM rendering
 */
import { VNode, VNodeTag } from './vnode/types';

// Minimal local types to decouple from external reconcile package
type WorkInProgress<T = HTMLElement> = {
  vnode?: any;
  previousVNode?: any;
  targetNode?: T | null;
  parent?: WorkInProgress<T> | null;
};

export interface ReconcileUtils<T = HTMLElement> {
  detectVNodeType(vnode: VNode): 'text' | 'element' | 'component' | 'portal';
  generateId(vnode: VNode): string;
  findTargetNode(vnode: VNode, container: T, parentWip?: WorkInProgress<T>): T | null | undefined;
}

/**
 * DOM-specific implementation of ReconcileUtils
 */
export class DOMReconcileUtilsAdapter implements ReconcileUtils<HTMLElement> {
  /**
   * Detect VNode type
   */
  detectVNodeType(vnode: VNode): 'text' | 'element' | 'component' | 'portal' {
    // Strict component detection: require both component marker and data-bc-component attribute
    // This prevents element renderers from being misclassified when someone accidentally sets vnode.stype
    if (vnode.stype && vnode.attrs?.['data-bc-component']) {
      return 'component';
    }
    
    // tag가 있으면 element로 분류 (text 속성이 있어도)
    if (vnode.tag) {
      if (vnode.tag === VNodeTag.PORTAL) return 'portal';
      return 'element';
    }
    // tag가 없고 text만 있으면 text 노드
    if (vnode.text !== undefined) return 'text';
    return 'element';
  }

  /**
   * Generate unique ID for VNode
   */
  generateId(vnode: VNode): string {
    if (!vnode) return `wip-${Math.random().toString(36).substr(2, 9)}`;
    
    // 1. Use data-bc-sid if available (from Model.sid)
    if (vnode.attrs?.['data-bc-sid']) {
      return vnode.attrs['data-bc-sid'];
    }
    
    // 2. For components, use component name + random suffix
    if (vnode.stype) {
      return `${vnode.stype}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // 3. Use tag + random suffix for elements (consistent ID for reconciliation)
    if (vnode.tag) {
      return `${vnode.tag}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // 4. Fallback to random ID
    return `wip-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find existing target node for VNode
   */
  findTargetNode(vnode: VNode, container: HTMLElement, parentWip?: WorkInProgress<HTMLElement>): HTMLElement | null | undefined {
    
    
    // For key-based reconciliation, try to find by key attribute first
    // Note: key and sid are separate - key is for reconciliation, sid is for model identity
    // We store key in a data attribute for DOM lookup (if needed)
    // But reconcile should work without DOM queries - this is just for initial targetNode finding
    if (vnode.key && parentWip?.targetNode) {
      const parent = parentWip.targetNode as HTMLElement;
      const children = Array.from(parent.children) as HTMLElement[];
      for (const child of children) {
        // Try to match by data-key or data-id attribute used in tests
        const dataKey = child.getAttribute('data-key');
        const dataId = child.getAttribute('data-id');
        if (dataKey === vnode.key || dataId === vnode.key) {
          return child;
        }
      }
    }
    
    // Root node: search only direct children of container
    if (!parentWip) {
      if (vnode.tag) {
        const directChildren = Array.from(container.children) as HTMLElement[];
        
        // For root nodes with multiple children of the same tag, we need position-based matching
        // Find the index of vnode in container's expected children by matching with previous children
        // This is important when there are multiple root nodes with the same tag (e.g., two <ul> elements)
        
        // Try to match by data-bc-sid first (most reliable)
        if (vnode.attrs?.['data-bc-sid']) {
          for (const child of directChildren) {
            if (child.tagName.toLowerCase() === vnode.tag.toLowerCase() &&
                child.getAttribute('data-bc-sid') === vnode.attrs['data-bc-sid']) {
              return child;
            }
          }
        }
        
        // For position-based matching with multiple root nodes of the same tag,
        // we need to match by index in container.children
        // Since we don't have parent context, we need to use container's expected children order
        // But we don't have access to that here - we only have prevVNode (vnode parameter)
        // So we need to find the index of prevVNode in the previous container's children
        
        // Try to find by matching with other root nodes of the same tag
        // If container has multiple children of the same tag, we need to distinguish by position
        // We can use the order in which nodes were created (they should match vnode.children order)
        // But since we don't have that info, we try to match by content if available
        
        // For now, return the first matching child
        // This works if children are created in the same order as vnode.children
        // TODO: Improve this by tracking created root nodes or using better matching
        
        
        
        for (const child of directChildren) {
          if (child.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
            // Match by tag only for root nodes - return first match
            // Note: This assumes children are created in the same order as vnode.children
            // For multiple root nodes of the same tag, this may return the wrong one
            return child;
          }
        }
      }
      return undefined;
    }
    
    // Child node: search within parent
    const parent = parentWip.targetNode as HTMLElement;
    if (!parent) {
      return undefined;
    }
    
    // For root-level children (e.g., ul elements that are children of div),
    // we need position-based matching to distinguish between multiple children of the same tag
    // This is especially important when there are multiple root-level children with the same tag
    // We match by finding the index of prevVNode in parentWip.previousVNode.children,
    // then use that same index in parent.children (not matchingChildren) to find the DOM node
      if (parentWip.vnode?.children && parentWip.previousVNode?.children && vnode.tag) {
      // Find the index of prevVNode in parentWip.previousVNode.children
      const prevParentChildren = parentWip.previousVNode.children;
      let prevVNodeIndex = -1;
      for (let i = 0; i < prevParentChildren.length; i++) {
        const prevChild = prevParentChildren[i];
        if (prevChild && typeof prevChild === 'object' && 'tag' in prevChild) {
          const prevChildVNode = prevChild as VNode;
          if (prevChildVNode.tag === vnode.tag) {
            // Match by tag and optionally by content/children
            // For elements like ul, we can match by children content
            const prevChildrenText = (prevChildVNode.children || []).map((c: any) => c?.text).join(',');
            const vnodeChildrenText = (vnode.children || []).map((c: any) => c?.text).join(',');
            if (prevChildrenText && vnodeChildrenText && prevChildrenText === vnodeChildrenText) {
              prevVNodeIndex = i;
              break;
            } else if (!prevChildrenText && !vnodeChildrenText) {
              // Both have no children, match by position
              prevVNodeIndex = i;
              break;
            }
          }
        }
      }
      
      // If we found the index, use it to find the corresponding DOM node
      // Use the index in parent.children directly (not filtered matchingChildren)
      // This ensures we get the correct node even if there are other elements between
      if (prevVNodeIndex >= 0) {
        const directChildren = Array.from(parent.children) as HTMLElement[];
        // Find the node at the same index that matches the tag
        // We need to count only elements with matching tag to get the correct index
        let matchingIndex = 0;
        for (let i = 0; i < directChildren.length; i++) {
          const child = directChildren[i];
          if (child.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
            if (matchingIndex === prevVNodeIndex) {
              
              return child;
            }
            matchingIndex++;
          }
        }
      }
    }
    
    // Verify that parentWip is correct by checking if parent's children match parentWip.vnode.children
    // This helps identify cases where parentWip points to wrong parent
    try {
      // minimal verification (no logging)
      const directChildren = Array.from(parent.children) as HTMLElement[];
      void directChildren;
    } catch {}
    
    // 1. Try to find by data-bc-sid attribute (Schema/Model based data only)
    if (vnode.attrs?.['data-bc-sid']) {
      const node = parent.querySelector(`[data-bc-sid="${vnode.attrs['data-bc-sid']}"]`) as HTMLElement | null;
      if (node && node.parentElement === parent) {
        return node;
      }
    }
    
    // 2. Try to find by tag and content (element with text content, not Text Node)
    // Note: vnode parameter is actually prevVNode when called from createWorkInProgressNode
    // So we match by prevVNode's text to find existing DOM node
    if (vnode.tag) {
      const directChildren = Array.from(parent.children) as HTMLElement[];
      
      // IMPORTANT: We need to find which child in parentWip.vnode.children corresponds to prevVNode (vnode parameter)
      // The DOM structure matches parentWip.vnode.children, so we need to find the index in parentWip.vnode.children
      // that corresponds to the prevVNode (vnode parameter)
      
      // Strategy: Find prevVNode's index in parentWip.previousVNode.children,
      // then use that same index in parentWip.vnode.children to get the corresponding nextVNode,
      // then find the DOM node that matches that nextVNode's text (or use position if text doesn't match)
      
      let targetIndex = -1;
      
      if (parentWip.previousVNode?.children && parentWip.vnode?.children) {
        const prevParentChildren = parentWip.previousVNode.children;
        const nextParentChildren = parentWip.vnode.children;
        
        // Step 1: Find prevVNode's index in prevParentChildren
        let prevVNodeIndex = -1;
        for (let i = 0; i < prevParentChildren.length; i++) {
          const prevChild = prevParentChildren[i];
          if (prevChild && typeof prevChild === 'object' && 'tag' in prevChild) {
            const prevChildVNode = prevChild as VNode;
            // Match by tag and text (exact match)
            if (prevChildVNode.tag === vnode.tag && prevChildVNode.text === vnode.text) {
              prevVNodeIndex = i;
              break;
            }
          }
        }
        
        // Verify that prevVNode was found in parentPrevChildren
        // If not found, parentWip might be pointing to wrong parent
        if (prevVNodeIndex === -1) {
          try {
            console.warn('[findTargetNode] prevVNode not found in parentPrevChildren', {
              tag: vnode.tag,
              text: vnode.text,
              parentTag: parentWip.vnode?.tag,
              parentPrevChildren: prevParentChildren.map((c: any, i: number) => ({
                index: i,
                tag: c?.tag,
                text: c?.text
              }))
            });
          } catch {}
          // Don't use position-based matching if prevVNode not found
          // Fall through to text/tag matching below
        }
        
        // Step 2: Use the same index in nextParentChildren to find the corresponding nextVNode
        if (prevVNodeIndex >= 0 && prevVNodeIndex < nextParentChildren.length) {
          const nextVNode = nextParentChildren[prevVNodeIndex];
          if (nextVNode && typeof nextVNode === 'object' && 'tag' in nextVNode) {
            const nextVNodeTyped = nextVNode as VNode;
            
            // Step 3: Find DOM node that matches nextVNode's tag and text (or position)
            // First try to match by text if available
            if (nextVNodeTyped.text !== undefined && nextVNodeTyped.tag) {
              
              
              // Find DOM node that matches nextVNode's text
              // IMPORTANT: Only search within directChildren (parent's children)
              // This ensures we don't match nodes from wrong parent
              for (let i = 0; i < directChildren.length; i++) {
                const domChild = directChildren[i];
                // Verify that domChild's parent matches parent
                if (domChild.parentElement !== parent) {
                  continue; // Skip nodes from different parent
                }
                if (domChild.tagName.toLowerCase() === nextVNodeTyped.tag.toLowerCase() &&
                    domChild.textContent === String(nextVNodeTyped.text)) {
                  targetIndex = i;
                  
                  break;
                }
              }
            }
            
            // If text match failed, use position-based matching
            // But only if prevVNodeIndex is valid and we're sure parentWip is correct
            if (targetIndex === -1 && prevVNodeIndex >= 0 && prevVNodeIndex < directChildren.length && nextVNodeTyped.tag) {
              const domChild = directChildren[prevVNodeIndex];
              // Verify that domChild's parent matches parent
              if (domChild && domChild.parentElement === parent &&
                  domChild.tagName.toLowerCase() === nextVNodeTyped.tag.toLowerCase()) {
                targetIndex = prevVNodeIndex;
              }
            }
          }
        }
      }
      
      // Return the found DOM node
      if (targetIndex >= 0 && targetIndex < directChildren.length) {
        const elementAtIndex = directChildren[targetIndex];
          if (elementAtIndex && vnode.tag && elementAtIndex.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
          // Verify that the found node's parent matches parentWip.targetNode
          // This prevents returning a node from the wrong parent
          if (elementAtIndex.parentElement !== parent) {
          
            // Don't return node from wrong parent - fall through to fallback matching
            targetIndex = -1;
          } else {
            return elementAtIndex;
          }
        }
      }
      
      // Fallback: Try to match by prevVNode's text (if available) to find existing DOM node
      // This is important for text updates where vnode.text != prevVNode.text
      if (vnode.text !== undefined) {
        
        for (const element of directChildren) {
          if (element.tagName.toLowerCase() === vnode.tag.toLowerCase() && 
              element.textContent === String(vnode.text)) {
            
            return element;
          }
        }
      }
      
      // Last resort: return first matching tag
      // This handles cases where text might have changed or where we're matching by position
      
      for (const element of directChildren) {
        if (element.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
          
          return element;
        }
      }
    }
    
    
    return undefined;
  }
}

