/**
 * Props Resolution Module
 * 
 * Separate logic for separating and processing component props and model into testable pure functions
 */

import { ComponentProps, ComponentTemplate, ModelData } from '@barocss/dsl';

/**
 * Remove model metadata from props (stype/sid/type)
 * Return only pure data to pass
 * 
 * @param props - Original props object
 * @returns Sanitized props (stype, sid, type removed)
 */
export function sanitizeProps(props: any): ComponentProps {
  if (!props || typeof props !== 'object') return {};
  const { stype, sid, type, ...sanitized } = props;
  return sanitized;
}

/**
 * Logic to resolve component props
 * 
 * Priority:
 * 1. If template.props is a function, use function execution result
 * 2. If template.props is an object with values, use it (sanitized props set in build())
 * 3. Otherwise, extract from data with sanitizeProps
 * 
 * @param template - ComponentTemplate
 * @param data - Original model data
 * @returns Resolved props (sanitized)
 */
export function resolveComponentProps(
  template: ComponentTemplate,
  data: ModelData
): Record<string, any> {
  if (typeof template.props === 'function') {
    // Props function: use function execution result
    return template.props(data);
  } else if (template.props !== undefined && template.props !== null) {
    // template.props is explicitly set (may be sanitized props set in build())
    const propsKeys = Object.keys(template.props);
    if (propsKeys.length > 0) {
      // If props exist, use them (already sanitized in build())
      return template.props;
    } else {
      // If template.props is empty object, extract from data
      return sanitizeProps(data || {});
    }
  } else {
    // If template.props is undefined/null, extract from data
    return sanitizeProps(data || {});
  }
}

/**
 * Create component info (separate props, model, decorators)
 * 
 * @param componentName - Component name
 * @param props - Sanitized props
 * @param model - Original model data
 * @param decorators - Decorator info
 * @param options - Additional options (isExternal, etc.)
 * @returns Component info object
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
    props: sanitizeProps(props), // Prevent double sanitize (may already be sanitized)
    model: { ...model },
    decorators,
    ...options
  };
}

/**
 * Separate props and model from model data
 * 
 * @param data - Original model data
 * @param decorators - Decorator info (optional)
 * @returns Separated props and model
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

