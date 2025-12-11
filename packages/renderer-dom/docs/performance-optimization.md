# Performance Optimization: Reduce Full Rebuild on setState

## Current State

### Problem
When `context.setState()` is called:
1. `changeState` event fires
2. `DOMRenderer.render()` runs
3. **Entire VNode tree is rebuilt from root**
4. Fiber reconciler updates only the changed DOM

**Performance issue:**
- VNode build itself is full rebuild (expensive)
- In large apps, changing one component triggers full rebuild
- Needs memo/skip capabilities to avoid redundant builds

### Existing optimizations
- ✅ **Fiber reconciler**: DOM updates are efficient (changed parts only)
- ✅ **Batch updates**: `queueMicrotask` batches multiple `setState` calls
- ✅ **Component instance reuse**: `sid`-based instance retention

## Optimization Options

### Option 1: Component memoization (memo pattern) ⭐ Recommended

**Concept:**
- If `props`, `model`, `state` unchanged, skip VNode rebuild
- Reuse previous VNode to save build cost

**Implementation:**
```typescript
class VNodeBuilder {
  private componentMemoCache: Map<string, {
    vnode: VNode;
    props: any;
    model: any;
    state: any;
    timestamp: number;
  }> = new Map();

  private _buildComponent(...): VNode {
    const componentId = this.generateComponentId(vnode);
    const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);
    const currentState = existingInstance?.state || {};

    const memoKey = `${componentId}:${JSON.stringify(props)}:${JSON.stringify(model)}:${JSON.stringify(currentState)}`;
    const cached = this.componentMemoCache.get(memoKey);

    if (cached && this._shouldUseMemo(cached, props, model, currentState)) {
      return this._cloneVNode(cached.vnode);
    }

    const vnode = this._buildComponentInternal(...);

    this.componentMemoCache.set(memoKey, {
      vnode,
      props: { ...props },
      model: { ...model },
      state: { ...currentState },
      timestamp: Date.now()
    });

    return vnode;
  }

  private _shouldUseMemo(
    cached: any,
    props: any,
    model: any,
    state: any
  ): boolean {
    return (
      shallowEqual(cached.props, props) &&
      shallowEqual(cached.model, model) &&
      shallowEqual(cached.state, state)
    );
  }
}
```

**Pros:**
- ✅ Greatly reduces build cost (unchanged components skipped)
- ✅ Familiar memo pattern for developers
- ✅ Compatible with current structure (incremental adoption)

**Cons:**
- ⚠️ More memory (cache storage)
- ⚠️ Shallow compare limits (deep object changes missed)

**Improvements:**
- Use WeakMap to avoid leaks
- Optional deep-compare for special cases

---

### Option 2: Partial rebuild (Sub-tree)

**Concept:**
- Rebuild only changed components and descendants
- Reuse previous VNodes for others

**Implementation:**
```typescript
class VNodeBuilder {
  private _buildWithPartialRebuild(
    rootVNode: VNode,
    changedComponentIds: Set<string>
  ): VNode {
    return this._rebuildSubtree(rootVNode, changedComponentIds);
  }
  
  private _rebuildSubtree(
    vnode: VNode,
    changedIds: Set<string>
  ): VNode {
    const componentId = this.generateComponentId(vnode);
    if (!changedIds.has(componentId)) {
      return vnode;
    }
    const newVNode = this._buildComponent(...);
    if (Array.isArray(newVNode.children)) {
      newVNode.children = newVNode.children.map(child =>
        this._rebuildSubtree(child, changedIds)
      );
    }
    return newVNode;
  }
}
```

**Pros:**
- ✅ Minimal build scope
- ✅ Faster (only changed parts)

**Cons:**
- ⚠️ Consistency risk: hard to keep full model in sync
- ⚠️ Higher complexity (partial update boundaries)
- ⚠️ Bug risk (state divergence)

**Conclusion:** Conflicts with “full build” principle; **not recommended**.

---

### Option 3: Lazy Evaluation

**Concept:**
- Defer VNode build to needed parts only
- Build only visible parts first

