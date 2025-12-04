/**
 * Component Props Resolution Utilities
 * 
 * Pure functions for resolving component props and keys
 */

import { ComponentTemplate, ModelData } from '@barocss/dsl';
import { isFunction } from './type-checks';
import { generatePropsHash } from '../props-resolution';

/**
 * Resolve component props and key
 * 
 * @param template - ComponentTemplate
 * @param data - Model data
 * @returns Object with props and key
 */
export function resolveComponentPropsAndKey(
  template: ComponentTemplate,
  data: ModelData
): { props: Record<string, any>; key: string } {
  // Resolve props
  let props: Record<string, any> = {};
  if (isFunction(template.props)) {
    props = template.props(data);
  } else if (template.props) {
    props = template.props;
  }

  // Resolve key - smart generation
  let key: string;
  if (isFunction(template.key)) {
    key = template.key(data);
  } else if (template.key) {
    key = template.key;
  } else {
    // Auto-generate key: data.sid > data.key > component-name + props-based hash
    if (data?.sid) {
      key = `${template.name}-${data.sid}`;
    } else if (data?.key) {
      key = `${template.name}-${data.key}`;
    } else {
      // Create props-based hash (stable key)
      const propsHash = generatePropsHash(props);
      key = `${template.name}-${propsHash}`;
    }
  }
  
  return { props, key };
}

