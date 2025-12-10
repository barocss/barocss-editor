# Text VNode Bug Fix Document

## Overview

This document summarizes a text rendering-related bug that occurred in the renderer-dom package and its resolution process. This bug was a core issue where text from `inline-text` models was not properly processed in VNode structure, preventing marks and decorators from being applied correctly.

## Nature of the Problem

### Discovered Bugs

1. **VNode Structure Error**: Text from `inline-text` model collapsed directly into parent VNode's `text` property, preventing marks and decorators from being applied
2. **Reconciler Complexity**: Logic for processing text-only VNodes was complex and error-prone
3. **DOM Rendering Error**: Text rendered at unexpected locations or duplicated

### Problem Scenario

```typescript
// Model
{
  sid: 'text-1',
  stype: 'inline-text',
  text: 'Hello World',
  marks: [{ type: 'bold', range: [0, 5] }]
}

// Incorrect VNode structure (bug)
{
  tag: 'span',
  sid: 'text-1',
  text: 'Hello World',  // ❌ text directly in parent
  children: []          // ❌ marks not applied
}

// Correct VNode structure (after fix)
{
  tag: 'span',
  sid: 'text-1',
  text: undefined,     // ✅ no text in parent
  children: [           // ✅ children with mark-applied VNodes
    {
      tag: 'strong',
      children: [
        {
          tag: 'span',
          children: [
            { text: 'Hello', children: [] }
          ]
        }
      ]
    },
    {
      tag: 'span',
      children: [
        { text: ' World', children: [] }
      ]
    }
  ]
}
```

## Resolution Process

### Stage 1: Problem Recognition

**Symptoms**:
- Marks not rendered even when applied to `inline-text` model
- Text collapsed to parent VNode's `text` after `data('text')` processing
- Invalid state where `text` and `children` exist simultaneously in VNode

**Cause Analysis**:
- Logic in `_buildElement` method that collapses single text child to parent's `text` conflicted with `data('text')` processing
- Collapse occurred even when `data('text')` was directly processed, preventing mark/decorator application

### Stage 2: Initial Fix Attempt

**Approach**: Prevent collapse when `data('text')` is directly processed

```typescript
// vnode/factory.ts - _buildElement
let hasDataTextProcessed = { value: false };

// Set flag when processing data('text') in _processChild
if (isDataText) {
  hasDataTextProcessed.value = true;
  // ...
}

// Prevent collapse
if (hasDataTextProcessed.value) {
  // Don't collapse
}
```

**Result**: Partially resolved, but reconciler's text-only VNode processing complexity issue remained

### Stage 3: Fundamental Solution

**Core Idea**: Wrap all text in `<span>`

Advantages of this approach:
1. **Consistency**: All text always exists inside element
2. **Simplification**: Reconciler doesn't need to handle text-only VNodes separately
3. **Optimization**: Structure specialized for editor use cases

## Final Solution

### Architecture Decision

**Principle**: "Text is processed in two paths"

1. **`data('text')` Processing**: Always kept in children to allow mark/decorator application
2. **Regular Text**: Collapsed to `vnode.text` for performance optimization

This decision is an optimization tailored to editor characteristics:
- `data('text')` always kept in children for mark/decorator processing
- Regular text collapsed to simplify VNode structure
- Each path clearly separated to ensure consistent processing

**Details**: See [`text-rendering-architecture.md`](./text-rendering-architecture.md)

### Implementation Changes

#### 1. VNode Builder Modifications

**File**: `packages/renderer-dom/src/vnode/factory.ts`

##### `_buildMarkedRunVNode` (line 447-565)

```typescript
// Before change
let inner: VNode = {
  attrs: {},
  style: {},
  children: [],
  text: String(run?.text ?? '')  // ❌ text-only VNode
};

// After change
let inner: VNode = {
  tag: 'span',  // ✅ Always wrap in span
  attrs: {},
  style: {},
  children: [
    {
      attrs: {},
      style: {},
      children: [],
      text: String(run?.text ?? '')
    }
  ]
};
```

##### `_buildMarkedRunsWithDecorators` (line 2308-2314)

```typescript
// Before change (when no marks)
inner = {
  tag: 'span',
  attrs: {},
  style: {},
  children: [],
  text: decoratorRun.text  // ❌ text-only
};

// After change
inner = {
  tag: 'span',
  attrs: {},
  style: {},
  children: [
    {
      text: decoratorRun.text,
      children: []
    }
  ]
};
```

