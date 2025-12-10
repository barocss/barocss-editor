# Decorator Removal Text Splitting Issue Analysis

## Problem Situation

### Test Case: "Add decorator → Remove → Add again"

**Step 3: Expected result after decorator removal**
```
Expected: "<div><p class="paragraph" data-bc-sid="p-1"><span class="text" data-bc-sid="text-1">Hello World</span></p></div>"
```

**Actual Result**
```
Received: "<div><p class="paragraph" data-bc-sid="p-1"><span class="text" data-bc-sid="text-1">Hello World<span>Hello</span><span>World</span></span></p></div>"
```

### Issues
- Decorator removed, but split text elements (`<span>Hello</span><span>World</span>) created by decorator remain in DOM
- Text node "Hello World" and split elements coexist

## Analysis Perspective

### 1. Observation from Reconcile Perspective

**Core Question**: From Reconcile's perspective, is it just that VNode changed?

- **Yes**: Reconcile receives VNode tree created by VNodeBuilder, compares with DOM, and updates
- **Possible Issues**: 
  1. VNodeBuilder may not create correct VNode when decorator removed
  2. Reconcile may not remove split text elements created by decorator

### 2. Possible Causes

#### Cause 1: VNodeBuilder Issue
- VNodeBuilder still creates split text structure when decorator removed
- Example: Creates in form `[{ tag: 'span', text: 'Hello' }, { tag: 'span', text: 'World' }]`
- Reconcile processes this VNode as-is, so split elements remain

#### Cause 2: Reconcile Processing Issue
- VNodeBuilder creates correct VNode, but Reconcile cannot remove DOM elements previously created by decorator
- Example: `removeStaleDecorators` only removes decorator elements, doesn't remove split text elements created by decorator

#### Cause 3: Test Case Issue
- Test may have incorrect expected result
- Actually, leaving split text when decorator removed may be normal behavior

## Investigation Needed

### 1. Verify VNodeBuilder Behavior
- When decorator exists: What VNode structure does it create?
- When decorator removed: What VNode structure does it create?
- When decorator added again: What VNode structure does it create?

### 2. Verify Reconcile Processing
- When Decorator VNode included in children: How is it processed?
- When decorator removed: How are DOM elements previously created by decorator processed?
- `removeStaleDecorators` function: What elements does it remove?

### 3. Verify DOM Structure
- DOM structure when decorator exists
- Expected DOM structure when decorator removed
- Differences with actual DOM structure

## Next Steps

1. **Check VNodeBuilder Logs**: Verify what VNode is created when decorator removed
2. **Check Reconcile Logs**: Verify how generated VNode is processed
3. **Compare DOM Structures**: Analyze differences between expected and actual DOM
4. **Identify Cause**: Determine if VNodeBuilder issue, Reconcile issue, or test issue

## Actual Investigation Results

### Core Question: From Reconcile's perspective, is it just that VNode changed?

**Answer**: Yes. Reconcile receives VNode tree created by VNodeBuilder, compares with DOM, and updates.

### Possible Scenarios

#### Scenario 1: VNodeBuilder Doesn't Create Correct VNode When Decorator Removed
- When decorator exists: `children: [decoratorVNode, splitTextVNode1, splitTextVNode2, ...]`
- When decorator removed: VNodeBuilder still creates split text structure
  - Example: `children: [{ tag: 'span', text: 'Hello' }, { tag: 'span', text: 'World' }]`
- Reconcile processes this VNode as-is, so split elements remain in DOM

#### Scenario 2: VNodeBuilder Creates Correct VNode But Reconcile Cannot Remove Previous DOM
- When decorator removed: VNodeBuilder creates `{ tag: 'span', text: 'Hello World', children: [] }`
- But DOM elements previously created by decorator (`<span>Hello</span><span>World</span>`) remain
- `removeStaleDecorators` only removes elements with `data-decorator-sid`, doesn't remove split text elements created by decorator

#### Scenario 3: Test Case Issue
- Test may have incorrect expected result
- Actually, leaving split text when decorator removed may be normal behavior

### Current `removeStaleDecorators` Behavior

```typescript
export function removeStaleDecorators(
  fiber: FiberNode,
  deps: FiberReconcileDependencies
): void {
  // Collect decoratorSid from current children
  const expectedDecoratorSids = new Set<string>();
  if (vnode.children) {
    for (const child of vnode.children) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        if (childVNode.decoratorSid) {
          expectedDecoratorSids.add(childVNode.decoratorSid);
        }
      }
    }
  }
  
  // Find and remove decorator elements from DOM
  const decoratorElements = Array.from(host.children).filter(
    (el): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const decoratorSid = el.getAttribute('data-decorator-sid');
      return !!decoratorSid;
    }
  );
  
  for (const decoratorEl of decoratorElements) {
    const decoratorSid = decoratorEl.getAttribute('data-decorator-sid');
    if (decoratorSid && !expectedDecoratorSids.has(decoratorSid)) {
      // Remove decorators no longer in children
      try {
        host.removeChild(decoratorEl);
      } catch {
        // May already be removed
      }
    }
  }
}
```

**Issues**: 
- `removeStaleDecorators` only removes elements with `data-decorator-sid`
- Split text elements (`<span>Hello</span>`, `<span>World</span>`) created by decorator don't have `data-decorator-sid`, so not removed
- These elements were created when decorator split text, but are not decorator VNode itself

### Solutions

1. **Verify VNodeBuilder**: Verify what VNode VNodeBuilder creates when decorator removed
   - If creates split text structure, need to fix VNodeBuilder
   - If creates simple text, Reconcile issue

2. **Improve Reconcile**: Remove split text elements created by decorator when decorator removed
   - Extend `removeStaleDecorators` to remove elements estimated to be created by decorator even without `data-decorator-sid`
   - Or ensure VNodeBuilder creates correct VNode when decorator removed

3. **Verify Tests**: Verify if test case is correct

## Core Insights

### Reconcile's Perspective
- **Reconcile only processes VNodeBuilder's output**
- If VNodeBuilder creates split text structure when decorator removed, Reconcile reflects it to DOM as-is
- If VNodeBuilder creates simple text, Reconcile reflects it to DOM, but DOM elements previously created by decorator are not automatically removed

### Nature of Problem
**DOM elements (`<span>Hello</span>`, `<span>World</span>`) created when decorator split text:**
1. Not decorator VNode itself (so no `data-decorator-sid`)
2. If VNodeBuilder creates simple text VNode when decorator removed, these elements don't exist in VNode
3. Reconcile doesn't automatically remove elements not in VNode (similar to React's key-based matching)
4. `removeStaleDecorators` only removes elements with `data-decorator-sid`, so these elements are not removed

### Solutions
1. **Fix VNodeBuilder**: Ensure VNodeBuilder doesn't create split text structure when decorator removed
2. **Improve Reconcile**: Add logic to remove split text elements created by decorator when decorator removed
3. **Hybrid Approach**: Ensure VNodeBuilder creates correct VNode, and Reconcile also removes stale elements as safety measure

## VNodeBuilder Behavior Analysis

### `_processDecoratorsForChildren` Logic

```typescript
private _processDecoratorsForChildren(
  vnode: VNode,
  data: ModelData,
  decorators: Decorator[]
): void {
  // 1. Remove existing decorator nodes
  const originalChildren = vnode.children.filter((child: any) => {
    if (isVNode(child)) {
      return !isDecoratorNode(child);
    }
    return true;
  });

  // 2. Process decorators for each child
  for (const child of originalChildren) {
    // ... decorator processing logic
  }
}
```

**Important Points**:
- `_processDecoratorsForChildren` only removes **decorator nodes**
- Split text VNodes created when decorator split text are included in `originalChildren`
- When decorator removed, these split text VNodes may remain

### Text Splitting Timing

Text splitting occurs in `_processDataTemplateChild`:

```typescript
if ((marks && marks.length > 0) || inlineDecorators.length > 0) {
  flushTextParts();
  const nodes = this._buildMarkedRunsWithDecorators(resolved, textMarks, inlineDecorators, data);
  this._flushAndAddVNodes(flushTextParts, nodes, orderedChildren);
}
```

**Core**: 
- When decorator exists, `_buildMarkedRunsWithDecorators` splits text and creates multiple VNodes
- These split VNodes are added to `orderedChildren`
- When decorator removed, `_processDecoratorsForChildren` only removes decorator nodes, split text VNodes remain

### Expected Problem

**Scenario**: When decorator removed
1. VNodeBuilder rebuilds text without decorator
2. In `_processDataTemplateChild`, `inlineDecorators.length === 0` so doesn't split and executes `currentTextParts.push(resolved)`
3. But split text VNodes previously created by decorator may remain in `originalChildren`
4. `_processDecoratorsForChildren` only removes decorator nodes, so split text VNodes remain

**Conclusion**: 
- High possibility VNodeBuilder doesn't create correct VNode when decorator removed
- Split text VNodes remain in `originalChildren`, so split structure maintained even after decorator removal

## Core Question Re-analysis

### Is VNode Properly Created in VNodeBuilder?

**Answer**: Need to verify. Must verify if VNodeBuilder creates correct VNode when decorator removed.

### Reconcile/Fiber Perspective

- **Reconcile only processes VNodeBuilder's output**
- If VNodeBuilder creates correct VNode, Reconcile/Fiber reflects it to DOM as-is
- If VNodeBuilder creates incorrect VNode, Reconcile/Fiber also creates incorrect DOM

### Why Not Removed in VNodeBuilder?

**Hypothesis 1: `_processDecoratorsForChildren` Doesn't Remove Split Text VNodes**
- `_processDecoratorsForChildren` only filters decorator nodes
- Split text VNodes are not decorator nodes, so remain in `originalChildren`
- `_processInlineDecorators` is called, but if split text VNodes already exist in `originalChildren`, may not rebuild

**Hypothesis 2: `_processInlineDecorators` Doesn't Re-merge Split Text**
- `_processInlineDecorators` processes inline decorators
- But when decorator removed, may not re-merge already split text VNodes

**Hypothesis 3: VNodeBuilder Doesn't Rebuild Entirely**
- VNodeBuilder reuses existing children in `_processDecoratorsForChildren`
- When decorator removed, may reuse children with split text VNodes as-is

## `_processInlineDecorators` Behavior Analysis

### Core Problem Discovered

Looking at `_processDecoratorsForChildren` logic:

```typescript
for (const child of originalChildren) {
  if (isVNode(child)) {
    const childVNode = child as VNode;
    // Only process component VNodes (those with stype)
    if (!childVNode.stype) {
      // Non-component nodes (text, etc.) are added as-is
      newChildren.push(child);
      continue;
    }
    // ...
    // Process inline decorators and recursively process children
    this._processInlineDecorators(childVNode, nodeDecorators, String(childSid), data);
  }
}
```

**Issues**:
- When `!childVNode.stype` (split text VNodes, etc.), added as-is with `newChildren.push(child)`
- `_processInlineDecorators` only called for VNodes with `stype`
- **Split text VNodes don't have `stype`, so remain as-is when decorator removed**

### When is `_processInlineDecorators` Called?

1. Called from `_processDecoratorsForChildren` for child VNodes with `stype`
2. Also called from `_processDecorators` for VNodes with `stype`

**But**: Split text VNodes don't have `stype`, so `_processInlineDecorators` is not called!

### Actual Problem

**Scenario**: When decorator removed
1. `_processDecoratorsForChildren` called
2. Decorator nodes filtered and removed
3. But split text VNodes (`{ tag: 'span', text: 'Hello' }`, `{ tag: 'span', text: 'World' }`) don't have `stype`, so:
   - Caught by `!childVNode.stype` condition, added as-is with `newChildren.push(child)`
   - `_processInlineDecorators` not called
4. Result: Split text VNodes remain as-is

**Conclusion**: 
- **VNodeBuilder doesn't create correct VNode when decorator removed**
- Split text VNodes don't have `stype`, so `_processInlineDecorators` not called
- Therefore, split text VNodes remain as-is even when decorator removed

## Final Cause Analysis

### Core Problem

**VNodeBuilder doesn't rebuild entirely when decorator removed**

1. **`_processDecoratorsForChildren` Behavior**:
   - Only filters and removes decorator nodes
   - Reuses existing children (`originalChildren`)
   - Adds VNodes without `stype` (split text VNodes, etc.) as-is

2. **Split Text VNode Characteristics**:
   - Don't have `stype` (not component VNodes)
   - VNodes created when decorator split text
   - Form: `{ tag: 'span', text: 'Hello' }`

3. **`_processInlineDecorators` Limitations**:
   - Only called for VNodes with `stype`
   - Actually does nothing (comment: "Inline decorators are handled by _buildMarkedRunsWithDecorators")
   - Split text VNodes not processed

### Why Not Removed?

**Answer**: Because VNodeBuilder doesn't rebuild entirely when decorator removed, reuses existing children.

**Flow**:
1. When decorator exists: `_buildMarkedRunsWithDecorators` splits text and creates multiple VNodes
2. When decorator removed:
   - `_processDecoratorsForChildren` called
   - Only filters and removes decorator nodes
   - Split text VNodes don't have `stype`, so added as-is to `newChildren`
   - `_processInlineDecorators` not called
3. Result: Split text VNodes remain as-is

### Solutions

1. **Fix VNodeBuilder**: Rebuild entirely when decorator removed
   - Detect and re-merge split text VNodes in `_processDecoratorsForChildren`
   - Or rebuild children of that VNode when decorator removed

2. **Improve Reconcile**: Prepare for cases where VNodeBuilder doesn't create correct VNode
   - Add logic to remove split text elements when decorator removed
   - But this is not fundamental solution (VNodeBuilder should create correct VNode)

**Recommended Solution**: Fix VNodeBuilder
- Add logic to detect and re-merge split text VNodes when decorator removed
- Or rebuild children of that VNode when decorator removed

## Core Principle Re-confirmation

### VNodeBuilder Must Create VNode Unidirectionally

**User Feedback**: "vnodebuilder builder should create vnode unidirectionally, so there's no need to reuse decorators"

**Answer**: Correct!

### Current Problem

`_processDecoratorsForChildren` reuses existing children:

```typescript
const originalChildren = vnode.children.filter((child: any) => {
  if (isVNode(child)) {
    return !isDecoratorNode(child);
  }
  return true;
});
```

**Issues**:
- Reuses existing `vnode.children`
- Only filters decorator nodes, leaves split text VNodes as-is
- This is **bidirectional update** approach (modifies existing VNode)

### Correct Approach

**VNodeBuilder must always build VNode from scratch based on model and decorators**

1. **Unidirectional Flow**: Model + Decorators → VNode
2. **No Reuse**: Don't reuse or modify existing VNodes
3. **Always Build from Scratch**: Rebuild entirely when decorator changes

### Solutions

**Remove or Modify `_processDecoratorsForChildren`**:
- Don't reuse existing children, build from scratch based on model and decorators
- Or correct VNode must already be built before `_processDecoratorsForChildren` is called

**Core**: VNodeBuilder's `build()` method must always receive model and decorators and build VNode from scratch. There should be no logic to reuse or modify existing VNodes.
