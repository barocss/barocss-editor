import { VNode } from '../../vnode/types';
import { findChildHost } from './dom-utils';
import { getVNodeId, normalizeClasses } from './vnode-utils';

/**
 * Find existing host element for a child VNode
 * 
 * This function implements React-style reconciliation matching:
 * 
 * 1. Key-based matching (SID/decoratorSID) - React's key prop
 * 2. Type-based matching (tag) + Index - React's type + index fallback
 * 
 * @param parent - Parent DOM element
 * @param childVNode - Child VNode to find host for
 * @param childIndex - Index where child should be positioned
 * @param prevChildVNodes - Previous child VNodes for type/index matching
 * @param prevChildToElement - Map of prevChildVNode -> DOM element for fallback lookup
 * @returns Existing host element or null if not found
 */
export function findHostForChildVNode(
  parent: HTMLElement,
  childVNode: VNode,
  childIndex: number,
  prevChildVNodes: (VNode | string | number)[],
  prevChildToElement: Map<VNode | string | number, HTMLElement | Text>
): HTMLElement | null {
  let host: HTMLElement | null = null;
  
  // Strategy 1: Key-based matching (React's key prop)
  // VNode identifier (sid or data-decorator-sid from attrs) acts as key
  // Domain 지식 없이 getVNodeId()로 통일된 ID만 비교
  const vnodeId = getVNodeId(childVNode);
  if (vnodeId) {
    // 인덱스 기반 매칭을 먼저 시도 (같은 인덱스의 prevChildVNode)
    if (childIndex < prevChildVNodes.length) {
      const prevChild = prevChildVNodes[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        // 같은 인덱스의 prevChildVNode가 같은 ID를 가지면 재사용
        if (prevId === vnodeId) {
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            host = prevChildVNode.meta.domElement;
          } else {
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              host = candidateElement as HTMLElement;
            }
          }
        }
      }
    }
    
    // Fallback: prevChildVNodes에서 같은 ID를 가진 VNode 찾기 (인덱스 기반)
    // IMPORTANT: 같은 ID를 가진 여러 VNode가 있을 때, 인덱스에 가장 가까운 것을 선택
    if (!host) {
      let bestMatch: HTMLElement | null = null;
      let minIndexDiff = Infinity;
      
      for (let i = 0; i < prevChildVNodes.length; i++) {
        const prevChild = prevChildVNodes[i];
        if (typeof prevChild !== 'object' || prevChild === null) continue;
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        if (prevId !== vnodeId) continue;
        
        // 인덱스 차이 계산
        const indexDiff = Math.abs(i - childIndex);
        if (indexDiff < minIndexDiff) {
          minIndexDiff = indexDiff;
          
          // Use DOM element from prevVNode meta if available
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            bestMatch = prevChildVNode.meta.domElement;
          } else {
            // Fallback: use prevChildToElement map
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              bestMatch = candidateElement as HTMLElement;
            }
          }
        }
      }
      
      if (bestMatch) {
        host = bestMatch;
      }
    }
    
    // If not found from prevChildVNodes, try local search within parent
    // IMPORTANT: prevChildVNodes가 없을 때는 같은 ID를 가진 요소를 찾지 않고,
    // 항상 새로 생성해야 합니다 (같은 ID를 가진 여러 VNode가 있을 때 각각 다른 DOM 요소를 생성하기 위해)
    // findChildHost는 prevVNode가 있을 때만 사용 (이미 매칭된 요소를 찾기 위해)
    // prevChildVNodes가 없으면 findChildHost를 호출하지 않고 null을 반환하여 새로 생성하도록 함
    if (!host && prevChildVNodes.length > 0) {
      host = findChildHost(parent, childVNode, childIndex);
    }
    
    // 전역 검색 제거: React처럼 children 기준으로만 비교
    // Cross-parent move는 새로 생성 (React 스타일)
  } else {
    // Strategy 2: Type-based matching + Index (React's type + index fallback)
    // Same tag at same index means same element
    // Domain 지식 없이 구조적 속성만 확인
    // ID가 있는 VNode는 이미 위에서 처리되었으므로, ID가 없는 경우만 구조적 매칭
    if (!vnodeId) {
      const prevChild = prevChildVNodes[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        // Check if same type (tag) - React's type comparison
        if (prevChildVNode.tag === childVNode.tag) {
          // Use DOM element from prevVNode meta if available
          if (prevChildVNode.meta?.domElement && prevChildVNode.meta.domElement instanceof HTMLElement) {
            host = prevChildVNode.meta.domElement;
          } else {
            // Fallback: use prevChildToElement map
            const candidateElement = prevChildToElement.get(prevChild);
            if (candidateElement && candidateElement.nodeType === 1) {
              host = candidateElement as HTMLElement;
            }
          }
        }
      }
    }
    
    // Strategy 3: Index-based fallback (same tag at same index in DOM)
    // This is React's last resort when key is missing
    // Domain 지식 없이 구조적 속성만 확인
    // ID가 있는 VNode는 이미 위에서 처리되었으므로, ID가 없는 경우만 구조적 매칭
    if (!host && childVNode.tag && !vnodeId) {
      host = findChildHost(parent, childVNode, childIndex);
    }
  }
  
  return host;
}

