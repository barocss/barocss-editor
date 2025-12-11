# Mark Wrapper Reuse Issue Analysis

## Current Status

### Passing Tests
- ✅ `fiber-find-host-mark-wrapper.test.ts` (2 tests passing)
- ✅ `fiber-mark-wrapper-reuse.test.ts` (6 tests passing)
- ✅ `fiber-process-primitive-text-mark-wrapper.test.ts` (2 tests passing)
- ✅ `fiber-create-fiber-tree-mark-wrapper.test.ts` (2 tests passing)

**All 12 unit tests passing**

### Failing Tests
- ❌ `reconciler-mark-wrapper-reuse.test.ts` (7 failing, 3 passing)

## Failure Cause Analysis

### Problem 1: Text Duplication (`'HelloHello World'`)

**Symptom:**
```
Expected: "Hello World"
Received: "HelloHello World"
```

**Cause:**
- `processPrimitiveTextChildren` adds new text node without removing existing one
- `handlePrimitiveTextChild` fails to find existing text node or finds it but doesn't update and creates new one

**Related Code:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts:745-780` (`processPrimitiveTextChildren`)
- `packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts:60-127` (`handlePrimitiveTextChild`)

**Expected Scenario:**
1. Initial render: Create `'Hello'` text node in mark wrapper
2. Update: Call `processPrimitiveTextChildren`
3. Call `handlePrimitiveTextChild('Hello World', 0)`
4. Fail to find existing text node or find it but don't update and create new text node
5. Result: `'Hello'` + `'Hello World'` = `'HelloHello World'`

### Problem 2: Mark Wrapper is null (`updatedMarkWrapper === null`)

**Symptom:**
```
Expected: <HTMLElement>
Received: null
```

**Cause:**
- `reconcileFiberNode` fails to reuse mark wrapper and creates new one or removes it
- `findHostForChildVNode` fails to find mark wrapper when `prevVNode` is `undefined`

**Related Code:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts:126-577` (`reconcileFiberNode`)
- `packages/renderer-dom/src/reconcile/utils/host-finding.ts:27-234` (`findHostForChildVNode`)
- `packages/renderer-dom/src/reconcile/utils/dom-utils.ts:16-68` (`findChildHost`)

**Expected Scenario:**
1. Initial render: Create mark wrapper DOM element (`<span class="mark-bold">Hello</span>`)
2. Update: Call `reconcileFiberNode`
3. `prevVNode` is `undefined` (log: `prevVNodeExists: false`)
4. `prevChildVNodes` is empty array (`prevChildVNodesCount: 0`)
5. Call `findHostForChildVNode`:
   - Strategy 1 (Key-based): Fails (no vnodeId)
   - Strategy 2 (Type-based): Fails (prevChildVNodes is empty)
   - Strategy 3 (Index-based): Calls `findChildHost` but fails
6. Call `createHostElement` to create new DOM element
7. Existing mark wrapper removed in `removeStaleChildren`
8. Result: `updatedMarkWrapper === null`

### Problem 3: Why `prevVNode` is `undefined`

**Log Analysis:**
```
[reconcileFiberNode] prevVNode info: {
  prevVNodeExists: false,
  prevVNodeSid: undefined,
  prevVNodeHasDomElement: false,
  prevChildVNodesCount: 0,
  prevChildVNodesWithMeta: 0,
  prevChildVNodesDetails: [],
```

**Cause:**
- `createFiberTree` fails to find mark wrapper's `prevChildVNode`
- Attempts index matching with `prevVNode?.children?.[i]` but index doesn't match or `prevVNode.children` is empty