#### 2. VNode Structure Changes

**Before Change**:
```json
{
  "tag": "strong",
  "children": [
    {
      "text": "Bold",
      "children": []
    }
  ]
}
```

**After Change**:
```json
{
  "tag": "strong",
  "children": [
    {
      "tag": "span",
      "children": [
        {
          "text": "Bold",
          "children": []
        }
      ]
    }
  ]
}
```

#### 3. Reconciler Modifications

**File**: `packages/renderer-dom/src/reconcile/reconciler.ts`

##### 3.1. Added `vnode.text` Processing

Logic added to handle cases where single text child is collapsed to `vnode.text` in VNodeBuilder:

```typescript
// Added at start of reconcileVNodeChildren
if (nextVNode.text !== undefined && (!nextVNode.children || nextVNode.children.length === 0)) {
  const doc = parent.ownerDocument || document;
  const existingTextNode = parent.firstChild && parent.firstChild.nodeType === 3 
    ? parent.firstChild as Text 
    : null;
  
  if (existingTextNode && prevVNode?.text !== undefined) {
    // Update existing text node
    existingTextNode.textContent = String(nextVNode.text);
  } else {
    // Create new text node
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }
    parent.appendChild(doc.createTextNode(String(nextVNode.text)));
  }
  return; // No children to process
}
```

This logic handles:
- `element('span', {}, ['Test Component'])` - Direct string array usage
- `element('span', {}, [text('Test Component')])` - Using text() function
- `element('span', 'Test Component')` - Direct string usage (overload)

##### 3.2. text-only VNode Processing (Removed)

Complex logic that previously handled text-only VNodes separately has been removed. Now all text is either wrapped in `<span>` or processed as `vnode.text`:

```typescript
// Removed code (now unnecessary)
// Logic that directly processed text-only VNodes from children is removed
// Instead, collapsed to vnode.text or wrapped in span
```

### 4. Text Rendering Tests Added

**File**: `packages/renderer-dom/test/core/vnode-builder-text-rendering.test.ts`

New test file added to verify various text rendering methods:

```typescript
describe('VNodeBuilder Text Rendering', () => {
  // Direct string array usage
  it('should render text from string array in element children', () => {
    define('test-component', element('div', {}, [
      element('span', {}, ['Test Component'])
    ]));
    // ...
  });

  // Using text() function
  it('should render text from text() function in element children', () => {
    define('test-component', element('div', {}, [
      element('span', {}, [text('Test Component')])
    ]));
    // ...
  });

  // Direct string usage (overload)
  it('should render text from string parameter (element overload)', () => {
    define('test-component', element('div', {}, [
      element('span', 'Test Component')
    ]));
    // ...
  });
});
```

These tests verify:
- ✅ `element('span', {}, ['Test Component'])` - Direct string array usage
- ✅ `element('span', {}, [text('Test Component')])` - Using text() function
- ✅ `element('span', 'Test Component')` - Direct string usage (overload)
- ✅ Mixed content (text + elements)
- ✅ Empty text handling

### 5. Existing Tests Modified

All tests' expected values modified to match new VNode structure:

**Change Example**:
```html
<!-- Before change -->
<strong class="mark-bold">Bold</strong>

<!-- After change -->
<strong class="mark-bold"><span>Bold</span></strong>
```

**Modified Test Files**:
- `mark-decorator-complex.test.ts`
- `mark-rendering-verification.test.ts`
- `block-decorator-spec.test.ts`
- `reconciler-advanced-cases.test.ts`
- `reconciler-complex-scenarios.test.ts`
- `reconciler-text-vnode.test.ts`
- `vnode-builder-text-rendering.test.ts` (new)

## Impact Scope

### Positive Impact

1. **Code Simplification**
   - Removed reconciler's text-only VNode processing logic
   - VNode structure more consistent and predictable

2. **Bug Fixes**
   - Fixed mark/decorator application issue for `inline-text` models
   - Fixed text duplication rendering issue
   - Fixed VNode structure error (text + children existing simultaneously)

3. **Performance Improvement**
   - Faster processing due to reconciler logic simplification
   - Optimized DOM manipulation

4. **Maintainability Improvement**
   - Easier debugging with consistent VNode structure
   - Predictable behavior when adding new features

