import { FiberNode } from './types';

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
    // If sibling has DOM node, return it
    // Text node (#text) or Host element (if has tag)
    if (sibling.domElement) {
      return sibling.domElement;
    }
    
    // If sibling doesn't have DOM node, find first DOM node among children
    if (sibling.child) {
      let childFiber = sibling.child;
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

