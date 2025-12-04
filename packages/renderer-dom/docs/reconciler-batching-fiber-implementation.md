# Batching과 Fiber 구현 개념

## 개요

Batching과 Fiber를 우리 시스템에 어떻게 구현할 수 있는지 구체적인 개념과 코드 예시를 설명합니다.

---

## 1. Batching 구현

### 개념

**목적**: 여러 업데이트를 모아서 한 번에 처리하여 불필요한 reconcile을 줄임

**핵심 아이디어**:
1. 업데이트를 큐에 모음
2. 다음 프레임에서 배치로 처리
3. 마지막 업데이트만 사용 (이전 업데이트는 무시)

---

### 구현 방법

#### Step 1: UpdateQueue 클래스 생성

```typescript
// packages/renderer-dom/src/reconcile/batching.ts

interface PendingUpdate {
  container: HTMLElement;
  vnode: VNode;
  model: ModelData;
  decorators?: any[];
  runtime?: Record<string, any>;
}

export class UpdateQueue {
  private queue: PendingUpdate[] = [];
  private scheduled = false;
  private reconciler: Reconciler;
  
  constructor(reconciler: Reconciler) {
    this.reconciler = reconciler;
  }
  
  /**
   * 업데이트를 큐에 추가
   * 여러 번 호출되어도 다음 프레임에서 한 번만 처리
   */
  enqueue(update: PendingUpdate): void {
    // 같은 container의 이전 업데이트를 제거 (마지막 것만 유지)
    this.queue = this.queue.filter(u => u.container !== update.container);
    this.queue.push(update);
    
    // 아직 스케줄되지 않았으면 스케줄
    if (!this.scheduled) {
      this.scheduled = true;
      // 다음 프레임에서 배치 처리
      requestAnimationFrame(() => this.process());
    }
  }
  
  /**
   * 큐에 있는 모든 업데이트를 처리
   */
  private process(): void {
    this.scheduled = false;
    
    if (this.queue.length === 0) return;
    
    // 모든 업데이트를 처리
    const updates = [...this.queue];
    this.queue = [];
    
    for (const update of updates) {
      this.reconciler.reconcile(
        update.container,
        update.vnode,
        update.model,
        update.runtime,
        update.decorators
      );
    }
  }
  
  /**
   * 강제로 즉시 처리 (테스트용 또는 긴급한 경우)
   */
  flush(): void {
    if (this.scheduled) {
      // requestAnimationFrame 취소는 불가능하므로
      // process를 즉시 호출하고 scheduled 플래그를 false로
      this.scheduled = false;
    }
    this.process();
  }
}
```

---

#### Step 2: Reconciler에 Batching 통합

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts

export class Reconciler {
  private updateQueue: UpdateQueue;
  private batchingEnabled: boolean = true; // 기본값: 활성화
  
  constructor(
    private registry: RendererRegistry,
    private builder: VNodeBuilder,
    private dom: DOMOperations,
    private components: ComponentManager
  ) {
    // UpdateQueue 생성 (자기 자신을 전달)
    this.updateQueue = new UpdateQueue(this);
  }
  
  /**
   * Batching을 사용하여 reconcile
   * 여러 번 호출되어도 다음 프레임에서 한 번만 처리
   */
  reconcile(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // Batching이 활성화되어 있으면 큐에 추가
    if (this.batchingEnabled) {
      this.updateQueue.enqueue({
        container,
        vnode,
        model,
        decorators,
        runtime
      });
      return;
    }
    
    // Batching이 비활성화되어 있으면 즉시 처리
    this.reconcileImmediate(container, vnode, model, runtime, decorators);
  }
  
  /**
   * 즉시 reconcile (내부 메서드)
   * Batching을 사용하지 않고 바로 처리
   */
  private reconcileImmediate(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // 기존 reconcile 로직
    // ... (현재 reconcile 메서드의 내용)
  }
  
  /**
   * Batching 활성화/비활성화
   */
  setBatchingEnabled(enabled: boolean): void {
    this.batchingEnabled = enabled;
  }
  
  /**
   * 큐에 있는 업데이트를 강제로 즉시 처리
   */
  flush(): void {
    this.updateQueue.flush();
  }
}
```

---

#### Step 3: DOMRenderer에서 사용

```typescript
// packages/renderer-dom/src/dom-renderer.ts

export class DOMRenderer {
  // ...
  