**Related Code:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts:64-79` (Finding `prevChildVNode` in `createFiberTree`)

**Expected Scenario:**
1. First render: Call `createFiberTree`, `prevVNode = undefined`
2. Second render: Call `createFiberTree`
3. Parent VNode (text-1) has `prevVNode` but fails to find mark wrapper's `prevChildVNode`
4. Index matching fails: `prevVNode?.children?.[i]` is `undefined`
5. Result: mark wrapper Fiber's `prevVNode = undefined`

## Solutions

### Solution 1: Fix `handlePrimitiveTextChild`

**Problem:** Fails to find existing text node or finds it but doesn't update and creates new one

**Solution:**
1. Find existing text node first in `handlePrimitiveTextChild`
2. Update if found, create new if not found
3. Remove existing text node if present, then create new (or update)

**Modification Location:**
- `packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts:60-127`

### Solution 2: Improve Class Matching in `findChildHost`

**Problem:** `findChildHost` fails to find mark wrapper when `prevVNode` is absent

**Solution:**
1. Improve class matching logic in `findChildHost`
2. When index matching fails, iterate all child elements and attempt class matching
3. Consider `usedDomElements` to exclude already used elements

**Modification Location:**
- `packages/renderer-dom/src/reconcile/utils/dom-utils.ts:42-65`

### Solution 3: Improve `prevChildVNode` Finding in `createFiberTree`

**Problem:** Index matching fails and `prevChildVNode` is not found

**Solution:**
1. When index matching fails, attempt matching by tag and class
2. Iterate `prevVNode.children` to find VNode with same tag and class

**Modification Location:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts:64-79`

## Testing Approach

### Step 1: Reproduce Problem and Debug

```bash
# Run only failing tests
cd packages/renderer-dom
pnpm test:run test/core/reconciler-mark-wrapper-reuse.test.ts -t "should reuse mark wrapper span when text changes"
```

**Check Items:**
1. Check if `prevVNode` is `undefined`
   - Log: `prevVNodeExists: false`
   - Cause: `createFiberTree` fails to find `prevChildVNode`
2. Check if `findHostForChildVNode` is called
   - Log: `[findHostForChildVNode] Failed to find prevChildVNode`
   - Cause: Strategy 1, 2 fail because `prevChildVNodes` is empty
3. Check if `findChildHost` is called
   - Log: `[findHostForChildVNode] Global search failed`
   - Cause: Strategy 3's `findChildHost` fails to find mark wrapper
4. Check if `processPrimitiveTextChildren` is called
   - Log: None (need to add debug log)
   - Cause: Only called when `fiber.child` is absent
5. Check if `handlePrimitiveTextChild` finds existing text node
   - Log: None (need to add debug log)
   - Cause: Creates new if no text node at `childIndex` position

### Step 2: Verify Individual Functions with Unit Tests

```bash
# Run tests for each function
pnpm test:run test/core/fiber-find-host-mark-wrapper.test.ts
pnpm test:run test/core/fiber-process-primitive-text-mark-wrapper.test.ts
pnpm test:run test/core/fiber-create-fiber-tree-mark-wrapper.test.ts
```

**Check Items:**
1. Verify each function works as expected
   - ✅ `findHostForChildVNode`: Both Strategy 2, 3 pass
   - ✅ `processPrimitiveTextChildren`: Text update passes
   - ✅ `createFiberTree`: `prevVNode` setting passes
2. Verify edge case handling (when prevVNode is absent)
   - ⚠️ Need to verify `findChildHost` finds mark wrapper when `prevVNode` is absent
   - ⚠️ Need to verify `handlePrimitiveTextChild` finds existing text node when `prevVNode` is absent

### Step 3: Modify and Verify

**Modification Order:**

#### 3-1. Fix `handlePrimitiveTextChild` (Text Duplication Problem)

**Problem:**
- Creates new if no text node at `childIndex` position
- Creates duplicate if fails to find existing text node

