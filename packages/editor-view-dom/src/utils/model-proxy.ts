/**
 * Proxy 기반 Model Adapter
 * 
 * INode를 ModelData 인터페이스로 접근할 수 있도록 하는 Proxy
 * 변환 오버헤드 없이 직접 접근하여 메모리와 성능을 최적화
 * 
 * 참고: TreeDocument (id/type)는 제거되었고, ModelData (sid/stype)를 직접 사용합니다.
 */

import type { INode } from '@barocss/datastore';
import type { ModelData } from '@barocss/dsl';
import type { DataStore } from '@barocss/datastore';

/**
 * INode를 ModelData로 직접 사용
 * 
 * INode는 이미 sid, stype을 가지고 있으므로 ModelData와 호환됩니다.
 * 
 * @param node - INode 객체 (또는 undefined)
 * @param dataStore - content 배열이 ID인 경우 노드를 가져오기 위한 DataStore
 * @returns ModelData 또는 null
 */
export function createModelProxy(
  node: INode | undefined,
  dataStore?: DataStore
): ModelData | null {
  if (!node) return null;

  // INode already has sid, stype, so compatible with ModelData
  // Can use directly without Proxy, only need to process content array
  if (!node.content || !dataStore) {
    return node as ModelData;
  }

  // Handle case where content array is ID array
  const resolvedContent = node.content.map((item: any) => {
    if (typeof item === 'string') {
      const childNode = dataStore.getNode(item);
      if (childNode) {
        return createModelProxy(childNode, dataStore);
      }
      return item;
    }
    if (item && typeof item === 'object' && item.stype) {
      return createModelProxy(item as INode, dataStore);
    }
    return item;
  });

  return {
    ...node,
    content: resolvedContent
  } as ModelData;
}

/**
 * @deprecated TreeDocument has been removed. Use createModelDataFromNode instead.
 * This function is kept for backward compatibility, but is actually the same as createModelDataFromNode.
 */
export function createModelProxyLegacy(
  node: INode | undefined,
  dataStore?: DataStore
): ModelData | null {
  if (!node) return null;

  return new Proxy(node as any, {
    get(target: INode, prop: string | symbol): any {
      // Legacy compatibility: map id/type to sid/stype (not used)
      if (prop === 'id') {
        return target.sid;
      }
      if (prop === 'type') {
        return target.stype;
      }
      
      // Process content array with lazy evaluation
      if (prop === 'content' && target.content) {
        return target.content.map((item: any) => {
          // String case: ID array or text
          if (typeof item === 'string') {
            // If dataStore exists and looks like ID (sufficiently long and specific pattern)
            if (dataStore && item.length > 5 && !item.includes(' ')) {
              const childNode = dataStore.getNode(item);
              if (childNode) {
                // If node found by ID, create Proxy recursively
                return createModelProxy(childNode, dataStore);
              }
            }
            // Return as-is if text node or not found
            return item;
          }
          
          // Already INode object case
          if (item && typeof item === 'object' && item.stype) {
            return createModelProxy(item as INode, dataStore);
          }
          
          return item;
        });
      }
      
      // Return original property for rest
      return (target as any)[prop];
    },
    
    has(target: INode, prop: string | symbol): boolean {
      if (prop === 'id') return !!target.sid;
      if (prop === 'type') return !!target.stype;
      return prop in target;
    },
    
    ownKeys(target: INode): (string | symbol)[] {
      const keys = Object.keys(target);
      // Add id, type for TreeDocument interface
      if (target.sid && !keys.includes('id')) keys.push('id');
      if (target.stype && !keys.includes('type')) keys.push('type');
      return keys;
    },
    
    getOwnPropertyDescriptor(target: INode, prop: string | symbol): PropertyDescriptor | undefined {
      if (prop === 'id') {
        return {
          enumerable: true,
          configurable: true,
          value: target.sid
        };
      }
      if (prop === 'type') {
        return {
          enumerable: true,
          configurable: true,
          value: target.stype
        };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    }
  }) as ModelData;
}

/**
 * Use INode directly as ModelData
 * 
 * INode already has stype, sid, so compatible with renderer-dom
 * Only need to process content array
 * 
 * @param node - INode object
 * @param dataStore - DataStore to get nodes when content array is IDs
 * @returns ModelData (using INode directly)
 */
export function createModelDataFromNode(
  node: INode | undefined,
  dataStore?: DataStore
): ModelData | null {
  if (!node) return null;

  // Convert content array to INode array if content array is ID array
  if (node.content && dataStore && Array.isArray(node.content)) {
    const resolvedContent = node.content.map((item: any) => {
      if (typeof item === 'string') {
        // If looks like ID
        const childNode = dataStore.getNode(item);
        if (childNode) {
          // Process recursively
          return createModelDataFromNode(childNode, dataStore);
        }
        // Return as-is if not found (might be text)
        return item;
      }
      // Already object case
      if (item && typeof item === 'object' && item.stype) {
        return createModelDataFromNode(item as INode, dataStore);
      }
      return item;
    });
    
    return {
      ...node,
      content: resolvedContent
    } as ModelData;
  }

  // Return as-is if content is missing or already processed
  return node as ModelData;
}

