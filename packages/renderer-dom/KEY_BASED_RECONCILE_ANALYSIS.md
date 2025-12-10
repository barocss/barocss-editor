# Key-based Children Reconcile Algorithm Analysis

## Current Implementation Overview

The current `ChildrenReconciler` in the `@barocss/reconcile` package uses the following algorithm:

### 1. Build Phase: Children Matching and WIP Creation

#### 1.1 Key-based Matching (Keyed Children)

```typescript
// ChildrenReconciler.reconcileChildren() (line 49-55)
if (nextChild.key) {
  // Keyed match: find by key
  const idx = prevChildren.findIndex(pc => 
    pc && 
    pc.key === nextChild.key && 
    !matchedPrevIndices.has(prevChildren.indexOf(pc))
  );
  if (idx >= 0) {
    prevMatch = prevChildren[idx];
    prevMatchIndex = idx;
  }
}
```

**How it works:**
- Iterates through `nextChildren` and finds matches in `prevChildren` using each `nextChild`'s `key`
- Matched `prevChild` is added to `matchedPrevIndices` to prevent duplicate matching
- On successful match, sets `prevMatch` and creates WIP

**Features:**
- Simple `findIndex()`-based search
- Matches by key regardless of order
- O(n*m) time complexity (n: nextChildren.length, m: prevChildren.length)

#### 1.2 WIP Creation and Index Setting

```typescript
// line 237-240
const childWIP = options.createWIP(nextChild as VNode, parentWip, prevMatch);
childWIP.desiredIndex = i;  // index in nextChildren
childWIP.orderIndex = i;    // same value
childWIP.parent = parentWip;
```

**Problems:**
- `desiredIndex` and `orderIndex` are set to the same value (`i`)
- Only records order in `nextChildren`, regardless of actual DOM position
- Even when matching with nodes in different order via key-based matching, `desiredIndex` follows new order

### 2. Execute Phase: Order Sorting and Finalize

#### 2.1 Children Sorting

```typescript
// WorkInProgressManager.executeUpdates() (line 346-349)
for (const [parent, children] of byParent.entries()) {
  const ordered = children
    .filter(c => !c.toDelete)
    .sort((a, b) => 
      (a.desiredIndex ?? a.orderIndex ?? 0) - 
      (b.desiredIndex ?? b.orderIndex ?? 0)
    );
  
  for (const child of ordered) {
    if (child.targetNode !== undefined) {
      finalize(child, context);
    }
  }
}
```

**How it works:**
- Sorts each parent's children by `desiredIndex` (or `orderIndex`)
- Calls `finalize()` in sorted order

**Problems:**
- Sorts but does not compare with actual current position in DOM
- Does not consider actual position of nodes already in DOM

### 3. Finalize Phase: DOM Updates

#### 3.1 Finding Previous Sibling

```typescript
// dom-operations.ts finalizeDOMUpdate() (line 744-812)
let prevSiblingDom: Node | null | undefined;
if (!prevSiblingDom && wip.parent && 'children' in wip.parent) {
  const parentChildren = (wip.parent as any).children as any[];
  const currentIndex = wip.desiredIndex ?? wip.orderIndex ?? -1;
  
  // Sort siblings by desiredIndex/orderIndex
  const sortedSiblings = parentChildren
    .filter((s: any) => s.domNode && !(s as any)?.toDelete)
    .sort((a: any, b: any) => {
      const aIndex = a.desiredIndex ?? a.orderIndex ?? -1;
      const bIndex = b.desiredIndex ?? b.orderIndex ?? -1;
      return aIndex - bIndex;
    });
  
  // Find the sibling that should be before current node
  let lastPrevSibling: any = null;
  for (let i = 0; i < sortedSiblings.length; i++) {
    const sibling = sortedSiblings[i];
    const siblingIndex = sibling.desiredIndex ?? sibling.orderIndex ?? -1;
    if (siblingIndex < currentIndex) {
      lastPrevSibling = sibling;
    } else {
      break;
    }
  }
  
  if (lastPrevSibling?.domNode) {
    prevSiblingDom = lastPrevSibling.domNode as Node;
  }
}
```

**How it works:**
- Finds already-finalized siblings in `wip.parent.children`
- Sorts by `desiredIndex`/`orderIndex` to find last sibling smaller than `currentIndex`
- Uses that sibling's `domNode.nextSibling` as `ref`

**Problems:**
- Does not guarantee order of already-finalized siblings
- `sortedSiblings` sorts WIP objects but may differ from actual DOM order
- `prevSiblingDom` may be found when other siblings have already been inserted/moved in DOM

#### 3.2 DOM Insertion/Reordering

```typescript
// dom-operations.ts finalizeDOMUpdate() (line 871-928)
const ref = prevSiblingDom ? (prevSiblingDom.nextSibling) : parent.firstChild;

if (ref) {
  if (wip.domNode === ref) {
    // Skip if ref is self
  } else if (wip.domNode.parentNode !== parent) {
    // Insert if not in parent
    parent.insertBefore(wip.domNode, ref);
  } else if (wip.domNode.parentNode === parent) {
    // Reorder if in wrong position
    const currentNextSibling = wip.domNode.nextSibling;
    if (currentNextSibling !== ref) {
      parent.insertBefore(wip.domNode, ref);
    }
  }
}
```

**How it works:**
- Uses `prevSiblingDom.nextSibling` as `ref`
- Inserts if `wip.domNode` is not in `parent`, otherwise reorders

**Problems:**
- `ref` calculation may reference already-changed DOM state
- When `insertBefore(wip.domNode, ref)` executes, `ref` may have already moved
- Mismatch between DOM state and WIP state

