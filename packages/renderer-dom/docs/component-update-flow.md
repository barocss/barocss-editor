# Component Update Flow

## Abstract

This document explains the consistent update flow through full re-rendering when Component state changes.

**Core principles:**
- **Model + Props + State = one "document"**: These three together form the complete document.
- Always build the entire VNode tree from the top.
- Reconcile the entire VNode tree to apply to the DOM.
- Do not update a single component in isolation.

When a Component's internal state changes, a `changeState` event triggers `DOMRenderer` to **rebuild the entire VNode tree from the top**. In `updateComponent`, the already-built `nextVNode` is reused to avoid duplicate builds.

## 1. Overall flow

```
Component State Change
  ↓
BaseComponentState.set()
  ↓
ComponentManager.emit('changeState')
  ↓
DOMRenderer (changeState event listener)
  ↓
DOMRenderer.render() (full re-render from top)
  ↓
VNodeBuilder.build() (build entire VNode tree from top, including Component state)
  ↓
Reconciler.reconcile() (reconcile entire VNode tree)
  ↓
ComponentManager.updateComponent() (called for each component)
  ↓
Reuse nextVNode (no duplicate build)
```

**Important:**
- ✅ Always build the entire VNode tree from the top.
- ✅ Reconcile the entire VNode tree to apply to the DOM.
- ❌ Do not update a single component in isolation.

## 2. Detailed flow

### 2.1 Component state change

How to change state inside a Component:

```typescript
// Method 1: Use BaseComponentState.set()
class MyComponentState extends BaseComponentState {
  increment() {
    this.set({ count: this.get('count') + 1 });
  }
}

// Method 2: Use ComponentContext.setState()
const MyComponent = (props, ctx) => {
  return element('div', [
    element('button', {
      onClick: () => ctx.setState({ count: (ctx.getState('count') || 0) + 1 })
    }, ['Increment'])
  ]);
};
```

### 2.2 BaseComponentState.set() → changeState event

**File**: `packages/renderer-dom/src/state/base-component-state.ts`

```typescript
set(patch: Record<string, any>): void {
  if (!patch) return;
  Object.assign(this.data, patch);
  
  // Emit changeState event if componentManager and sid are available
  if (this.componentManager && this.sid) {
    this.componentManager.emit('changeState', this.sid, {
      state: this.snapshot(),
      patch: patch
    });
  }
}
```

**Behavior:**
1. Update Component state data.
2. Call `ComponentManager.emit('changeState', sid, data)`.

### 2.3 ComponentManager.emit() → DOMRenderer listener

**File**: `packages/renderer-dom/src/dom-renderer.ts`

```typescript
constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
  // ...
  
  // Receive state change event → full re-render (model unchanged, only state changed)
  this.componentManager.on('changeState', (_sid: string) => {
    if (!this.rootElement || !this.lastModel) return;
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try {
        this.render(this.rootElement as HTMLElement, this.lastModel as ModelData, this.lastDecorators || [], this.lastRuntime || undefined);
      } catch {}
    });
  });
}
```

**Behavior:**
1. Receive `changeState` event.
2. Use `renderScheduled` flag to prevent duplicate scheduling.
3. Schedule full re-render in the next event loop via `queueMicrotask`.
4. Use `lastModel`, `lastDecorators`, `lastRuntime` (model unchanged, only state changed).

### 2.4 DOMRenderer.render() → build entire VNode tree

**File**: `packages/renderer-dom/src/dom-renderer.ts`

```typescript
render(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { 
    textNode?: Text; 
    restoreSelection?: (textNode: Text, offset: number) => void;
    model?: { sid: string; modelOffset: number };
  }
): void {
  // Store for later use
  this.rootElement = container;
  this.lastModel = model;
  this.lastDecorators = decorators;
  this.lastRuntime = runtime || null;
  
  // Build complete VNode tree from model
  const vnode = this.builder.build(model.stype, model, { 
    decorators,
    selectionContext: selection?.model
  } as unknown as VNodeBuildOptions);
  
  // Reconcile VNode tree to container
  const selectionContext = this.selectionTextNodePool
    ? { ...(selection || {}), pool: this.selectionTextNodePool }
    : undefined;
  this.reconciler.reconcile(container, vnode, model, runtime, decorators, selectionContext as any);
}
```

