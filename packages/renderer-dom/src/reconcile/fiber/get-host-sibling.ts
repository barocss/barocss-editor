import { FiberNode } from './types';

/**
 * React의 getHostSibling 알고리즘 구현
 * 
 * 다음 형제의 DOM 노드를 찾기 위해:
 * 1. fiber.sibling부터 시작하여 다음 형제를 찾음
 * 2. 형제가 DOM 노드를 가지고 있으면 반환
 * 3. 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색
 * 
 * React의 실제 구현:
 * - commitPlacement에서 getHostSibling을 호출할 때, 다음 형제는 아직 commit되지 않았을 수 있음
 * - 하지만 render phase에서 이미 domElement가 설정되었으므로, 다음 형제의 domElement를 찾을 수 있음
 * 
 * @param fiber - 현재 Fiber 노드
 * @returns 다음 형제의 DOM 노드 또는 null
 */
export function getHostSibling(fiber: FiberNode): Node | null {
  // 다음 형제 Fiber 찾기
  let sibling = fiber.sibling;
  
  // 다음 형제가 없으면 null 반환
  if (!sibling) {
    return null;
  }
  
  // 다음 형제부터 시작하여 DOM 노드를 가진 형제 찾기
  while (sibling !== null) {
    // 형제가 DOM 노드를 가지고 있으면 반환
    // Text node (#text) 또는 Host element (tag가 있는 경우)
    if (sibling.domElement) {
      return sibling.domElement;
    }
    
    // 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드 찾기
    if (sibling.child) {
      let childFiber = sibling.child;
      while (childFiber) {
        if (childFiber.domElement) {
          return childFiber.domElement;
        }
        childFiber = childFiber.child;
      }
    }
    
    // 다음 형제로 이동
    sibling = sibling.sibling;
  }
  
  return null;
}

