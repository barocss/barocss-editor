/**
 * Attribute Resolution Utilities
 * 
 * Pure functions for resolving attribute values, styles, and classNames
 */

import { ModelData } from '@barocss/dsl';
import { isFunction, isNullOrUndefined, isDefined } from './type-checks';
import { isDataTemplate } from './template-guards';
import { getDataValue } from './model-data';
import { classTokensFrom } from './classname';

/**
 * Resolve a single attribute value
 * Handles functions, DataTemplates, and static values
 * 
 * @param vnode - VNode (for side effect: deleting attrs[key] when DataTemplate)
 * @param key - Attribute key
 * @param value - Attribute value (function, DataTemplate, or static)
 * @param data - Model data for data binding
 * @returns Resolved attribute value
 */
export function resolveAttributeValue(
  vnode: { attrs?: Record<string, any> },
  key: string,
  value: any,
  data: ModelData
): any {
  if (isFunction(value)) {
    return (value as any)(data);
  }

  if (isDataTemplate(value)) {
    const dt = value as any;
    const resolved = dt.getter ? dt.getter(data) : getDataValue(data, dt.path);
    const finalValue = isNullOrUndefined(resolved) ? dt.defaultValue : resolved;
    if (vnode.attrs) {
      delete vnode.attrs[key];
    }
    return finalValue;
  }

  return value;
}

/**
 * Resolve style object with nested data binding
 * 
 * @param styleValue - Style object with potentially nested functions/DataTemplates
 * @param data - Model data for data binding
 * @returns Resolved style object
 */
export function resolveStyleObject(styleValue: Record<string, any>, data: ModelData): Record<string, any> {
  const styleObj: Record<string, any> = {};

  Object.entries(styleValue).forEach(([styleKey, styleEntry]) => {
    let resolvedStyleValue: any = styleEntry;

    if (isFunction(styleEntry)) {
      resolvedStyleValue = (styleEntry as any)(data);
    } else if (styleEntry && isDataTemplate(styleEntry)) {
      const dt = styleEntry as any;
      const value = dt.getter ? dt.getter(data) : getDataValue(data, dt.path);
      resolvedStyleValue = isNullOrUndefined(value) ? dt.defaultValue : value;
    }

    if (isDefined(resolvedStyleValue)) {
      styleObj[styleKey] = resolvedStyleValue;
    }
  });

  return styleObj;
}

/**
 * Resolve className value
 * 
 * @param classNameValue - ClassName value (function, string, array, object, etc.)
 * @param data - Model data for data binding
 * @returns Resolved className string
 */
export function resolveClassName(classNameValue: any, data: ModelData): string {
  const resolved = isFunction(classNameValue) ? classNameValue(data) : classNameValue;
  const classTokens = classTokensFrom(resolved);
  return classTokens.filter(Boolean).join(' ');
}

