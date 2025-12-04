# Reconciliation 로직 흐름 분석

## 전체 흐름

```
reconcileWithFiber()
  ├─ createFiberTree() - Fiber 트리 생성
  ├─ FiberScheduler 생성
  │   ├─ renderFiberNode() - Render Phase (각 Fiber마다)
  │   │   ├─ transferVNodeIdFromPrev()
  │   │   ├─ generateVNodeIdIfNeeded()
  │   │   ├─ handlePortalVNode()
  │   │   ├─ effectTag 설정 (PLACEMENT/UPDATE)
  │   │   ├─ prevVNode에서 domElement 찾기 (참조만)
  │   │   └─ saveVNodeToTree()
  │   └─ onComplete 콜백
  │       └─ commitFiberTree() - Commit Phase
  │           └─ commitFiberNode() - 각 Fiber마다
  │               ├─ DELETION 처리
  │               ├─ Text node 생성/재사용
  │               ├─ findOrCreateHost() - Host element 생성/찾기
  │               ├─ domElement 저장
  │               ├─ updateAttributes()
  │               ├─ updateStyles()
  │               └─ handleVNodeTextProperty()
```

## 1. Render Phase (`renderFiberNode`)

### 역할
- 변경사항 계산만 수행
- DOM 조작 없음
- effectTag 설정

### 현재 구현

```typescript
export function renderFiberNode(fiber, deps, context) {
  // 1. ID 전달 및 생성
  transferVNodeIdFromPrev(vnode, prevVNode);
  generateVNodeIdIfNeeded(vnode, fiber, deps.components);
  
  // 2. Portal 처리
  if (handlePortalVNode(...)) return;
  
  // 3. vnode가 없으면 DELETION (로깅만)
  if (!vnode) {
    console.error('Component unmount calculated');
    fiber.effectTag = 'DELETION';
    return;
  }
  
  // 4. effectTag 설정
  if (!prevVNode) {
    fiber.effectTag = 'PLACEMENT';
  } else {
    fiber.effectTag = 'UPDATE';
  }
  
  // 5. 기존 DOM 요소 찾기 (참조만)
  if (prevVNode?.meta?.domElement) {
    fiber.domElement = prevVNode.meta.domElement;
  }
  
  // 6. VNode 스냅샷 저장
  saveVNodeToTree(vnode, deps.prevVNodeTree);
}
```

### 문제점

1. **기존 DOM 요소 찾기**: 
   - `prevVNode.meta.domElement`에서 찾기만 함
   - 이것은 문제 없음 (참조만)

2. **Portal 처리**:
   - Portal 내부에서 별도 FiberScheduler 생성
   - 이것도 문제 없음

3. **effectTag 설정**:
   - 올바르게 설정됨

## 2. Commit Phase (`commitFiberTree`)

### 역할
- Fiber 트리를 순회하면서 DOM 조작 수행
- child -> sibling 순서로 순회

### 현재 구현

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

### 문제점

1. **순회 순서**: 
   - child -> sibling 순서로 순회
   - 이것은 올바름

2. **다음 형제 찾기**:
   - 다음 형제는 아직 commit되지 않았을 수 있음
   - 따라서 `fiber.sibling.domElement`를 찾을 수 없을 수 있음

## 3. Commit Phase (`commitFiberNode`)

### 역할
- effectTag에 따라 DOM 조작 수행
- DOM 요소 생성/찾기/삽입/업데이트

### 현재 구현

```typescript
export function commitFiberNode(fiber, deps, context) {
  // 1. effectTag 확인
  if (!fiber.effectTag) return;
  
  // 2. DELETION 처리
  if (!vnode && fiber.effectTag === 'DELETION') {
    // unmountComponent 호출
    // removeChild 호출
    return;
  }
  
  // 3. DOM 요소 찾기 또는 생성
  if (vnode.tag === '#text') {
    // Text node 처리
    // referenceNode 찾기 (다음 형제)
    // Text node 생성/재사용
    // insertBefore 호출
  } else {
    // Host element 찾기 또는 생성
    domElement = findOrCreateHost(fiber, deps, context);
  }
  
  // 4. domElement 저장
  vnode.meta.domElement = domElement;
  fiber.domElement = domElement;
  
  // 5. 속성 및 스타일 업데이트
  if (domElement instanceof HTMLElement) {
    dom.updateAttributes(...);
    dom.updateStyles(...);
  }
}
```