**Modification Approach:**
```typescript
// packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts
export function handlePrimitiveTextChild(
  parent: HTMLElement,
  child: string | number,
  childIndex?: number
): Text {
  const doc = parent.ownerDocument || document;
  const expectedText = String(child);
  
  if (childIndex !== undefined) {
    const childNodes = Array.from(parent.childNodes);
    let textNodeToUse: Text | null = null;
    
    // Check if text node exists at childIndex position
    if (childIndex < childNodes.length) {
      const nodeAtIndex = childNodes[childIndex];
      if (nodeAtIndex && nodeAtIndex.nodeType === Node.TEXT_NODE) {
        textNodeToUse = nodeAtIndex as Text;
      }
    }
    
    // IMPORTANT: If no text node at childIndex position,
    // check all text nodes to find reusable one
    if (!textNodeToUse) {
      for (const node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          textNodeToUse = node as Text;
          break; // Reuse first text node
        }
      }
    }
    
    // ... rest of logic
  }
}
```

**Test:**
```bash
pnpm test:run test/core/fiber-process-primitive-text-mark-wrapper.test.ts
```

#### 3-2. Fix `findChildHost` (Mark Wrapper Finding Problem)

**Problem:**
- Only checks element at `childIndex` position
- Fails to find if index doesn't match

**Modification Approach:**
```typescript
// packages/renderer-dom/src/reconcile/utils/dom-utils.ts
export function findChildHost(
  parent: HTMLElement,
  vnode: VNode,
  childIndex?: number,
  usedDomElements?: Set<HTMLElement>
): HTMLElement | null {
  // ... existing logic ...
  
  // Fallback: When sid is absent (e.g., mark wrapper span)
  if (childIndex !== undefined && vnode.tag && !vnode.decoratorSid) {
    const children = Array.from(parent.children);
    
    // IMPORTANT: Check element at childIndex position first
    if (childIndex < children.length) {
      const candidate = children[childIndex] as HTMLElement;
      if (candidate && candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              if (!usedDomElements || !usedDomElements.has(candidate)) {
                return candidate;
              }
            }
          } else {
            if (!usedDomElements || !usedDomElements.has(candidate)) {
              return candidate;
            }
          }
        }
      }
    }
    
    // IMPORTANT: If not found at childIndex position, iterate all child elements
    for (const candidate of children) {
      if (usedDomElements && usedDomElements.has(candidate as HTMLElement)) {
        continue;
      }
      if (candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              return candidate as HTMLElement;
            }
          } else {
            return candidate as HTMLElement;
          }
        }
      }
    }
  }
  
  return null;
}
```

**Test:**
```bash
pnpm test:run test/core/fiber-find-host-mark-wrapper.test.ts
```

#### 3-3. Fix `createFiberTree` (prevChildVNode Finding Problem)

**Problem:**
- Only attempts index matching
- Fails to find `prevChildVNode` if index doesn't match

**Modification Approach:**
```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts
// Find prevChildVNode: Match by sid (more accurate than index matching)
let prevChildVNode: VNode | undefined;
const childId = childVNode.sid || childVNode.decoratorSid;
if (childId && prevVNode?.children) {
  prevChildVNode = prevVNode.children.find(
    (c): c is VNode => {
      if (typeof c !== 'object' || c === null) return false;
      const prevId = c.sid || c.decoratorSid;
      return prevId === childId;
    }
  );
}
// Fallback: Match by index
if (!prevChildVNode) {
  prevChildVNode = prevVNode?.children?.[i] as VNode | undefined;
}
// IMPORTANT: If index matching also fails, attempt matching by tag and class
if (!prevChildVNode && prevVNode?.children && childVNode.tag && !childVNode.decoratorSid) {
  prevChildVNode = prevVNode.children.find(
    (c): c is VNode => {
      if (typeof c !== 'object' || c === null) return false;
      if (c.tag !== childVNode.tag) return false;
      if (c.decoratorSid) return false; // Exclude decorator VNode
      // Class matching
      if (childVNode.attrs?.class || childVNode.attrs?.className) {
        const vnodeClasses = normalizeClasses(childVNode.attrs.class || childVNode.attrs.className);
        const prevClasses = normalizeClasses(c.attrs?.class || c.attrs?.className);
        return vnodeClasses.every(cls => prevClasses.includes(cls));
      }
      return true; // Match by tag only if no class
    }
  );
}
```

