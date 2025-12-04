/**
 * Component Wrapper Utilities
 * 
 * Pure functions for creating component wrapper data and VNodes
 */

import { ModelData } from '@barocss/dsl';
import { VNode } from '../types';
import { sanitizeProps as sanitizePropsUtil } from '../props-resolution';
import { createComponentVNode } from './vnode-creators';
import type { Decorator } from '../decorator';
import type { VNodeBuildOptions } from '../decorator';

/**
 * Resolve decorators from build options
 * 
 * @param buildOptions - Build options
 * @returns Array of decorators
 */
export function resolveDecoratorsFromBuildOptions(buildOptions?: VNodeBuildOptions): Decorator[] {
  return buildOptions?.decorators ?? [];
}

/**
 * Prepare component wrapper data
 * 
 * @param data - Model data
 * @param props - Component props
 * @param buildOptions - Build options
 * @returns Object with sanitized props, model data, and decorators
 */
export function prepareComponentWrapperData(
  data: ModelData,
  props: Record<string, any>,
  buildOptions: VNodeBuildOptions
): {
  sanitizedProps: Record<string, any>;
  modelData: ModelData;
  decorators: Decorator[];
} {
  const sanitizedProps = sanitizePropsUtil(props);
  const modelData = { ...data };
  const decorators = resolveDecoratorsFromBuildOptions(buildOptions);
  return { sanitizedProps, modelData, decorators };
}

