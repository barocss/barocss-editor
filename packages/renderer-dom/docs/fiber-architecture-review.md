# Fiber Architecture Review

## React's Reconciliation Structure

### React's Core Principles

React handles **pure reconciliation logic only** and has no domain knowledge:

1. **Key-based Matching (Primary Strategy)**
   ```javascript
   // React uses key prop to identify elements
   <div key="item-1">Item 1</div>
   <div key="item-2">Item 2</div>
   
   // During reconciliation:
   // 1. Find element with same key and reuse
   // 2. Create new if key is missing or different
   ```

2. **Type + Index-based Fallback (Secondary Strategy)**
   ```javascript
   // When key is missing, match by same type (tag) and index
   // <div> → <div> (same index) → reuse
   // <div> → <span> (different type) → create new
   ```

3. **Compare Only by Children**
   ```javascript
   // React does not perform global search
   // Only checks current parent's children
   function reconcileChildren(parent, newChildren, prevChildren) {
     // Search only in parent.children array
     // No global querySelector
   }
   ```

4. **Cross-parent Move Handling**
   ```javascript
   // When React element moves to different parent:
   // 1. Remove from previous location (unmount)
   // 2. Create at new location (mount)
   // Does not reuse via global search
   ```

### React's Reconciliation Algorithm

```javascript
// React's reconciliation (pseudocode)
function reconcileChild(parent, newChild, prevChild, index) {
  // 1. Key matching (highest priority)
  if (newChild.key && prevChild?.key === newChild.key) {
    // Same key → reuse
    return updateElement(prevChild.domElement, newChild);
  }
  
  // 2. Type + Index matching (when key is missing)
  if (!newChild.key && prevChild && 
      prevChild.type === newChild.type && 
      prevChild.index === index) {
    // Same type + same index → reuse
    return updateElement(prevChild.domElement, newChild);
  }
  
  // 3. Matching failed → create new
  return createElement(newChild);
}
```

### React's Domain Knowledge Separation

React **does not know any domain concepts**:

```javascript
// React does not know:
// - "This is a decorator"
// - "This is a mark wrapper"
// - "This is a special component"

// React only checks:
// - key: Element identifier
// - type: Component type (function, class, tag name)
// - props: Attributes
// - children: Child elements
```

### React's Absence of Global Search

React **does not perform global search**:

```javascript
// React does not do:
// ❌ document.querySelectorAll('[key="item-1"]')
// ❌ parent.ownerDocument.querySelectorAll(...)

// React only checks:
// ✅ parent.children[index]
// ✅ Find by key in prevChildren array
```

## Comparison with Our Project

### Similarities

| Item | React | Our Project |
|------|------|-------------|
| Fiber-based architecture | ✅ | ✅ |
| Priority-based scheduling | ✅ | ✅ |
| Async rendering | ✅ | ✅ |
| Key-based matching | ✅ | ✅ (sid/decoratorSid) |

### Differences

| Item | React | Our Project (Current) | Our Project (Goal) |
|------|------|---------------------|-------------------|
| Domain knowledge | ❌ None | ⚠️ Present (direct decoratorSid usage) | ❌ None |
| Global search | ❌ None | ⚠️ Present (querySelectorAll) | ❌ None |
| Cross-parent Move | Create new | Reuse via global search | Create new |
| Children-based comparison | ✅ | ⚠️ Partial | ✅ |

## Problem Analysis

### 1. Domain Knowledge Leakage

#### Current Problem

Fiber reconciler directly knows domain concepts like `mark` and `decorator`:

```typescript
// fiber-reconciler.ts
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // Don't reuse if decoratorSid differs
}

// fiber-tree.ts
if (!prevChildVNode && prevVNode?.children && childVNode.tag && !childVNode.decoratorSid) {
  // Exclude decorator VNode
}
```

#### Issues

1. **Separation of Concerns Violation**
   - Fiber should only reconcile what VNodeBuilder created
   - Should not know domain concepts like `decoratorSid`, `decoratorStype`
   - VNodeBuilder already created correct VNode structure, so Fiber should just follow it

2. **Maintainability Degradation**
   - When domain logic changes, Fiber must also be modified
   - Fiber should be pure reconciliation logic

3. **Increased Test Complexity**
   - Must test domain concepts
   - Testing Fiber's own logic becomes difficult

#### Correct Approach