### 문제점

1. **referenceNode 찾기**:
   - 다음 형제의 `domElement`를 찾으려고 시도
   - 하지만 다음 형제는 아직 commit되지 않았을 수 있음
   - 따라서 `fiber.sibling.domElement`가 `undefined`일 수 있음

2. **findOrCreateHost**:
   - DOM 요소 생성/찾기
   - 이것은 올바름

## 4. `findOrCreateHost`

### 역할
- DOM 요소 찾기 또는 생성
- 올바른 위치에 삽입

### 현재 구현

```typescript
export function findOrCreateHost(fiber, deps, context) {
  // 1. prevVNode에서 찾기
  let host = findHostFromPrevVNode(vnode, prevVNode);
  
  // 2. findHostForChildVNode로 찾기
  if (!host) {
    host = findHostForChildVNode(...);
  }
  
  // 3. findHostInParentChildren로 찾기
  if (!host) {
    host = findHostInParentChildren(...);
  }
  
  // 4. 새로 생성
  if (!host) {
    host = createHostElement(...);
  } else {
    updateExistingHost(...);
  }
  
  return host;
}
```

### 문제점

1. **createHostElement**:
   - `parent.childNodes[index]`를 사용하여 referenceNode 찾기
   - 이것은 올바름 (commit phase에서 이전 형제는 이미 추가되었을 것)

## 핵심 문제

### 1. Text node의 referenceNode 찾기

현재 구현:
```typescript
let nextSiblingFiber = fiber.sibling;
if (nextSiblingFiber) {
  if (nextSiblingFiber.domElement) {
    referenceNode = nextSiblingFiber.domElement;
  } else if (nextSiblingFiber.child) {
    // 깊이 우선 탐색
  }
}
```

**문제**:
- 다음 형제는 아직 commit되지 않았으므로 `domElement`가 설정되지 않았을 수 있음
- 다음 형제의 자식도 아직 commit되지 않았을 수 있음

**해결책**:
```typescript
// parent.childNodes를 직접 참조
const childNodes = Array.from(actualParent.childNodes);
const referenceNode = fiber.index < childNodes.length ? childNodes[fiber.index] : null;
```

### 2. Host element의 referenceNode 찾기

현재 구현:
- `createHostElement`에서 `parent.childNodes[index]` 사용
- 이것은 올바름

## 테스트 가능한 단위

### 1. `renderFiberNode`
- 입력: FiberNode, deps, context
- 출력: effectTag 설정, fiber.domElement 설정
- 테스트: effectTag가 올바르게 설정되는지 확인

### 2. `commitFiberNode`
- 입력: FiberNode, deps, context
- 출력: DOM 조작 수행
- 테스트: DOM 요소가 올바르게 생성/삽입되는지 확인

### 3. `findOrCreateHost`
- 입력: FiberNode, deps, context
- 출력: HTMLElement
- 테스트: 기존 요소 재사용 또는 새로 생성

### 4. Text node 처리
- 입력: FiberNode (text node), deps, context
- 출력: Text node 생성/재사용 및 삽입
- 테스트: referenceNode를 올바르게 찾는지 확인

## 개선 방향

1. **Text node의 referenceNode 찾기**:
   - `parent.childNodes[index]` 직접 참조
   - 다음 형제의 `domElement`를 찾으려고 시도하지 않음

2. **단위 테스트 추가**:
   - `renderFiberNode` 테스트
   - `commitFiberNode` 테스트
   - `findOrCreateHost` 테스트
   - Text node 처리 테스트

