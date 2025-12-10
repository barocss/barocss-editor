# Block Decorator and Text Rendering Fix

## Problem Situation

### 1. Paragraph Text Not Rendering When Block Decorator Exists

**Symptoms:**
- Text from paragraph with block decorator not rendered to DOM
- `<p>` tag rendered empty

**Causes:**
1. **VNodeBuilder Issue:**
   - Text collapsed to `vnode.text` even when `hasDataTextProcessed` is `true` because `shouldCollapse` condition met
   - But block decorator added to paragraph's children makes `vnode.children.length > 0`, so text not processed in Reconciler

2. **Reconciler Issue:**
   - Due to condition `childVNode.text !== undefined && (!childVNode.children || childVNode.children.length === 0)`
   - Text not processed if children has decorator
   - Text removed while reconciling children that only have decorators

3. **Test Structure Issue:**
   - Tests existed where paragraph was rendered as root
   - In actual usage, document is always root, so test structure mismatched actual usage pattern

## Modifications

### 1. VNodeBuilder Fix (`packages/renderer-dom/src/vnode/factory.ts`)

#### Issue: Collapse Occurs Even After `data('text')` Processing

**Before Fix:**
```typescript
const shouldCollapse = singleTextChild && 
                       (!hasDataTextProcessed.value || !hasMarksOrInlineDecorators)
```

**After Fix:**
```typescript
// IMPORTANT: If data('text') was processed, NEVER collapse because:
// 1. data('text') generates VNodes that should always be in children
// 2. marks and decorators may split the text into multiple VNodes
// 3. Even if there are no marks/decorators now, they might be added later
// Collapse only if: single text child exists AND data('text') was NOT processed AND no marks/decorators
const shouldCollapse = singleTextChild && 
                       !hasDataTextProcessed.value && 
                       !hasMarksOrInlineDecorators
```

**Reason:**
- Must always keep in children when `data('text')` processed
- Because marks or decorators may be added later
- Text should remain in children even when block decorator added to children

### 2. Reconciler Fix (`packages/renderer-dom/src/reconcile/reconciler.ts`)

#### Issue 1: Text Not Processed Because Children Only Has Decorators

**Before Fix:**
```typescript
if (childVNode.text !== undefined && (!childVNode.children || childVNode.children.length === 0)) {
  // Text processing
}
```

**After Fix:**
```typescript
// If VNode has text property, process it even if children exist (children might be decorators)
// Only skip if children contain non-decorator VNodes (actual content children)
const hasNonDecoratorChildren = childVNode.children && childVNode.children.some((c: any) => 
  typeof c === 'object' && c && !c.decoratorSid && !c.decoratorStype && (c.tag || c.text)
);
if (childVNode.text !== undefined && !hasNonDecoratorChildren) {
  // Text processing
}
```

**Reason:**
- Must process text if children only has decorators
- Decorators render as siblings, not actual content children

#### Issue 2: Text Removed While Reconciling Children That Only Has Decorators

**Before Fix:**
```typescript
this.reconcileVNodeChildren(host, prevChildVNode, childVNode, recursiveContext, true);
```

**After Fix:**
```typescript
// Check if children contain only decorators (not actual content)
const childrenAreOnlyDecorators = childVNode.children && childVNode.children.every((c: any) => 
  typeof c === 'object' && c && (c.decoratorSid || c.decoratorStype)
);

// Only reconcile children if they are not just decorators (decorators are handled as siblings, not children)
// OR if VNode has text property, we should not reconcile children that are decorators
if (!childrenAreOnlyDecorators || childVNode.text === undefined) {
  this.reconcileVNodeChildren(host, prevChildVNode, childVNode, recursiveContext, true);
}
```

**Reason:**
- Block decorator renders as sibling, so shouldn't reconcile as children
- Shouldn't reconcile children that only has decorators when text exists

#### Issue 3: Text Nodes Removed in Cleanup Logic

