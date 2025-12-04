# React Commit Phase vs Current Implementation

## React의 Commit Phase 순서

React는 commit phase에서 **3단계**로 나눕니다:

1. **Before Mutation**: DOM 조작 전 처리
2. **Mutation**: DOM 조작 (insertBefore, removeChild 등)
3. **Layout**: DOM 조작 후 처리 (layout effects)

각 단계는 **child -> sibling 순서**로 순회합니다.

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

**문제**: 이 순회는 child -> sibling 순서로 진행되지만, **같은 레벨의 형제들을 순서대로 처리하지 않습니다**.

예를 들어:
```
RootFiber
  └─ child: Fiber0
      └─ sibling: Fiber1
          └─ sibling: Fiber2
```

현재 순회:
1. RootFiber commit
2. Fiber0 commit
3. Fiber0.child가 없으므로 Fiber0.sibling (Fiber1) commit
4. Fiber1.child가 없으므로 Fiber1.sibling (Fiber2) commit

이것은 올바른 순서입니다! 하지만 문제는 **이전 형제를 찾는 로직**에 있습니다.

### 2. commitFiberNode에서 이전 형제 찾기

현재 구현:
```typescript
// 이전 형제 Fiber를 직접 찾아서 domElement.nextSibling을 referenceNode로 사용
let referenceNode: Node | null = null;
if (fiber.index > 0 && fiber.parentFiber) {
  let prevSiblingFiber = fiber.parentFiber.child;
  for (let i = 0; i < fiber.index - 1 && prevSiblingFiber; i++) {
    prevSiblingFiber = prevSiblingFiber.sibling;
  }
  if (prevSiblingFiber && prevSiblingFiber.domElement) {
    referenceNode = prevSiblingFiber.domElement.nextSibling;
  }
}
```

**문제**: 
- `fiber.index`는 VNode children 배열의 인덱스입니다.
- 하지만 Fiber sibling 관계는 primitive text를 제외한 VNode만 포함할 수 있습니다.
- 따라서 `fiber.index - 1`로 이전 형제 Fiber를 찾을 수 없습니다.

**해결책**: 
- VNode children 배열을 기준으로 이전 형제를 찾아야 합니다.
- 하지만 commit phase에서는 이미 모든 Fiber가 render phase를 거쳤으므로, 이전 형제 Fiber의 `domElement`가 설정되어 있어야 합니다.
- **하지만 이전 형제가 아직 commit되지 않았을 수 있습니다!**

### 3. React의 방식

React는 commit phase에서:
1. **Before Mutation**: 모든 Fiber를 순회하면서 DOM 조작 전 처리
2. **Mutation**: 모든 Fiber를 순회하면서 DOM 조작 (insertBefore 등)
3. **Layout**: 모든 Fiber를 순회하면서 DOM 조작 후 처리

각 단계에서 **child -> sibling 순서**로 순회하므로, 이전 형제는 이미 처리되었을 것입니다.

하지만 React는 **이전 형제의 domElement.nextSibling**을 사용하지 않고, **부모의 childNodes를 직접 참조**합니다.

## 올바른 해결책

React 방식:
1. commit phase에서 child -> sibling 순서로 순회
2. 각 Fiber를 commit할 때, **이전 형제가 이미 commit되었으므로** `domElement`가 설정되어 있을 것
3. 하지만 `insertBefore`를 사용할 때는 **이전 형제의 `nextSibling`**을 사용하는 것이 아니라, **부모의 childNodes를 직접 참조**해야 합니다.

현재 구현의 문제:
- `fiber.index`로 이전 형제를 찾으려고 시도
- 하지만 Fiber sibling 관계와 VNode children 순서가 일치하지 않을 수 있음

**해결책**: 
- commit phase에서 이전 형제를 찾을 때, **VNode children 배열을 기준으로** 이전 형제 Fiber를 찾아야 합니다.
- 또는 **부모의 childNodes를 직접 참조**하여 올바른 위치를 찾아야 합니다.

## 권장 수정 사항

1. **commitFiberTree 순회 순서 확인**: child -> sibling 순서가 올바른지 확인
2. **이전 형제 찾기 로직 수정**: VNode children 배열을 기준으로 이전 형제 Fiber 찾기
3. **referenceNode 계산**: 이전 형제의 `domElement.nextSibling` 대신, 부모의 childNodes를 직접 참조

