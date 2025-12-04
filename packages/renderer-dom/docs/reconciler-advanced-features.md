# Reconciler 고급 기능: Fiber, Batching, Suspense

## 개요

React의 고급 기능들(Fiber Architecture, Batching, Suspense)을 우리 Reconciler에 적용하면 어떻게 되는지 설명합니다.

---

## 1. Fiber Architecture

### 현재 상태

```typescript
// 현재: 동기적으로 모든 작업 처리
reconcile(container, vnode, model) {
  // 1. Root VNode 처리
  // 2. reconcileVNodeChildren (재귀)
  //    - 모든 children을 한 번에 처리
  //    - 큰 트리면 브라우저가 멈춤
  // 3. 완료
}
```

**문제점**:
- 큰 트리(1000+ 노드)를 reconcile하면 브라우저가 멈춤
- 사용자 입력이 블로킹됨
- 애니메이션이 끊김

---

### Fiber Architecture 적용 후

```typescript
// Fiber 적용: 작업을 작은 단위로 분할하고 우선순위 조정
reconcile(container, vnode, model) {
  // 1. 작업을 Fiber 단위로 분할
  const fiberRoot = createFiberRoot(container, vnode);
  
  // 2. 스케줄러가 우선순위에 따라 처리
  scheduler.scheduleWork(fiberRoot, {
    priority: 'normal', // 또는 'high', 'low'
    timeout: 5000 // 5초 내에 완료
  });
  
  // 3. 브라우저가 다른 작업(사용자 입력, 애니메이션)을 처리할 수 있음
  // 4. 다음 프레임에서 계속 reconcile
}

// 스케줄러 내부
function workLoop() {
  while (hasWork && !shouldYield()) {
    // 작은 단위로 작업 처리 (예: 5ms마다 yield)
    performUnitOfWork(currentFiber);
  }
  
  if (hasWork) {
    // 다음 프레임에서 계속
    requestIdleCallback(workLoop);
  }
}
```

**변화**:
- ✅ 큰 트리도 브라우저가 멈추지 않음
- ✅ 사용자 입력이 즉시 반응
- ✅ 애니메이션이 부드럽게 동작
- ✅ 우선순위 기반 렌더링 (중요한 것 먼저)

**예시**:

```typescript
// 현재: 1000개 노드를 한 번에 처리 (100ms 소요, 브라우저 멈춤)
reconcile(container, largeVNode, model);
// → 100ms 동안 브라우저 멈춤

// Fiber 적용 후: 1000개 노드를 20개씩 나눠서 처리
reconcile(container, largeVNode, model);
// → 5ms 처리 → yield → 사용자 입력 처리 → 5ms 처리 → yield → ...
// → 총 100ms 소요되지만 브라우저가 멈추지 않음
```

**구현 예시**:

```typescript
// Fiber Node 구조
interface FiberNode {
  vnode: VNode;
  domElement: HTMLElement | null;
  parent: FiberNode | null;
  child: FiberNode | null;
  sibling: FiberNode | null;
  return: FiberNode | null; // parent와 동일하지만 의미론적으로 다름
  effectTag: 'PLACEMENT' | 'UPDATE' | 'DELETION' | null;
  alternate: FiberNode | null; // 이전 Fiber (diffing용)
}

// 작업 단위
function performUnitOfWork(fiber: FiberNode): FiberNode | null {
  // 1. 현재 Fiber reconcile
  reconcileFiber(fiber);
  
  // 2. 자식 Fiber 반환 (다음 작업)
  if (fiber.vnode.children) {
    return createChildFiber(fiber, fiber.vnode.children[0]);
  }
  
  // 3. 형제 Fiber 반환
  if (fiber.sibling) {
    return fiber.sibling;
  }
  
  // 4. 부모로 돌아가서 형제 찾기
  let nextFiber = fiber.return;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.return;
  }
  
  return null; // 완료
}
```

**장점**:
- 큰 트리에서도 반응성 유지
- 우선순위 기반 렌더링
- 중단 가능 (긴급한 작업 처리 가능)