/**
 * Find host element in parent's children only (no global search)
 * React-style: children 기준으로만 비교
 * 
 * @param parent - Parent DOM element
 * @param vnode - VNode to find host for
 * @param prevVNode - Previous VNode (for matching)
 * @param childIndex - Index where child should be positioned
 * @returns Existing host element or null if not found
 */
export function findHostInParentChildren(
  parent: HTMLElement,
  vnode: VNode,
  prevVNode: VNode | undefined,
  childIndex: number
): HTMLElement | null {
  const vnodeId = getVNodeId(vnode);
  
  // 1. prevVNode.children에서 같은 ID를 가진 VNode 찾기 (인덱스 기반)
  // IMPORTANT: 같은 ID를 가진 여러 VNode가 있을 때, 인덱스에 가장 가까운 것을 선택
  if (prevVNode?.children && vnodeId) {
    // 먼저 같은 인덱스의 prevChildVNode 확인
    if (childIndex < prevVNode.children.length) {
      const prevChild = prevVNode.children[childIndex];
      if (prevChild && typeof prevChild === 'object') {
        const prevChildVNode = prevChild as VNode;
        const prevId = getVNodeId(prevChildVNode);
        // 같은 인덱스의 prevChildVNode가 같은 ID를 가지면 재사용
        if (prevId === vnodeId) {
          if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
            const domEl = prevChildVNode.meta.domElement;
            // 현재 parent의 자식인지 확인
            if (domEl.parentElement === parent) {
              return domEl;
            }
          }
        }
      }
    }
    
    // Fallback: 인덱스에 가장 가까운 같은 ID를 가진 VNode 찾기
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < prevVNode.children.length; i++) {
      const prevChild = prevVNode.children[i];
      if (typeof prevChild !== 'object' || prevChild === null) continue;
      const prevChildVNode = prevChild as VNode;
      const prevId = getVNodeId(prevChildVNode);
      if (prevId === vnodeId) {
        if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
          const domEl = prevChildVNode.meta.domElement;
          // 현재 parent의 자식인지 확인
          if (domEl.parentElement === parent) {
            // 인덱스 차이 계산
            const indexDiff = Math.abs(i - childIndex);
            if (indexDiff < minIndexDiff) {
              minIndexDiff = indexDiff;
              bestMatch = domEl;
            }
          }
        }
      }
    }
    
    if (bestMatch) {
      return bestMatch;
    }
  }
  
  // 2. parent.children에서 같은 ID를 가진 요소 찾기 (인덱스 기반)
  // IMPORTANT: prevVNode가 없을 때는 같은 ID를 가진 요소를 찾지 않고,
  // 항상 새로 생성해야 합니다 (같은 ID를 가진 여러 VNode가 있을 때 각각 다른 DOM 요소를 생성하기 위해)
  // prevVNode가 있을 때만 같은 ID를 가진 요소를 찾습니다 (이미 매칭된 요소를 찾기 위해)
  if (vnodeId && prevVNode) {
    const children = Array.from(parent.children);
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childEl = child as HTMLElement;
      const childSid = childEl.getAttribute('data-bc-sid');
      const childDecoratorSid = childEl.getAttribute('data-decorator-sid');
      if (childSid === vnodeId || childDecoratorSid === vnodeId) {
        // 인덱스 차이 계산
        const indexDiff = Math.abs(i - childIndex);
        if (indexDiff < minIndexDiff) {
          minIndexDiff = indexDiff;
          bestMatch = childEl;
        }
      }
    }
    
    if (bestMatch) {
      return bestMatch;
    }
  }
  
  // 3. prevVNode.children에서 구조적 매칭 (ID가 없는 경우)
  // 인덱스만으로는 부족하므로 구조적 매칭 필요
  if (!vnodeId && prevVNode?.children) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        // ID가 있는 VNode는 제외 (이미 위에서 처리됨)
        if (getVNodeId(c)) return false;
        // 태그가 같아야 함
        if (c.tag !== vnode.tag) return false;
        // 클래스 매칭 (구조적 매칭)
        if (vnode.attrs?.class || vnode.attrs?.className) {
          const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
          const prevClasses = normalizeClasses(c.attrs?.class || c.attrs?.className);
          return vnodeClasses.every(cls => prevClasses.includes(cls));
        }
        return true; // 클래스가 없으면 태그만으로 매칭
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // 현재 parent의 자식인지 확인
      if (domEl.parentElement === parent) {
        return domEl;
      }
    }
  }
  
  // 4. 인덱스 기반 매칭 (fallback, ID가 없는 경우)
  if (childIndex < parent.children.length) {
    const candidate = parent.children[childIndex] as HTMLElement;
    if (candidate && candidate.tagName.toLowerCase() === (vnode.tag || '').toLowerCase()) {
      // 클래스 매칭 (구조적 매칭)
      if (vnode.attrs?.class || vnode.attrs?.className) {
        const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
        const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
        if (vnodeClasses.every(cls => candidateClasses.includes(cls))) {
          return candidate;
        }
      } else {
        return candidate;
      }
    }
  }
  
  return null;
}

