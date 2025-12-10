# Reconciler Update Flow Detailed Document

## Overview

This document details the update flow that occurs when `DOMRenderer.render()` is called multiple times in the `Reconciler` class. It particularly covers handling when decorators are applied and text is split.

## Core Summary

### data('text') Concept and Text Splitting by Decorators

**Core Concepts:**
- `data('text')` is defined in **template's children**
  ```typescript
  define('inline-text', element('span', [data('text')]))
  //                                 ^^^^^^^^^^^^
  //                                 In template's children
  ```
- When `data('text')` is processed, generated VNodes enter **parent VNode's children**
- If marks and decorators exist, split VNodes enter as children

**Important Principles:**
1. **Original component VNode exists only once**: Component VNodes like `inline-text` (sid: `text-14`) exist only once and maintain `sid`.
2. **Text is split based on decorator range**: Decorator's `range` (startOffset, endOffset) is an absolute position based on entire text.
3. **Split text enters original component's children**: Split text VNodes and decorator VNodes all enter original component's children.
4. **Split text VNodes do not have `sid`**: Split text VNodes are regular spans and do not have `sid`.

**Example:**
- Original: `"Hello World"` (sid: `text-14`)
- Decorator: `chip-before` (range: [0, 5], position: `before`)
- Result structure:
  ```
  {
    sid: 'text-14',
    stype: 'inline-text',
    children: [
      { decoratorSid: 'chip-before', ... },  // decorator VNode
      { tag: 'span', text: 'Hello' },        // split text (no sid)
      { tag: 'span', text: ' World' }       // split text (no sid)
    ]
  }
  ```

### Behavior on Multiple render() Calls

1. **First render()**: Render text only without decorator
2. **Second render()**: Add decorator to split text, original component VNode matches exactly by `sid`
3. **updateComponent call**: When original component VNode matches, `updateComponent` is called
4. **Structure change handling**: When children structure changes, split text VNodes are newly created

### ✅ Bug Fix Completed: model.text Overwriting children Issue

**Problem (Before Fix):**
- `reconcile()` method cleared all children and set only text after `reconcileVNodeChildren()` if `model.text` existed.
- As a result, decorators existed in VNode but were not rendered to DOM.

**Solution:**
- ✅ Fixed to ignore `model.text` if children exist
- Both `reconcile()` method and `reconcileVNodesToDOM()` method fixed
- See sections 4.0, 5.0, 8.1 for details

## 1. Overall Flow Overview

```
DOMRenderer.render()
  ↓
VNodeBuilder.build() - Model + Decorators → VNode tree creation
  ↓
Reconciler.reconcile() - VNode tree → DOM update
  ↓
Reconciler.reconcileVNodeChildren() - Recursive child VNode processing
  ↓
ComponentManager.updateComponent() - Component update (conditional)
```

## 2. Detailed Flow on render() Call

### 2.1 DOMRenderer.render()

```typescript
render(container: HTMLElement, model: ModelData, decorators: Decorator[] = [], runtime?: Record<string, any>): void
```

**Steps:**
1. Create VNode tree based on Model and Decorators with `VNodeBuilder.build()`
2. Call `Reconciler.reconcile()` to reflect VNode tree to DOM

**Important Points:**
- Decorators are processed in VNodeBuilder and included in VNode tree
- When decorators are applied to text, VNodes are split into multiple (see below)

### 2.2 VNodeBuilder.build() - Decorator Processing

When inline decorators are applied to text, `_buildMarkedRunsWithDecorators()` is called to split text.

#### 2.2.1 data('text') Concept and Text Splitting Rules

**Core Concepts:**
- `data('text')` is defined in **template's children**
  ```typescript
  define('inline-text', element('span', { className: 'text' }, [data('text')]))
  //                                                              ^^^^^^^^^^^^
  //                                                              In template's children
  ```
- When `data('text')` is processed in `VNodeBuilder._processChild()`:
  1. Get `model.text` value
  2. If marks and decorators exist, call `_buildMarkedRunsWithDecorators()`
  3. Add generated VNodes with `orderedChildren.push()`
- Final setting in `VNodeBuilder._buildElement()`:
  ```typescript
  vnode.children = [...orderedChildren]
  ```
  → VNodes generated from `data('text')` enter **parent VNode's children**