**단점**:
- 복잡도 증가 (Fiber 트리 관리)
- 오버헤드 발생 (작은 트리에서는 오히려 느릴 수 있음)
- 구현 난이도 높음

**언제 필요?**:
- 500+ 노드의 큰 트리
- 실시간 업데이트가 많은 경우
- 사용자 입력이 중요한 경우

---

## 2. Batching (배칭)

### 현재 상태

```typescript
// 현재: 각 업데이트를 즉시 처리
function updateModel(model: ModelData) {
  // 1. 모델 업데이트
  model.text = 'new text';
  
  // 2. 즉시 reconcile
  reconciler.reconcile(container, vnode, model);
  // → DOM 업데이트 발생
}

// 여러 업데이트가 연속으로 발생하면
updateModel(model1); // reconcile 1
updateModel(model2); // reconcile 2
updateModel(model3); // reconcile 3
// → 3번의 DOM 업데이트 발생
```

**문제점**:
- 여러 업데이트가 연속으로 발생하면 불필요한 reconcile 반복
- 중간 상태가 DOM에 반영됨 (깜빡임)
- 성능 저하

---

### Batching 적용 후

```typescript
// Batching 적용: 여러 업데이트를 모아서 한 번에 처리
function updateModel(model: ModelData) {
  // 1. 모델 업데이트
  model.text = 'new text';
  
  // 2. 업데이트를 큐에 추가 (즉시 reconcile하지 않음)
  updateQueue.enqueue({
    container,
    vnode,
    model
  });
  
  // 3. 다음 프레임에서 배치로 처리
  scheduleBatchUpdate();
}

// 배치 처리
function processBatch() {
  const updates = updateQueue.flush();
  
  // 모든 업데이트를 하나의 VNode로 합침
  const finalVNode = mergeUpdates(updates);
  
  // 한 번만 reconcile
  reconciler.reconcile(container, finalVNode, finalModel);
  // → 1번의 DOM 업데이트만 발생
}
```

**변화**:
- ✅ 여러 업데이트를 하나로 합쳐서 처리
- ✅ 중간 상태가 DOM에 반영되지 않음
- ✅ 성능 향상 (불필요한 reconcile 감소)

**예시**:

```typescript
// 현재: 3번의 reconcile
updateModel(model1); // reconcile 1 (10ms)
updateModel(model2); // reconcile 2 (10ms)
updateModel(model3); // reconcile 3 (10ms)
// → 총 30ms, 3번의 DOM 업데이트

// Batching 적용 후: 1번의 reconcile
updateModel(model1); // 큐에 추가
updateModel(model2); // 큐에 추가
updateModel(model3); // 큐에 추가
// → 다음 프레임에서 배치 처리
processBatch(); // reconcile 1 (10ms)
// → 총 10ms, 1번의 DOM 업데이트
```

**구현 예시**:

```typescript
class UpdateQueue {
  private queue: Array<{ container: HTMLElement, vnode: VNode, model: ModelData }> = [];
  private scheduled = false;
  
  enqueue(update: { container: HTMLElement, vnode: VNode, model: ModelData }) {
    this.queue.push(update);
    
    if (!this.scheduled) {
      this.scheduled = true;
      // 다음 프레임에서 배치 처리
      requestAnimationFrame(() => this.process());
    }
  }
  
  process() {
    this.scheduled = false;
    
    if (this.queue.length === 0) return;
    
    // 마지막 업데이트만 사용 (이전 업데이트는 무시)
    const lastUpdate = this.queue[this.queue.length - 1];
    this.queue = [];
    
    // 한 번만 reconcile
    reconciler.reconcile(
      lastUpdate.container,
      lastUpdate.vnode,
      lastUpdate.model
    );
  }
  
  flush() {
    const updates = [...this.queue];
    this.queue = [];
    this.scheduled = false;
    return updates;
  }
}
```

**장점**:
- 불필요한 reconcile 감소
- 중간 상태 방지 (깜빡임 없음)
- 성능 향상

**단점**:
- 지연 시간 증가 (다음 프레임까지 대기)
- 복잡도 증가 (큐 관리)