/**
 * Find previous child VNode for a given child VNode
 * 
 * This is used to get the previous VNode for comparison during reconciliation.
 * Implements React-style matching:
 * 1. Key-based matching (SID/decoratorSID)
 * 2. Type-based matching + Index
 * 
 * @param childVNode - Current child VNode
 * @param childIndex - Index of current child
 * @param prevChildVNodes - Previous child VNodes array
 * @returns Previous child VNode or undefined if not found
 */
export function findPrevChildVNode(
  childVNode: VNode,
  childIndex: number,
  prevChildVNodes: (VNode | string | number)[]
): VNode | undefined {
  // Strategy 1: Key-based matching (React's key prop)
  // VNode identifier (sid or data-decorator-sid from attrs) acts as key
  const vnodeId = getVNodeId(childVNode);
  if (vnodeId) {
    return prevChildVNodes.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        const prevId = getVNodeId(c);
        return prevId === vnodeId;
      }
    );
  }
  
  // Strategy 3: Type-based matching + Index (React's type + index fallback)
  const prevChild = prevChildVNodes[childIndex];
  if (prevChild && typeof prevChild === 'object') {
    const prevChildVNode = prevChild as VNode;
    // Same type (tag) at same index means same element
    if (prevChildVNode.tag === childVNode.tag) {
      return prevChildVNode;
    }
  }
  
  return undefined;
}

