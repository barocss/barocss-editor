# Batching and Fiber Implementation Concepts

## Overview

This document explains how we can implement Batching and Fiber in our system with concrete concepts and code examples.

---

## 1. Batching Implementation

### Concept

**Goal**: Collect multiple updates and process them at once to reduce unnecessary reconciliation.

**Key ideas**:
1. Gather updates into a queue
2. Process as a batch on the next frame
3. Use only the latest update (drop earlier ones)

---

### Implementation Approach

#### Step 1: Create UpdateQueue class

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
   * Enqueue an update
   * Even if called multiple times, process only once in next frame
   */
  enqueue(update: PendingUpdate): void {
    // Remove previous updates for same container (keep the latest)
    this.queue = this.queue.filter(u => u.container !== update.container);
    this.queue.push(update);
    
    // Schedule if not scheduled yet
    if (!this.scheduled) {
      this.scheduled = true;
      // Batch process in next frame
      requestAnimationFrame(() => this.process());
    }
  }
  
  /**
   * Process all updates in the queue
   */
  private process(): void {
    this.scheduled = false;
    
    if (this.queue.length === 0) return;
    
    // Process all updates
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
   * Force immediate processing (for tests or urgent cases)
   */
  flush(): void {
    if (this.scheduled) {
      // Cannot cancel requestAnimationFrame
      // Call process immediately and reset scheduled flag
      this.scheduled = false;
    }
    this.process();
  }
}
```

---

#### Step 2: Integrate Batching into Reconciler

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts

export class Reconciler {
  private updateQueue: UpdateQueue;
  private batchingEnabled: boolean = true; // default: enabled
  
  constructor(
    private registry: RendererRegistry,
    private builder: VNodeBuilder,
    private dom: DOMOperations,
    private components: ComponentManager
  ) {
    // Create UpdateQueue (pass self)
    this.updateQueue = new UpdateQueue(this);
  }
  
  /**
   * Reconcile using batching
   * Even if called multiple times, process once next frame
   */
  reconcile(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // If batching enabled, enqueue
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
    
    // If batching disabled, process immediately
    this.reconcileImmediate(container, vnode, model, runtime, decorators);
  }
  
  /**
   * Immediate reconcile (internal)
   * Process without batching
   */
  private reconcileImmediate(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // Existing reconcile logic
    // ... (current reconcile content)
  }
  
  /**
   * Enable/disable batching
   */
  setBatchingEnabled(enabled: boolean): void {
    this.batchingEnabled = enabled;
  }
  
  /**
   * Force process queued updates immediately
   */
  flush(): void {
    this.updateQueue.flush();
  }
}
```

---

#### Step 3: Use from DOMRenderer

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
    // Build VNode
    const vnode = this.builder.build(model.stype, model, { decorators });
    
    // Call reconciler.reconcile (handles batching internally)
    this.reconciler.reconcile(container, vnode, model, runtime, decorators);
    // → Even if called multiple times, processed once next frame
  }
  
  /**
   * Force immediate render (bypass batching)
   */
  renderImmediate(
    container: HTMLElement,
    model: ModelData,
    decorators: Decorator[] = [],
    runtime?: Record<string, any>
  ): void {
    // Disable batching
    this.reconciler.setBatchingEnabled(false);
    
    // Render
    this.render(container, model, decorators, runtime);
    
    // Re-enable batching
    this.reconciler.setBatchingEnabled(true);
  }
  
  /**
   * Force immediate processing of queued updates
   */
  flush(): void {
    this.reconciler.flush();
  }
}
```

---

### Usage

```typescript
// Rapid consecutive updates
renderer.render(container, model1); // enqueue
renderer.render(container, model2); // enqueue (drops model1)
renderer.render(container, model3); // enqueue (drops model2)
// → Next frame reconciles only model3 (once)

// Force immediate processing
renderer.flush(); // process all queued updates immediately
```

---

### Pros / Cons

**Pros**:
- ✅ Reduce unnecessary reconcile
- ✅ Remove flicker
- ✅ Improve performance

**Cons**:
- ⚠️ Adds latency (wait until next frame)
- ⚠️ Adds complexity (queue management)

---

## 2. Fiber Architecture Implementation

### Concept

**Goal**: Split large trees into small units so the browser doesn’t freeze.

**Key ideas**:
1. Convert VNode tree to Fiber tree
2. Break work into small units
3. Yield to let browser handle other tasks
4. Continue next frame

---

### Implementation Details

#### Step 1: Fiber Node structure

```typescript
// packages/renderer-dom/src/reconcile/fiber.ts

