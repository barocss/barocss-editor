# Reconciler.ts Fiber Application Review and Improvement Plan

## Current Structure Analysis

### 1. reconcile Method Structure

```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // 1. rootVNode find/promote (sync)
  // 2. host find/create (sync)
  // 3. attrs/style update (sync)
  // 4. Fiber reconcile call (async)
  // 5. model.text processing (sync, after Fiber reconcile)
  // 6. Portal cleanup (sync)
}
```

**Issues**:
- rootVNode processing, host creation/update executed synchronously before Fiber reconcile
- model.text processing executed after Fiber reconcile, order may be wrong
- Not properly utilizing Fiber benefits (processing in small units)

### 2. reconcileVNodesToDOM Method Structure

```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  for (const vnode of newVNodes) {
    // 1. host find/create (sync)
    // 2. attrs/style update (sync)
    // 3. Fiber reconcile call (async)
    // 4. model.text processing (sync, after Fiber reconcile)
  }
  // 5. reorder (sync)
  // 6. stale removal (sync)
}
```

**Issues**:
- Host find/create, attrs/style update executed synchronously before Fiber reconcile for each VNode
- reorder and stale removal executed without waiting for Fiber reconcile completion
- Not considering Fiber's async nature

### 3. Fiber Scheduler Structure

```typescript
workLoop() {
  while (hasWork && !shouldYield()) {
    performUnitOfWork(fiber);
    // DOM manipulation performed directly in reconcileFiberNode
  }
  if (hasWork) {
    requestIdleCallback(workLoop);
  } else {
    commitWork(); // Empty function
  }
}
```

**Issues**:
- Doesn't distinguish React Fiber's two phases (render phase, commit phase)
- Currently performs DOM manipulation directly in render phase
- commitWork is empty function, no commit phase

### 4. reconcileFiberNode Structure

```typescript
reconcileFiberNode(fiber, deps, context) {
  // 1. Portal processing
  // 2. host find/create
  // 3. attrs/style update
  // 4. vnode.text processing
  // 5. primitive text children processing
  // 6. Child Fibers processed by Scheduler
}
```

**Issues**:
- Primitive text processing is complex and executed before VNode children processed by Fiber
- Order issue: VNode children may not be added to DOM yet when processing primitive text

---

## Comparison with React Fiber Principles

### React Fiber Core Principles

1. **Two-Phase Processing (Render Phase + Commit Phase)**
   - Render Phase: Calculate changes (no DOM manipulation)
   - Commit Phase: Perform DOM manipulation (all at once)

2. **Process in Small Units**
   - Process each Fiber node individually
   - Work only within time limit (time slice)
   - Yield so browser can process other work

3. **Priority-Based Scheduling**
   - Process high priority work first
   - Process low priority work later

4. **Interruptible Work**
   - Can interrupt work and resume later
   - Can discard previous work results and start fresh

### Differences from Our Implementation

| React Fiber | Our Implementation | Issues |
|------------|----------|--------|
| Render Phase (calculate changes) | DOM manipulation directly in reconcileFiberNode | DOM manipulation executed immediately, cannot interrupt |
| Commit Phase (DOM manipulation) | None | Cannot apply changes all at once |
| Priority-based scheduling | Exists (FiberPriority) | ✅ Implemented |
| Interruptible work | Partial | DOM manipulation executed immediately, cannot interrupt |

---

## Improvement Plans

### Plan 1: Introduce Two-Phase Processing (Recommended)

#### Render Phase (Calculate Changes)
```typescript
function reconcileFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  // Calculate changes only, no DOM manipulation
  // Set effectTag: 'PLACEMENT', 'UPDATE', 'DELETION'
  
  // 1. Portal processing (calculation only)
  // 2. Calculate if host find/create needed
  // 3. Calculate attrs/style changes
  // 4. Calculate vnode.text changes
  // 5. Calculate primitive text changes
  // 6. Process child Fibers (recursive)
}
```