## Core Issues

### 1. Limitations of Sequential Finalize

Current algorithm:
1. Build Phase: create all WIPs (order-independent)
2. Execute Phase: sort by `desiredIndex`
3. Call `finalize()` sequentially in sorted order

**Problem:**
- When finalizing in A → B → C order:
  - Finalizing A adds A to DOM
  - When finalizing B, `prevSiblingDom` finds A, and since A is already in DOM, works correctly
  - Same for C

**But when order changes:**
- Original: Item1(0), Item2(1), Item3(2)
- Changed: Item3(0), Item2(1), Item1(2)
- Finalize Item3(desiredIndex: 0) → add Item3 to DOM
- Finalize Item2(desiredIndex: 1) → when finding `prevSiblingDom`, only Item3 has `desiredIndex < 1` among already-finalized siblings
- But Item3's `domNode` is already in DOM, and `prevSiblingDom.nextSibling` may not be the correct position

### 2. Mismatch Between Key-based Matching and Order Guarantee

**Current logic:**
- Match by key → match regardless of order
- `desiredIndex` is order in `nextChildren` (new order)
- `prevMatch` is order in `prevChildren` (existing order)

**Problem:**
- Matched `prevMatch`'s DOM node is at existing position
- But `desiredIndex` follows new order
- Must move from existing position to new position when reordering DOM

### 3. Reliability Issue in PrevSiblingDom Calculation

**Current logic:**
```typescript
const sortedSiblings = parentChildren
  .filter((s: any) => s.domNode && !(s as any)?.toDelete)
  .sort((a: any, b: any) => {
    const aIndex = a.desiredIndex ?? a.orderIndex ?? -1;
    const bIndex = b.desiredIndex ?? b.orderIndex ?? -1;
    return aIndex - bIndex;
  });
```

**Problem:**
- `parentChildren` is array of WIP objects (still finalizing)
- `sortedSiblings` is sorted by `desiredIndex` but may differ from actual DOM order
- `lastPrevSibling.domNode` is already in DOM but its position is not guaranteed to be correct

## Improvement Directions

### Option 1: Calculate Insert Position Based on Actual DOM Order

Instead of WIP-based sorting, calculate position in actual DOM:

```typescript
// Pseudocode
function findInsertPosition(wip, parent) {
  const desiredIndex = wip.desiredIndex;
  
  // Find desiredIndex position in actual DOM
  const parentDom = parent.domNode;
  const children = Array.from(parentDom.children);
  
  // Among siblings with desiredIndex smaller than current
  // find the one that is last in actual DOM
  let ref = null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    // Find WIP corresponding to child
    const childWip = findWipByDomNode(child);
    if (childWip && childWip.desiredIndex < desiredIndex) {
      // Insert after this child
      ref = child.nextSibling;
    } else if (childWip && childWip.desiredIndex >= desiredIndex) {
      // Must insert before this child
      ref = child;
      break;
    }
  }
  
  return ref || parentDom.firstChild;
}
```

### Option 2: Detect and Optimize Order Changes Based on Diff

Like React's diff algorithm, only reorder nodes that actually need to move:

```typescript
// Pseudocode
function calculateMoves(prevChildren, nextChildren) {
  // Key → prevIndex mapping
  const keyToPrevIndex = new Map();
  prevChildren.forEach((child, i) => {
    if (child.key) {
      keyToPrevIndex.set(child.key, i);
    }
  });
  
  // Find nodes that actually need to move in nextChildren order
  const moves = [];
  let lastIndex = 0;
  
  for (let i = 0; i < nextChildren.length; i++) {
    const nextChild = nextChildren[i];
    if (!nextChild.key) continue;
    
    const prevIndex = keyToPrevIndex.get(nextChild.key);
    if (prevIndex === undefined) {
      // New node
      continue;
    }
    
    if (prevIndex < lastIndex) {
      // Needs to move (move left)
      moves.push({
        key: nextChild.key,
        from: prevIndex,
        to: i
      });
    }
    
    lastIndex = Math.max(lastIndex, prevIndex);
  }
  
  return moves;
}
```

### Option 3: Batch Reordering

Reorder all children at once:

```typescript
// Pseudocode
function finalizeChildrenInOrder(parent, children) {
  // 1. Sort all children by desiredIndex
  const ordered = children
    .filter(c => !c.toDelete)
    .sort((a, b) => (a.desiredIndex ?? 0) - (b.desiredIndex ?? 0));
  
  // 2. Compare with actual DOM order
  const parentDom = parent.domNode;
  const domChildren = Array.from(parentDom.children);
  
  // 3. Reorder all at once if order differs
  const needsReorder = ordered.some((wip, i) => {
    const domChild = domChildren[i];
    return domChild !== wip.domNode;
  });
  
  if (needsReorder) {
    // Add to DocumentFragment in order
    const fragment = document.createDocumentFragment();
    for (const wip of ordered) {
      if (wip.domNode && wip.domNode.parentNode === parentDom) {
        fragment.appendChild(wip.domNode);
      }
    }
    parentDom.appendChild(fragment);
  }
}
```

## Conclusion

Core issues with current algorithm:
1. **Mismatch** between **sequential finalize** and **DOM state changes**
2. **Mismatch** between **WIP-based sorting** and **actual DOM order**
3. **Separation** between **key-based matching** and **order guarantee**

For improvement:
- Calculate insert position by referencing actual DOM order
- Or consider batch approach that reorders all children at once
- Or reorder only when actual movement is needed, like React's diff algorithm

Next step: propose implementing **Option 1 (based on actual DOM order)**.
