/**
 * Element Initialization Utilities
 * 
 * Pure functions for initializing element VNodes
 */

import { ElementTemplate, ModelData } from '@barocss/dsl';
import { VNode } from '../types';
import { isFunction } from './type-checks';
import { createElementVNode } from './vnode-creators';

/**
 * Initialize element VNode with tag, attrs, and key
 * 
 * @param template - ElementTemplate
 * @param data - Model data
 * @returns Initialized VNode
 */
export function initializeElementVNode(template: ElementTemplate, data: ModelData): VNode {
  // Resolve dynamic tag if function
  const resolvedTag = isFunction(template.tag) ? template.tag(data) : template.tag;
  const attrs = { ...(template.attributes || {}) };
  
  // Extract key from attrs if present (key is VNode-only, never stored in DOM)
  let key: string | undefined;
  if ('key' in (attrs as any)) {
    const rawKey = (attrs as any).key;
    key = isFunction(rawKey) ? String(rawKey(data)) : rawKey;
    delete (attrs as any).key; // Remove from attrs so it's not added to DOM
  }
  
  // Reflect key into attrs for initial DOM matching (data-key). Key itself is VNode-only.
  if (key) {
    attrs['data-key'] = key;
  }
  
  const vnode = createElementVNode(resolvedTag, attrs, [], {});
  vnode.key = key; // Set as VNode property
  
  return vnode;
}

