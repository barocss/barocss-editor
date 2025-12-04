# Commit Phase 실행 시점

## 현재 구현

### 1. Render Phase (Reconciliation)

`FiberScheduler`의 `workLoop`에서:
1. 모든 Fiber 노드에 대해 `renderFiberNode` 호출
2. 각 Fiber 노드의 `effectTag` 설정 (PLACEMENT, UPDATE, DELETION)
3. **DOM 조작 없음**

### 2. Commit Phase

Render Phase가 **완전히 끝난 후**에 실행됩니다:

```typescript
// FiberScheduler.workLoop()
if (this.syncMode) {
  while (this.nextUnitOfWork) {
    this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
  }
  // 모든 작업 완료
  this.workStatus = FiberWorkStatus.Completed;
  this.commitWork();
  // 완료 콜백 호출
  if (this.onCompleteCallback) {
    this.onCompleteCallback(); // 여기서 commitFiberTree 호출
  }
}
```

`reconcileWithFiber`에서:
```typescript
const scheduler = new CustomFiberScheduler(fiberRender, () => {
  // Render Phase 완료 후 Commit Phase 실행
  commitFiberTree(rootFiber, deps, context);
  if (onComplete) {
    onComplete();
  }
});
```

## Commit Phase 실행 순서

1. **모든 Render Phase 작업 완료**
   - 모든 Fiber 노드에 대해 `renderFiberNode` 호출 완료
   - 모든 Fiber 노드의 `effectTag` 설정 완료

2. **Commit Phase 시작**
   - `commitFiberTree` 호출
   - child -> sibling 순서로 Fiber 트리 순회
   - 각 Fiber 노드에 대해 `commitFiberNode` 호출
   - `effectTag`에 따라 DOM 조작 수행

## 문제점

### 현재 구현의 문제

Commit phase에서 `referenceNode`를 찾을 때:
- 다음 형제의 `domElement`를 찾으려고 시도
- 하지만 다음 형제는 아직 commit되지 않았으므로 `domElement`가 설정되지 않았을 수 있음

### 해결책

React의 `getHostSibling`은:
- 다음 형제의 `stateNode`를 찾지만, commit phase에서는 아직 설정되지 않았을 수 있음
- 따라서 다음 형제의 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색 사용
- 하지만 다음 형제의 자식도 아직 commit되지 않았을 수 있음

**핵심 문제**: 
- Commit phase는 child -> sibling 순서로 순회하므로, 다음 형제는 아직 commit되지 않았을 것
- 따라서 다음 형제의 `domElement`를 찾을 수 없음

**해결 방법**:
- `parent.childNodes`를 직접 참조하여 올바른 위치를 찾기
- commit phase는 child -> sibling 순서로 순회하므로, 이전 형제는 이미 `parent.childNodes`에 추가되었을 것
- `fiber.index`는 VNode children 배열의 인덱스이므로, `parent.childNodes[fiber.index]`는 다음 형제의 DOM 노드가 될 것

## React의 실제 구현

React는 commit phase를 3단계로 나눕니다:
1. **Before Mutation**: DOM 조작 전 처리
2. **Mutation**: DOM 조작 (insertBefore 등)
3. **Layout**: DOM 조작 후 처리

각 단계에서 child -> sibling 순서로 순회하므로, 이전 형제는 이미 처리되었을 것입니다.

하지만 React의 `getHostSibling`은:
- 다음 형제의 `stateNode`를 찾지만, commit phase에서는 아직 설정되지 않았을 수 있음
- 따라서 다음 형제의 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색 사용

## 현재 구현의 수정 방향

1. **`parent.childNodes` 직접 참조**:
   - commit phase는 child -> sibling 순서로 순회하므로, 이전 형제는 이미 `parent.childNodes`에 추가되었을 것
   - `fiber.index`는 VNode children 배열의 인덱스이므로, `parent.childNodes[fiber.index]`는 다음 형제의 DOM 노드가 될 것

2. **다음 형제의 `domElement` 찾기**:
   - `fiber.sibling`을 직접 사용하여 다음 형제 찾기
   - 다음 형제의 `domElement`가 설정되어 있으면 사용
   - 다음 형제의 `domElement`가 설정되지 않았으면, 다음 형제의 자식 중 첫 번째 DOM 노드를 찾기 위해 깊이 우선 탐색

3. **하지만 핵심 문제**:
   - commit phase는 child -> sibling 순서로 순회하므로, 다음 형제는 아직 commit되지 않았을 것
   - 따라서 다음 형제의 `domElement`를 찾을 수 없음
   - `parent.childNodes`를 직접 참조하는 것이 더 안전함