**Behavior:**
1. Call `VNodeBuilder.build()` to build the entire VNode tree.
2. `VNodeBuilder` accesses Component state via `componentStateProvider`.
3. Create VNode tree with Component state reflected.
4. Call `Reconciler.reconcile()` to update the DOM.

### 2.5 VNodeBuilder.build() → access Component state

**File**: `packages/renderer-dom/src/vnode/factory.ts`

```typescript
private _getComponentStateForBuild(template: ComponentTemplate, data: ModelData, props: Record<string, any>): Record<string, any> {
  if (!this.componentStateProvider) {
    return {};
  }
  
  // Create temporary VNode to get component state
  const tempVNode: VNode = {
    stype: template.stype,
    sid: data.sid,
    // ...
  };
  
  return this.componentStateProvider.getComponentStateByVNode(tempVNode);
}
```

**Behavior:**
1. When building a Component template, query state via `componentStateProvider`.
2. Include Component state in `dataForBuild`.
3. Pass context with state reflected when calling the Component template function.

### 2.6 Reconciler.reconcile() → Component update

**File**: `packages/renderer-dom/src/reconcile/reconciler.ts`

```typescript
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // ...
  
  for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
    const childVNode = childVNodes[childIndex];
    
    // If Component VNode, call updateComponent
    if (!isDecorator && childVNode.stype) {
      const isReconciling = !!(context as any)?.__isReconciling;
      
      if (!isReconciling) {
        try { 
          this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any)); 
        } catch (error) {
          console.error(`[Reconciler] Error updating component ${childVNode.stype} (sid: ${childVNode.sid}):`, error);
          throw error;
        }
      }
    }
  }
}
```

**Behavior:**
1. Traverse the VNode tree and find Component VNodes.
2. Call `ComponentManager.updateComponent()`.
3. Use `__isReconciling` flag to prevent recursive calls.

### 2.7 ComponentManager.updateComponent() → reuse nextVNode

**File**: `packages/renderer-dom/src/component-manager.ts`

```typescript
public updateComponent(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext, wip: DOMWorkInProgress): void {
  // Skip updateComponent if __isReconciling flag is set
  const isReconciling = !!(context as any)?.__isReconciling;
  if (isReconciling) {
    // Only update DOM attributes (no build)
    if (nextVNode.attrs) {
      const dom = (context as any)?.dom;
      if (dom && container) {
        dom.updateAttributes(container, prevVNode?.attrs, nextVNode.attrs);
      }
    }
    return;
  }
  
  // ...
  
  // Consistent full build pattern:
  // VNodeBuilder already built the entire VNode tree, so updateComponent reuses nextVNode as-is
  // Component state change → changeState event → DOMRenderer.render() full re-render
  // Therefore nextVNode was already built in DOMRenderer.render() with state reflected
  // updateComponent does not call buildFromElementTemplate and reuses nextVNode
  const prevVNodeForReconcile = prevVNode || instance.vnode || {} as VNode;
  const nextVNodeForReconcile = nextVNode;
  
  // If nextVNode is missing or empty, that's VNodeBuilder's responsibility, not handled here
  // If nextVNode is empty, there was a problem in VNodeBuilder.build(), so we should error
  if (!nextVNodeForReconcile) {
    console.error(`[ComponentManager.updateComponent] nextVNode is missing for component ${componentId}. This should not happen if VNodeBuilder.build() is working correctly.`);
  }
  
  // Reconcile nextVNode to DOM
  const reconcileFunc = (context as any).reconcile;
  if (reconcileFunc) {
    const reconcileContext = {
      ...context,
      parent: instance.element,
      data: instance.state,
      __internal: true,
      prevVNode: prevVNodeForReconcile,
      __isReconciling: true  // prevent recursive calls
    } as any;
    reconcileFunc(nextVNodeForReconcile as any, instance.element, reconcileContext);
    instance.vnode = nextVNodeForReconcile;
  }
}
```

**Core logic:**
1. **`nextVNode` is always already built in `VNodeBuilder.build()`, so reuse it as-is.**
2. **Do not call `buildFromElementTemplate`** (prevents duplicate builds).
3. Call `reconcileFunc` to update the DOM.
4. Use `__isReconciling` flag to prevent recursive calls.

**Important**: Since `VNodeBuilder` is responsible for building the entire VNode tree, `updateComponent` does not need to build again. This ensures a consistent full build pattern.