#### Commit Phase (DOM Manipulation)
```typescript
function commitFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies): void {
  // Perform DOM manipulation according to effectTag
  
  switch (fiber.effectTag) {
    case 'PLACEMENT':
      // Create and add DOM element
      break;
    case 'UPDATE':
      // Update DOM element
      break;
    case 'DELETION':
      // Remove DOM element
      break;
  }
  
  // Commit child Fibers (recursive)
  commitFiberNode(fiber.child, deps);
  commitFiberNode(fiber.sibling, deps);
}
```

**Advantages**:
- ✅ Can interrupt and resume work
- ✅ Can apply changes all at once
- ✅ Matches React Fiber principles

**Disadvantages**:
- ⚠️ Complex implementation
- ⚠️ Requires major code modifications

### Plan 2: Maintain Current Structure + Improve Order (Simple)

#### Improve reconcile Method
```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // Move rootVNode processing to Fiber too
  // Move model.text processing to Fiber too
  
  const rootFiber = createFiberTree(container, vnode, prevVNode, context);
  // Include model.text information in rootFiber
  
  reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps);
  
  // Portal cleanup executed after Fiber completes (need waitForFiber)
}
```

#### Improve reconcileVNodesToDOM
```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  // Process each VNode with Fiber
  // Execute reorder and stale removal after Fiber completes (need waitForFiber)
  
  for (const vnode of newVNodes) {
    reconcileWithFiber(host, vnode, prevVNode, reconcileContext, fiberDeps);
  }
  
  // Wait for Fiber completion
  await waitForFiber();
  
  // reorder and stale removal
  reorder(parent, nextHosts);
  removeStale(parent, nextHosts);
}
```

**Advantages**:
- ✅ Minimal code modifications
- ✅ Simple implementation

**Disadvantages**:
- ⚠️ DOM manipulation still executed immediately
- ⚠️ Work cannot be interrupted

### Plan 3: Hybrid Approach (Realistic)

#### Keep Root Level Sync Processing
```typescript
reconcile(container, vnode, model, runtime, decorators) {
  // Root level host find/create sync processing (required)
  // Only children reconcile processed with Fiber
}
```

#### Process Children Level with Fiber
```typescript
reconcileVNodesToDOM(parent, newVNodes, sidToModel, context) {
  // Only children reconcile processed with Fiber for each VNode
  // host find/create, attrs/style update sync processing
}
```

**Advantages**:
- ✅ Maintains compatibility with existing code
- ✅ Only children reconcile utilizes Fiber benefits

**Disadvantages**:
- ⚠️ Not complete Fiber architecture

---

## Recommended Improvements

### Immediately Improvable Items

1. **Improve model.text Processing Order**
   - Current: model.text processing after Fiber reconcile
   - Improvement: Process inside Fiber reconcile or after Fiber completes

2. **Improve reorder and Stale Removal Order**
   - Current: Executed without waiting for Fiber reconcile completion
   - Improvement: Execute after Fiber completes (use waitForFiber)

3. **Improve Primitive Text Processing**
   - Current: Complex position calculation logic
   - Improvement: Process primitive text after VNode children processed by Fiber

### Long-term Improvement Items

1. **Introduce Two-Phase Processing**
   - Separate Render Phase and Commit Phase
   - Implement interruptible work

2. **Introduce Effect List**
   - Manage changes as list
   - Apply all at once in Commit Phase

3. **Strengthen Priority-Based Scheduling**
   - Currently only sets priority, actual scheduling insufficient
   - Improve to process high priority work first

---

## Specific Issues and Solutions

### Issue 1: model.text Processing Order

