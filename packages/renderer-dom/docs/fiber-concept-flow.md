# React Fiber 개념 흐름 정리

## React Fiber의 핵심 개념

### 1. 두 단계 처리 (Render Phase + Commit Phase)

#### Render Phase (Reconciliation)
- **목적**: 변경사항 계산만 수행, DOM 조작 없음
- **순서**: child -> sibling 순서로 순회
- **작업**:
  - VNode 비교 (prevVNode vs nextVNode)
  - effectTag 설정 (PLACEMENT, UPDATE, DELETION)
  - 변경사항 계산 (attrs, style, text 등)
  - 자식 Fiber 생성 및 연결

#### Commit Phase
- **목적**: 계산된 변경사항을 실제 DOM에 적용
- **순서**: child -> sibling 순서로 순회
- **작업**:
  - effectTag에 따라 DOM 조작 수행
  - insertBefore, removeChild 등
  - 속성 및 스타일 업데이트

### 2. Commit Phase에서 insertBefore 사용

React는 commit phase에서 `insertBefore`를 사용할 때:

```typescript
// React 방식 (의사코드)
function commitPlacement(fiber) {
  const parent = fiber.return.domElement;
  const before = getHostSibling(fiber); // 다음 형제의 DOM 노드 찾기
  parent.insertBefore(fiber.domElement, before);
}

function getHostSibling(fiber) {
  // 다음 형제 Fiber를 찾아서 그 DOM 노드를 반환
  let sibling = fiber.sibling;
  while (sibling) {
    if (sibling.domElement) {
      return sibling.domElement;
    }
    sibling = sibling.sibling;
  }
  return null;
}
```

**핵심**: 
- 이전 형제의 `nextSibling`을 사용하는 것이 아니라
- **다음 형제의 DOM 노드**를 직접 찾아서 사용
- 다음 형제가 없으면 `null` (appendChild와 동일)

### 3. 왜 이전 형제가 아니라 다음 형제인가?

`insertBefore(newNode, referenceNode)`는:
- `referenceNode` 앞에 `newNode`를 삽입
- `referenceNode`가 `null`이면 끝에 추가 (appendChild와 동일)

따라서:
- **다음 형제의 DOM 노드**를 `referenceNode`로 사용하면
- 현재 노드가 다음 형제 앞에 삽입됨
- 올바른 순서가 보장됨

## 현재 구현의 문제점

### 1. 이전 형제를 찾으려고 시도

현재 구현:
```typescript
// 이전 형제 Fiber를 찾아서 domElement.nextSibling을 referenceNode로 사용
let prevSiblingFiber = ...;
if (prevSiblingFiber && prevSiblingFiber.domElement) {
  referenceNode = prevSiblingFiber.domElement.nextSibling;
}
```

**문제**:
- 이전 형제의 `nextSibling`을 사용하려고 시도
- 하지만 이전 형제가 아직 commit되지 않았을 수 있음
- 또는 이전 형제의 `nextSibling`이 올바르지 않을 수 있음

### 2. React 방식과 다름

React는:
- **다음 형제의 DOM 노드**를 직접 찾아서 사용
- 다음 형제가 없으면 `null` (appendChild)
- 이렇게 하면 올바른 순서가 보장됨

## 올바른 해결책

### React 방식 적용

```typescript
// commit phase에서 insertBefore 사용
function commitFiberNode(fiber) {
  // ...
  
  // 다음 형제 Fiber를 찾아서 그 DOM 노드를 referenceNode로 사용
  let referenceNode: Node | null = null;
  let nextSiblingFiber = fiber.sibling;
  while (nextSiblingFiber) {
    // 다음 형제가 이미 commit되었을 것이므로 domElement가 설정되어 있음
    if (nextSiblingFiber.domElement) {
      referenceNode = nextSiblingFiber.domElement;
      break;
    }
    // 다음 형제의 자식 중 첫 번째 DOM 노드 찾기
    let childFiber = nextSiblingFiber.child;
    while (childFiber) {
      if (childFiber.domElement) {
        referenceNode = childFiber.domElement;
        break;
      }
      childFiber = childFiber.child; // 깊이 우선 탐색
    }
    if (referenceNode) break;
    nextSiblingFiber = nextSiblingFiber.sibling;
  }
  
  // referenceNode가 null이면 끝에 추가 (appendChild)
  parent.insertBefore(domElement, referenceNode);
}
```

**핵심**:
- 이전 형제가 아니라 **다음 형제**를 찾음
- 다음 형제의 DOM 노드를 직접 사용
- 다음 형제가 없으면 `null` (appendChild)

## 현재 구현 수정 방향

1. **commitFiberNode에서 다음 형제 찾기**:
   - `fiber.sibling`부터 시작하여 다음 형제 Fiber 찾기
   - 다음 형제의 `domElement`를 `referenceNode`로 사용
   - 다음 형제가 없으면 `null` (appendChild)

2. **createHostElement와 동일한 방식**:
   - `createHostElement`는 이미 `parent.childNodes[index]`를 사용
   - 하지만 이것도 commit phase에서는 문제가 있을 수 있음
   - React 방식(다음 형제 찾기)이 더 안전함

