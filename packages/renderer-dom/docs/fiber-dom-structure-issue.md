# Fiber DOM Structure Error Analysis

## Problem Phenomenon

DOM structure rendered differently than expected in tests:

**Expected:**
```html
<div class="document" data-bc-sid="doc-1" data-bc-stype="document">
  <h1 class="heading" data-bc-sid="h1-1" data-bc-stype="heading">
    <span class="text" data-bc-sid="text-1" data-bc-stype="inline-text">제목입니다</span>
  </h1>
  ...
</div>
```

**Received:**
```html
<div class="document" data-bc-sid="doc-1">
  <h1 class="heading" data-bc-sid="h1-1">
    <span class="text" data-bc-sid="text-1">
      <div>제목입니다</div>  <!-- ❌ Text wrapped in <div> -->
    </span>
  </h1>
  <p class="paragraph" data-bc-sid="p-1">
    <span class="text" data-bc-sid="text-2"></span>  <!-- ❌ Empty -->
  </p>
  <div>첫 번째 단락입니다.</div>  <!-- ❌ Text rendered as <div> outside -->
  ...
</div>
```

## Cause Analysis

### 1. React Fiber Works Asynchronously

React Fiber works **asynchronously** by default:
- `createRoot().render()` is synchronous function, but internally processes asynchronously
- Can force synchronous with `flushSync()`
- Yields to browser to maintain UI responsiveness

### 2. Causes of DOM Structure Errors

#### Problem 1: Child Fiber's parent Incorrectly Set

When creating child Fibers in `createFiberTree`:
```typescript
const childFiber = createFiberTree(
  parent, // ❌ Always set to root container
  childVNode,
  ...
);
```

**Solution**: Update child Fibers' `parent` to current host after creating host in `reconcileFiberNode`
```typescript
// 4-1. Directly update child Fibers' parent to current host
let childFiber = fiber.child;
while (childFiber) {
  childFiber.parent = host; // ✅ Update to parent Fiber's DOM element
  childFiber = childFiber.sibling;
}
```

#### Problem 2: vnode.text Processing Order

VNodes with `vnode.text` should be processed with `handleVNodeTextProperty`, but currently checked after child Fiber processing.

**Solution**: Move `vnode.text` processing to immediately after host creation (before child Fiber processing)

#### Problem 3: Primitive Text Processing

Primitive text (string/number) rendered wrapped in `<div>`.

**Cause**: Should use `handlePrimitiveTextChild` instead of direct DOM manipulation in `processPrimitiveTextChildren`

**Solution**: Use `handlePrimitiveTextChild` to create/update text node at correct position

## Modifications

1. ✅ Update child Fibers' `parent` to parent Fiber's DOM element
2. ✅ Move `vnode.text` processing to immediately after host creation
3. ✅ Use `handlePrimitiveTextChild` in `processPrimitiveTextChildren`

## Additional Verification Needed

- `data-bc-stype` attribute missing (verify if intentional change)
- Text still rendered wrapped in `<div>` issue (additional debugging needed)
