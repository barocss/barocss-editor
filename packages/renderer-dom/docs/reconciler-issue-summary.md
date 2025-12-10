# Reconciler Text VNode Processing Issue Summary

## Problem Verification

### 1. VNode Builder Verification (✅ Normal)
- VNode builder creates correct VNode structure
- Test: `vnode-builder-mark-check.test.ts` passes
- Mark VNode structure:
  ```json
  {
    "tag": "strong",
    "attrs": { "className": "mark-bold" },
    "children": [
      {
        "text": "Bold",
        "children": []
      }
    ]
  }
  ```

### 2. Reconciler Issue (❌ Problem Occurred)
- VNode structure is correct, but problems occur during DOM rendering
- Symptoms:
  - text VNode in Mark VNode's children not rendered to DOM
  - Example: `<strong class="mark-bold">Bold</strong>` → `<strong class="mark-bold"></strong>`
  - Decorator VNode's text content duplicated

## Current Test Situation

### Passing Tests
- ✅ `vnode-data-text-concept.test.ts` - VNode structure verification
- ✅ `dom-renderer-multiple-render.test.ts` - 5/6 pass

### Failing Tests
- ❌ `dom-renderer-multiple-render.test.ts` - 1 failure (decorator duplication)
- ❌ `mark-decorator-complex.test.ts` - 16 failures (mark VNode children processing)

## Problem Analysis

### Issue 1: Processing text VNode in Mark VNode's children

**VNode Structure (Normal)**:
```typescript
{
  tag: 'strong',
  children: [
    {
      text: 'Bold',  // text-only VNode
      children: []
    }
  ]
}
```

**Expected DOM**:
```html
<strong class="mark-bold">Bold</strong>
```

**Actual DOM**:
```html
<strong class="mark-bold"></strong>
```

**Cause**:
- Logic for processing text-only VNode in recursive calls in `reconcileVNodeChildren` doesn't work properly
- Order of `parent.childNodes` and `childVNodes` may not match in recursive calls

### Issue 2: Decorator VNode's text content duplication

**Symptoms**:
- "CHIPCHIP" (expected: "CHIP")

**Cause**:
- text VNode in Decorator VNode's children processed twice

## Solutions

### 1. Is Testing Only Reconciler Correct?
- ✅ Verified VNode builder already creates correct structure
- ✅ Only need to test Reconciler
- But current tests test entire rendering flow

### 2. Test Improvement Plan
- Write unit tests that only test Reconciler
- Directly create VNode structure and pass to reconciler
- Only verify DOM results

### 3. Solutions
- Fix order issues when processing text-only VNode in recursive calls
- Accurately match order of `parent.childNodes` and `childVNodes`
- Or use simpler logic when processing text-only VNode

## Test Results

### Reconciler Unit Tests (`reconciler-text-vnode.test.ts`)

**Passing Tests**:
- ✅ Single text VNode inside mark VNode
- ✅ Single text VNode inside decorator VNode

**Failing Tests**:
- ❌ Multiple text VNodes inside mark VNode - Second text VNode not rendered
- ❌ text VNode in nested structure - Second text VNode not rendered

### Problem Clarification

**Core Problem**: When multiple text VNodes exist, second and later text VNodes not rendered

**Estimated Cause**:
- When processing text-only VNode in `reconcileVNodeChildren`, adds to `nextDomChildren` but
- May not be properly processed in `reorder` and `removeStale`
- Or logic for finding text VNode may only find first one

## Next Steps

1. ✅ Completed writing unit tests that only test Reconciler
2. Fix multiple text VNode processing logic
3. Verify text VNode processing in `reorder` and `removeStale`
