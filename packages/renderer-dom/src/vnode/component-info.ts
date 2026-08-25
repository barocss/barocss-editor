/**
 * Component Info Creation Module
 * 
 * Separate logic for adding component info to VNode into testable pure functions
 */

import { VNode } from './types';
import { ModelData } from '@barocss/dsl';
import { sanitizeProps } from './props-resolution';

/**
 * VNode에 component 정보 추가
 * 
 * @param vnode - 대상 VNode
 * @param componentName - Component 이름
 * @param data - 원본 모델 데이터
 * @param decorators - Decorator 정보 (optional)
 * @param options - 추가 옵션 (isExternal 등)
 * @returns Component 정보가 추가된 VNode
 */
export function attachComponentInfo(
  vnode: VNode,
  componentName: string,
  data: ModelData,
  decorators: any[] = [],
  options: { isExternal?: boolean } = {}
): VNode {
  /*
   * `sanitizeProps` directly, and not `separatePropsAndModel`, whose other half was thrown away.
   *
   * Measured (barocss-editor, a slide deck of 163 nodes): that call built `{ ...data }` — a full copy
   * of the node — and this function used only `props`. On a document whose children are **resolved**
   * rather than stored, spreading a node is not free: every spread asks the store's content resolver
   * for that node's children again. It was 162 of the 520 resolutions in a render, 31% of them, for
   * an object with no reader.
   *
   * `props` here is `data` minus stype/sid/type, which is exactly what the discarded call returned.
   */
  const props = sanitizeProps(data || {});
  
  // Set directly on top-level fields
  vnode.stype = componentName;
  vnode.props = sanitizeProps(props);
  // decorators are already processed in VNodeBuilder and reflected in VNode tree, so don't store
  if (options.isExternal !== undefined) {
    vnode.isExternal = options.isExternal;
  }
  
  return vnode;
}

/**
 * Add component info to VNode (when props and model are already separated)
 * 
 * @param vnode - Target VNode
 * @param componentName - Component name
 * @param props - Sanitized props
 * @param model - Original model data
 * @param decorators - Decorator info (optional)
 * @param options - Additional options (isExternal, etc.)
 * @returns VNode with component info added
 */
export function attachComponentInfoWithSeparatedData(
  vnode: VNode,
  componentName: string,
  props: Record<string, any>,
  model: ModelData,
  decorators: any[] = [],
  options: { isExternal?: boolean } = {}
): VNode {
  // Set directly on top-level fields
  vnode.stype = componentName;
  vnode.props = sanitizeProps(props);
  // decorators are already processed in VNodeBuilder and reflected in VNode tree, so don't store
  if (options.isExternal !== undefined) {
    vnode.isExternal = options.isExternal;
  }
  
  return vnode;
}

