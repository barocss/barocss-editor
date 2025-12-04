# Reconciler.ts Fiber 적용 검토 및 개선 방안

## 현재 구조 분석

### 1. reconcile 메서드 구조

```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // 1. rootVNode 찾기/승격 (동기)
  // 2. host 찾기/생성 (동기)
  // 3. attrs/style 업데이트 (동기)
  // 4. Fiber reconcile 호출 (비동기)
  // 5. model.text 처리 (동기, Fiber reconcile 후)
  // 6. Portal 클린업 (동기)
}
```

**문제점**:
- rootVNode 처리, host 생성/업데이트가 Fiber reconcile 전에 동기적으로 실행됨
- model.text 처리가 Fiber reconcile 후에 실행되어 순서가 어긋날 수 있음
- Fiber의 이점(작은 단위로 나눠서 처리)을 제대로 활용하지 못함

### 2. reconcileVNodesToDOM 메서드 구조

```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  for (const vnode of newVNodes) {
    // 1. host 찾기/생성 (동기)
    // 2. attrs/style 업데이트 (동기)
    // 3. Fiber reconcile 호출 (비동기)
    // 4. model.text 처리 (동기, Fiber reconcile 후)
  }
  // 5. reorder (동기)
  // 6. stale 제거 (동기)
}
```

**문제점**:
- 각 VNode에 대해 host 찾기/생성, attrs/style 업데이트가 Fiber reconcile 전에 동기적으로 실행됨
- reorder와 stale 제거가 Fiber reconcile 완료를 기다리지 않고 실행됨
- Fiber의 비동기 특성을 고려하지 않음

### 3. Fiber Scheduler 구조

```typescript
workLoop() {
  while (hasWork && !shouldYield()) {
    performUnitOfWork(fiber);
    // reconcileFiberNode에서 바로 DOM 조작 수행
  }
  if (hasWork) {
    requestIdleCallback(workLoop);
  } else {
    commitWork(); // 빈 함수
  }
}
```

**문제점**:
- React Fiber의 두 단계(render phase, commit phase)를 구분하지 않음
- 현재는 render phase에서 바로 DOM 조작을 수행함
- commitWork가 빈 함수로, commit phase가 없음

### 4. reconcileFiberNode 구조

```typescript
reconcileFiberNode(fiber, deps, context) {
  // 1. Portal 처리
  // 2. host 찾기/생성
  // 3. attrs/style 업데이트
  // 4. vnode.text 처리
  // 5. primitive text children 처리
  // 6. 자식 Fiber는 Scheduler가 처리
}
```

**문제점**:
- primitive text 처리가 복잡하고, VNode children이 Fiber로 처리되기 전에 실행됨
- 순서 문제: primitive text를 처리할 때 VNode children이 아직 DOM에 추가되지 않았을 수 있음

---

## React Fiber 원칙과 비교

### React Fiber의 핵심 원칙

1. **두 단계 처리 (Render Phase + Commit Phase)**
   - Render Phase: 변경사항 계산 (DOM 조작 없음)
   - Commit Phase: DOM 조작 수행 (한 번에)

2. **작은 단위로 나눠서 처리**
   - 각 Fiber 노드를 개별적으로 처리
   - 시간 제한(time slice) 내에서만 작업
   - 브라우저가 다른 작업을 처리할 수 있도록 yield

3. **우선순위 기반 스케줄링**
   - 높은 우선순위 작업을 먼저 처리
   - 낮은 우선순위 작업은 나중에 처리

4. **중단 가능한 작업**
   - 작업을 중단하고 나중에 재개할 수 있음
   - 이전 작업 결과를 버리고 새로 시작할 수 있음

### 우리 구현과의 차이점

| React Fiber | 우리 구현 | 문제점 |
|------------|----------|--------|
| Render Phase (변경사항 계산) | reconcileFiberNode에서 바로 DOM 조작 | DOM 조작이 즉시 실행되어 중단 불가 |
| Commit Phase (DOM 조작) | 없음 | 변경사항을 한 번에 적용할 수 없음 |
| 우선순위 기반 스케줄링 | 있음 (FiberPriority) | ✅ 구현됨 |
| 중단 가능한 작업 | 부분적 | DOM 조작이 즉시 실행되어 중단 불가 |

---

## 개선 방안

### 방안 1: 두 단계 처리 도입 (권장)

#### Render Phase (변경사항 계산)
```typescript
function reconcileFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  // DOM 조작 없이 변경사항만 계산
  // effectTag 설정: 'PLACEMENT', 'UPDATE', 'DELETION'
  
  // 1. Portal 처리 (계산만)
  // 2. host 찾기/생성 필요 여부 계산
  // 3. attrs/style 변경사항 계산
  // 4. vnode.text 변경사항 계산
  // 5. primitive text 변경사항 계산
  // 6. 자식 Fiber 처리 (재귀)
}
```