**Text Splitting Rules:**
- Decorator's `range` (startOffset, endOffset) is an **absolute position based on entire text**
- Text is split based on decorator range
- Split text enters **original component's children**
- **Original component VNode exists only once** and maintains `sid`

**Example:**
- Original text: `"Hello World"` (sid: `text-14`, stype: `inline-text`)
- Decorator: `chip-before` (position: `before`, range: [0, 5])
  - range [0, 5] means first 5 characters "Hello" of "Hello World"

**Processing Steps:**

**Step 1: Template Definition**
```typescript
define('inline-text', element('span', { className: 'text' }, [data('text')]))
//                                                              ^^^^^^^^^^^^
//                                                              data('text') is in template's children
```

**Step 2: Process Template children in VNodeBuilder._buildElement()**
- Iterate `template.children` and call `_processChild()` (lines 673-675)
- When `data('text')` is encountered, process in `_processChild()`

**Step 3: Process data('text') in VNodeBuilder._processChild()** (lines 1011-1127)
1. Get `model.text` value: `"Hello World"`
2. Check marks and decorators
3. Call `_buildMarkedRunsWithDecorators()`:
   - Call `splitTextByDecorators("Hello World", [chip-before])`
     - boundaries: [0, 5, 11] (decorator range start/end + text end)
     - Create runs:
       - `{ text: "Hello", start: 0, end: 5, decorator: chip-before }`
       - `{ text: " World", start: 5, end: 11, decorator: undefined }`
   - Create VNode for each run:
     - First run (has decorator, position: `before`):
       - Create decorator VNode: `{ decoratorSid: 'chip-before', tag: 'span', ... }`
       - Create text VNode: `{ tag: 'span', text: 'Hello' }` (no sid, regular span)
       - `nodes.push(decoratorVNode)`, `nodes.push(inner)`
     - Second run (no decorator):
       - Create text VNode: `{ tag: 'span', text: ' World' }` (no sid, regular span)
       - `nodes.push(inner)`
4. Add generated VNodes to `orderedChildren`: `orderedChildren.push(n)` (line 1127)

**Step 4: Final Setting in VNodeBuilder._buildElement()** (lines 743-745)
```typescript
vnode.children = [...orderedChildren]
```
→ VNodes generated from `data('text')` enter **parent VNode's children**

**Final VNode Structure:**
```
{
  sid: 'text-14',
  stype: 'inline-text',
  tag: 'span',
  children: [
    { decoratorSid: 'chip-before', tag: 'span', ... },  // decorator VNode
    { tag: 'span', text: 'Hello' },                     // split text (no sid)
    { tag: 'span', text: ' World' }                    // split text (no sid)
  ]
}
```

**Final DOM Structure:**
```html
<span class="text" data-bc-sid="text-14" data-bc-stype="inline-text">
  <span class="chip" data-decorator-sid="chip-before" ...>CHIP</span>
  <span>Hello</span>
  <span> World</span>
</span>
```

**Important Points:**
- `data('text')` is defined in **template's children**, and when processed, generated VNodes enter **parent VNode's children**
- Original component VNode (`text-14`) **exists only once** and maintains `sid`
- Split text VNodes are **regular spans** and do not have `sid`
- Decorator VNode has `decoratorSid` and enters original component's children
- `prevVNodeTree` stores entire VNode structure of `text-14`, so split structure is also stored together

**Concept Verification:**
- ✅ `data('text')` is in template's children
- ✅ When processed, generated VNodes enter parent VNode's children
- ✅ If marks and decorators exist, split VNodes enter as children
- ✅ This is the correct concept!

### 2.3 Reconciler.reconcile()

```typescript
reconcile(container: HTMLElement, vnode: VNode, model: ModelData, runtime?: RuntimeCtx, decorators?: any[]): void
```

**Steps:**
1. Find or create existing host by Root VNode's `sid`
2. Get `prevVNode`: `this.prevVNodeTree.get(sid)`
3. Update Attributes/Styles
4. Store `prevVNode`: `this.prevVNodeTree.set(sid, { ...rootVNode })`
5. Call `reconcileVNodeChildren()` to process children

**Important Points:**
- `prevVNodeTree` is stored only by `sid` unit
- VNodes split by decorators can have different structures but can have same `sid`

### 2.4 Reconciler.reconcileVNodeChildren()

```typescript
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any): void
```

