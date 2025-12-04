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

  // INode는 이미 sid, stype을 가지고 있으므로 ModelData와 호환됨
  // Proxy 없이 직접 사용하거나, content 배열 처리만 필요
  if (!node.content || !dataStore) {
    return node as ModelData;
  }

  // content 배열이 ID 배열인 경우 처리
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
 * @deprecated TreeDocument는 제거되었습니다. createModelDataFromNode를 사용하세요.
 * 이 함수는 하위 호환성을 위해 유지되지만, 실제로는 createModelDataFromNode와 동일합니다.
 */
export function createModelProxyLegacy(
  node: INode | undefined,
  dataStore?: DataStore
): ModelData | null {
  if (!node) return null;

  return new Proxy(node as any, {
    get(target: INode, prop: string | symbol): any {
      // 레거시 호환성: id/type을 sid/stype으로 매핑 (사용되지 않음)
      if (prop === 'id') {
        return target.sid;
      }
      if (prop === 'type') {
        return target.stype;
      }
      
      // content 배열을 lazy evaluation으로 처리
      if (prop === 'content' && target.content) {
        return target.content.map((item: any) => {
          // 문자열인 경우: ID 배열이거나 텍스트
          if (typeof item === 'string') {
            // dataStore가 있고 ID로 보이는 경우 (길이가 충분히 길고 특정 패턴)
            if (dataStore && item.length > 5 && !item.includes(' ')) {
              const childNode = dataStore.getNode(item);
              if (childNode) {
                // ID로 노드를 찾았으면 재귀적으로 Proxy 생성
                return createModelProxy(childNode, dataStore);
              }
            }
            // 텍스트 노드이거나 찾을 수 없는 경우 그대로 반환
            return item;
          }
          
          // 이미 INode 객체인 경우
          if (item && typeof item === 'object' && item.stype) {
            return createModelProxy(item as INode, dataStore);
          }
          
          return item;
        });
      }
      
      // 나머지는 원본 속성 반환
      return (target as any)[prop];
    },
    
    has(target: INode, prop: string | symbol): boolean {
      if (prop === 'id') return !!target.sid;
      if (prop === 'type') return !!target.stype;
      return prop in target;
    },
    
    ownKeys(target: INode): (string | symbol)[] {
      const keys = Object.keys(target);
      // TreeDocument 인터페이스를 위해 id, type 추가
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
 * INode를 직접 ModelData로 사용
 * 
 * INode는 이미 stype, sid를 가지고 있으므로 renderer-dom과 호환됨
 * content 배열만 처리하면 됨
 * 
 * @param node - INode 객체
 * @param dataStore - content 배열이 ID인 경우 노드를 가져오기 위한 DataStore
 * @returns ModelData (INode를 직접 사용)
 */
export function createModelDataFromNode(
  node: INode | undefined,
  dataStore?: DataStore
): ModelData | null {
  if (!node) return null;

  // content 배열이 ID 배열인 경우 INode 배열로 변환
  if (node.content && dataStore && Array.isArray(node.content)) {
    const resolvedContent = node.content.map((item: any) => {
      if (typeof item === 'string') {
        // ID로 보이는 경우
        const childNode = dataStore.getNode(item);
        if (childNode) {
          // 재귀적으로 처리
          return createModelDataFromNode(childNode, dataStore);
        }
        // 찾을 수 없으면 그대로 반환 (텍스트일 수 있음)
        return item;
      }
      // 이미 객체인 경우
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

  // content가 없거나 이미 처리된 경우 그대로 반환
  return node as ModelData;
}