interface FiberNode {
  // VNode info
  vnode: VNode;
  prevVNode: VNode | undefined;
  
  // DOM info
  domElement: HTMLElement | null;
  parent: HTMLElement;
  
  // Fiber tree structure
  parent: FiberNode | null;      // parent fiber
  child: FiberNode | null;         // first child fiber
  sibling: FiberNode | null;       // next sibling fiber
  return: FiberNode | null;        // fiber to return to after work (usually parent)
  
  // Work state
  effectTag: 'PLACEMENT' | 'UPDATE' | 'DELETION' | null;
  alternate: FiberNode | null;     // previous fiber (for diffing)
  
  // Context
  context: any;
}

/**
 * Convert VNode tree to Fiber tree
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
  
  // Create child fibers
  if (vnode.children && vnode.children.length > 0) {
    let prevSibling: FiberNode | null = null;
    
    for (let i = 0; i < vnode.children.length; i++) {
      const child = vnode.children[i];
      
      if (typeof child === 'object' && child !== null) {
        const childFiber = createFiberTree(
          parent, // actual parent decided after reconcile
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

#### Step 2: Work Loop

```typescript
// packages/renderer-dom/src/reconcile/fiber-scheduler.ts

export class FiberScheduler {
  private workInProgress: FiberNode | null = null;
  private nextUnitOfWork: FiberNode | null = null;
  private reconciler: Reconciler;
  
  // Time slice (yield every ~5ms)
  private timeSlice = 5; // milliseconds
  
  constructor(reconciler: Reconciler) {
    this.reconciler = reconciler;
  }
  
  /**
   * Start fiber work
   */
  scheduleWork(rootFiber: FiberNode): void {
    this.nextUnitOfWork = rootFiber;
    this.workLoop();
  }
  
  /**
   * Work loop
   * Process small units and yield
   */
  private workLoop(): void {
    const startTime = performance.now();
    
    while (this.nextUnitOfWork && this.shouldYield(startTime)) {
      // Do a unit of work
      this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
    }
    
    // If work remains, continue next frame
    if (this.nextUnitOfWork) {
      requestIdleCallback(() => this.workLoop(), { timeout: 5 });
    } else {
      // All work done
      this.commitWork();
    }
  }
  
  /**
   * Check time slice
   */
  private shouldYield(startTime: number): boolean {
    return performance.now() - startTime < this.timeSlice;
  }
  
  /**
   * Perform one unit of work
   * Reconcile one Fiber and return the next Fiber
   */
  private performUnitOfWork(fiber: FiberNode): FiberNode | null {
    // 1. Reconcile current Fiber
    this.reconcileFiber(fiber);
    
    // 2. If child exists, go child (next work)
    if (fiber.child) {
      return fiber.child;
    }
    
    // 3. If sibling exists, go sibling
    if (fiber.sibling) {
      return fiber.sibling;
    }
    
    // 4. Walk up to parent to find sibling
    let nextFiber = fiber.return;
    while (nextFiber) {
      if (nextFiber.sibling) {
        return nextFiber.sibling;
      }
      nextFiber = nextFiber.return;
    }
    
    return null; // done
  }
  
  /**
   * Fiber reconcile
   */
  private reconcileFiber(fiber: FiberNode): void {
    // Use existing reconcileVNodeChildren logic
    // But do not commit to DOM immediately; only set effectTag
    if (!fiber.domElement) {
      // Needs creation
      fiber.effectTag = 'PLACEMENT';
    } else if (fiber.vnode !== fiber.prevVNode) {
      // Needs update
      fiber.effectTag = 'UPDATE';
    }
    
    // Children handled later in performUnitOfWork
  }
  
  /**
   * Apply to DOM after all work completes
   */
  private commitWork(): void {
    // Traverse Fiber tree and manipulate DOM by effectTag
    // Similar to existing reconcile logic
  }
}
```

---

#### Step 3: Integrate Fiber into Reconciler

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts

export class Reconciler {
  private fiberScheduler: FiberScheduler | null = null;
  private fiberEnabled: boolean = false;
  
  constructor(...) {
    // Fiber is optional; default false
  }
  
  /**
   * Reconcile using Fiber
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
   * Reconcile with Fiber
   */
  private reconcileWithFiber(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[]
  ): void {
    // 1. Create Fiber tree
    const context = this.buildContext(runtime, decorators);
    const rootFiber = createFiberTree(container, vnode, undefined, context);
    
    // 2. Start work via Fiber Scheduler
    if (!this.fiberScheduler) {
      this.fiberScheduler = new FiberScheduler(this);
    }
    
    this.fiberScheduler.scheduleWork(rootFiber);
  }
  
  /**
   * Enable/disable Fiber
   */
  setFiberEnabled(enabled: boolean): void {
    this.fiberEnabled = enabled;
  }
}
```