Fiber should only check VNode's structural properties:
- `sid`: VNode identifier (doesn't need to know which domain)
- `tag`: DOM tag name
- `attrs`: Attributes
- `children`: Child VNodes

Since VNodeBuilder already set `decoratorSid` correctly, Fiber can just use it like `sid`.

### 2. Global Search Problem

#### Current Problem

```typescript
// fiber-reconciler.ts (line 301)
const allMatches = parent.ownerDocument?.querySelectorAll(
  `[data-bc-sid="${vnodeId}"], [data-decorator-sid="${vnodeId}"]`
) || [];

// host-finding.ts (line 130)
const allMatches = parent.ownerDocument?.querySelectorAll(
  `[data-bc-sid="${vnodeId}"], [data-decorator-sid="${vnodeId}"]`
) || [];
```

#### Issues

1. **Performance Problem**
   - Searching entire document is expensive
   - Slower as DOM tree grows larger

2. **Unintended Reuse**
   - Can reuse elements under different parents
   - Elements with same `sid` in different locations can be incorrectly matched

3. **Increased Complexity**
   - Must track already used elements with `usedDomElements`
   - Fallback logic when global search fails becomes complex

#### Correct Approach

**Compare only by children, create new if not found**

1. **Check only current parent's children**
   - Search only in `parent.children` array
   - Compare `prevVNode.children` and `vnode.children`

2. **Create new on matching failure**
   - Create new element immediately without global search
   - If sid's location changed, creating new is correct

3. **Simple logic**
   - No need for complex `usedDomElements` tracking
   - No need for global search fallback

## Improvement Direction

### 1. Remove Domain Knowledge

#### Before

```typescript
// Directly check decoratorSid
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // Don't reuse
}
```

#### After

```typescript
// Only check VNode identifier (don't need to know which domain)
const vnodeId = vnode.sid || vnode.decoratorSid; // Use decoratorSid just like sid
const prevVNodeId = prevVNode?.sid || prevVNode?.decoratorSid;

if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // Don't reuse if ID differs
}
```

Or better approach:

```typescript
// Function to extract VNode's unique identifier
function getVNodeId(vnode: VNode): string | undefined {
  return vnode.sid || vnode.decoratorSid; // Just ID, no domain concept
}

// Usage
const vnodeId = getVNodeId(vnode);
const prevVNodeId = getVNodeId(prevVNode);
if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // Don't reuse if ID differs
}
```

### 2. Remove Global Search

#### Before

```typescript
// 1. Check prevVNode.meta.domElement
if (prevVNode?.meta?.domElement) {
  host = prevVNode.meta.domElement;
}

// 2. Find via findHostForChildVNode (includes global search)
if (!host) {
  host = findHostForChildVNode(...);
}

// 3. Global search fallback
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

#### After

```typescript
// 1. Check prevVNode.meta.domElement (highest priority)
if (prevVNode?.meta?.domElement instanceof HTMLElement) {
  host = prevVNode.meta.domElement;
}

// 2. Find only in current parent's children (no global search)
if (!host) {
  host = findHostInParentChildren(parent, vnode, prevVNode, childIndex);
}

// 3. Create new if not found (no global search)
if (!host) {
  host = createHostElement(parent, vnode, childIndex, ...);
}
```

#### findHostInParentChildren Implementation

```typescript
function findHostInParentChildren(
  parent: HTMLElement,
  vnode: VNode,
  prevVNode: VNode | undefined,
  childIndex: number
): HTMLElement | null {
  const vnodeId = getVNodeId(vnode);
  
  // 1. Find VNode with same ID in prevVNode.children
  if (prevVNode?.children && vnodeId) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        const prevId = getVNodeId(c);
        return prevId === vnodeId;
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      // Check if prevChildVNode's domElement is child of current parent
      const domEl = prevChildVNode.meta.domElement;
      if (domEl.parentElement === parent) {
        return domEl;
      }
    }
  }
  
  // 2. Find element with same ID in parent.children
  if (vnodeId) {
    const children = Array.from(parent.children);
    for (const child of children) {
      const childEl = child as HTMLElement;
      const childSid = childEl.getAttribute('data-bc-sid');
      const childDecoratorSid = childEl.getAttribute('data-decorator-sid');
      if (childSid === vnodeId || childDecoratorSid === vnodeId) {
        return childEl;
      }
    }
  }
  
  // 3. Index-based matching (for mark wrapper etc. without sid)
  if (childIndex < parent.children.length) {
    const candidate = parent.children[childIndex] as HTMLElement;
    if (candidate && candidate.tagName.toLowerCase() === (vnode.tag || '').toLowerCase()) {
      // Class matching (mark wrapper)
      if (vnode.attrs?.class || vnode.attrs?.className) {
        const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
        const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
        if (vnodeClasses.every(cls => candidateClasses.includes(cls))) {
          return candidate;
        }
      } else {
        return candidate;
      }
    }
  }
  
  return null;
}
```

## Improvement Effects

### 1. Simplicity

- Fiber logic simplified by removing domain knowledge
- Complex tracking logic unnecessary by removing global search

### 2. Performance

- DOM query cost reduced by removing global search
- Fast because only checking children

### 3. Correctness

- Prevents unintended reuse
- More accurate by comparing only by children

### 4. Maintainability

- Domain logic changes don't affect Fiber
- Fiber handles only pure reconciliation logic

## Migration Plan

### Phase 1: Remove Domain Knowledge

1. Remove direct `decoratorSid` references
2. Unify with `getVNodeId()` function
3. Check only VNode structure without domain concepts

### Phase 2: Remove Global Search

1. Remove `querySelectorAll`
2. Implement `findHostInParentChildren`
3. Compare only by children

### Phase 3: Testing and Verification

1. Verify existing tests pass
2. Performance measurement
3. Edge case testing

## Expected Issues

### 1. Cross-parent Move

**Problem**: When sid moves to different parent

**Current**: Find and reuse via global search

**After improvement**: Create new

**Solution**: 
- Cross-parent move is rare
- Creating new is safer and simpler
- VNodeBuilder already created correct structure, so Fiber should just follow it

### 2. Mark Wrapper Reuse

**Problem**: Reusing mark wrapper without sid

**Solution**: 
- Match by index + tag + class
- Handle in `findHostInParentChildren`

## Alignment with React

### Following React's Principles

1. **Remove Domain Knowledge**
   - Perform pure reconciliation like React
   - Treat `decoratorSid` as general identifier like `sid`

2. **Remove Global Search**
   - Compare only by children like React
   - Create new for cross-parent move

3. **Simple Matching Strategy**
   - Key (sid/decoratorSid) based matching
   - Type + Index based fallback
   - No need for complex tracking logic

### React-style Improved Code

```typescript
// React-style reconciliation
function reconcileFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies) {
  const vnode = fiber.vnode;
  const prevVNode = fiber.prevVNode;
  const parent = fiber.parent;
  
  // 1. Key-based matching (React's key prop)
  const vnodeId = getVNodeId(vnode); // sid || decoratorSid (no domain concept)
  const prevVNodeId = getVNodeId(prevVNode);
  
  let host: HTMLElement | null = null;
  
  // 1-1. Check prevVNode.meta.domElement (highest priority)
  if (prevVNode?.meta?.domElement instanceof HTMLElement) {
    if (vnodeId && prevVNodeId && vnodeId === prevVNodeId) {
      host = prevVNode.meta.domElement;
    }
  }
  
  // 1-2. Find same key in prevVNode.children
  if (!host && prevVNode?.children && vnodeId) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        return getVNodeId(c) === vnodeId;
      }
    );
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // Check if child of current parent (no global search)
      if (domEl.parentElement === parent) {
        host = domEl;
      }
    }
  }
  
  // 2. Type + Index based Fallback (React style)
  if (!host && prevVNode?.children) {
    const prevChild = prevVNode.children[fiber.index];
    if (prevChild && typeof prevChild === 'object') {
      const prevChildVNode = prevChild as VNode;
      // Same type (tag) + same index
      if (prevChildVNode.tag === vnode.tag) {
        if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
          const domEl = prevChildVNode.meta.domElement;
          if (domEl.parentElement === parent) {
            host = domEl;
          }
        }
      }
    }
  }
  
  // 3. Matching failed → create new (React style)
  if (!host) {
    host = createHostElement(parent, vnode, fiber.index, deps);
  }
  
  // 4. Update DOM
  updateHostElement(host, vnode, deps);
  
  // 5. Store meta.domElement (for next reconciliation)
  vnode.meta = vnode.meta || {};
  vnode.meta.domElement = host;
}
```

## Conclusion

Fiber should be **pure reconciliation logic like React**:

1. **Remove Domain Knowledge** (like React)
   - Treat `decoratorSid` as general identifier
   - Should not know domain concepts (mark, decorator)

2. **Remove Global Search** (like React)
   - Compare only by children
   - Create new for cross-parent move

3. **Simple Matching Strategy** (like React)
   - Key (sid/decoratorSid) based matching
   - Type + Index based fallback
   - No need for complex tracking logic

This enables **simple, fast, and accurate reconciliation** similar to React's level.