## 3. Consistent full build pattern

### 3.1 Core principles

**All updates follow the full build pattern:**

1. **Component state change** → `changeState` event → `DOMRenderer.render()` full re-render.
2. **Model change** → direct call to `DOMRenderer.render()`.
3. **Props change** → direct call to `DOMRenderer.render()`.

### 3.2 Preventing duplicate builds

**Previous structure (inconsistent):**
- Component state change → full re-render.
- `updateComponent` checks `stateChanged` and rebuilds (duplicate).

**Current structure (consistent):**
- Component state change → full re-render.
- `updateComponent` reuses `nextVNode` (no duplicate).

### 3.3 Removing exception cases

**Previous structure**: Call `buildFromElementTemplate` when `nextVNode` is missing or has no children.

**Current structure**: Since `VNodeBuilder` is responsible for building the entire VNode tree, `updateComponent` reuses `nextVNode` as-is. If `nextVNode` is empty, that indicates a problem in `VNodeBuilder.build()`, so we log an error.

## 4. Performance optimizations

### 4.1 renderScheduled flag

```typescript
if (this.renderScheduled) return;
this.renderScheduled = true;
queueMicrotask(() => {
  this.renderScheduled = false;
  // ...
});
```

**Purpose**: Prevent duplicate renders when state changes rapidly in succession.

### 4.2 Using queueMicrotask

**Purpose:**
- Batch synchronous state changes.
- Render once in the next event loop.

### 4.3 Text Node Pool reuse

**Purpose:**
- Ensure Selection stability by reusing DOM Text Nodes.
- Avoid unnecessary DOM creation/deletion.

## 5. Test coverage

### 5.1 Related test files

1. **`test/components/component-rerender.test.ts`**
   - Basic Component re-render tests.
   - Verify state update when `setState` is called.
   - Verify independent state management across multiple Component instances.

2. **`test/core/reconciler-component-state-integration.test.ts`**
   - Tests for `changeState` event and manual updates.
   - Simulate `ComponentManager.emit('changeState')`.
   - Verify DOM update after full re-render.

3. **`test/core/reconciler-component-updatebysid.test.ts`**
   - Component update tests (updateBySid method).

4. **`test/core/reconciler-verification.test.ts`**
   - Component update verification tests.
   - Verify Component mount/unmount/attribute changes.

### 5.2 Test coverage analysis

**Current coverage:**
- ✅ Component state change (`setState`).
- ✅ Component re-render.
- ✅ Independent state across multiple Component instances.
- ✅ `changeState` event simulation.
- ✅ Component mount/unmount.
- ✅ Component attribute changes.

**Missing tests:**
- ❌ Verify that `changeState` event automatically triggers `DOMRenderer.render()`.
- ❌ Verify `nextVNode` reuse in `updateComponent`.
- ❌ Verify duplicate render prevention with `renderScheduled` flag.
- ❌ Verify batch processing via `queueMicrotask`.

### 5.3 Recommended additional tests

We recommend adding the following test cases:

```typescript
describe('Component State Change Flow', () => {
  it('should trigger full re-render on changeState event', () => {
    const renderer = new DOMRenderer(registry);
    const container = document.createElement('div');
    
    // Initial render
    const model = { sid: 'comp-1', stype: 'counter', count: 0 };
    renderer.render(container, model);
    
    // Simulate state change
    const componentManager = (renderer as any).componentManager;
    const renderSpy = vi.spyOn(renderer, 'render');
    
    componentManager.emit('changeState', 'comp-1', { state: { count: 1 } });
    
    // Should trigger render after microtask
    await new Promise(resolve => queueMicrotask(resolve));
    expect(renderSpy).toHaveBeenCalled();
  });
  
  it('should reuse nextVNode in updateComponent', () => {
    // Test that updateComponent reuses nextVNode instead of rebuilding
  });
  
  it('should prevent duplicate renders with renderScheduled flag', () => {
    // Test that rapid state changes only trigger one render
  });
});
```

## 6. Summary

1. **Component state changes** always trigger full re-render via `changeState` event.
2. **DOMRenderer.render()** rebuilds the entire VNode tree, reflecting Component state.
3. **ComponentManager.updateComponent()** reuses the already-built `nextVNode` to prevent duplicate builds.
4. This pattern ensures **consistent full builds**, and all updates follow the same flow.
