# Prohibition of Arbitrary Element Creation in Fiber

## Principle

**VNodeBuilder creates VNodes, and Fiber Reconciler should only process the results**

Fiber Reconciler:
- ✅ Converts VNode structure created by VNodeBuilder directly to DOM
- ❌ Must not arbitrarily create `<div>` or other elements

## Current Problem

Received HTML shows text wrapped in `<div>`:
```html
<span class="text" data-bc-sid="text-1">
  <div>제목입니다</div>  <!-- ❌ Arbitrarily created in Fiber -->
</span>
```

## Cause Analysis

### 1. Default `'div'` Usage in `createHostElement`

```typescript
const host = dom.createSimpleElement(String(childVNode.tag || 'div'), parent);
```

**Problem**: Uses `'div'` as default when `vnode.tag` is missing
- Should only occur when VNodeBuilder doesn't provide `tag`
- But VNodes with `vnode.text` should have `tag`

### 2. `vnode.text` Processing Order

VNodes with `vnode.text`:
1. Do not create child Fibers in `createFiberTree` (fixed)
2. Create host then process with `handleVNodeTextProperty` in `reconcileFiberNode`

**Problem**: VNodes with `vnode.text` may be processed as child Fibers

## Solutions

### 1. Check `vnode.text` in `createFiberTree` (Completed)

```typescript
// IMPORTANT: Don't create child Fibers if vnode.text exists and children is empty
if (vnode.text !== undefined && (!vnode.children || vnode.children.length === 0)) {
  return fiber;
}
```

### 2. Verify `vnode.text` Processing in `reconcileFiberNode`

VNodes with `vnode.text`:
- Process with `handleVNodeTextProperty` after creating host
- `return` before processing child Fibers to exit

### 3. Validate `tag` in `createHostElement`

Should throw error or at least log if `vnode.tag` is missing:
```typescript
if (!childVNode.tag) {
  console.warn('[Fiber] VNode without tag:', childVNode);
  // Use default 'div' (but this indicates VNodeBuilder issue)
}
```

## Resolution Completed

### Modifications

1. ✅ Process as text node in `reconcileFiberNode` if `vnode.tag` is missing
   - Branch before calling `createHostElement`
   - Use `handleTextOnlyVNode` to create text node

2. ✅ Add warning to `createHostElement`
   - Output warning log if `tag` is missing (indicates VNodeBuilder issue)

### Result

Text correctly rendered in Received HTML:
```html
<span class="text" data-bc-sid="text-1">제목입니다</span>
```

Correctly processed as text node without wrapping in `<div>`.
