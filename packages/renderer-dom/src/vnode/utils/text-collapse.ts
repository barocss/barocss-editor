/**
 * Text Collapse Utilities
 * 
 * Pure functions for handling text collapse logic in VNodes
 */

import { VNode } from '../types';
import { isDecoratorNode } from './vnode-guards';

/**
 * Determine if text child should be collapsed into parent.text
 * 
 * @param orderedChildren - Array of child VNodes
 * @param hasDataTextProcessed - Reference to track if data('text') was processed
 * @returns true if should collapse
 */
export function shouldCollapseTextChild(
  orderedChildren: VNode[],
  hasDataTextProcessed: { value: boolean }
): boolean {
  // IMPORTANT: When checking for collapse, we should exclude decorators from the count
  // because decorators are added as siblings (to parent's children), not to this node's children
  const nonDecoratorChildren = orderedChildren.filter((child: any) => 
    !isDecoratorNode(child)
  );
  
  // Check if the single text child has inline decorators (which would prevent collapse)
  const singleTextChild = nonDecoratorChildren.length === 1 && !nonDecoratorChildren[0].tag && nonDecoratorChildren[0].text !== undefined;
  const hasInlineDecorators = singleTextChild && (
    (nonDecoratorChildren[0] as any).decorators?.length > 0
  );
  
  // IMPORTANT: If data('text') was processed, NEVER collapse because:
  // 1. data('text') generates VNodes that should always be in children
  // 2. decorators may split the text into multiple VNodes
  // 3. Even if there are no decorators now, they might be added later
  // Collapse only if: single text child exists AND data('text') was NOT processed AND no decorators
  return singleTextChild && 
         !hasDataTextProcessed.value && 
         !hasInlineDecorators;
}

/**
 * Apply text collapse logic to VNode
 * 
 * @param vnode - VNode to apply collapse to
 * @param orderedChildren - Array of child VNodes
 * @param shouldCollapse - Whether to collapse text child
 */
export function applyTextCollapse(
  vnode: VNode,
  orderedChildren: VNode[],
  shouldCollapse: boolean
): void {
  if (shouldCollapse) {
    // Collapse single text child into parent.text for simpler consumption
    vnode.text = String(orderedChildren[0].text);
    vnode.children = [];
  } else if (orderedChildren.length > 0) {
    // Always expose children explicitly for tests that assert presence of children
    vnode.children = [...orderedChildren];
  } else {
    // Ensure children is at least an empty array for downstream consumers/tests
    vnode.children = [];
  }
}

