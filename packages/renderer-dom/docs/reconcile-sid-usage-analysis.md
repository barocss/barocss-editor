# Analysis of sid Usage in Reconcile

## Problem Statement

**Question:** `sid` is for editor model, so why is the `sid` concept continuously used in reconcile?

## Current Structure Analysis

### 1. Role of `sid`

#### `sid` in Editor Model
- **Purpose**: Unique identifier for editor model
- **Usage**: 
  - Identify each node in model data structure
  - Stored as `data-bc-sid` attribute on DOM elements
  - Used when finding specific nodes in editor

#### `sid` in Reconcile
- **Purpose**: Similar role to React's `key` prop
- **Usage**:
  1. **prevVNode storage/retrieval**: Use `sid` as key in `prevVNodeTree: Map<string, VNode>`
  2. **DOM element matching**: Find previous DOM element with `sid` in `findHostForChildVNode`
  3. **VNode matching**: Find previous VNode with `sid` in `findPrevChildVNode`

### 2. Current Implementation Issues

#### Issue 1: VNodes without `sid` Cannot Be Tracked

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts
private prevVNodeTree: Map<string, VNode> = new Map()

// Get prevVNode
const prevVNode = this.prevVNodeTree.get(String(sid));

// Store prevVNode
if (sid) {
  this.prevVNodeTree.set(String(sid), cloned);
}
```

**Problem:**
- Cannot store/retrieve in `prevVNodeTree` if `sid` is missing
- VNodes without `sid` like mark wrappers cannot track previous state
- Result: `prevVNode` becomes `undefined`, cannot reuse

#### Issue 2: Only `sid`-Based Matching Used

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts
// Store current VNode snapshot in prevVNodeTree (track by sid unit)
if (deps.prevVNodeTree && vnode.sid) {
  deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
}
```

**Problem:**
- Not stored if `vnode.sid` is missing
- Mark wrappers don't have `sid`, so not stored
- Cannot find `prevVNode` in next render

#### Issue 3: Strategy 1 of `findHostForChildVNode` Depends on `sid`

```typescript
// packages/renderer-dom/src/reconcile/utils/host-finding.ts
const vnodeId = getVNodeId(childVNode); // sid || decoratorSid
if (vnodeId) {
  // Strategy 1: Key-based matching
  // ...
}
```

**Problem:**
- Strategy 1 fails if both `sid` and `decoratorSid` are missing
- Mark wrappers have neither, so only depend on Strategy 2, 3
- Strategy 2 needs `prevChildVNodes`, but if `prevVNode` is missing, `prevChildVNodes` is also empty

### 3. Why Use `sid`?

#### Similarity to React's `key` Prop

In React:
```jsx
{items.map(item => <Item key={item.id} />)}
```

In our system:
```typescript
// Use sid as key if VNode has sid
const prevVNode = prevVNodeTree.get(sid);
```

**Advantages:**
- VNodes with same `sid` always match to same DOM element
- Correct matching even when order changes
- Performance optimization (O(1) lookup)

**Disadvantages:**
- VNodes without `sid` cannot be tracked
- Dynamically generated VNodes like mark wrappers don't have `sid`

### 4. Solutions

#### Solution 1: Improve to Track VNodes Without `sid`

**Current:**
```typescript
// Store only when sid exists
if (deps.prevVNodeTree && vnode.sid) {
  deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
}
```

**Improvement:**
```typescript
// Track based on structure even without sid
if (deps.prevVNodeTree) {
  if (vnode.sid) {
    // Store with sid if sid exists
    deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
  } else {
    // Store with parent sid + index if sid doesn't exist
    const parentSid = fiber.parentFiber?.vnode?.sid;
    if (parentSid) {
      const key = `${parentSid}:${fiber.index}`;
      deps.prevVNodeTree.set(key, cloneVNodeTree(vnode));
    }
  }
}
```

**Issues:**
- Parent's `sid` may also be missing
- Matching fails if index changes

#### Solution 2: Store `prevVNode` as Fiber Tree Structure

**Current:**
```typescript
// Store only by sid unit
prevVNodeTree: Map<string, VNode>
```

**Improvement:**
```typescript
// Store entire VNode tree
prevVNodeTree: VNode | undefined

// Recursively search when retrieving
function findPrevVNode(vnode: VNode, prevVNodeTree: VNode | undefined): VNode | undefined {
  if (!prevVNodeTree) return undefined;
  
  // Match by sid
  if (vnode.sid && prevVNodeTree.sid === vnode.sid) {
    return prevVNodeTree;
  }
  
  // Recursively search in children
  if (prevVNodeTree.children) {
    for (const prevChild of prevVNodeTree.children) {
      if (typeof prevChild === 'object') {
        const found = findPrevVNode(vnode, prevChild);
        if (found) return found;
      }
    }
  }
  
  return undefined;
}
```