**Test:**
```bash
pnpm test:run test/core/fiber-create-fiber-tree-mark-wrapper.test.ts
```

**Integration test after each modification:**
```bash
pnpm test:run test/core/reconciler-mark-wrapper-reuse.test.ts
```

### Step 4: Run All Tests

```bash
# Run all reconcile-related tests
pnpm test:run test/core/*reconcile*.test.ts

# Run all fiber-related tests
pnpm test:run test/core/fiber-*.test.ts
```

## Debugging Tips

### Enable Logging

To enable debug logs in test environment:

```typescript
// In test file
(globalThis as any).__DEBUG_RECONCILE__ = true;
```

### Key Log Points

1. `[reconcileFiberNode] prevVNode info` - Check prevVNode status
   - `prevVNodeExists: false` → `prevVNode` is absent
   - `prevChildVNodesCount: 0` → `prevChildVNodes` is empty
2. `[findHostForChildVNode] Failed to find prevChildVNode` - Strategy 1, 2 failed
3. `[findHostForChildVNode] Global search failed` - Strategy 3 failed
4. `[processPrimitiveTextChildren]` - Check text processing (need to add log)

### Add Debug Logs

Add logs to `processPrimitiveTextChildren`:

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts
export function processPrimitiveTextChildren(
  fiber: FiberNode,
  deps: FiberReconcileDependencies
): void {
  if (!fiber.primitiveTextChildren || fiber.primitiveTextChildren.length === 0) {
    return;
  }
  
  const host = fiber.domElement;
  if (!host) {
    return;
  }
  
  if (process.env.NODE_ENV === 'test' || (globalThis as any).__DEBUG_RECONCILE__) {
    console.log('[processPrimitiveTextChildren]', {
      hostTag: host.tagName,
      hostClasses: host.className,
      primitiveTextChildren: fiber.primitiveTextChildren,
      existingTextNodes: Array.from(host.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => (n as Text).textContent)
    });
  }
  
    // ... rest of logic
}
```

Add logs to `handlePrimitiveTextChild`:

```typescript
// packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts
export function handlePrimitiveTextChild(
  parent: HTMLElement,
  child: string | number,
  childIndex?: number
): Text {
  const expectedText = String(child);
  
  if (process.env.NODE_ENV === 'test' || (globalThis as any).__DEBUG_RECONCILE__) {
    console.log('[handlePrimitiveTextChild]', {
      expectedText,
      childIndex,
      parentTag: parent.tagName,
      parentClasses: parent.className,
      existingTextNodes: Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => ({
        text: (n as Text).textContent,
        index: Array.from(parent.childNodes).indexOf(n)
      }))
    });
  }
  
    // ... rest of logic
}
```

### Check DOM Structure

To check DOM structure during test:

```typescript
console.log('DOM structure:', container.innerHTML);
console.log('Mark wrapper:', container.querySelector('span.mark-bold'));
console.log('Text nodes:', Array.from(container.querySelectorAll('*')).map(el => ({
  tag: el.tagName,
  classes: el.className,
  textContent: el.textContent,
  childNodes: Array.from(el.childNodes).map(n => ({
    type: n.nodeType === Node.TEXT_NODE ? 'TEXT' : 'ELEMENT',
    text: n.nodeType === Node.TEXT_NODE ? (n as Text).textContent : (n as Element).tagName
  }))
})));
```

## Expected Results

### Success Scenario

1. Initial render: Create `<span class="mark-bold">Hello</span>`
2. Update: 
   - `findHostForChildVNode` finds existing mark wrapper
   - `processPrimitiveTextChildren` updates existing text node
   - Result: `<span class="mark-bold">Hello World</span>` (same DOM element)

### Failure Scenario (Current)

1. Initial render: Create `<span class="mark-bold">Hello</span>`
2. Update:
   - `findHostForChildVNode` fails to find existing mark wrapper
   - Create new mark wrapper or remove existing one
   - `processPrimitiveTextChildren` adds new text node
   - Result: `null` or `'HelloHello World'`