**Current Code**:
```typescript
// reconciler.ts:164-171
reconcileWithFiber(host, rootVNode, prevVNode, context, fiberDeps);

// model.text processing after Fiber reconcile
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  if (!rootVNode.children || rootVNode.children.length === 0) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**Issues**:
- Fiber reconcile executes asynchronously, but model.text processing executes synchronously
- model.text may be processed before Fiber reconcile completes
- model.text may overwrite while children being processed by Fiber

**Solutions**:
1. Move model.text processing inside Fiber reconcile
2. Or process after Fiber completes (use waitForFiber)

### Issue 2: reorder and Stale Removal Order

**Current Code**:
```typescript
// reconciler.ts:390-402
for (const vnode of newVNodes) {
  reconcileWithFiber(host, vnode, prevVNode, reconcileContext, fiberDeps);
  // Fiber reconcile executes asynchronously
}

// Execute immediately without waiting for Fiber completion
reorder(parent, nextHosts);
// stale removal also executes immediately
for (const el of existingHosts) {
  if (!keepSet.has(el)) {
    parent.removeChild(el);
  }
}
```

**Issues**:
- reorder and stale removal executed before Fiber reconcile completes
- May change order or remove elements when DOM not yet updated

**Solutions**:
- Execute reorder and stale removal after Fiber completes
- Use waitForFiber or add completion callback to FiberScheduler

### Issue 3: Primitive Text Processing Order

**Current Code**:
```typescript
// fiber-reconciler.ts:196-266
for (let i = 0; i < vnode.children.length; i++) {
  const child = vnode.children[i];
  
  if (typeof child === 'string' || typeof child === 'number') {
    // primitive text processing
    // VNode children may not be processed by Fiber yet
  }
}
```

**Issues**:
- VNode children may not be added to DOM yet when processing primitive text
- elementCount calculation may be inaccurate

**Solutions**:
- Process primitive text after VNode children processed by Fiber
- Or process primitive text with Fiber too (create Text Fiber node)

### Issue 4: rootVNode Processing and Host Creation

**Current Code**:
```typescript
// reconciler.ts:40-84
// rootVNode find/promote (sync)
let rootVNode = vnode;
if ((!rootVNode.tag || ...)) {
  const firstEl = findFirstElementVNode(rootVNode);
  if (firstEl) {
    rootVNode = { ...(firstEl as any) } as VNode;
  }
}

// host find/create (sync)
let host: HTMLElement | null = null;
if (sid) {
  host = Array.from(container.children).find(...);
}
if (!host) {
  host = this.dom.createSimpleElement(tag, container);
  container.appendChild(host);
}

// attrs/style update (sync)
if (rootVNode.attrs) {
  this.dom.updateAttributes(host, prevVNode?.attrs, rootVNode.attrs);
}

// Then call Fiber reconcile
reconcileWithFiber(host, rootVNode, prevVNode, context, fiberDeps);
```

**Issues**:
- rootVNode processing, host creation, attrs/style update all executed synchronously
- Not utilizing Fiber benefits (processing in small units)

**Solutions**:
- Process rootVNode with Fiber too
- Or keep root level sync processing (required)

---

## Conclusion

Current implementation **has Fiber's basic structure but doesn't fully implement React Fiber's core principles (two-phase processing, interruptible work)**.

### Immediately Improvable Items (High Priority)

1. ✅ **Improve reorder and Stale Removal Order**
   - Modify to execute after Fiber completes
   - Use waitForFiber or add completion callback

2. ✅ **Improve model.text Processing Order**
   - Move inside Fiber reconcile or process after completion

3. ✅ **Improve Primitive Text Processing Order**
   - Process primitive text after VNode children processing

### Long-term Improvement Items (Low Priority)

1. **Introduce Two-Phase Processing**
   - Separate Render Phase and Commit Phase
   - Implement interruptible work

2. **Introduce Effect List**
   - Manage changes as list
   - Apply all at once in Commit Phase

3. **Move rootVNode Processing to Fiber Too**
   - Currently sync processing, but can move to Fiber

**Recommendation**: Process immediately improvable items first, and consider introducing two-phase processing in the long term.