  render(
    container: HTMLElement,
    model: ModelData,
    decorators: Decorator[] = [],
    runtime?: Record<string, any>
  ): void {
    // VNode 빌드
    const vnode = this.builder.build(model.stype, model, { decorators });
    
    // Reconciler의 reconcile 호출 (내부적으로 Batching 처리)
    this.reconciler.reconcile(container, vnode, model, runtime, decorators);
    // → 여러 번 호출되어도 다음 프레임에서 한 번만 처리됨
  }
  
  /**
   * 강제로 즉시 렌더링 (Batching 우회)
   */
  renderImmediate(
    container: HTMLElement,
    model: ModelData,
    decorators: Decorator[] = [],
    runtime?: Record<string, any>
  ): void {
    // Batching 비활성화
    this.reconciler.setBatchingEnabled(false);
    
    // 렌더링
    this.render(container, model, decorators, runtime);
    
    // Batching 다시 활성화
    this.reconciler.setBatchingEnabled(true);
  }
  
  /**
   * 큐에 있는 업데이트를 강제로 즉시 처리
   */
  flush(): void {
    this.reconciler.flush();
  }
}
```

---

### 사용 예시

```typescript
// 빠른 연속 업데이트
renderer.render(container, model1); // 큐에 추가
renderer.render(container, model2); // 큐에 추가 (model1 제거)
renderer.render(container, model3); // 큐에 추가 (model2 제거)
// → 다음 프레임에서 model3만 reconcile (1번)

// 강제로 즉시 처리
renderer.flush(); // 큐에 있는 모든 업데이트 즉시 처리
```

---

### 장단점

**장점**:
- ✅ 불필요한 reconcile 감소
- ✅ 깜빡임 제거
- ✅ 성능 향상

**단점**:
- ⚠️ 지연 시간 증가 (다음 프레임까지 대기)
- ⚠️ 복잡도 증가 (큐 관리)

---

## 2. Fiber Architecture 구현

### 개념

**목적**: 큰 트리를 작은 단위로 나눠서 처리하여 브라우저가 멈추지 않도록 함

**핵심 아이디어**:
1. VNode 트리를 Fiber 트리로 변환
2. 작업을 작은 단위로 분할
3. 브라우저가 다른 작업을 처리할 수 있도록 yield
4. 다음 프레임에서 계속 처리

---

### 구현 방법

#### Step 1: Fiber Node 구조

```typescript
// packages/renderer-dom/src/reconcile/fiber.ts

interface FiberNode {
  // VNode 정보
  vnode: VNode;
  prevVNode: VNode | undefined;
  
  // DOM 정보
  domElement: HTMLElement | null;
  parent: HTMLElement;
  
  // Fiber 트리 구조
  parent: FiberNode | null;      // 부모 Fiber
  child: FiberNode | null;         // 첫 번째 자식 Fiber
  sibling: FiberNode | null;       // 다음 형제 Fiber
  return: FiberNode | null;        // 작업 완료 후 돌아갈 Fiber (보통 parent와 같음)
  
  // 작업 상태
  effectTag: 'PLACEMENT' | 'UPDATE' | 'DELETION' | null;
  alternate: FiberNode | null;     // 이전 Fiber (diffing용)
  
  // 컨텍스트
  context: any;
}

/**
 * VNode 트리를 Fiber 트리로 변환
 */
function createFiberTree(
  parent: HTMLElement,
  vnode: VNode,
  prevVNode: VNode | undefined,
  context: any,
  returnFiber: FiberNode | null = null
): FiberNode {
  const fiber: FiberNode = {
    vnode,
    prevVNode,
    domElement: null,
    parent,
    parent: returnFiber,
    child: null,
    sibling: null,
    return: returnFiber,
    effectTag: null,
    alternate: null,
    context
  };
  
  // 자식 Fiber 생성
  if (vnode.children && vnode.children.length > 0) {
    let prevSibling: FiberNode | null = null;
    
    for (let i = 0; i < vnode.children.length; i++) {
      const child = vnode.children[i];
      
      if (typeof child === 'object' && child !== null) {
        const childFiber = createFiberTree(
          parent, // 실제 parent는 reconcile 후 결정
          child as VNode,
          prevVNode?.children?.[i] as VNode | undefined,
          context,
          fiber
        );
        
        if (i === 0) {
          fiber.child = childFiber;
        } else if (prevSibling) {
          prevSibling.sibling = childFiber;
        }
        
        prevSibling = childFiber;
      }
    }
  }
  
  return fiber;
}
```

---

#### Step 2: 작업 루프 (Work Loop)

```typescript
// packages/renderer-dom/src/reconcile/fiber-scheduler.ts