**Advantages:**
- Can find based on structure even without `sid`
- Maintains entire tree structure

**Disadvantages:**
- Performance degradation (recursive search)
- Increased complexity

#### Solution 3: Get `prevVNode` Directly from `fiber.prevVNode` (Improve Current Approach)

**Current:**
```typescript
// In reconcileFiberNode
const prevVNode = fiber.prevVNode; // Set in createFiberTree
const prevChildVNodes: (VNode | string | number)[] = prevVNode?.children || [];
```

**Problem:**
- `prevChildVNodes` is empty if `fiber.prevVNode` is `undefined`
- `prevVNode` is `undefined` if `createFiberTree` cannot find `prevChildVNode`

**Improvement:**
- Improve `prevChildVNode` finding logic in `createFiberTree` (already completed)
- Improve Strategy 3 of `findHostForChildVNode` (already completed)

#### Solution 4: Separate `sid` for Reconcile-Only Use

**Concept:**
- `sid`: Editor model identifier (immutable)
- `reconcileKey`: Reconcile-only identifier (can be dynamically generated)

**Implementation:**
```typescript
interface VNode {
  sid?: string; // Editor model identifier
  reconcileKey?: string; // Reconcile-only identifier
}

// Generate reconcileKey
function generateReconcileKey(vnode: VNode, parentKey?: string, index?: number): string {
  if (vnode.sid) return vnode.sid;
  if (vnode.decoratorSid) return `decorator:${vnode.decoratorSid}`;
  if (parentKey && index !== undefined) return `${parentKey}:${index}`;
  return `anonymous:${vnode.tag}:${index}`;
}
```

**Advantages:**
- Separates `sid` and reconcile identifier
- Can assign reconcile identifier to all VNodes

**Disadvantages:**
- Requires structure changes
- Increased complexity

## Recommended Solutions

### Short-term Solution (Currently in Progress)

1. **Improve `prevChildVNode` Finding in `createFiberTree`** ✅
   - Attempt matching by tag and class
   - Enable finding even when index matching fails

2. **Traverse All Child Elements in `findChildHost`** ✅
   - Traverse all if not found at `childIndex` position
   - Find mark wrapper by class matching

3. **Reuse Existing Text Nodes in `handlePrimitiveTextChild`** ✅
   - Check all text nodes if not at `childIndex` position

### Long-term Solution

1. **Improve `prevVNodeTree` Structure**
   - Enable tracking VNodes without `sid`
   - Store as tree structure maintaining parent-child relationships

2. **Introduce `reconcileKey` Concept**
   - Reconcile-only identifier separate from `sid`
   - Can be assigned to all VNodes

## Conclusion

**Current Problem:**
- `sid` is editor model identifier but also used like `key` in reconcile
- VNodes without `sid` (mark wrappers, etc.) cannot be tracked
- `prevVNodeTree` is `sid`-based, so cannot store/retrieve if `sid` is missing

**Solution Direction:**
1. Short-term: Match based on structure even without `sid` (in progress)
2. Long-term: Separate `sid` and reconcile identifier, or store `prevVNode` as entire tree structure

**Core Insight:**
- `sid` is editor model identifier but used like React's `key` in reconcile
- VNodes without `sid` must be tracked differently
- Currently supplementing with structure-based matching (tag, class, index)

## Actual Problem Discovery

Log analysis results:
- At `prevVNode storage` time: mark wrapper included in `rootVNodeChildren` ✅
- mark wrapper also included in `clonedChildren` ✅
- But in `createFiberTree`: `prevVNodeExists: false` ❌

**Core Problem:**
- When `createFiberTree` creates mark wrapper Fiber, should use parent VNode (`text-1`)'s `prevVNode`
- But `prevVNode` is passed as `undefined`
- This means `prevVNode` passed to `reconcileWithFiber` is `undefined`, or `createFiberTree` cannot correctly use `prevVNode.children`

**Needs Verification:**
1. Does `reconciler.reconcile` correctly get `prevVNode`?
2. Is `prevVNode` correctly passed to `reconcileWithFiber`?
3. Does `prevVNode.children` have mark wrapper in `createFiberTree`?