**Steps:**
1. Iterate `nextVNode.children`
2. For each child VNode:
   - Find existing DOM element with `findChildHost()`
   - Create new if not found
   - Call `updateComponent()` if found (conditional)

**prevVNode Matching:**
```typescript
let prevChildVNode: VNode | undefined = undefined;
if (childVNode.sid) {
  prevChildVNode = prevChildVNodes.find(
    (c): c is VNode => typeof c === 'object' && 'sid' in c && c.sid === childVNode.sid
  );
} else if (childVNode.decoratorSid) {
  prevChildVNode = prevChildVNodes.find(
    (c): c is VNode => typeof c === 'object' && 'decoratorSid' in c && c.decoratorSid === childVNode.decoratorSid
  );
}
```

**Actual Structure:**
- Original component VNode (`text-14`) exists only once, so matching by `sid` is accurate
- Split text VNodes do not have `sid`, so they are not matched and are newly created
- Decorator VNode is matched by `decoratorSid`

**Example:**
- Previous render (no decorator):
  ```
  {
    sid: 'text-14',
    children: [{ tag: 'span', text: 'Hello World' }]  // or text: 'Hello World'
  }
  ```
- Next render (with decorator):
  ```
  {
    sid: 'text-14',
    children: [
      { decoratorSid: 'chip-before', tag: 'span', ... },
      { tag: 'span', text: 'Hello' },      // no sid
      { tag: 'span', text: ' World' }      // no sid
    ]
  }
  ```
- `text-14` VNode itself matches exactly by `sid`
- Split text VNodes do not have `sid`, so they are newly created

### 2.5 ComponentManager.updateComponent()

```typescript
updateComponent(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext, wip: DOMWorkInProgress): void
```

**Call Conditions:**
1. When existing host is found in `reconcileVNodeChildren()`
2. When `!isDecorator && childVNode.stype`
3. When `!isReconciling` (prevent infinite loop)

**Important Logic:**
```typescript
const isReconciling = !!(context as any)?.__isReconciling;
if (!isReconciling) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
} else {
  // If __isReconciling is true, only update DOM attributes
  if (childVNode.attrs) {
    this.dom.updateAttributes(host, prevChildVNode?.attrs, childVNode.attrs);
  }
  if (childVNode.style) {
    this.dom.updateStyles(host, prevChildVNode?.style, childVNode.style);
  }
}
```

**Issues:**
- `prevChildVNode` may be `undefined` or invalid VNode
- When split by decorator, `prevChildVNode` may be VNode with entire text
- Structure mismatch can occur when comparing `prevVNode` and `nextVNode` inside `updateComponent`

## 3. VNode Splitting by Decorators

### 3.1 Splitting Process

**VNodeBuilder._buildMarkedRunsWithDecorators():**
1. Split text by mark ranges (if marks exist)
2. Split each mark run again by decorator ranges
3. Create VNode for each decorator run

**Result:**
- Original component VNode exists only once and maintains `sid`
- Split text VNodes are regular spans and do not have `sid`
- Decorator VNode has `decoratorSid`
- All VNodes enter original component's children

### 3.2 Processing in Reconciler

**Current Approach:**
- `findChildHost()` finds DOM element by `sid` or `decoratorSid`
- Original component VNode matches exactly by `sid`
- Split text VNodes do not have `sid`, so they are newly created
- Decorator VNode matches by `decoratorSid`

**Characteristics:**
- Original component VNode exists only once, so no matching issues
- Split text VNodes do not have `sid`, so they are always newly created (cannot reuse previous DOM elements)
- Decorator VNode matches exactly by `decoratorSid`

## 4. Issues on Multiple render() Calls

### 4.0 model.text and children Conflict Issue (Important)

**Problem:**
There is logic in `reconcile()` method that clears all children and sets only text after `reconcileVNodeChildren()` if `model.text` exists.

**Problem Code:**
```typescript
// Lines 152-157 of reconcile() method
this.reconcileVNodeChildren(host, prevVNode, rootVNode, context);

// If root model has text, set host text directly
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  const doc = host.ownerDocument || document;
  while (host.firstChild) host.removeChild(host.firstChild);  // ⚠️ Delete all children!
  host.appendChild(doc.createTextNode(String((model as any).text)));
}
```

