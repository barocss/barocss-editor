/**
 * Component Info Creation Module
 * 
 * Separate logic for adding component info to VNode into testable pure functions
 */

import { VNode } from './types';
import { ModelData } from '@barocss/dsl';
import { separatePropsAndModel, sanitizeProps } from './props-resolution';

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
  const { props } = separatePropsAndModel(data, decorators);
  
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

