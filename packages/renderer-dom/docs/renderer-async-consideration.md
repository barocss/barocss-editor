# Renderer Async Processing Considerations

## Current State

### 1. DOMRenderer.render()
```typescript
render(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { ... }
): void {
  // VNode build (synchronous)
  const vnode = this.builder.build(model.stype, model, { ... });
  
  // Reconcile (async - Fiber-based)
  this.reconciler.reconcile(container, vnode, model, runtime, decorators, selection);
  // ⚠️ reconcile returns immediately, but actual DOM update proceeds asynchronously
}
```

### 2. Reconciler.reconcile()
```typescript
reconcile(...): void {
  // Fiber-based reconcile (async)
  reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps, () => {
    // Completion callback
  });
  // ⚠️ Returns immediately, but actual work is processed asynchronously by Fiber Scheduler
}
```

## Issues

1. **Using await in test code**
   ```typescript
   await editorView.render(model as any); // ❌ render() returns void
   ```

2. **Cannot know completion time**
   - `render()` returns immediately after call, but actual DOM update may still be in progress
   - Tests need utilities like `waitForFiber()` to check DOM state

3. **Difference from React**
   - React 18: `createRoot().render()` is synchronous function, but internally processes asynchronously
   - But React also provides synchronous version like `flushSync()`

## Solutions

### Option 1: Maintain Current Structure (Recommended)

**Advantages**:
- ✅ Maintains existing API compatibility
- ✅ Similar pattern to React
- ✅ Caller often doesn't need to wait for completion

**Disadvantages**:
- ⚠️ Need utility (`waitForFiber()`) when completion must be waited
- ⚠️ Test code needs to call `await waitForFiber()` every time

**Usage Example**:
```typescript
// Normal usage
renderer.render(container, model); // Returns immediately, processed asynchronously

// Wait for completion in tests
renderer.render(container, model);
await waitForFiber(); // Wait for Fiber completion
expect(container.innerHTML).toBe('...');
```

### Option 2: Change render() to Async

**Advantages**:
- ✅ Can clearly know completion time
- ✅ Test code becomes simpler (`await render()`)
- ✅ Promise chaining possible

**Disadvantages**:
- ⚠️ Breaking change to existing API
- ⚠️ Need to modify all call sites
- ⚠️ Need await even when completion doesn't need to be waited

**Usage Example**:
```typescript
// Normal usage
await renderer.render(container, model); // Wait for completion

// Tests
await renderer.render(container, model);
expect(container.innerHTML).toBe('...'); // Check after completion
```

### Option 3: Hybrid Approach (Synchronous + Async Version)

**Advantages**:
- ✅ Maintains existing API compatibility
- ✅ Can use async version when needed
- ✅ Flexibility

**Disadvantages**:
- ⚠️ Increased API complexity
- ⚠️ Two patterns may coexist

**Usage Example**:
```typescript
// Synchronous version (existing)
renderer.render(container, model); // Returns immediately

// Async version (newly added)
await renderer.renderAsync(container, model); // Wait for completion
```

## Recommendations

### Immediate Application: Maintain Option 1

Maintain current structure but modify test code:

```typescript
// Modify test code
renderer.render(container, model);
await waitForFiber(); // Wait for Fiber completion
expect(container.innerHTML).toBe('...');
```

### Long-term Improvement: Consider Option 3

Add async version when needed:

```typescript
// Add to DOMRenderer
async renderAsync(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { ... }
): Promise<void> {
  const vnode = this.builder.build(model.stype, model, { ... });
  
  return new Promise<void>((resolve) => {
    this.reconciler.reconcile(container, vnode, model, runtime, decorators, selection, () => {
      resolve(); // Resolve when Fiber completes
    });
  });
}
```

## Conclusion

**Currently recommend maintaining Option 1:**
1. Maintains existing API compatibility
2. Similar pattern to React
3. Most cases don't need to wait for completion
4. Use `waitForFiber()` only in tests

**Add Option 3 when needed:**
- Add `renderAsync()` method for special cases that need to wait for completion
- Keep existing `render()` as is
