# Fiber Improvement Plan

## Core Principles

**Reconciler must work without knowing the domain**

- Fiber only reconciles what VNodeBuilder created
- Must not directly know domain concepts like `decoratorSid`, `decoratorStype`
- Only handles pure reconciliation logic like React

## Current Issues Summary

### 1. Domain Knowledge Leakage

#### Problematic Files

**1. `fiber-reconciler.ts`**
- Line 140-151: Direct check of `decoratorSid`, `decoratorStype`
- Line 228-233: `decoratorSid` comparison logic
- Line 300-315: `isDecoratorVNode` check and `decoratorSid` comparison

**2. `fiber-tree.ts`**
- Line 67-68: Direct use of `decoratorSid`
- Line 83-88: `!childVNode.decoratorSid` condition
- Line 107-113: Direct check of `decoratorSid`, `decoratorStype`

**3. `host-finding.ts`**
- Line 41-43: `isDecoratorVNode = !!childVNode.decoratorSid`
- Line 53-57: Direct `decoratorSid` comparison
- Line 84-95: `decoratorSid` condition
- Line 138-144: `decoratorSid` comparison

**4. `host-management.ts`**
- Line 201-211: Direct use of `decoratorSid`, `decoratorStype`, etc. (OK - DOM attribute setting)
- Line 351-362: Direct use of `decoratorSid`, `decoratorStype`, etc. (OK - DOM attribute setting)

**Note**: `decoratorSid` usage in `host-management.ts` is OK because it's DOM attribute setting. Reflecting VNode attributes to DOM is normal behavior.

### 2. Global Search Problem

#### Problematic Files

**1. `fiber-reconciler.ts`**
- Line 301-318: Use of `parent.ownerDocument?.querySelectorAll`

**2. `host-finding.ts`**
- Line 130-148: Use of `parent.ownerDocument?.querySelectorAll`

**3. `host-management.ts`**
- Line 124-136: Use of `parent.ownerDocument.querySelectorAll`

## Improvement Plan

### Phase 1: Remove Domain Knowledge

#### 1.1 Unify `getVNodeId()` Function

**Current**: `vnode.sid || vnode.decoratorSid` repeated in many places

**Improvement**: 
- Use `getVNodeId()` function everywhere
- Treat only as "VNode identifier" without domain concepts

**Files**: `host-finding.ts`, `fiber-reconciler.ts`, `fiber-tree.ts`, `dom-utils.ts`

#### 1.2 Remove Direct `decoratorSid` References

**Current**:
```typescript
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // Don't reuse
}
```

**Improvement**:
```typescript
const vnodeId = getVNodeId(vnode);
const prevVNodeId = getVNodeId(prevVNode);
if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // Don't reuse if IDs differ
}
```

**Files**: `fiber-reconciler.ts` (Line 140-151, 228-233, 300-315)

#### 1.3 Remove `isDecoratorVNode` Check

**Current**:
```typescript
const isDecoratorVNode = !!childVNode.decoratorSid;
if (isDecoratorVNode) {
  // Special decorator handling
}
```

**Improvement**: 
- Remove `isDecoratorVNode` check
- Only perform unified ID comparison with `getVNodeId()`

**Files**: `host-finding.ts` (Line 41-43, 53-57, 84-95, 138-144)

#### 1.4 Remove `decoratorSid` Conditions

**Current**:
```typescript
if (!childVNode.decoratorSid) {
  // Only process if not decorator
}
```

**Improvement**:
- Remove condition or change to `getVNodeId()`-based
- Only check structural properties without domain concepts

**Files**: `fiber-tree.ts` (Line 83-88)

### Phase 2: Remove Global Search

#### 2.1 Implement `findHostInParentChildren()` Function

**New Function**: Add to `host-finding.ts`

```typescript
/**
 * Find host element in parent's children only (no global search)
 * React-style: compare only based on children
 */
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
        return getVNodeId(c) === vnodeId;
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // Verify it's a child of current parent
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
  
  // 3. Index-based matching (for cases without sid like mark wrappers)
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

#### 2.2 Remove Global Search in `fiber-reconciler.ts`

**Current** (Line 283-319):
```typescript
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

