/**
 * @barocss/vnode - Extended Model Data Types
 * 
 * Extended types for model data that includes common properties
 */

import { ModelData } from '@barocss/dsl';

/**
 * Extended model data that includes common properties used in vnode processing
 */
export interface ExtendedModelData extends ModelData {
  sid?: string;
  stype?: string;
  marks?: Array<{
    type: string;
    range: [number, number];
    start?: number;
    end?: number;
    types?: string[];
    classes?: string[];
  }>;
  text?: string;
  [key: string]: any;
}

/**
 * Type guard to check if model data has sid property
 */
export function hasSid(data: ModelData): data is ExtendedModelData & { sid: string } {
  return typeof (data as any)?.sid === 'string';
}

/**
 * Type guard to check if model data has marks property
 */
export function hasMarks(data: ModelData): data is ExtendedModelData & { marks: Array<any> } {
  return Array.isArray((data as any)?.marks);
}

/**
 * Safely extracts sid from model data
 */
export function getSid(data: ModelData): string | undefined {
  return (data as ExtendedModelData)?.sid;
}

/**
 * Safely extracts marks from model data
 */
export function getMarks(data: ModelData): Array<any> | undefined {
  return (data as ExtendedModelData)?.marks;
}

/**
 * Gets nested data value by dot-notation path
 * 
 * This function traverses the data object using dot-notation paths
 * to access nested properties.
 * 
 * @param data - The data object to traverse
 * @param path - Dot-notation path (e.g., 'user.name', 'items.0.title')
 * @returns The value at the specified path, or undefined if not found
 */
export function getDataValue(data: ModelData, path: string): any {
  const value = path.split('.').reduce((obj, key) => obj?.[key], data);
  return value;
}

/**
 * Extracts node ID from a VNode or model data
 */
export function extractNodeId(vnode: any, model: ModelData): string | undefined {
  return vnode.attrs?.['data-bc-sid'] || getSid(model);
}