#### Commit Phase (DOM 조작)
```typescript
function commitFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies): void {
  // effectTag에 따라 DOM 조작 수행
  
  switch (fiber.effectTag) {
    case 'PLACEMENT':
      // DOM 요소 생성 및 추가
      break;
    case 'UPDATE':
      // DOM 요소 업데이트
      break;
    case 'DELETION':
      // DOM 요소 제거
      break;
  }
  
  // 자식 Fiber commit (재귀)
  commitFiberNode(fiber.child, deps);
  commitFiberNode(fiber.sibling, deps);
}
```

**장점**:
- ✅ 작업을 중단하고 재개할 수 있음
- ✅ 변경사항을 한 번에 적용할 수 있음
- ✅ React Fiber 원칙에 부합

**단점**:
- ⚠️ 구현이 복잡함
- ⚠️ 기존 코드 대폭 수정 필요

### 방안 2: 현재 구조 유지 + 순서 개선 (간단)

#### reconcile 메서드 개선
```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // rootVNode 처리도 Fiber로 이동
  // model.text 처리도 Fiber로 이동
  
  const rootFiber = createFiberTree(container, vnode, prevVNode, context);
  // rootFiber에 model.text 정보 포함
  
  reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps);
  
  // Portal 클린업은 Fiber 완료 후 실행 (waitForFiber 필요)
}
```

#### reconcileVNodesToDOM 개선
```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  // 각 VNode를 Fiber로 처리
  // reorder와 stale 제거는 Fiber 완료 후 실행 (waitForFiber 필요)
  
  for (const vnode of newVNodes) {
    reconcileWithFiber(host, vnode, prevVNode, reconcileContext, fiberDeps);
  }
  
  // Fiber 완료 대기
  await waitForFiber();
  
  // reorder와 stale 제거
  reorder(parent, nextHosts);
  removeStale(parent, nextHosts);
}
```

**장점**:
- ✅ 기존 코드 수정 최소화
- ✅ 구현이 간단함

**단점**:
- ⚠️ 여전히 DOM 조작이 즉시 실행됨
- ⚠️ 중단 불가능한 작업

### 방안 3: 하이브리드 접근 (현실적)

#### Root 레벨은 동기 처리 유지
```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // Root 레벨 host 찾기/생성은 동기 처리 (필수)
  // children reconcile만 Fiber로 처리
}
```

#### Children 레벨은 Fiber로 처리
```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  // 각 VNode의 children reconcile만 Fiber로 처리
  // host 찾기/생성, attrs/style 업데이트는 동기 처리
}
```

**장점**:
- ✅ 기존 코드와 호환성 유지
- ✅ children reconcile만 Fiber 이점 활용

**단점**:
- ⚠️ 완전한 Fiber 아키텍처는 아님

---

## 권장 개선 사항

### 즉시 개선 가능한 항목

1. **model.text 처리 순서 개선**
   - 현재: Fiber reconcile 후에 model.text 처리
   - 개선: Fiber reconcile 내부에서 처리하거나, Fiber 완료 후 처리

2. **reorder와 stale 제거 순서 개선**
   - 현재: Fiber reconcile 완료를 기다리지 않고 실행
   - 개선: Fiber 완료 후 실행 (waitForFiber 사용)

3. **primitive text 처리 개선**
   - 현재: 복잡한 위치 계산 로직
   - 개선: VNode children이 Fiber로 처리된 후 primitive text 처리

### 장기 개선 항목

1. **두 단계 처리 도입**
   - Render Phase와 Commit Phase 분리
   - 중단 가능한 작업 구현

2. **Effect List 도입**
   - 변경사항을 리스트로 관리
   - Commit Phase에서 한 번에 적용

3. **Priority 기반 스케줄링 강화**
   - 현재는 우선순위만 설정하고 실제 스케줄링은 미흡
   - 높은 우선순위 작업을 먼저 처리하도록 개선

---

## 구체적인 문제점과 해결 방안

### 문제 1: model.text 처리 순서