**언제 필요?**:
- 빠른 연속 업데이트가 많은 경우
- 중간 상태를 보여주고 싶지 않은 경우
- 성능 최적화가 중요한 경우

---

## 3. Suspense (복잡함 - 대안 권장)

### ⚠️ Suspense의 문제점

Suspense는 **Promise를 throw하고 catch하는 방식**으로 동작하는데, 이는:
- ❌ 일반적인 JavaScript 패턴과 다름
- ❌ 이해하기 어려움
- ❌ 디버깅이 어려움
- ❌ 타입 안정성이 떨어짐

```typescript
// Suspense의 동작 방식 (이해하기 어려움)
function MyComponent() {
  const data = useAsyncData(fetchData); // 내부에서 Promise throw
  return <div>{data}</div>;
}

// 내부 구현 (복잡함)
function useAsyncData(fetcher) {
  const promise = fetcher();
  if (promise.status === 'pending') {
    throw promise; // Promise를 throw? 🤔
  }
  return promise.value;
}
```

---

### ✅ 더 간단한 대안: 명시적 로딩 상태

**대안 1: 컴포넌트 레벨에서 처리**

```typescript
// 간단하고 직관적
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchUser(userId).then(data => {
      setUser(data);
      setLoading(false);
    });
  }, [userId]);
  
  if (loading) {
    return <Spinner />; // 명시적 로딩 상태
  }
  
  return <div>{user.name}</div>;
}
```

**장점**:
- ✅ 이해하기 쉬움
- ✅ 디버깅이 쉬움
- ✅ 타입 안정성
- ✅ 기존 패턴과 일치

---

**대안 2: VNodeBuilder에서 비동기 처리**

```typescript
// VNodeBuilder가 비동기 데이터를 처리
function buildComponent(template, data, options) {
  // 비동기 데이터가 있으면 로딩 상태 VNode 반환
  if (data.isLoading) {
    return {
      tag: 'div',
      children: [{ tag: 'div', text: 'Loading...' }]
    };
  }
  
  // 데이터가 로드되면 정상 VNode 반환
  return {
    tag: 'div',
    children: [{ tag: 'div', text: data.value }]
  };
}
```

**장점**:
- ✅ Reconciler는 동기적으로만 동작
- ✅ 비동기 처리는 VNodeBuilder에서
- ✅ Suspense 없이도 로딩 상태 표시 가능

---

**대안 3: Model 레벨에서 처리 (가장 권장)**

```typescript
// Model에 로딩 상태 포함
const model = {
  sid: 'user-profile',
  stype: 'user-profile',
  isLoading: true,
  data: null
};

// VNodeBuilder가 로딩 상태에 따라 다른 VNode 생성
if (model.isLoading) {
  // 로딩 VNode
} else {
  // 데이터 VNode
}

// 데이터 로드되면
model.isLoading = false;
model.data = userData;
renderer.render(container, model); // 다시 렌더링
```

**장점**:
- ✅ 가장 간단함
- ✅ 기존 시스템과 완벽히 호환
- ✅ Suspense 불필요

---

### 결론: Suspense는 필요 없음

**이유**:
1. **복잡함**: Promise throw/catch 패턴이 직관적이지 않음
2. **대안 존재**: 더 간단한 방법으로 같은 효과 가능
3. **현재 시스템**: 이미 Model 기반으로 동작하므로 로딩 상태를 Model에 포함하면 됨

**권장 방법**:
- ✅ **Model에 로딩 상태 포함** (가장 간단)
- ✅ **VNodeBuilder에서 로딩 상태 처리** (유연함)
- ❌ **Suspense 사용 안 함** (복잡하고 불필요)

---

## 4. 실제 적용 시나리오

### 시나리오 1: 큰 문서 편집기

**현재 문제**:
```
사용자가 문서를 편집
→ 1000개 노드 reconcile (100ms)
→ 브라우저 멈춤
→ 타이핑이 끊김
```

**Fiber 적용 후**:
```
사용자가 문서를 편집
→ 1000개 노드를 20개씩 나눠서 처리
→ 5ms 처리 → yield → 사용자 입력 처리
→ 타이핑이 부드럽게 동작
```

