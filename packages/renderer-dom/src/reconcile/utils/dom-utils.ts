import { VNode } from '../../vnode/types';
import { normalizeClasses, getVNodeId } from './vnode-utils';

/**
 * Find child host element by VNode identifier
 * Falls back to structural matching by index and tag
 */
export function findChildHost(
  parent: HTMLElement,
  vnode: VNode,
  childIndex?: number
): HTMLElement | null {
  // VNode 식별자로 찾기 (sid 또는 data-decorator-sid from attrs)
  const vnodeId = getVNodeId(vnode);
  if (vnodeId && childIndex !== undefined) {
    // DOM에서 data-bc-sid 또는 data-decorator-sid로 찾기 (인덱스 기반)
    // IMPORTANT: 같은 ID를 가진 여러 요소가 있을 때, 인덱스에 가장 가까운 요소를 선택
    const children = Array.from(parent.children);
    let bestMatch: HTMLElement | null = null;
    let minIndexDiff = Infinity;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!(child instanceof HTMLElement)) continue;
      const isMatch = child.getAttribute('data-bc-sid') === vnodeId ||
        child.getAttribute('data-decorator-sid') === vnodeId;
      if (!isMatch) continue;
      
      // 인덱스 차이 계산
      const indexDiff = Math.abs(i - childIndex);
      if (indexDiff < minIndexDiff) {
        minIndexDiff = indexDiff;
        bestMatch = child;
      }
    }
    
    if (bestMatch) return bestMatch;
  }
  
  // Fallback: ID가 없는 경우 같은 인덱스의 같은 태그를 가진 요소 재사용
  // Domain 지식 없이 구조적 속성만 확인
  const vnodeIdForFallback = getVNodeId(vnode);
  if (childIndex !== undefined && vnode.tag && !vnodeIdForFallback) {
    const children = Array.from(parent.children);
    
    // IMPORTANT: childIndex 위치의 요소를 먼저 확인
    if (childIndex < children.length) {
      const candidate = children[childIndex] as HTMLElement;
      if (candidate && candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        // 같은 태그이고, sid가 없는 경우 재사용
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          // 클래스도 비교하여 더 정확하게 매칭 (구조적 매칭)
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
              if (classesMatch) {
                return candidate;
              }
            } else {
              // 클래스가 없으면 태그만으로 재사용
              return candidate;
            }
        }
      }
    }
    
    // IMPORTANT: childIndex 위치에서 찾지 못하면, 모든 자식 요소를 순회
    // (prevVNode가 없을 때 인덱스가 맞지 않을 수 있음)
    for (const candidate of children) {
      if (candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          // 클래스도 비교하여 더 정확하게 매칭 (구조적 매칭)
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              return candidate as HTMLElement;
            }
          } else {
            // 클래스가 없으면 태그만으로 재사용
            return candidate as HTMLElement;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Query host element by sid within parent scope
 */
export function queryHost(parent: HTMLElement, sid: string): HTMLElement | null {
  return parent.querySelector(`:scope > [data-bc-sid="${sid}"]`) as HTMLElement | null;
}

/**
 * Reorder DOM children to match the ordered array
 * Moves elements to correct positions without removing them
 */
export function reorder(parent: HTMLElement, ordered: (HTMLElement | Text)[]): void {
  // ordered 배열의 순서대로 DOM에 배치
  // 각 요소를 순회하면서 올바른 위치에 있는지 확인하고, 필요시 이동
  const orderedSet = new Set(ordered);
  
  // ordered에 없는 요소는 제거하지 않음 (removeStale에서 처리)
  // ordered에 있는 요소만 재정렬
  // IMPORTANT: current 배열을 매번 다시 가져와야 함 (insertBefore로 인해 DOM이 변경됨)
  for (let i = 0; i < ordered.length; i++) {
    const want = ordered[i];
    
    // 현재 DOM 상태를 다시 확인
    const currentNow = Array.from(parent.childNodes);
    
    // 현재 위치가 올바른지 확인
    if (currentNow[i] !== want) {
      // 올바른 위치로 이동
      const referenceNode = i < currentNow.length ? currentNow[i] : null;
      parent.insertBefore(want, referenceNode);
    }
  }
}

