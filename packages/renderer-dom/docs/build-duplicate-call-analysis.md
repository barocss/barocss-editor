# build Function Duplicate Call Analysis

## Problem Situation

Test logs show `VNodeBuilder.build` is called twice for each `inline-text` node:

```
[VNodeBuilder.build] START: nodeType=inline-text, sid=text-1, stype=inline-text, decoratorsCount=0
[VNodeBuilder.build] START: nodeType=inline-text, sid=text-1, stype=inline-text, decoratorsCount=0
```

## Call Path Analysis

### First Call: DOMRenderer.render()

```
DOMRenderer.render()
  └─> builder.build(model.stype, model, options)  [First call]
      └─> VNodeBuilder.build()
          └─> _buildElement() or _buildComponent()
              └─> _processChild()
                  └─> When processing slot: this.build(childType, child) [can be re-called inside slot]
```

### Second Call: Inside updateComponent

```
reconciler.reconcile()
  └─> reconcileVNodeChildren()
      └─> updateComponent() [only when __isReconciling is false]
          └─> buildFromElementTemplate() [Second call]
              └─> _buildElement()
                  └─> _processChild()
                      └─> When processing slot: this.build(childType, child) [can be re-called inside slot]
```

## Why Duplicate Calls Occur

### Scenario 1: buildFromElementTemplate Called in updateComponent

`updateComponent` calls:
1. `buildFromElementTemplate(prevElementTemplate, ...)`
2. `buildFromElementTemplate(nextElementTemplate, ...)`

These two calls rebuild child elements (e.g., `inline-text`) inside the component.

**Problem**: Already built entire VNode tree in `DOMRenderer.render()`, but rebuilding again in `updateComponent`.

### Scenario 2: build Call in Slot Processing

In `_renderSlotGetChildren` method:
```typescript
const childVNode = this.build(childType, child, childBuildOptions);
```

Directly calls `build` when processing slot's child elements.

**Problem**: For components with slots, `build` is called again when processing slots inside `buildFromElementTemplate`.

## Solutions

### Solution 1: Reuse VNode in updateComponent

Instead of calling `buildFromElementTemplate` in `updateComponent`, reuse already built VNode:

```typescript
// Current: Call buildFromElementTemplate
const prevVNodeForReconcile = context.builder.buildFromElementTemplate(prevElementTemplate, dataForBuildPrev, prevBuildOptions);
const nextVNodeForReconcile = context.builder.buildFromElementTemplate(nextElementTemplate, dataForBuildNext, nextBuildOptions);

// Improvement: Reuse already built VNode
// nextVNode is already built in reconcileVNodeChildren, so can reuse
const nextVNodeForReconcile = nextVNode; // Already built VNode
```

**Problem**: `nextVNode` is component's root VNode, not child VNode inside component.

### Solution 2: Block build Call with __isReconciling Flag

Check `__isReconciling` flag inside `build` method to prevent re-call:

```typescript
build(nodeType: string, data: ModelData = {}, options?: VNodeBuildOptions): VNode {
  // Skip build and return cached VNode if __isReconciling is true
  if ((options as any)?.__isReconciling) {
    // Return cached VNode or perform minimal build only
  }
  // ...
}
```

**Problem**: Child elements inside component may not be built correctly this way.

### Solution 3: Optimize buildFromElementTemplate

Reuse already built VNode when `buildFromElementTemplate` is called:

```typescript
public buildFromElementTemplate(template: ElementTemplate, data: ModelData, options?: VNodeBuildOptions): VNode {
  // Generate cache key
  const cacheKey = `${template.tag}-${JSON.stringify(data)}-${JSON.stringify(options)}`;
  
  // Check cache
  if (this._buildCache?.has(cacheKey)) {
    return this._buildCache.get(cacheKey);
  }
  
  // Perform build
  const vnode = this._buildElement(template, data, options);
  
  // Store in cache
  if (this._buildCache) {
    this._buildCache.set(cacheKey, vnode);
  }
  
  return vnode;
}
```

**Problem**: Cache must be invalidated when data changes, but tracking this is difficult.

### Solution 4: Improve updateComponent Call Conditions

Make conditions for calling `updateComponent` stricter:

```typescript
// Current: Only call when __isReconciling is false
if (!isReconciling) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
}

// Improvement: Only call when component actually changed
if (!isReconciling && hasComponentChanged(prevChildVNode, childVNode)) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
}
```

**Problem**: Difficult to accurately determine `hasComponentChanged`.

## Recommended Solution

**Combination of Solution 2 + Solution 4**:

1. When calling `buildFromElementTemplate` in `updateComponent`, reuse children of already built VNode
2. Pass `__isReconciling` flag to `build` method to prevent unnecessary rebuilds
3. Check `__isReconciling` flag in slot processing to prevent re-calls

## Next Steps

1. Add `__isReconciling` flag support to `build` method
2. Add logic to reuse already built VNode in `updateComponent`
3. Add logic to check `__isReconciling` flag in slot processing
4. Verify with tests
