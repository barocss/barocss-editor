# Reconcile Refactor Plan

## Current Issues

1. **Duplicate Finalize**: Both `reconcileChildrenWithKeys` and `work-in-progress-manager` call `finalizeDOMUpdate`
2. **DOM access in Build phase**: `KeyBasedReconciler` directly queries DOM to attempt reuse
3. **DOM manipulation in Process phase**: `updateChildren` calls `reconcileChildrenWithKeys` which immediately executes finalize
4. **Text processing scattered**: `textContent` is set in multiple places

## Correct Phase Separation

### Phase 1: Build (WIP tree creation)
- **Purpose**: Compare only `prevVNode` and `nextVNode` to construct WIP tree
- **Condition**: No DOM access, no DOM manipulation
- **Output**: Complete WIP tree (parent/children linked, `orderIndex` assigned, `toDelete` marked)

### Phase 2: Process (change detection)
- **Purpose**: Compare each WIP's `previousVNode` and `vnode` to set `needsUpdate`
- **Condition**: No DOM access, no DOM manipulation
- **Output**: WIP tree with `needsUpdate` flags set

### Phase 3: Finalize (DOM manipulation)
- **Purpose**: Traverse WIP tree to create/modify/delete actual DOM
- **Condition**: Only point of DOM access/manipulation
- **Input**: Complete WIP tree (children sorted by `orderIndex`)

## Modifications

### 1. KeyBasedReconciler.reconcileChildren
- **Current**: Attempts reuse by querying DOM, calls `processWorkInProgress`
- **Change**: Remove DOM access, only create WIP, assign `orderIndex`

### 2. reconcileChildrenWithKeys
- **Current**: Directly calls `finalizeDOMUpdate`
- **Change**: Only return WIP, remove finalize

### 3. updateChildren
- **Current**: Calls `reconcileChildrenWithKeys` to immediately finalize
- **Change**: Call `reconcileChildrenWithKeys` to only receive WIP, connect it to `wip.children`

### 4. work-in-progress-manager.executeDOMUpdates
- **Current**: Already correct (sorts children by `orderIndex` then finalizes)
- **Verify**: Ensure WIPs created by `reconcileChildrenWithKeys` are included in the tree

## Implementation Order

1. Modify KeyBasedReconciler: remove DOM access, only create WIP
2. Modify reconcileChildrenWithKeys: remove finalize, only return WIP
3. Modify updateChildren: connect returned WIP to `wip.children`
4. Integrate text processing: handle only in finalize phase
