/**
 * Component Info Creation Module
 * 
 * VNode에 component 정보를 추가하는 로직을 테스트 가능한 순수 함수로 분리
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
  
  // 최상위 필드에 직접 설정
  vnode.stype = componentName;
  vnode.props = sanitizeProps(props);
  // decorators는 VNodeBuilder에서 이미 처리되어 VNode 트리에 반영되므로 저장하지 않음
  if (options.isExternal !== undefined) {
    vnode.isExternal = options.isExternal;
  }
  
  return vnode;
}

/**
 * VNode에 component 정보 추가 (props와 model이 이미 분리된 경우)
 * 
 * @param vnode - 대상 VNode
 * @param componentName - Component 이름
 * @param props - Sanitized props
 * @param model - 원본 모델 데이터
 * @param decorators - Decorator 정보 (optional)
 * @param options - 추가 옵션 (isExternal 등)
 * @returns Component 정보가 추가된 VNode
 */
export function attachComponentInfoWithSeparatedData(
  vnode: VNode,
  componentName: string,
  props: Record<string, any>,
  model: ModelData,
  decorators: any[] = [],
  options: { isExternal?: boolean } = {}
): VNode {
  // 최상위 필드에 직접 설정
  vnode.stype = componentName;
  vnode.props = sanitizeProps(props);
  // decorators는 VNodeBuilder에서 이미 처리되어 VNode 트리에 반영되므로 저장하지 않음
  if (options.isExternal !== undefined) {
    vnode.isExternal = options.isExternal;
  }
  
  return vnode;
}

