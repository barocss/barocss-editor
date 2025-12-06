import { VNode } from '../../vnode/types';
import { ComponentManager } from '../../component-manager';

/**
 * Pre-clean: Remove direct element children whose data-bc-sid is not expected anymore.
 * 
 * This function removes elements that have a data-bc-sid attribute but are no longer
 * in the expected children list. This is done BEFORE processing children to avoid
 * conflicts during reconciliation.
 * 
 * IMPORTANT: This function also calls unmountComponent for removed elements to ensure
 * proper component lifecycle management.
 * 
 * @param parent - Parent DOM element
 * @param childVNodes - Array of expected child VNodes
 * @param prevChildVNodes - Array of previous child VNodes (for finding prevChildVNode for unmount)
 * @param components - ComponentManager instance (for unmountComponent)
 * @param context - Reconciliation context (for unmountComponent)
 */
export function removeStaleEarly(
  parent: HTMLElement,
  childVNodes: (VNode | string | number)[],
  prevChildVNodes: (VNode | string | number)[],
  components: ComponentManager,
  context: any
): void {
  // Build set of desired child SIDs
  const desiredChildSids = new Set<string>();
  for (const c of childVNodes) {
    if (typeof c === 'object' && c && (c as any).sid) {
      desiredChildSids.add(String((c as any).sid));
    }
  }

  // If no desired SIDs, skip pre-clean (nothing to remove)
  if (desiredChildSids.size === 0) {
    return;
  }

  // Find elements to remove (have data-bc-sid but not in desiredChildSids)
  const toRemoveEarly: HTMLElement[] = [];
  parent.childNodes.forEach((n) => {
    if (n.nodeType === 1) {
      const el = n as HTMLElement;
      const sid = el.getAttribute('data-bc-sid');
      if (sid && !desiredChildSids.has(sid)) {
        toRemoveEarly.push(el);
      }
    }
  });

  // Remove elements and unmount components
  for (const el of toRemoveEarly) {
    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      // Try to find prevChildVNode for proper unmount
      const prevChildVNode = prevChildVNodes.find(
        (c): c is VNode => typeof c === 'object' && 'sid' in c && c.sid === sid
      );

      if (prevChildVNode) {
        try {
          components.unmountComponent(prevChildVNode, context as any);
        } catch (err) {
          console.error('[Reconciler.removeStaleEarly] Error unmounting component:', err);
        }
      } else {
        // If prevChildVNode cannot be found, get info directly from element and create temporary VNode
        try {
          const tempVNode: VNode = {
            tag: el.tagName.toLowerCase(),
            stype: el.getAttribute('data-bc-stype') || '',
            sid: sid
          } as any;
          components.unmountComponent(tempVNode, context as any);
        } catch (err) {
          console.error('[Reconciler.removeStaleEarly] Error unmounting component by sid:', err);
        }
      }
    }
    try {
      parent.removeChild(el);
    } catch {
      // Ignore errors (element may have already been removed)
    }
  }
}

