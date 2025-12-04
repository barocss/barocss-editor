/**
 * Props Resolution Module
 * 
 * Component props와 model을 분리하고 처리하는 로직을 테스트 가능한 순수 함수로 분리
 */

import { ComponentProps, ComponentTemplate, ModelData } from '@barocss/dsl';

/**
 * Props에서 모델 메타데이터 제거 (stype/sid/type)
 * 순수 전달 데이터만 반환
 * 
 * @param props - 원본 props 객체
 * @returns Sanitized props (stype, sid, type 제거)
 */
export function sanitizeProps(props: any): ComponentProps {
  if (!props || typeof props !== 'object') return {};
  const { stype, sid, type, ...sanitized } = props;
  return sanitized;
}

/**
 * Component props를 resolve하는 로직
 * 
 * 우선순위:
 * 1. template.props가 함수면 함수 실행 결과 사용
 * 2. template.props가 객체이고 값이 있으면 사용 (build()에서 설정한 sanitized props)
 * 3. 그 외에는 data에서 sanitizeProps로 추출
 * 
 * @param template - ComponentTemplate
 * @param data - 원본 모델 데이터
 * @returns Resolved props (sanitized)
 */
export function resolveComponentProps(
  template: ComponentTemplate,
  data: ModelData
): Record<string, any> {
  if (typeof template.props === 'function') {
    // Props function: 함수 실행 결과 사용
    return template.props(data);
  } else if (template.props !== undefined && template.props !== null) {
    // template.props가 명시적으로 설정됨 (build()에서 설정한 sanitized props일 수 있음)
    const propsKeys = Object.keys(template.props);
    if (propsKeys.length > 0) {
      // Props가 있으면 사용 (build()에서 이미 sanitized)
      return template.props;
    } else {
      // template.props가 빈 객체인 경우, data에서 추출
      return sanitizeProps(data || {});
    }
  } else {
    // template.props가 undefined/null이면 data에서 추출
    return sanitizeProps(data || {});
  }
}

/**
 * Component 정보 생성 (props, model, decorators 분리)
 * 
 * @param componentName - Component 이름
 * @param props - Sanitized props
 * @param model - 원본 모델 데이터
 * @param decorators - Decorator 정보
 * @param options - 추가 옵션 (isExternal 등)
 * @returns Component 정보 객체
 */
export function createComponentInfo(
  componentName: string,
  props: Record<string, any>,
  model: ModelData,
  decorators: any[] = [],
  options: { isExternal?: boolean } = {}
): {
  name: string;
  props: ComponentProps;
  model: ModelData;
  decorators: any[];
  isExternal?: boolean;
} {
  return {
    name: componentName,
    props: sanitizeProps(props), // 이중 sanitize 방지 (이미 sanitized일 수 있음)
    model: { ...model },
    decorators,
    ...options
  };
}

/**
 * Model 데이터에서 props와 model 분리
 * 
 * @param data - 원본 모델 데이터
 * @param decorators - Decorator 정보 (optional)
 * @returns 분리된 props와 model
 */
export function separatePropsAndModel(
  data: ModelData,
  decorators: any[] = []
): {
  props: ComponentProps;
  model: ModelData;
  decorators: any[];
} {
  const sanitizedProps = sanitizeProps(data || {});
  const modelData = { ...data };
  
  return {
    props: sanitizedProps,
    model: modelData,
    decorators
  };
}

/**
 * Creates a stable hash from component props for key generation
 * 
 * This function generates a consistent hash from important props to create
 * stable keys for components. It only considers important props to avoid
 * unnecessary re-renders when irrelevant props change.
 * 
 * @param props - Component props object
 * @returns Hash string for use as component key
 */
export function generatePropsHash(props: Record<string, any>): string {
  // Select only important props
  const importantProps = ['id', 'src', 'content', 'value', 'type', 'name'];
  const hashData: Record<string, any> = {};
  
  importantProps.forEach(prop => {
    if (props[prop] !== undefined) {
      hashData[prop] = props[prop];
    }
  });
  
  // Stringify object to generate a simple hash
  const str = JSON.stringify(hashData, Object.keys(hashData).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