**Before Fix:**
```typescript
if (host.childNodes.length > 0 && (childVNode.children && childVNode.children.length > 0)) {
  const hasElementChild = Array.from(host.childNodes).some(n => n.nodeType === 1);
  if (hasElementChild) {
    const toRemove: ChildNode[] = [];
    host.childNodes.forEach((n) => { if (n.nodeType === 3) toRemove.push(n); });
    toRemove.forEach(n => { try { host.removeChild(n); } catch {} });
  }
}
```

**After Fix:**
```typescript
if (host.childNodes.length > 0 && (childVNode.children && childVNode.children.length > 0)) {
  const hasElementChild = Array.from(host.childNodes).some(n => n.nodeType === 1);
  // Only remove text nodes if there are actual content children (not just decorators)
  const hasNonDecoratorChildren = childVNode.children.some((c: any) => 
    typeof c === 'object' && c && !c.decoratorSid && !c.decoratorStype
  );
  if (hasElementChild && hasNonDecoratorChildren) {
    const toRemove: ChildNode[] = [];
    host.childNodes.forEach((n) => { if (n.nodeType === 3) toRemove.push(n); });
    toRemove.forEach(n => { try { host.removeChild(n); } catch {} });
  }
}
```

**Reason:**
- Shouldn't remove text nodes when only decorators exist
- Should only remove text nodes when actual content children exist

### 3. Test File Modifications

#### Issue: Tests Where Paragraph Rendered as Root

**Before Fix:**
```typescript
const model = {
  sid: 'p-1',
  stype: 'paragraph',
  text: 'This is a paragraph with a comment before it.'
};
```

**After Fix:**
```typescript
const model = {
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      text: 'This is a paragraph with a comment before it.'
    }
  ]
};
```

**Reason:**
- Document is always root in actual usage
- Decorators not used at root level
- Modified test structure to match actual usage pattern

#### Modified Test Files:
- `test/core/block-decorator-spec.test.ts`
  - Modified all tests to wrap paragraph in document
  - Modified Expected HTML to match document structure

### 4. Mark Wrapper Structure Consideration

#### Issue: Text Wrapped in Mark Wrapper When Decorator Exists

**Symptoms:**
- Test expected `children[1].text` but actually in `children[1].children[0].text`

**Fix:**
```typescript
// children[1] may be mark wrapper: { tag: 'span', children: [{ text: 'Hello' }] }
const text1 = children[1].text || (children[1].children?.[0]?.text);
expect(text1).toBe('Hello');
```

**Modified Test Files:**
- `test/core/vnode-data-text-concept.test.ts`
- `test/core/vnode-decorator-structure.test.ts`

## Fix Results

### Passing Tests

1. ✅ `test/core/block-decorator-spec.test.ts` - All 7 tests pass
2. ✅ `test/core/vnode-data-text-concept.test.ts` - All 4 tests pass
3. ✅ `test/core/vnode-decorator-structure.test.ts` - All 5 tests pass
4. ✅ `test/core/decorator-types.test.ts` - All 9 tests pass
5. ✅ `test/core/dom-renderer-multiple-render.test.ts` - All 6 tests pass
6. ✅ `test/core/dom-renderer-simple-rerender.test.ts` - All 2 tests pass

## Core Concepts Summary

### 1. Block Decorator Renders as Sibling
- Block decorator added as parent's children, not target node's children
- VNodeBuilder constructs children array in order: `[before decorators..., child, after decorators...]`

### 2. Collapse Prohibited When `data('text')` Processed
- Always keep in children when `data('text')` processed
- Because marks or decorators may be added later
- Collapse only allowed when `data('text')` not processed

### 3. Relationship Between Decorator and Text
- Text should be in `vnode.text` if children only has decorators
- Shouldn't reconcile decorators, only process text
- Shouldn't remove text nodes during cleanup when only decorators exist

### 4. Test Structure Must Match Actual Usage Pattern
- Root is always document
- Paragraph is document's children
- Decorators not used at root level

## Notes

- With this fix, paragraph text renders correctly even when block decorator exists
- VNodeBuilder and Reconciler logic became clearer
- Test structure improved to match actual usage pattern
