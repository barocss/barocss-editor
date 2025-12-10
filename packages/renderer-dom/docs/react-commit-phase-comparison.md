# React Commit Phase vs Current Implementation

## React's Commit Phase Order

React divides commit phase into **3 stages**:

1. **Before Mutation**: Processing before DOM manipulation
2. **Mutation**: DOM manipulation (insertBefore, removeChild, etc.)
3. **Layout**: Processing after DOM manipulation (layout effects)

Each stage traverses in **child -> sibling order**.

## Current Implementation Issues

### 1. commitFiberTree Traversal Order

Current implementation:
```typescript
export function commitFiberTree(rootFiber, deps, context) {
  let currentFiber = rootFiber;
  
  while (currentFiber) {
    commitFiberNode(currentFiber, deps, context);
    
    if (currentFiber.child) {
      currentFiber = currentFiber.child;
      continue;
    }
    
    if (currentFiber.sibling) {
      currentFiber = currentFiber.sibling;
      continue;
    }
    
    // Go back to parent to find sibling
    currentFiber = currentFiber.return;
    while (currentFiber && !currentFiber.sibling) {
      currentFiber = currentFiber.return;
    }
    if (currentFiber) {
      currentFiber = currentFiber.sibling;
    }
  }
}
```

**Issue**: This traversal proceeds in child -> sibling order, but **does not process siblings at the same level in order**.

For example:
```
RootFiber
  └─ child: Fiber0
      └─ sibling: Fiber1
          └─ sibling: Fiber2
```

Current traversal:
1. RootFiber commit
2. Fiber0 commit
3. Fiber0 has no child, so commit Fiber0.sibling (Fiber1)
4. Fiber1 has no child, so commit Fiber1.sibling (Fiber2)

This is the correct order! But the issue is in the **logic to find previous sibling**.

### 2. Finding Previous Sibling in commitFiberNode

Current implementation:
```typescript
// Find previous sibling Fiber directly and use domElement.nextSibling as referenceNode
let referenceNode: Node | null = null;
if (fiber.index > 0 && fiber.parentFiber) {
  let prevSiblingFiber = fiber.parentFiber.child;
  for (let i = 0; i < fiber.index - 1 && prevSiblingFiber; i++) {
    prevSiblingFiber = prevSiblingFiber.sibling;
  }
  if (prevSiblingFiber && prevSiblingFiber.domElement) {
    referenceNode = prevSiblingFiber.domElement.nextSibling;
  }
}
```

**Issue**: 
- `fiber.index` is the index in VNode children array.
- But Fiber sibling relationship may only include VNodes excluding primitive text.
- Therefore, cannot find previous sibling Fiber with `fiber.index - 1`.

**Solution**: 
- Must find previous sibling based on VNode children array.
- But in commit phase, all Fibers have already gone through render phase, so previous sibling Fiber's `domElement` should be set.
- **But previous sibling may not have been committed yet!**

### 3. React's Approach

React in commit phase:
1. **Before Mutation**: Traverse all Fibers for processing before DOM manipulation
2. **Mutation**: Traverse all Fibers for DOM manipulation (insertBefore, etc.)
3. **Layout**: Traverse all Fibers for processing after DOM manipulation

Since each stage traverses in **child -> sibling order**, previous sibling should already be processed.

But React does not use **previous sibling's domElement.nextSibling**, but **directly references parent's childNodes**.

## Correct Solution

React approach:
1. Traverse in child -> sibling order in commit phase
2. When committing each Fiber, **previous sibling has already been committed**, so `domElement` should be set
3. But when using `insertBefore`, should **directly reference parent's childNodes** rather than using **previous sibling's `nextSibling`**.

Current implementation issue:
- Attempts to find previous sibling with `fiber.index`
- But Fiber sibling relationship and VNode children order may not match

**Solution**: 
- When finding previous sibling in commit phase, must find previous sibling Fiber based on **VNode children array**.
- Or must **directly reference parent's childNodes** to find correct position.

## Recommended Modifications

1. **Verify commitFiberTree traversal order**: Verify that child -> sibling order is correct
2. **Fix previous sibling finding logic**: Find previous sibling Fiber based on VNode children array
3. **Calculate referenceNode**: Directly reference parent's childNodes instead of previous sibling's `domElement.nextSibling`