export class FiberScheduler {
  private workInProgress: FiberNode | null = null;
  private nextUnitOfWork: FiberNode | null = null;
  private reconciler: Reconciler;
  
  // 시간 제한 (5ms마다 yield)
  private timeSlice = 5; // milliseconds
  
  constructor(reconciler: Reconciler) {
    this.reconciler = reconciler;
  }
  
  /**
   * Fiber 작업 시작
   */
  scheduleWork(rootFiber: FiberNode): void {
    this.nextUnitOfWork = rootFiber;
    this.workLoop();
  }
  
  /**
   * 작업 루프
   * 작은 단위로 작업을 처리하고 yield
   */
  private workLoop(): void {
    const startTime = performance.now();
    
    while (this.nextUnitOfWork && this.shouldYield(startTime)) {
      // 단위 작업 수행
      this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
    }
    
    // 아직 작업이 남아있으면 다음 프레임에서 계속
    if (this.nextUnitOfWork) {
      requestIdleCallback(() => this.workLoop(), { timeout: 5 });
    } else {
      // 모든 작업 완료
      this.commitWork();
    }
  }
  
  /**
   * 시간 제한 체크
   */
  private shouldYield(startTime: number): boolean {
    return performance.now() - startTime < this.timeSlice;
  }
  
  /**
   * 단위 작업 수행
   * 하나의 Fiber를 reconcile하고 다음 Fiber 반환
   */
  private performUnitOfWork(fiber: FiberNode): FiberNode | null {
    // 1. 현재 Fiber reconcile
    this.reconcileFiber(fiber);
    
    // 2. 자식이 있으면 자식 반환 (다음 작업)
    if (fiber.child) {
      return fiber.child;
    }
    
    // 3. 형제가 있으면 형제 반환
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
  
  /**
   * Fiber reconcile
   */
  private reconcileFiber(fiber: FiberNode): void {
    // 기존 reconcileVNodeChildren 로직 사용
    // 하지만 DOM에 즉시 반영하지 않고 effectTag만 설정
    if (!fiber.domElement) {
      // 새로 생성해야 함
      fiber.effectTag = 'PLACEMENT';
    } else if (fiber.vnode !== fiber.prevVNode) {
      // 업데이트 필요
      fiber.effectTag = 'UPDATE';
    }
    
    // children은 나중에 처리 (performUnitOfWork에서)
  }
  
  /**
   * 모든 작업 완료 후 DOM에 반영
   */
  private commitWork(): void {
    // Fiber 트리를 순회하면서 effectTag에 따라 DOM 조작
    // 이 부분은 기존 reconcile 로직과 유사
  }
}
```

---

#### Step 3: Reconciler에 Fiber 통합

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts

export class Reconciler {
  private fiberScheduler: FiberScheduler | null = null;
  private fiberEnabled: boolean = false;
  
  constructor(...) {
    // Fiber는 선택적이므로 기본값은 false
  }
  
  /**
   * Fiber를 사용하여 reconcile
   */
  reconcile(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    if (this.fiberEnabled) {
      this.reconcileWithFiber(container, vnode, model, runtime, decorators);
    } else {
      this.reconcileImmediate(container, vnode, model, runtime, decorators);
    }
  }
  
  /**
   * Fiber를 사용한 reconcile
   */
  private reconcileWithFiber(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // 1. Fiber 트리 생성
    const context = this.buildContext(runtime, decorators);
    const rootFiber = createFiberTree(container, vnode, undefined, context);
    
    // 2. Fiber Scheduler로 작업 시작
    if (!this.fiberScheduler) {
      this.fiberScheduler = new FiberScheduler(this);
    }
    
    this.fiberScheduler.scheduleWork(rootFiber);
  }
  
  /**
   * Fiber 활성화/비활성화
   */
  setFiberEnabled(enabled: boolean): void {
    this.fiberEnabled = enabled;
  }
}
```

---

### Fiber 동작 흐름

```
1. reconcile 호출
   ↓
2. VNode 트리를 Fiber 트리로 변환
   ↓
3. Fiber Scheduler가 작업 시작
   ↓
4. workLoop 시작
   ↓
5. performUnitOfWork (5ms 동안)
   - Fiber 1 reconcile
   - Fiber 2 reconcile
   - ...
   - 5ms 경과 → yield
   ↓
6. 브라우저가 다른 작업 처리 (사용자 입력, 애니메이션)
   ↓
7. 다음 프레임에서 workLoop 계속
   ↓
8. 모든 Fiber 처리 완료
   ↓
9. commitWork (DOM에 반영)
```

---

### 장단점

**장점**:
- ✅ 큰 트리에서도 브라우저가 멈추지 않음
- ✅ 사용자 입력이 즉시 반응
- ✅ 애니메이션이 부드럽게 동작

**단점**:
- ⚠️ 복잡도 증가 (Fiber 트리 관리)
- ⚠️ 오버헤드 발생 (작은 트리에서는 오히려 느릴 수 있음)
- ⚠️ 구현 난이도 높음

---

## 3. Batching + Fiber 조합

### 개념

Batching과 Fiber를 함께 사용하면:
1. 여러 업데이트를 배치로 모음 (Batching)
2. 배치된 업데이트를 작은 단위로 처리 (Fiber)

---

### 구현 예시

```typescript
// UpdateQueue에서 Fiber 사용
class UpdateQueue {
  process(): void {
    const updates = [...this.queue];
    this.queue = [];
    
    // 마지막 업데이트만 사용
    const lastUpdate = updates[updates.length - 1];
    
    // Fiber를 사용하여 처리
    if (this.reconciler.isFiberEnabled()) {
      this.reconciler.reconcileWithFiber(
        lastUpdate.container,
        lastUpdate.vnode,
        lastUpdate.model,
        lastUpdate.runtime,
        lastUpdate.decorators
      );
    } else {
      this.reconciler.reconcileImmediate(...);
    }
  }
}
```

---

## 4. 실제 적용 전략

### Phase 1: Batching만 적용 (1-2일)

**이유**:
- 구현이 간단함
- 즉시 효과를 볼 수 있음
- 대부분의 경우 충분함

**구현**:
1. `UpdateQueue` 클래스 생성
2. `Reconciler`에 Batching 통합
3. `DOMRenderer`에서 사용

---

### Phase 2: Fiber 적용 (나중에, 필요할 때)

**조건**:
- 500+ 노드의 큰 트리를 다룰 때
- 사용자 입력이 중요한 경우
- 성능 문제가 발생할 때

**구현**:
1. `FiberNode` 인터페이스 정의
2. `FiberScheduler` 클래스 생성
3. `Reconciler`에 Fiber 통합
4. 선택적으로 활성화/비활성화 가능

---

## 5. 코드 구조

```
packages/renderer-dom/src/reconcile/
├── reconciler.ts          # 기존 (Batching/Fiber 통합)
├── batching.ts            # 새로 추가 (UpdateQueue)
├── fiber.ts               # 새로 추가 (FiberNode, createFiberTree)
└── fiber-scheduler.ts     # 새로 추가 (FiberScheduler)
```

---

## 6. 사용 예시

### Batching만 사용

```typescript
const renderer = new DOMRenderer(registry);

// Batching 활성화 (기본값)
renderer.render(container, model1);
renderer.render(container, model2);
renderer.render(container, model3);
// → 다음 프레임에서 model3만 reconcile

// 강제로 즉시 처리
renderer.flush();
```

### Fiber만 사용

```typescript
const reconciler = new Reconciler(...);
reconciler.setFiberEnabled(true);

reconciler.reconcile(container, largeVNode, model);
// → 큰 트리를 작은 단위로 나눠서 처리
```

### Batching + Fiber

```typescript
const renderer = new DOMRenderer(registry);
renderer.setFiberEnabled(true);

renderer.render(container, model1);
renderer.render(container, model2);
renderer.render(container, model3);
// → 다음 프레임에서 model3를 Fiber로 처리
```

---

## 7. 성능 비교

### 현재 (Batching/Fiber 없음)

```
1000개 노드 reconcile: 100ms
→ 브라우저 멈춤
→ 사용자 입력 지연
```

### Batching만 적용

```
1000개 노드 reconcile: 100ms
→ 하지만 여러 업데이트를 하나로 합침
→ 깜빡임 제거
```

### Fiber만 적용

```
1000개 노드를 20개씩 나눠서 처리: 5ms × 50 = 100ms
→ 브라우저가 멈추지 않음
→ 사용자 입력 즉시 반응
```

### Batching + Fiber

```
여러 업데이트를 배치로 모음
→ 큰 트리를 작은 단위로 처리
→ 최적의 성능
```

---

## 8. 결론

### Batching
- **구현**: 간단 (1-2일)
- **효과**: 명확함 (50-70% 성능 향상)
- **권장**: 즉시 적용

### Fiber
- **구현**: 복잡 (2-3주)
- **효과**: 큰 트리에서 필수
- **권장**: 나중에 필요할 때

### 조합
- **Batching + Fiber**: 최적의 성능
- **단계적 적용**: 먼저 Batching, 나중에 Fiber