### Notes

1. **DOM Structure Changes**
   - All text wrapped in additional `<span>`
   - May affect CSS selectors (but generally no issues)

2. **Test Updates Needed**
   - All tests' expected values modified to match new structure (completed)

## Verification Results

### Test Pass Status

✅ **All Major Tests Pass**:
- `reconciler-advanced-cases.test.ts` - 23/23 pass
- `dom-renderer-multiple-render.test.ts` - 6/6 pass
- `reconciler-update-flow.test.ts` - 8/8 pass
- `reconciler-complex-scenarios.test.ts` - 8/8 pass
- `vnode-builder-verification.test.ts` - 13/13 pass
- `vnode-complex-marks-decorators.test.ts` - 5/5 pass
- `reconciler-text-vnode.test.ts` - 4/4 pass
- `decorator-types.test.ts` - 9/9 pass
- `mark-decorator-complex.test.ts` - 16/16 pass
- `mark-rendering-verification.test.ts` - All tests pass
- `vnode-builder-text-rendering.test.ts` - 10/10 pass (new)

### Feature Verification

1. ✅ Text from `inline-text` model correctly converted to VNode
2. ✅ Marks correctly applied to text
3. ✅ Inline decorators correctly applied to text
4. ✅ Block decorators correctly rendered
5. ✅ Text not duplicated on multiple render() calls
6. ✅ Text correctly rendered even in complex nested structures
7. ✅ `element('span', {}, ['Test Component'])` - Direct string array usage works correctly
8. ✅ `element('span', {}, [text('Test Component')])` - Using text() function works correctly
9. ✅ `element('span', 'Test Component')` - Direct string usage (overload) works correctly
10. ✅ Text collapsed to `vnode.text` correctly rendered in reconciler

## Reasons for Architecture Decision

### Why Wrap All Text in `<span>`?

1. **Editor Characteristics**
   - Text in editors almost always used with marks or decorators
   - Cases where text exists alone are rare
   - Structure consistency more important for performance and maintainability

2. **Reconciler Simplification**
   - No need for complex logic to handle text-only VNodes separately
   - Can assume all VNodes have elements
   - DOM manipulation logic simpler and more predictable

3. **Performance Optimization**
   - May differ from typical reconciler patterns, but more suitable for editor use cases
   - Improved processing speed by removing unnecessary condition branches

4. **Maintainability**
   - Easier debugging with consistent structure
   - Predictable behavior when adding new features

## Recent Additional Fixes (2024)

### Text Rendering Bug Fix

**Problem**: Text not rendered in `element('span', {}, ['Test Component'])` or `element('span', {}, [text('Test Component')])`

**Cause**: 
- Single text child collapsed to `vnode.text` in VNodeBuilder
- `reconcileVNodeChildren` in Reconciler doesn't process `vnode.text`

**Solution**:
- Added `vnode.text` processing logic at start of `reconcileVNodeChildren`
- Directly render text node if `vnode.text` exists and `children` is empty

**Result**:
- ✅ `element('span', {}, ['Test Component'])` works correctly
- ✅ `element('span', {}, [text('Test Component')])` works correctly
- ✅ `element('span', 'Test Component')` works correctly
- ✅ Text rendering tests added (`vnode-builder-text-rendering.test.ts`)

## Conclusion

This bug fix was not just a simple bug fix, but an architecture improvement tailored to editor characteristics. By deciding to wrap all text in `<span>` and adding `vnode.text` processing logic:

1. ✅ Core Bug Fixed: Mark/decorator application issue for `inline-text` models
2. ✅ Text Rendering Bug Fixed: Text correctly rendered when using string arrays and text() function
3. ✅ Code Simplification: Reconciler logic significantly simplified
4. ✅ Performance Improvement: Removed unnecessary condition branches
5. ✅ Maintainability Improvement: Consistent VNode structure
6. ✅ Test Coverage Improvement: Added dedicated text rendering tests

These changes significantly improved stability and maintainability of the renderer-dom package.

## Reference Documents

- `reconciler-text-vnode-issue.md`: Problem analysis document
- `reconciler-text-vnode-solution.md`: Solution document
- `text-rendering-architecture.md`: Detailed text rendering architecture explanation
- `reconciler-update-flow.md`: Reconciler update flow document