**Impact:**
- Even if decorator VNode and split text VNodes are included in VNode's children when decorator is applied
- If `model.text` exists, all children are cleared and only original text is set
- As a result, decorators are not rendered to DOM

**Example:**
- VNode structure:
  ```
  {
    sid: 'text-14',
    children: [
      { decoratorSid: 'chip-before', ... },
      { tag: 'span', text: 'Hello' },
      { tag: 'span', text: ' World' }
    ]
  }
  ```
- Model: `{ sid: 'text-14', text: 'Hello World' }`
- Result DOM: `<span data-bc-sid="text-14">Hello World</span>` (no decorator!)

**Solutions:**
1. Prioritize children even if `model.text` exists
2. Add children check logic like lines 617-624 of `reconcileVNodeChildren()`
3. Or move `model.text` setting logic before `reconcileVNodeChildren()`

**Current State:**
- Inside `reconcileVNodeChildren()`, there is logic to ignore model.text if children exist (lines 617-624)
- But `reconcile()` method does not have this check

### 4.1 prevVNode Storage Issue

**Current Implementation:**
```typescript
// In reconcileVNodesToDOM()
if (sid) {
  this.prevVNodeTree.set(String(sid), { ...vnode });
}
```

**Actual Behavior:**
- `prevVNodeTree` stores entire VNode structure by `sid` unit
- When split by decorator, split children structure is also stored together
- When getting `prevVNode` in next render, entire structure is retrieved

**Potential Issues:**
- `prevVNode`'s children structure may differ from next render's children structure
- Example: previous render had no decorator, next render has decorator added
- In this case, `prevChildVNodes` and `nextChildVNodes` structures are completely different

### 4.2 updateComponent Call Issue

**Condition:**
```typescript
if (!isDecorator && childVNode.stype) {
  if (!isReconciling) {
    this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
  }
}
```

**Issues:**
- `prevChildVNode` may be `undefined` or invalid VNode
- Structure mismatch may occur when comparing `prevVNode` and `nextVNode` inside `updateComponent`
- When split by decorator, `prevVNode` has entire text and `nextVNode` has split text

### 4.3 DOM Element Matching Issue

**Current Implementation:**
```typescript
private findChildHost(parent: HTMLElement, vnode: VNode): HTMLElement | null {
  if (isDecorator) {
    const decoratorSid = vnode.decoratorSid;
    if (decoratorSid) {
      return parent.querySelector(`:scope > [data-decorator-sid="${decoratorSid}"]`);
    }
  } else {
    const sid = vnode.sid;
    if (sid) {
      return parent.querySelector(`:scope > [data-bc-sid="${sid}"]`);
    }
  }
  return null;
}
```

**Actual Behavior:**
- Original component VNode matches exactly by `sid` (exists only once)
- Split text VNodes do not have `sid`, so they are always newly created
- Decorator VNode matches exactly by `decoratorSid`

**Potential Issues:**
- Split text VNodes do not have `sid`, so previous DOM elements cannot be reused
- New DOM elements may be created every render, potentially causing performance degradation
- But since structure changed, recreation is needed anyway, so not a major issue

## 5. Solutions

### 5.0 Resolve model.text and children Conflict (High Priority)

**Problem:**
Logic in `reconcile()` method that ignores children and sets only text when `model.text` exists interferes with decorator rendering.

