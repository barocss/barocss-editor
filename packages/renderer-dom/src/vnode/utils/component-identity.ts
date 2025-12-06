/**
 * Component Identity Utilities
 * 
 * Functions for creating and assigning component identity attributes
 */

import { ModelData } from '@barocss/dsl';

/**
 * Assign component identity attributes to an attrs object
 * 
 * @param attrs - Attributes object to modify
 * @param componentName - Component name
 * @param modelData - Model data
 * @param options - Optional configuration
 * @param ensureUniqueId - Function to ensure unique ID (from VNodeBuilder)
 */
export function assignComponentIdentityAttrs(
  attrs: Record<string, any>,
  componentName: string,
  modelData: ModelData,
  options?: { defaultStype?: string; includeComponentMarker?: boolean },
  ensureUniqueId?: (id: string | undefined) => string | undefined
): void {
  const includeComponentMarker = options?.includeComponentMarker !== false;
  if (includeComponentMarker) {
    attrs['data-bc-component'] = componentName;
  }

  // data-bc-stype is no longer exposed to DOM (model can be queried with sid only)
  // const defaultStype = options?.defaultStype ?? 'component';
  // if (attrs['data-bc-stype'] === undefined) {
  //   attrs['data-bc-stype'] = defaultStype;
  // }

  // const modelStype = (modelData as any)?.stype;
  // if (modelStype) {
  //   attrs['data-bc-stype'] = modelStype;
  // }

  if (attrs['data-bc-sid'] === undefined) {
    const sid = (modelData as any)?.sid;
    if (sid) {
      const uniqueId = ensureUniqueId ? ensureUniqueId(sid) : sid;
      if (uniqueId) {
        attrs['data-bc-sid'] = uniqueId;
      }
    }
  }
}

/**
 * Create component wrapper attributes
 * 
 * @param componentName - Component name
 * @param data - Model data
 * @param ensureUniqueId - Function to ensure unique ID (from VNodeBuilder)
 * @returns Wrapper attributes object
 */
export function createComponentWrapperAttrs(
  componentName: string,
  data: ModelData,
  ensureUniqueId?: (id: string | undefined) => string | undefined
): Record<string, any> {
  const wrapperAttrs: Record<string, any> = {};
  assignComponentIdentityAttrs(wrapperAttrs, componentName, data, undefined, ensureUniqueId);
  return wrapperAttrs;
}

