import { EffectTag, FiberNode } from './types';

/**
 * Implementation of React's getHostSibling algorithm
 * 
 * To find next sibling's DOM node:
 * 1. Start from fiber.sibling to find next sibling
 * 2. If sibling has DOM node, return it
 * 3. If sibling doesn't have DOM node, perform depth-first search to find first DOM node among children
 * 
 * React's actual implementation:
 * - When getHostSibling is called in commitPlacement, next sibling may not be committed yet
 * - However, domElement is already set in render phase, so can find next sibling's domElement
 * 
 * @param fiber - Current Fiber node
 * @returns Next sibling's DOM node or null
 */
export function getHostSibling(fiber: FiberNode): Node | null {
  // Find next sibling Fiber
  let sibling = fiber.sibling;
  
  // Return null if no next sibling
  if (!sibling) {
    return null;
  }
  
  // Start from next sibling to find sibling with DOM node
  while (sibling !== null) {
    // Skip siblings that are themselves being placed (React does the same).
    // Their DOM node is not in the tree yet, so it is not a usable anchor: using
    // it would make the caller insert relative to a node that has no position,
    // and treating it as "no anchor" would append and destroy sibling order.
    if (sibling.effectTag === EffectTag.PLACEMENT) {
      sibling = sibling.sibling;
      continue;
    }

    // If sibling has DOM node, return it
    // Text node (#text) or Host element (if has tag)
    if (sibling.domElement) {
      return sibling.domElement;
    }

    // If sibling doesn't have DOM node, find first DOM node among children
    if (sibling.child) {
      let childFiber: FiberNode | null = sibling.child;
      while (childFiber) {
        if (childFiber.domElement) {
          return childFiber.domElement;
        }
        childFiber = childFiber.child;
      }
    }
    
    // Move to next sibling
    sibling = sibling.sibling;
  }
  
  return null;
}

