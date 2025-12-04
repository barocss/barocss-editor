import { VNode } from '../../vnode/types';

/**
 * VNode 트리를 깊은 복사 (meta.domElement 포함)
 * prevVNode 저장 시 사용
 */
export function cloneVNodeTree(vnode: VNode): VNode {
  const cloned: VNode = {
    ...vnode,
    meta: vnode.meta ? { ...vnode.meta } : undefined,
    children: vnode.children ? vnode.children.map(child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return child;
      }
      if (typeof child === 'object' && child !== null) {
        return cloneVNodeTree(child as VNode);
      }
      return child;
    }) : undefined,
  };
  return cloned;
}

