# React 실제 구현 분석 및 현재 구현 비교

## React의 getHostSibling 실제 구현

React의 `getHostSibling` 함수는 다음과 같이 동작합니다:

```typescript
function getHostSibling(fiber: Fiber): Node | null {
  // 다음 형제 Fiber를 찾아서 그 DOM 노드를 반환
  let sibling = fiber.return.child;
  
  // 현재 Fiber까지의 형제들을 건너뛰기
  while (sibling !== null && sibling !== fiber) {
    // 형제가 DOM 노드를 가지고 있으면 반환
    if (sibling.tag === HostComponent || sibling.tag === HostText) {
      return sibling.stateNode;
    }
    // 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드 찾기
    if (sibling.child !== null) {
      sibling.child.return = sibling;
      sibling = sibling.child;
      continue;
    }
    // 형제의 자식이 없으면 다음 형제로 이동
    while (sibling.sibling === null) {
      if (sibling.return === null || sibling.return === fiber.return) {
        return null;
      }
      sibling = sibling.return;
    }
    sibling.sibling.return = sibling.return;
    sibling = sibling.sibling;
  }
  return null;
}
```

**핵심**:
- `fiber.return.child`부터 시작하여 현재 Fiber까지의 형제들을 순회
- 형제가 DOM 노드를 가지고 있으면 반환
- 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색
- **중요**: `sibling.stateNode`는 이미 DOM에 추가된 노드입니다 (commit phase에서)

## 현재 구현의 문제점

### 1. commitFiberTree 순회 순서

현재 구현:
```typescript
export function commitFiberTree(rootFiber, deps, context) {
  let currentFiber = rootFiber;
  
  while (currentFiber) {
    commitFiberNode(currentFiber, deps, context);
    
    if (currentFiber.child) {
      currentFiber = currentFiber.child;
      continue;
    }
    
    if (currentFiber.sibling) {
      currentFiber = currentFiber.sibling;
      continue;
    }
    
    // 부모로 돌아가서 형제 찾기
    currentFiber = currentFiber.return;
    while (currentFiber && !currentFiber.sibling) {
      currentFiber = currentFiber.return;
    }
    if (currentFiber) {
      currentFiber = currentFiber.sibling;
    }
  }
}
```

**문제**: 
- 이 순회는 child -> sibling 순서로 진행되지만, **같은 레벨의 형제들을 순서대로 처리하지 않습니다**.
- 예를 들어, `fiber.return.child`부터 시작하여 현재 Fiber까지의 형제들을 순회해야 하는데, 현재는 `fiber.sibling`만 확인합니다.

### 2. commitFiberNode에서 referenceNode 찾기

현재 구현:
```typescript
// React의 getHostSibling 방식: fiber.return.child부터 시작하여 현재 Fiber까지의 형제들을 순회
let sibling = fiber.parentFiber.child;
while (sibling && sibling !== fiber) {
  if (sibling.domElement) {
    referenceNode = sibling.domElement;
    break;
  }
  // ...
}
```

**문제**:
- commit phase에서 형제의 `domElement`가 아직 설정되지 않았을 수 있습니다.
- `commitFiberNode`는 `domElement`를 DOM에 추가한 **후**에 `fiber.domElement`를 설정합니다.
- 따라서 형제를 찾을 때 `sibling.domElement`가 아직 설정되지 않았을 수 있습니다.

### 3. React 방식과의 차이

React는:
- `fiber.return.child`부터 시작하여 현재 Fiber까지의 형제들을 순회
- 형제가 DOM 노드를 가지고 있으면 반환
- 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색
- **중요**: `sibling.stateNode`는 이미 DOM에 추가된 노드입니다 (commit phase에서)

현재 구현은:
- `fiber.parentFiber.child`부터 시작하여 현재 Fiber까지의 형제들을 순회
- 형제가 DOM 노드를 가지고 있으면 반환
- 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색
- **문제**: commit phase에서 형제의 `domElement`가 아직 설정되지 않았을 수 있음

## 올바른 해결책

React 방식 적용:
1. `fiber.return.child`부터 시작하여 현재 Fiber까지의 형제들을 순회
2. 형제가 DOM 노드를 가지고 있으면 반환
3. 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색

**하지만**: commit phase에서는 형제가 아직 commit되지 않았을 수 있으므로, `domElement`가 설정되지 않았을 수 있습니다.

**해결책**:
- commit phase에서 `domElement`를 DOM에 추가하기 **전에** `fiber.domElement`를 설정
- 또는 `parent.childNodes`를 직접 참조하되, 이전 형제가 이미 commit되었는지 확인

## 현재 구현 수정 방향

1. **commitFiberNode에서 domElement 설정 시점 변경**:
   - `domElement`를 DOM에 추가하기 **전에** `fiber.domElement`를 설정
   - 이렇게 하면 다음 형제를 찾을 때 `fiber.domElement`가 설정되어 있을 것

2. **React의 getHostSibling 방식 적용**:
   - `fiber.return.child`부터 시작하여 현재 Fiber까지의 형제들을 순회
   - 형제가 DOM 노드를 가지고 있으면 반환
   - 형제가 DOM 노드를 가지고 있지 않으면, 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색

3. **하지만 핵심 문제**:
   - `handleTextOnlyVNode`와 `findOrCreateHost`는 이미 DOM에 추가된 `domElement`를 반환
   - 따라서 `fiber.domElement`는 DOM 조작 **후**에 설정됨
   - 형제를 찾을 때 `sibling.domElement`가 아직 설정되지 않았을 수 있음

**최종 해결책**:
- `domElement`를 DOM에 추가하기 **전에** `fiber.domElement`를 설정
- `handleTextOnlyVNode`와 `findOrCreateHost`를 수정하여 DOM에 추가하기 전에 `fiber.domElement`를 설정하도록 변경