---

### 시나리오 2: 빠른 연속 업데이트

**현재 문제**:
```
사용자가 빠르게 타이핑
→ 'a' 입력 → reconcile
→ 'b' 입력 → reconcile
→ 'c' 입력 → reconcile
→ 깜빡임 발생
```

**Batching 적용 후**:
```
사용자가 빠르게 타이핑
→ 'a', 'b', 'c' 입력 → 모두 큐에 추가
→ 다음 프레임에서 한 번에 reconcile
→ 깜빡임 없음
```

---

### 시나리오 3: 비동기 데이터 로딩

**현재 문제**:
```
컴포넌트가 API 데이터 필요
→ 데이터 로딩 중 아무것도 안 보임
→ 사용자가 혼란스러움
```

**Suspense 적용 후**:
```
컴포넌트가 API 데이터 필요
→ 로딩 중 Spinner 표시
→ 데이터 로드되면 컴포넌트 표시
→ 사용자 경험 향상
```

---

## 5. 적용 우선순위

### 1순위: Batching (가장 쉽고 효과적)

**이유**:
- 구현이 비교적 간단
- 즉시 효과를 볼 수 있음
- 성능 향상이 명확함

**예상 효과**:
- 빠른 연속 업데이트에서 50-70% 성능 향상
- 깜빡임 제거

---

### 2순위: Fiber Architecture (복잡하지만 강력)

**이유**:
- 큰 트리에서 필수적
- 사용자 경험 향상
- 하지만 구현이 복잡함

**예상 효과**:
- 큰 트리(1000+ 노드)에서 반응성 유지
- 브라우저 멈춤 방지

---

### 3순위: Suspense (권장하지 않음)

**이유**:
- ❌ Promise throw/catch 패턴이 복잡하고 직관적이지 않음
- ✅ 더 간단한 대안 존재 (Model에 로딩 상태 포함)

**대안**:
- Model에 `isLoading` 상태 포함
- VNodeBuilder에서 로딩 상태에 따라 다른 VNode 생성
- Suspense 없이도 로딩 상태 표시 가능

---

## 6. 구현 복잡도 비교

| 기능 | 복잡도 | 예상 시간 | 효과 | 권장 |
|------|--------|----------|------|------|
| Batching | ⭐⭐ | 1-2일 | ⭐⭐⭐⭐⭐ | ✅ |
| Suspense | ⭐⭐⭐⭐⭐ | 3-5일 | ⭐⭐ | ❌ (대안 사용) |
| Fiber | ⭐⭐⭐⭐⭐ | 2-3주 | ⭐⭐⭐⭐⭐ | ⚠️ (나중에) |

---

## 7. 결론

### 현재 상태
- ✅ 기본적인 reconcile 동작
- ✅ React 스타일 매칭 전략
- ✅ 작은-중간 트리에서 충분히 빠름

### 개선이 필요한 경우

**Batching이 필요한 경우**:
- 빠른 연속 업데이트가 많은 경우
- 깜빡임이 문제가 되는 경우

**Fiber가 필요한 경우**:
- 500+ 노드의 큰 트리
- 실시간 업데이트가 많은 경우
- 사용자 입력이 중요한 경우

**비동기 데이터가 필요한 경우** (Suspense 대신):
- ✅ Model에 `isLoading` 상태 포함
- ✅ VNodeBuilder에서 로딩 상태 처리
- ❌ Suspense 사용 안 함 (복잡하고 불필요)

### 권장 사항

1. **현재는 Batching만 적용**하는 것을 권장
   - 구현이 간단하고 효과가 명확함
   - 대부분의 경우 충분함

2. **Fiber는 나중에 고려**
   - 큰 트리를 다룰 때 필요
   - 구현 복잡도가 높음

3. **Suspense는 사용하지 않음**
   - ❌ 복잡하고 직관적이지 않음
   - ✅ Model에 로딩 상태 포함하는 것이 더 간단함

---

## 참고 자료

- [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture)
- [React Batching](https://react.dev/learn/queueing-a-series-of-state-updates)
- [React Suspense](https://react.dev/reference/react/Suspense)