**현재 코드**:
```typescript
// reconciler.ts:164-171
reconcileWithFiber(host, rootVNode, prevVNode, context, fiberDeps);

// Fiber reconcile 후에 model.text 처리
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  if (!rootVNode.children || rootVNode.children.length === 0) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**문제점**:
- Fiber reconcile이 비동기로 실행되는데, model.text 처리는 동기적으로 실행됨
- Fiber reconcile이 완료되기 전에 model.text가 처리될 수 있음
- children이 Fiber로 처리되는 중에 model.text가 덮어쓸 수 있음

**해결 방안**:
1. model.text 처리를 Fiber reconcile 내부로 이동
2. 또는 Fiber 완료 후 처리 (waitForFiber 사용)

### 문제 2: reorder와 stale 제거 순서

**현재 코드**:
```typescript
// reconciler.ts:390-402
for (const vnode of newVNodes) {
  reconcileWithFiber(host, vnode, prevVNode, reconcileContext, fiberDeps);
  // Fiber reconcile은 비동기로 실행됨
}

// Fiber 완료를 기다리지 않고 즉시 실행
reorder(parent, nextHosts);
// stale 제거도 즉시 실행
for (const el of existingHosts) {
  if (!keepSet.has(el)) {
    parent.removeChild(el);
  }
}
```

**문제점**:
- Fiber reconcile이 완료되기 전에 reorder와 stale 제거가 실행됨
- DOM이 아직 업데이트되지 않은 상태에서 순서를 변경하거나 요소를 제거할 수 있음

**해결 방안**:
- Fiber 완료 후 reorder와 stale 제거 실행
- waitForFiber 사용 또는 FiberScheduler에 완료 콜백 추가

### 문제 3: primitive text 처리 순서

**현재 코드**:
```typescript
// fiber-reconciler.ts:196-266
for (let i = 0; i < vnode.children.length; i++) {
  const child = vnode.children[i];
  
  if (typeof child === 'string' || typeof child === 'number') {
    // primitive text 처리
    // VNode children이 아직 Fiber로 처리되지 않았을 수 있음
  }
}
```

**문제점**:
- primitive text를 처리할 때 VNode children이 아직 DOM에 추가되지 않았을 수 있음
- elementCount 계산이 정확하지 않을 수 있음

**해결 방안**:
- VNode children이 Fiber로 처리된 후 primitive text 처리
- 또는 primitive text도 Fiber로 처리 (Text Fiber 노드 생성)

### 문제 4: rootVNode 처리와 host 생성

**현재 코드**:
```typescript
// reconciler.ts:40-84
// rootVNode 찾기/승격 (동기)
let rootVNode = vnode;
if ((!rootVNode.tag || ...)) {
  const firstEl = findFirstElementVNode(rootVNode);
  if (firstEl) {
    rootVNode = { ...(firstEl as any) } as VNode;
  }
}

// host 찾기/생성 (동기)
let host: HTMLElement | null = null;
if (sid) {
  host = Array.from(container.children).find(...);
}
if (!host) {
  host = this.dom.createSimpleElement(tag, container);
  container.appendChild(host);
}

// attrs/style 업데이트 (동기)
if (rootVNode.attrs) {
  this.dom.updateAttributes(host, prevVNode?.attrs, rootVNode.attrs);
}

// 그 다음 Fiber reconcile 호출
reconcileWithFiber(host, rootVNode, prevVNode, context, fiberDeps);
```

**문제점**:
- rootVNode 처리, host 생성, attrs/style 업데이트가 모두 동기적으로 실행됨
- Fiber의 이점(작은 단위로 나눠서 처리)을 활용하지 못함

**해결 방안**:
- rootVNode도 Fiber로 처리
- 또는 root 레벨은 동기 처리 유지 (필수적이므로)

---

## 결론

현재 구현은 **Fiber의 기본 구조는 갖추고 있지만, React Fiber의 핵심 원칙(두 단계 처리, 중단 가능한 작업)을 완전히 구현하지는 못했습니다**.

### 즉시 개선 가능한 항목 (우선순위 높음)

1. ✅ **reorder와 stale 제거 순서 개선**
   - Fiber 완료 후 실행하도록 수정
   - waitForFiber 사용 또는 완료 콜백 추가

2. ✅ **model.text 처리 순서 개선**
   - Fiber reconcile 내부로 이동하거나 완료 후 처리

3. ✅ **primitive text 처리 순서 개선**
   - VNode children 처리 후 primitive text 처리

### 장기 개선 항목 (우선순위 낮음)

1. **두 단계 처리 도입**
   - Render Phase와 Commit Phase 분리
   - 중단 가능한 작업 구현

2. **Effect List 도입**
   - 변경사항을 리스트로 관리
   - Commit Phase에서 한 번에 적용

3. **rootVNode 처리도 Fiber로 이동**
   - 현재는 동기 처리하지만, Fiber로 이동 가능

**권장 사항**: 즉시 개선 가능한 항목부터 처리하고, 장기적으로는 두 단계 처리 도입을 고려하는 것이 좋습니다.