---

### Fiber Flow

```
1. Call reconcile
   ↓
2. Convert VNode tree to Fiber tree
   ↓
3. Fiber Scheduler starts work
   ↓
4. Start workLoop
   ↓
5. performUnitOfWork (for ~5ms)
   - Fiber 1 reconcile
   - Fiber 2 reconcile
   - ...
   - After 5ms → yield
   ↓
6. Browser handles other tasks (user input, animations)
   ↓
7. Continue workLoop next frame
   ↓
8. Finish all Fibers
   ↓
9. commitWork (apply to DOM)
```

---

### Pros / Cons

**Pros**:
- ✅ Browser doesn’t freeze on large trees
- ✅ User input stays responsive
- ✅ Animations remain smooth

**Cons**:
- ⚠️ Increased complexity (Fiber tree management)
- ⚠️ Overhead (may be slower on small trees)
- ⚠️ Higher implementation difficulty

---

## 3. Batching + Fiber Combination

### Concept

Using Batching and Fiber together:
1. Batch multiple updates (Batching)
2. Process the batched update in small units (Fiber)

---

### Implementation example

```typescript
// Use Fiber inside UpdateQueue
class UpdateQueue {
  process(): void {
    const updates = [...this.queue];
    this.queue = [];
    
    // Use only the last update
    const lastUpdate = updates[updates.length - 1];
    
    // Process with Fiber
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

## 4. Practical Rollout Strategy

### Phase 1: Apply Batching only (1-2 days)

**Why**:
- Simple to implement
- Immediate benefit
- Enough for most cases

**Steps**:
1. Create `UpdateQueue`
2. Integrate Batching into `Reconciler`
3. Use from `DOMRenderer`

---

### Phase 2: Apply Fiber (later, when needed)

**When**:
- Handling large trees (500+ nodes)
+- User input is critical
+- Performance issues occur

**Steps**:
1. Define `FiberNode` interface
2. Create `FiberScheduler` class
3. Integrate Fiber into `Reconciler`
4. Allow optional enable/disable

---

## 5. Code Structure

```
packages/renderer-dom/src/reconcile/
├── reconciler.ts          # existing (Batching/Fiber integrated)
├── batching.ts            # newly added (UpdateQueue)
├── fiber.ts               # newly added (FiberNode, createFiberTree)
└── fiber-scheduler.ts     # newly added (FiberScheduler)
```

---

## 6. Usage Examples

### Batching only

```typescript
const renderer = new DOMRenderer(registry);

// Batching enabled (default)
renderer.render(container, model1);
renderer.render(container, model2);
renderer.render(container, model3);
// → Next frame reconciles only model3

// Force immediate processing
renderer.flush();
```

### Fiber only

```typescript
const reconciler = new Reconciler(...);
reconciler.setFiberEnabled(true);

reconciler.reconcile(container, largeVNode, model);
// → Processes large tree in small units
```

### Batching + Fiber

```typescript
const renderer = new DOMRenderer(registry);
renderer.setFiberEnabled(true);

renderer.render(container, model1);
renderer.render(container, model2);
renderer.render(container, model3);
// → Next frame processes model3 with Fiber
```

---

## 7. Performance Comparison

### Current (no Batching/Fiber)

```
Reconcile 1000 nodes: 100ms  
→ Browser freeze  
→ User input lag
```

### Batching only

```
Reconcile 1000 nodes: 100ms  
→ But multiple updates merged into one  
→ Removes flicker
```

### Fiber only

```
Process 1000 nodes in chunks of 20: 5ms × 50 = 100ms
→ Browser doesn’t freeze
→ User input responds immediately
```

### Batching + Fiber

```
Batch multiple updates
→ Process large tree in small units
→ Optimal performance
```

---

## 8. Conclusion

### Batching
- **Implementation**: simple (1-2 days)
- **Impact**: clear (50-70% perf gain)
- **Recommendation**: apply immediately

### Fiber
- **Implementation**: complex (2-3 weeks)
- **Impact**: essential for large trees
- **Recommendation**: add later when needed

### Combined
- **Batching + Fiber**: optimal performance
- **Phased rollout**: Batching first, Fiber later

