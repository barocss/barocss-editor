/**
 * VNode Type Guards and Utilities
 * - Type checking utilities for VNode special types (portal, conditional, component, etc.)
 * - Helps distinguish different VNode types for proper handling in reconciliation
 */

import { VNode, VNodeTag } from '../types';

/**
 * Check if VNode is a portal node
 * Portal nodes have tag === 'portal' and attrs.target is an HTMLElement
 */
export function isPortal(vnode: VNode): boolean {
  return vnode.tag === VNodeTag.PORTAL && 
         vnode.attrs?.target instanceof HTMLElement;
}

/**
 * Check if VNode is a conditional node
 * Conditional nodes have tag === 'conditional' with condition and template
 */
export function isConditional(vnode: VNode): boolean {
  return vnode.tag === 'conditional' && 
         vnode.attrs?.condition !== undefined;
}

/**
 * Check if VNode is a component node
 * Component nodes have stype (component type)
 */
export function isComponent(vnode: VNode): boolean {
  return !!vnode.stype;
}

/**
 * Check if VNode is an external component
 * External components manage their own DOM via mount/unmount functions
 */
export function isExternalComponent(vnode: VNode): boolean {
  return !!vnode.stype && vnode.isExternal === true;
}

/**
 * Check if VNode is a contextual component
 * Contextual components are rendered via template functions
 */
export function isContextualComponent(vnode: VNode): boolean {
  return !!vnode.stype && vnode.isExternal === false;
}

/**
 * Check if VNode is a text node
 * Text nodes have text content but no tag
 */
export function isTextNode(vnode: VNode): boolean {
  return vnode.text !== undefined && !vnode.tag;
}

/**
 * Check if VNode is an element node
 * Element nodes have a tag and are not special types
 */
export function isElement(vnode: VNode): boolean {
  return !!vnode.tag && 
         !isPortal(vnode) && 
         !isConditional(vnode) && 
         !isComponent(vnode);
}

/**
 * VNode인지 확인 (타입 가드)
 * VNode는 tag 속성을 가진 객체입니다.
 */
export function isVNode(c: any): c is VNode {
  return c && typeof c === 'object' && 'tag' in c;
}

/**
 * Decorator VNode인지 확인
 * Decorator VNode는 decoratorSid, decoratorStype, 또는 decoratorCategory 속성을 가집니다.
 */
export function isDecoratorNode(c: any): boolean {
  return !!(c?.decoratorSid || c?.decoratorStype || c?.decoratorCategory);
}