**Implementation:**
```typescript
class VNodeBuilder {
  private _buildLazy(vnode: VNode, depth: number = 0): VNode {
    if (depth > MAX_DEPTH) {
      return this._createLazyVNode(vnode);
    }
    return this._buildComponent(...);
  }
  
  private _createLazyVNode(vnode: VNode): VNode {
    return {
      ...vnode,
      _lazy: true,
      _buildFn: () => this._buildComponent(...)
    };
  }
}
```

**Pros:**
- ✅ Faster initial render
- ✅ Lower memory

**Cons:**
- ⚠️ More complexity
- ⚠️ Extra build on scroll/interaction
- ⚠️ Not aligned with editor needs

**Conclusion:** Not suitable; **not recommended**.

---

### Option 4: Props comparison (current-structure improvement)

**Concept:**
- Compare props/model/state before building component
- Skip template execution if unchanged

**Implementation:**
```typescript
class VNodeBuilder {
  private _buildComponent(...): VNode {
    const componentId = this.generateComponentId(vnode);
    const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);

    const prevProps = existingInstance?.props || {};
    const prevModel = existingInstance?.model || {};
    const prevState = existingInstance?.state || {};

    const propsChanged = !shallowEqual(prevProps, props);
    const modelChanged = !shallowEqual(prevModel, model);
    const stateChanged = !shallowEqual(prevState, currentState);

    if (!propsChanged && !modelChanged && !stateChanged) {
      return existingInstance.vnode;
    }

    return this._buildComponentInternal(...);
  }
}
```

**Pros:**
- ✅ Simple to implement
- ✅ Compatible with current structure
- ✅ Immediate benefit

**Cons:**
- ⚠️ Shallow compare limits
- ⚠️ Need to store previous VNode in component instance

---

## Recommended Hybrid

### Step 1: Props comparison (immediate)
- Implement Option 4
- Simple and effective

### Step 2: Component memoization (optional)
- Implement Option 1
- Apply only to performance-critical components

### Step 3: Memo cache management
- Use WeakMap
- Use LRU for memory control

## Performance Expectations

### Current
- Full build: O(n) (n = component count)
- DOM update: O(m) (m = changed nodes, Fiber reconciler)

### After optimization
- Full build: O(k) (k = changed components, when memo applied)
- DOM update: O(m) (same)

## Implementation Checklist

### Option 4 (Props comparison)
- [ ] Add props/model/state compare in `VNodeBuilder._buildComponent`
- [ ] Store `vnode` in `ComponentInstance`
- [ ] Add shallow compare utility (`shallowEqual`)
- [ ] Add tests

### Option 1 (Component memoization)
- [ ] Design memo cache structure
- [ ] Cache key generation
- [ ] Cache invalidation strategy
- [ ] WeakMap-based memory management
- [ ] Add tests

## Conclusion

### Revisit issues

**Limits of Option 4 (Props comparison):**
- `data('text')`, `slot('content')` depend on nested model structures
- Deep compare needed but too expensive
- Option 4 may not fit these cases

**Limits of Option 1 (Memoization):**
- Same deep-compare challenge for model
- More memory + compare cost

### Practical approach

**Strengths of current structure:**
- ✅ **Fiber reconciler**: DOM updates already efficient (changed parts only)
- ✅ **Consistency**: Full build keeps correctness
- ✅ **Batch updates**: `queueMicrotask` batches multiple `setState`

**Similar patterns in other UI systems:**
- Full component tree rerender, optimize actual DOM update via diff
- Our Fiber reconciler already does the DOM optimization

### Final recommendations

**1. Keep current structure (default)**
- Keep full VNode build
- Fiber reconciler handles DOM efficiently
- Fast enough for most apps

**2. Add optimizations when needed**
- Version-based compare: add `__version` field to model for quick change detection
- Developer-driven memo: optional memo API for components
- Profiling: find real bottlenecks before optimizing

**3. Measure performance**
- Profile in real apps
- Compare VNode build vs DOM update cost
- Apply extra optimizations only when needed

### Performance goals (revised)

- ✅ DOM update optimization: already via Fiber reconciler
- ✅ Batch updates: already via `queueMicrotask`
- ⚠️ VNode build optimization: hard due to deep-compare costs
- 💡 Alternative: version-based compare or developer-driven memo

**Conclusion:** Keeping the current structure is the safest and most practical. Apply targeted optimizations only when real performance issues appear.
