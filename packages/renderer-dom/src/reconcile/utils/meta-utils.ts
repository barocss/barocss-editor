import { VNode } from '../../vnode/types';
import { getVNodeId } from './vnode-utils';

/**
 * Transfer meta (especially meta.domElement) from prevVNode to nextVNode
 * This preserves DOM element references for next reconciliation without deep copying
 * 
 * Uses React-style matching: key (sid) or type (tag) + index
 */
export function transferMetaFromPrevToNext(prevVNode: VNode | undefined, nextVNode: VNode): void {
  if (!prevVNode) return;
  
  // Transfer root VNode meta
  if (prevVNode.meta && nextVNode) {
    if (!nextVNode.meta) {
      nextVNode.meta = {};
    }
    // Preserve meta.domElement if it exists
    if (prevVNode.meta.domElement) {
      nextVNode.meta.domElement = prevVNode.meta.domElement;
    }
    // Preserve other meta properties
    Object.keys(prevVNode.meta).forEach(key => {
      if (key !== 'domElement' && !(key in nextVNode.meta!)) {
        (nextVNode.meta as any)[key] = (prevVNode.meta as any)[key];
      }
    });
  }
  
  // Recursively transfer children meta
  const prevChildren = (prevVNode.children || []) as (VNode | string | number)[];
  const nextChildren = (nextVNode.children || []) as (VNode | string | number)[];
  
  for (let i = 0; i < Math.min(prevChildren.length, nextChildren.length); i++) {
    const prevChild = prevChildren[i];
    const nextChild = nextChildren[i];
    
    if (typeof prevChild === 'object' && typeof nextChild === 'object' && 
        prevChild !== null && nextChild !== null) {
      const prevChildVNode = prevChild as VNode;
      const nextChildVNode = nextChild as VNode;
      
      // Transfer meta using React-style matching:
      // 1. Key-based (VNode identifier: sid or data-decorator-sid from attrs)
      // 2. Type-based (tag) + Index
      const prevId = getVNodeId(prevChildVNode);
      const nextId = getVNodeId(nextChildVNode);
      const keyMatches = prevId && prevId === nextId;
      
      const typeMatches = prevChildVNode.tag === nextChildVNode.tag;
      
      if (keyMatches || typeMatches) {
        transferMetaFromPrevToNext(prevChildVNode, nextChildVNode);
      }
    }
  }
}