**Solution 1: Add children Priority Check**
```typescript
// Modify reconcile() method
this.reconcileVNodeChildren(host, prevVNode, rootVNode, context);

// If root model has text, set host text directly
// BUT: Prioritize children if they exist (decorators are included in children)
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  // Ignore model.text if children exist (children may include decorators)
  if (!rootVNode.children || rootVNode.children.length === 0) {
    const doc = host.ownerDocument || document;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**Solution 2: Apply Same Logic to reconcileVNodesToDOM()**
```typescript
// Modify lines 361-365 of reconcileVNodesToDOM() method
// Ensure host text if text model provided (after children diff)
// BUT: Prioritize children if they exist
if (model && (model as any)?.text !== undefined && (model as any)?.text !== null) {
  // Ignore model.text if children exist
  if (!vnode.children || vnode.children.length === 0) {
    const doc = host.ownerDocument || document;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**Solution 3: Prioritize VNode.text Property**
- Prioritize `vnode.text` instead of `model.text`
- VNodeBuilder already processed text, so model.text is only used as fallback

### 5.1 Improve prevVNode Storage

**Proposal:**
- Store `prevVNodeTree` as entire VNode tree structure instead of by `sid` unit
- Or use separate mapping for split VNodes

**Implementation Example:**
```typescript
// Store entire VNode tree
private prevVNodeTree: Map<string, VNode> = new Map();
private prevVNodeTreeFull: VNode | null = null; // Store entire tree

// At end of reconcile()
this.prevVNodeTreeFull = { ...vnode };
```

### 5.2 Improve prevVNode Matching

**Current State:**
- Original component VNode matches exactly by `sid` (no issue)
- Split text VNodes do not have `sid`, so they are not matched (intended behavior)
- Decorator VNode matches exactly by `decoratorSid` (no issue)

**Improvement Proposal:**
- Consider sequential matching for split text VNodes
- But since recreation is needed when structure changes anyway, not much benefit
- Current implementation is appropriate

### 5.3 Improve updateComponent Call Conditions

**Proposal:**
- Verify `prevChildVNode` is valid
- Call `updateComponent` after verifying structure matches

**Implementation Example:**
```typescript
if (!isDecorator && childVNode.stype) {
  if (!isReconciling) {
    // Verify prevChildVNode validity
    if (prevChildVNode && prevChildVNode.stype === childVNode.stype) {
      this.components.updateComponent(prevChildVNode, childVNode, host, context || ({} as any));
    } else {
      // Handle mount/unmount if structure differs
      if (prevChildVNode) {
        this.components.unmountComponent(prevChildVNode, context);
      }
      this.components.mountComponent(childVNode, host, context);
    }
  }
}
```

### 5.4 Improve DOM Element Matching

**Current State:**
- Original component VNode matches exactly by `sid` (no issue)
- Split text VNodes do not have `sid`, so they are always newly created (intended behavior)
- Decorator VNode matches exactly by `decoratorSid` (no issue)

**Improvement Proposal:**
- Consider sequential matching for split text VNodes
- But since recreation is needed when structure changes anyway, not much benefit
- Current implementation is appropriate

**Performance Optimization Considerations:**
- Can add `key` attribute to split text VNodes to improve matching
- But since recreation is needed when text content changes anyway, not much benefit

## 6. Debugging Guide

### 6.1 Log Points

**Reconciler.reconcileVNodeChildren():**
```typescript
if (childVNode.sid === 'text-14') {
  console.log('[Reconciler.reconcileVNodeChildren] text-14 updateComponent call:', {
    sid: childVNode.sid,
    stype: childVNode.stype,
    contextDecoratorsCount: contextDecorators.length,
    text14DecoratorsCount: text14Decorators.length,
    isReconciling: (context as any)?.__isReconciling
  });
}
```

**ComponentManager.updateComponent():**
```typescript
if (componentId === 'text-14') {
  console.log('[ComponentManager.updateComponent] text-14 decorator update:', {
    componentId,
    contextDecoratorsCount: contextDecorators.length,
    nextDecoratorsCount: nextDecorators.length
  });
}
```

### 6.2 Verification Items

1. **Verify prevVNode Storage:**
   - Does `prevVNodeTree.get(sid)` return correct VNode?
   - Is entire structure stored when split by decorator?

2. **Verify prevVNode Matching:**
   - Is `prevChildVNode` found correctly?
   - Does original component VNode match exactly by `sid`?

3. **Verify updateComponent Call:**
   - Is `isReconciling` flag set correctly?
   - Is `prevChildVNode` valid?
   - For Element templates, updateComponent may not be called

4. **Verify DOM Element Matching:**
   - Does `findChildHost()` find correct DOM element?
   - Does original component VNode match exactly by `sid`?

5. **Verify model.text and children Conflict:**
   - Does `model.text` overwrite children even when VNode has children?
   - Do decorators exist in VNode but not rendered to DOM?
   - Check container HTML to verify children are actually rendered

## 7. Test Scenarios

### 7.1 Basic Scenarios

1. First render (no decorator)
2. Second render after adding decorator
3. Third render after removing decorator

### 7.2 Complex Scenarios

1. Add/remove multiple decorators
2. Text change and decorator change occur simultaneously
3. Call render() multiple times with same modelData

### 7.3 Problem Reproduction Scenarios

1. Add decorator to `text-14`
2. Text is split, changing original component's children structure
3. When second render() is called, `updateComponent` is called but:
   - `prevVNode`'s children structure differs from `nextVNode`'s children structure
   - `prevChildVNode` matching may be difficult
4. DOM recreation may occur due to structure change

### 7.4 model.text and children Conflict Reproduction Scenario

1. Add decorator to `text-14`
2. VNodeBuilder creates VNode:
   ```
   {
     sid: 'text-14',
     children: [
       { decoratorSid: 'chip-before', ... },
       { tag: 'span', text: 'Hello' },
       { tag: 'span', text: ' World' }
     ]
   }
   ```
3. Call `reconcile()` method:
   - Execute `reconcileVNodeChildren()` → children rendered to DOM
   - Then `model.text` check → clear all children and set only text
4. Result: decorators not rendered to DOM

**Test Results:**
```
Container HTML: <span data-bc-sid="text-14" data-bc-stype="inline-text" class="text">Hello World</span>
Text element children: []  // All children deleted!
```

## 8. Bug Fix History

### 8.1 model.text Overwriting children Issue (Fixed)

**Location:** `packages/renderer-dom/src/reconcile/reconciler.ts`

**Problem:**
- `reconcile()` method (lines 152-157): Clear all children and set only text if `model.text` exists
- `reconcileVNodesToDOM()` method (lines 361-365): Same issue

**Impact:**
- Decorators not rendered to DOM even when included in VNode's children
- Always shows only original text if `model.text` exists

**Fix Status:**
- ✅ Fixed (2024)
- Fix content: Added logic to ignore `model.text` if children exist

**Fix Content:**
```typescript
// Modify reconcile() method (line 156)
if (!rootVNode.children || rootVNode.children.length === 0) {
  // Set model.text only when children do not exist
}

// Modify reconcileVNodesToDOM() method (line 368)
if (!vnode.children || vnode.children.length === 0) {
  // Set model.text only when children do not exist
}
```

**Test Results:**
- ✅ `reconciler-update-flow.test.ts`: All 8 tests pass
- ✅ `vnode-decorator-structure.test.ts`: All 5 tests pass
- ✅ Decorators render correctly to DOM

## 9. Summary

### 9.1 Core Findings

1. **VNode Structure is Correct**
   - When decorators are applied, text is split and enters original component's children
   - Original component VNode exists only once and maintains `sid`
   - Split text VNodes do not have `sid` (regular spans)

2. **Reconciler's prevVNode Matching Works Correctly**
   - Original component VNode matches exactly by `sid`
   - Decorator VNode matches exactly by `decoratorSid`
   - Split text VNodes are newly created (intended behavior)

3. **Important Bug Found**
   - Logic that overwrites children when `model.text` exists interferes with decorator rendering
   - Decorators exist in VNode but not rendered to DOM
   - Solution: Need to add children priority check logic

### 9.2 Completed Work

1. **✅ Bug Fix Completed**
   - Modified lines 152-161 of `reconcile()` method
   - Modified lines 364-373 of `reconcileVNodesToDOM()` method
   - Changed to ignore `model.text` if children exist

2. **✅ Test Pass Confirmation**
   - `reconciler-update-flow.test.ts`: All 8 tests pass
   - `vnode-decorator-structure.test.ts`: All 5 tests pass
   - Decorators render correctly to DOM

3. **Additional Verification (Optional)**
   - Test various decorator scenarios
   - Performance tests (multiple render() calls)

## 10. References

- `packages/renderer-dom/src/reconcile/reconciler.ts`
  - `reconcile()` method: lines 37-169
  - `reconcileVNodesToDOM()` method: lines 265-390
  - `reconcileVNodeChildren()` method: lines 402-631
- `packages/renderer-dom/src/component-manager.ts`
  - `updateComponent()` method: lines 911-1163
- `packages/renderer-dom/src/vnode/factory.ts`
  - `_buildMarkedRunsWithDecorators()` method: lines 2238-2340
- `packages/renderer-dom/test/core/vnode-decorator-structure.test.ts`
- `packages/renderer-dom/test/core/reconciler-update-flow.test.ts`
- `packages/renderer-dom/test/core/dom-renderer-simple-rerender.test.ts`
- `packages/renderer-dom/test/core/dom-renderer-multiple-render.test.ts`
