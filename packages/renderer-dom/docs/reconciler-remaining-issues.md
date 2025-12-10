# Reconciler Remaining Issues Summary

## Current State

### Completed Fixes
1. ✅ VNode Builder: Prevent collapse when processing `data('text')`
2. ✅ Reconciler: Process text-only VNode as text node directly

### Remaining Issues

## Issue 1: Processing text VNode in Mark VNode's children

### Symptoms
- text-only VNode in Mark VNode's children not rendered to DOM
- Example: `<strong class="mark-bold">Bold</strong>` becomes `<strong class="mark-bold"></strong>`

### Cause Analysis
1. **VNode Structure** (normal):
   ```typescript
   {
     tag: 'strong',
     attrs: { className: 'mark-bold' },
     children: [
       {
         text: 'Bold',  // text-only VNode
         children: []
       }
     ]
   }
   ```

2. **Recursive Call Issue**:
   - When processing mark VNode in `reconcileVNodeChildren`, recursive call `this.reconcileVNodeChildren(host, prevChildVNode, childVNode, context)` executed
   - Logic to check text-only VNode exists inside recursive call, but logic to find existing text node is complex and doesn't work properly

3. **Issue with Existing Text Node Finding Logic**:
   - Current logic counts text-only VNodes up to previous point based on `childIndex` to calculate text node index
   - But in recursive calls, `childIndex` starts from 0, so cannot use same logic

### Solutions
- Improve logic to process text-only VNode in recursive calls too
- Simplify logic to find existing text node, or modify to always create new in recursive calls

## Issue 2: Decorator VNode's text content duplication

### Symptoms
- Decorator VNode's text content duplicated
- Example: "CHIPCHIP" appears (expected: "CHIP")

### Cause Analysis
1. **Decorator VNode Structure**:
   ```typescript
   {
     tag: 'span',
     attrs: { className: 'chip' },
     children: [
       {
         text: 'CHIP',  // text-only VNode
         children: []
       }
     ]
   }
   ```

2. **Duplication Cause**:
   - text-only VNode in Decorator VNode's children being processed twice
   - When processing text-only VNode in recursive call, cannot find existing text node so creates new, and another logic also adds text node simultaneously

3. **Possible Causes**:
   - After processing text-only VNode in `reconcileVNodeChildren`, added to `nextDomChildren`
   - Same text-only VNode also processed in recursive call, added again
   - Or text node duplicated when processing decorator VNode's children

### Solutions
- Prevent duplicate processing of text-only VNode when processing Decorator VNode's children
- Add logic to check if text-only VNode already processed when processing in recursive call

## Test Results

### Passing Tests
- ✅ `test/core/vnode-data-text-concept.test.ts` - Pass
- ✅ `test/core/dom-renderer-multiple-render.test.ts` - 5/6 pass

### Failing Tests
- ❌ `test/core/dom-renderer-multiple-render.test.ts` - 1 failure (decorator duplication)
- ❌ `test/core/mark-decorator-complex.test.ts` - 16 failures (mark VNode children processing)

## Next Steps

1. **Improve Mark VNode children Processing**:
   - Improve logic to find existing text node when processing text-only VNode in recursive calls
   - Or modify to always create new in recursive calls

2. **Resolve Decorator Duplication Issue**:
   - Prevent duplicate processing of text-only VNode when processing Decorator VNode's children
   - Add logic to check if text node already processed in recursive calls