**Improvement**:
```typescript
// Remove global search
// Replace with findHostInParentChildren or create new immediately
if (!host) {
  host = findHostInParentChildren(parent, vnode, prevVNode, fiber.index);
}
if (!host) {
  host = createHostElement(parent, vnode, fiber.index, deps);
}
```

#### 2.3 Remove Global Search in `host-finding.ts`

**Current** (Line 126-148):
```typescript
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

**Improvement**:
- Remove global search
- Use `findHostInParentChildren` or return null immediately

#### 2.4 Remove Global Search in `host-management.ts`

**Current** (Line 122-136):
```typescript
if (!existingHost && parent.ownerDocument) {
  const allMatches = parent.ownerDocument.querySelectorAll(...);
  // ...
}
```

**Improvement**:
- Remove global search
- Search only in `parent.children`

### Phase 3: Remove `usedDomElements` Tracking

Removing global search makes `usedDomElements` tracking unnecessary.

**To Remove**:
- `fiber-reconciler.ts` (Line 286-296)
- `host-finding.ts` (multiple places)
- `host-management.ts` (multiple places)

### Phase 4: Testing and Verification

1. Verify existing tests pass
2. Performance measurement (before/after removing global search)
3. Edge case tests

## Improvement Order

### Step 1: Unify `getVNodeId()`
1. Verify `getVNodeId()` usage in all files
2. Remove direct use of `vnode.sid || vnode.decoratorSid`

### Step 2: Remove Domain Knowledge (fiber-reconciler.ts)
1. Line 140-151: Remove direct `decoratorSid` references
2. Line 228-233: Remove `decoratorSid` comparison logic
3. Line 300-315: Remove `isDecoratorVNode` check

### Step 3: Remove Domain Knowledge (fiber-tree.ts)
1. Line 67-68: Use `getVNodeId()`
2. Line 83-88: Remove `decoratorSid` condition
3. Line 107-113: Remove direct `decoratorSid` references

### Step 4: Remove Domain Knowledge (host-finding.ts)
1. Line 41-43: Remove `isDecoratorVNode`
2. Line 53-57: Remove `decoratorSid` comparison
3. Line 84-95: Remove `decoratorSid` condition
4. Line 138-144: Remove `decoratorSid` comparison

### Step 5: Implement `findHostInParentChildren()`
1. Add new function to `host-finding.ts`
2. Implement React-style children-based matching

### Step 6: Remove Global Search
1. Remove global search in `fiber-reconciler.ts`
2. Remove global search in `host-finding.ts`
3. Remove global search in `host-management.ts`

### Step 7: Remove `usedDomElements`
1. Remove all `usedDomElements` parameters
2. Remove related tracking logic

### Step 8: Testing and Verification
1. Verify all tests pass
2. Performance measurement
3. Update documentation

## Expected Issues

### 1. Cross-parent Move

**Current**: Reuse via global search

**After Improvement**: Create new

**Solution**: 
- Creating new is correct like React
- VNodeBuilder already created correct structure, so Fiber just follows it

### 2. Mark Wrapper Reuse

**Current**: Global search + complex tracking

**After Improvement**: Match by index + tag + class in `findHostInParentChildren`

**Solution**: 
- Handle in Strategy 3 of `findHostInParentChildren`
- Simpler and more accurate

## Success Criteria

1. ✅ Complete Domain Knowledge Removal
   - No direct `decoratorSid` references
   - No `isDecoratorVNode` checks
   - Only check VNode structure without domain concepts

2. ✅ Complete Global Search Removal
   - No `querySelectorAll` usage
   - Compare only based on children

3. ✅ All Tests Pass
   - All existing tests pass
   - Performance improvement confirmed

4. ✅ Code Simplification
   - `usedDomElements` tracking unnecessary
   - Remove complex fallback logic
