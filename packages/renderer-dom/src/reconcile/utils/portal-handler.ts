import { VNode, VNodeTag } from '../../vnode/types';
import { ModelData } from '@barocss/dsl';
import { DOMOperations } from '../../dom-operations';

/**
 * Portal configuration for tracking portal hosts
 */
export interface PortalEntry {
  target: HTMLElement;
  host: HTMLElement;
}

/**
 * Handle portal VNode rendering
 * 
 * Portals allow rendering content to a different DOM target than the parent.
 * This function:
 * 1. Finds or creates a portal host in the target element
 * 2. Renders portal content into the host
 * 3. Tracks portal usage for cleanup
 * 
 * @param childVNode - Portal VNode (tag === 'portal' with portal property)
 * @param dom - DOM operations helper
 * @param reconcileFunc - Function to reconcile portal content (reconcileVNodeChildren signature: (host, prevVNode, nextVNode, context) => void)
 * @param currentVisitedPortalIds - Set to track visited portals (for cleanup)
 * @param portalHostsById - Map of portalId -> { target, host } for tracking
 * @returns true if portal was handled (should continue to next child)
 */
export function handlePortalVNode(
  childVNode: VNode,
  dom: DOMOperations,
  reconcileFunc: (host: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context: any) => void,
  currentVisitedPortalIds: Set<string> | null,
  portalHostsById: Map<string, PortalEntry>
): boolean {
  // Check if this is a portal VNode
  if (childVNode.tag !== VNodeTag.PORTAL || !childVNode.portal || !childVNode.portal.target) {
    return false;
  }

  const targetEl = childVNode.portal.target as HTMLElement;
  
  // Get portal content VNode (first child)
  const contentVNode = (Array.isArray(childVNode.children) && 
                        childVNode.children[0] && 
                        typeof childVNode.children[0] === 'object')
    ? (childVNode.children[0] as VNode)
    : undefined;
  
  if (!contentVNode) {
    return true; // No content to render, but still handled as portal
  }

  // Get or generate portal ID
  const portalId = childVNode.portal.portalId || 'portal-default';
  
  // Mark portal as visited (for cleanup tracking)
  if (currentVisitedPortalIds) {
    currentVisitedPortalIds.add(portalId);
  }

  // Find or create portal host in target element
  let portalHost = Array.from(targetEl.children).find((el: Element) => 
    el.getAttribute('data-bc-sid') === portalId
  ) as HTMLElement | null;
  
  if (!portalHost) {
    // Create new portal host
    portalHost = dom.createSimpleElement('div', targetEl);
    dom.setAttribute(portalHost, 'data-bc-sid', portalId);
    // Note: data-bc-stype is no longer exposed in DOM (sid is sufficient for model lookup)
    targetEl.appendChild(portalHost);
  }

  // Cleanup: if portal host moved to different target, remove old host
  const prev = portalHostsById.get(portalId);
  if (prev && prev.host !== portalHost) {
    if (prev.host.parentElement) {
      prev.host.parentElement.removeChild(prev.host);
    }
  }
  
  // Update portal tracking map
  portalHostsById.set(portalId, { target: targetEl, host: portalHost });

  // Render portal content into host
  // Portal content is reconciled using reconcileVNodeChildren (prevVNode is undefined for initial render)
  const portalContext: any = {
    __isReconciling: true
  };
  reconcileFunc(portalHost, undefined, contentVNode, portalContext);

  return true; // Portal handled
}

