# mountComponent Re-call Issue Analysis

## Problem Situation

`should rebuild only when nextVNode is missing or empty` test in `reconciler-component-state-integration.test.ts` fails.

### Test Scenario
1. First render: Mount `p-1` (paragraph) and `text-1` (inline-text) components
2. Second render: Re-render with same model
3. Expected: `mountComponent` should not be called (already mounted component)
4. Actual: `mountComponent` called 3 times

## Cause Analysis

### 1. sid Auto-Generation (Resolved)
- **Problem**: `findHostForChildVNode` fails to match when `stype` exists but `sid` is missing
- **Solution**: Auto-generate `sid` with `componentManager.generateComponentId` when `stype` exists in VNodeBuilder
- **Status**: ✅ Completed

### 2. findHostForChildVNode Cannot Find Host (In Progress)

`findHostForChildVNode` tries the following strategies in order:

#### Strategy 1: Find in prevVNode.children
- Find `prevChildVNode` by matching `sid` in `prevChildVNodes`
- Use `prevChildVNode.meta.domElement`
- **Problem**: `meta.domElement` in `prevVNode.children` may not be properly stored

#### Strategy 2: findChildHost (Find in parent.children)
- Find by `data-bc-sid` in `parent.children`
- **Problem**: `parent` may be incorrect (Fiber's parent may not be updated)

#### Strategy 3: Global Search (querySelector)
- Global search with `parent.ownerDocument.querySelector`
- **Problem**: May not find even when element exists in DOM

### 3. Search Inside createHostElement Also Fails

Global search is attempted inside `createHostElement` but fails:
- Find in `parent.children`
- Global search (`querySelector`)
- **Problem**: Found `existingHost` but `getComponentInstance` doesn't return instance, so `mountComponent` called

### 4. prevVNode Storage Timing Issue (Suspected)

`prevVNode` is stored in `onComplete` callback:
- In sync mode, `onComplete` called after all Fiber work completes
- At this point, all child nodes' `meta.domElement` should be set
- **Problem**: `cloneVNodeTree` includes child nodes' `meta.domElement`, but may not actually exist

## Core Problems

### Problem 1: findHostForChildVNode Cannot Find Host

`findHostForChildVNode` tries 3 strategies but all fail:

1. **Strategy 1 (prevVNode.children)**: `prevChildVNode.meta.domElement` missing
2. **Strategy 2 (findChildHost)**: Cannot find in `parent.children`
3. **Strategy 3 (Global Search)**: Cannot find with `querySelector`

### Problem 2: Search Inside createHostElement Also Fails

Global search is attempted inside `createHostElement` but fails:
- Find in `parent.children` fails
- Global search (`querySelector`) fails
- Result: `existingHost` becomes `null`, new host created → `mountComponent` called

### Problem 3: Missing meta.domElement in prevVNode.children

Possible causes:
- Child nodes' `meta.domElement` not yet set at `onComplete` time
- `cloneVNodeTree` doesn't copy child nodes' `meta.domElement`
- Child nodes' `meta.domElement` missing when `prevVNode` stored

## Solutions

### Solution 1: Verify prevVNode Storage Timing
- Verify all child Fibers' `meta.domElement` are set when `onComplete` callback is called
- Verify `cloneVNodeTree` properly copies child nodes' `meta.domElement`

### Solution 2: Debug findHostForChildVNode
- Verify why global search fails:
  - Is `vnode.sid` correct?
  - Does element actually exist in DOM?
  - Is `parent.ownerDocument` correct?
- Add logs to verify failure reason for each strategy

### Solution 3: Improve createHostElement
- Verify why `getComponentInstance` doesn't return instance when `existingHost` found
- Reuse `existingHost` unconditionally if already in DOM (already implemented, but not working)

## Code Analysis Results

### VNode Reference Structure
- `createFiberTree` uses `childVNode` directly to create child Fibers
- `reconcileFiberNode` sets `vnode.meta.domElement = host;`
- `rootVNode.children` references original VNode, so when child Fiber's `vnode.meta.domElement` is set, `rootVNode.children` also reflects it
- Therefore, all child nodes' `meta.domElement` should be set when `cloneVNodeTree` is called

### Possible Causes
1. **prevVNode Passing Issue**: `prevVNode.children` not properly passed in `reconcileFiberNode`
2. **parent Issue**: `parent` in `findHostForChildVNode` incorrect (Fiber's parent may not be updated)
3. **Global Search Failure**: `querySelector` actually cannot find element in DOM (timing issue or DOM structure issue)

## Debugging Results

### Verified Facts
1. **`prevVNode` properly passed in second render**:
   - `p-1`: `prevVNodeExists: true, prevChildVNodesWithMeta: 1`
   - `text-1`: `prevVNodeExists: true, prevChildVNodesCount: 0` (normal, no children)

2. **`findHostForChildVNode` cannot find in `prevChildVNodes`**:
   - For `p-1`: `prevChildVNodesWithMeta: 1` but `findHostForChildVNode` cannot find host
   - For `text-1`: `prevVNodeExists: true` but `prevChildVNodesCount: 0` (parent's `prevVNode.children` is empty)

3. **Global Search Also Fails**:
   - `foundElements: []` - `querySelector` cannot find even when element exists in DOM

### Core Problem
- `p-1`'s `prevVNode.children` includes `text-1`'s `prevVNode`, but `findHostForChildVNode` cannot find it
- Global search also cannot find DOM element (timing issue or DOM structure issue)

## Latest Debugging Results

### Resolved Parts
1. **Added Logic to Find Host from prevVNode Itself**: Find host if `prevVNode.sid === vnode.sid` and `prevVNode.meta.domElement` exists
2. **Log Verification**: Logs "Found host from prevVNode itself" and "Update existing host" appear

### Remaining Issues
1. **`mountComponent` Called Inside `updateComponent`**: 
   - When `updateComponent` is called, calls `mountComponent` if `instance.mounted` is false or `instance.element` is missing
   - `mountComponent` called in first render, but `instance.mounted` or `instance.element` may not be properly set

## Resolution Completed ✅

### Final Solution
1. **Find Host from prevVNode Itself**: Find host if `prevVNode.sid === vnode.sid` and `prevVNode.meta.domElement` exists
2. **Use prevVNode as prevChildVNode**: If not found in `prevChildVNodes`, use `prevVNode` itself as `prevChildVNode` if it matches current vnode
3. **Generate Auto sid with `stype` and `index` Combined**: Auto-generated `sid` is created in `stype-index` format, so components with same `stype` and `index` share same `instance`

### Changes
- Added `index` option to `generateComponentId`: Generate consistent ID in `stype-index` format
- Use `fiber.index` when generating auto `sid` in `reconcileFiberNode`
- Use `childIndex` when generating auto `sid` in `updateHostElement`
- Modified `reconcileFiberNode` to use `prevVNode` as `prevChildVNode`

### Test Results
✅ `should rebuild only when nextVNode is missing or empty` test passes
