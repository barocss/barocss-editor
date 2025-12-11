# Reconciler Detailed Operation Flow

## Table of Contents
1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Complete Flow Diagram](#complete-flow-diagram)
4. [Main Methods Details](#main-methods-details)
5. [Utility Function Roles](#utility-function-roles)
6. [Data Structures](#data-structures)
7. [Important Patterns and Strategies](#important-patterns-and-strategies)

---

## Overview

Reconciler is a core component that converts VNode trees into actual DOM and performs minimal DOM updates by comparing with previous VNode trees.

### Main Goals
- **Efficiency**: Minimize unnecessary DOM manipulation
- **Accuracy**: Accurately reflect VNode tree in DOM
- **Reusability**: Maximize reuse of existing DOM elements
- **Purity**: Separate from external concerns like Selection preservation

---

## Core Concepts

### 1. VNode (Virtual Node)
- Abstract representation of DOM elements
- Contains properties like `tag`, `attrs`, `style`, `children`, `text`
- `sid` (stable ID): Unique ID identifying component
- `decoratorSid`: ID identifying decorator
- `meta.domElement`: Reference to actual DOM element

### 2. prevVNode vs nextVNode
- **prevVNode**: VNode from previous rendering cycle (stored in prevVNodeTree)
- **nextVNode**: VNode to render now (created by VNodeBuilder)
- Compare two VNodes to reflect only changes in DOM

### 3. Host Element
- DOM element where VNode is actually rendered
- Component identified by `data-bc-sid` attribute
- Decorator identified by `data-decorator-sid` attribute

### 4. Reconciliation
- Process of updating DOM by comparing prevVNode and nextVNode
- Reuse reusable DOM elements and update only changed parts

---

## Complete Flow Diagram

```
reconcile(container, vnode, model)
    │
    ├─ 1. Root VNode Processing
    │   ├─ findFirstElementVNode: Find first element
    │   ├─ Find/Create Host (sid-based)
    │   └─ Update Attributes/Styles
    │
    ├─ 2. Context Construction
    │   ├─ Pass Registry, Builder
    │   └─ Initialize Portal visited set
    │
    └─ 3. reconcileVNodeChildren (recursive)
        │
        ├─ 3-1. vnode.text Processing (handleVNodeTextProperty)
        │   └─ Direct text node rendering if only text and no children
        │
        ├─ 3-2. Build prevChildToElement Map
        │   └─ prevChildVNode → DOM element mapping
        │
        ├─ 3-3. Pre-clean (removeStaleEarly)
        │   └─ Remove unexpected elements (including unmount)
        │
        ├─ 3-4. Process Each Child (processChildVNode)
        │   │
        │   ├─ Primitive text (string/number)
        │   │   └─ handlePrimitiveTextChild
        │   │
        │   ├─ Text-only VNode (no tag, only text)
        │   │   └─ handleTextOnlyVNode
        │   │
        │   ├─ Portal VNode
        │   │   └─ handlePortalVNode (render to external target)
        │   │
        │   └─ Element VNode
        │       ├─ Find Host (findHostForChildVNode)
        │       │   ├─ SID-based matching
        │       │   ├─ Structural matching
        │       │   └─ Index-based fallback
        │       │
        │       ├─ Create/Update Host
        │       │   ├─ createHostElement (create new)
        │       │   └─ updateHostElement (update existing)
        │       │
        │       ├─ Update Attributes/Styles
        │       │
        │       ├─ Text Content Processing
        │       │   ├─ vnode.text processing
        │       │   ├─ model.text processing
        │       │   └─ handleTextVNodeInChildren
        │       │
        │       └─ Recursive reconcile (reconcileVNodeChildren)
        │
        ├─ 3-5. Order Sorting (reorder)
        │   └─ Reorder DOM according to nextDomChildren order
        │
        ├─ 3-6. Meta Transfer (transferMetaFromPrevToNext)
        │   └─ prevVNode.meta → nextVNode.meta (preserve domElement reference)
        │
        └─ 3-7. Stale Removal (removeStale)
            └─ Remove elements not in keep Set (including unmount)
```

---

## Main Methods Details

### 1. `reconcile(container, vnode, model, runtime?, decorators?)`

**Purpose**: Convert VNode tree to DOM at root level

**Steps**:

1. **Root VNode Preparation**
   ```typescript
   // If no tag or div, promote first element to root
   if (!rootVNode.tag || rootVNode.tag === 'div') {
     const firstEl = findFirstElementVNode(rootVNode);
     if (firstEl) rootVNode = firstEl;
   }
   ```

2. **Find/Create Host**
   ```typescript
   // Find existing host based on sid
   const sid = vnode.sid || model.sid;
   let host = container.querySelector(`[data-bc-sid="${sid}"]`);
   
   if (!host) {
     // Create new
     host = dom.createSimpleElement(rootVNode.tag, container);
     dom.setAttribute(host, 'data-bc-sid', sid);
   } else if (host.tagName !== rootVNode.tag) {
     // Replace if tag changed
     const replacement = dom.createSimpleElement(rootVNode.tag, container);
     container.replaceChild(replacement, host);
     host = replacement;
   }
   ```

3. **Update Attributes/Styles**
   ```typescript
   const prevVNode = prevVNodeTree.get(sid);
   dom.updateAttributes(host, prevVNode?.attrs, rootVNode.attrs);
   dom.updateStyles(host, prevVNode?.style, rootVNode.style);
   ```

4. **Recursive Children Processing**
   ```typescript
   reconcileVNodeChildren(host, prevVNode, rootVNode, context);
   ```

5. **Store prevVNode**
   ```typescript
   prevVNodeTree.set(sid, rootVNode);
   ```

6. **Portal Cleanup**
   ```typescript
   // Remove unvisited portals
   for (const [pid, entry] of portalHostsById) {
     if (!visited.has(pid)) {
       entry.host.parentElement?.removeChild(entry.host);
       portalHostsById.delete(pid);
     }
   }
   ```

---

### 2. `reconcileVNodeChildren(parent, prevVNode, nextVNode, context)`

**Purpose**: Recursively convert VNode's children to DOM

**Core Steps**:

#### Step 1: vnode.text Processing
```typescript
if (handleVNodeTextProperty(parent, nextVNode, prevVNode)) {
  return; // Exit here if only text and no children
}
```

**Behavior**:
- If `nextVNode.text` exists and no `children`, render directly as text node
- Reuse existing text node (minimize MutationObserver triggers)

#### Step 2: Build prevChildToElement Map
```typescript
const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();
for (let i = 0; i < prevChildVNodes.length && i < parentChildren.length; i++) {
  prevChildToElement.set(prevChildVNodes[i], parentChildren[i]);
}
```

**Purpose**: 
- Mapping to reuse elements without SID (mark wrapper, etc.)
- prevChildVNode → actual DOM element

#### Step 3: Pre-clean
```typescript
removeStaleEarly(parent, childVNodes, prevChildVNodes, components, context);
```

**Behavior**:
- Remove elements with unexpected `data-bc-sid`
- Call unmountComponent to handle component lifecycle

**Example**:
```typescript
// If childVNodes only has 'sid1', 'sid3'
// Remove 'sid2' element if present in parent
```

#### Step 4: Process Each Child
```typescript
for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
  const domNode = processChildVNode(
    parent, child, childIndex,
    prevChildVNodes, prevChildToElement,
    dom, components, context,
    reconcileFunction,
    currentVisitedPortalIds, portalHostsById
  );
  
  if (domNode !== null) {
    nextDomChildren.push(domNode);
  }
}
```

**processChildVNode Behavior**:
1. Primitive text → `handlePrimitiveTextChild`
2. Text-only VNode → `handleTextOnlyVNode`
3. Portal VNode → `handlePortalVNode` (returns null)
4. Element VNode:
   - Find Host (`findHostForChildVNode`)
   - Create/Update Host (`createHostElement` / `updateHostElement`)
   - Update Attributes/Styles
   - Process text content
   - Recursive reconcile

#### Step 5: Order Sorting
```typescript
reorder(parent, nextDomChildren);
```

**Behavior**:
- Reorder DOM according to `nextDomChildren` array order
- Use `insertBefore` to move to correct position

#### Step 6: Meta Transfer
```typescript
transferMetaFromPrevToNext(prevVNode, nextVNode);
```

**Purpose**:
- Transfer `prevVNode.meta.domElement` to `nextVNode.meta.domElement`
- Preserve DOM element reference for reuse in next rendering
- Recursively transfer children's meta as well

#### Step 7: Stale Removal
```typescript
removeStale(parent, new Set(nextDomChildren), context, prevMap, expectedSids);
```

**Behavior**:
- Remove elements not in `keep` Set
- Force remove elements not in `expectedSids`
- Call unmountComponent

---

## Utility Function Roles

### VNode Utilities (`vnode-utils.ts`)

#### `findFirstElementVNode(node)`
- Find first element VNode in VNode tree
- Used when root VNode is a placeholder

#### `normalizeClasses(classValue)`
- Normalize various class value formats to array
- Supported formats: string, array, object (class-names style)

#### `vnodeStructureMatches(prev, next)`
- Check if two VNodes have matching structure
- Comparison items: tag, class, children count
- Used for matching elements without SID (mark wrapper)

---

### DOM Utilities (`dom-utils.ts`)

#### `findChildHost(parent, vnode, childIndex?)`
- Find host corresponding to vnode among parent's direct children
- Strategy:
  1. Match based on `data-bc-sid` or `data-decorator-sid`
  2. Fallback based on index and tag

#### `queryHost(parent, sid)`
- Find direct child with `:scope > [data-bc-sid="${sid}"]` selector

#### `reorder(parent, ordered)`
- Reorder DOM children according to `ordered` array order
- Use `insertBefore` to perform minimal moves

---

### Meta Utilities (`meta-utils.ts`)

#### `transferMetaFromPrevToNext(prevVNode, nextVNode)`
- Transfer `prevVNode.meta` to `nextVNode.meta`
- Especially preserve `meta.domElement` reference
- Recursively transfer children's meta as well
- Conditions:
  - Structure matches, or
  - SID matches, or
  - decoratorSid matches

---

### Text Node Handlers (`text-node-handlers.ts`)

#### `handleVNodeTextProperty(parent, nextVNode, prevVNode)`
- Handle when `vnode.text` exists and no `children`
- Reuse existing text node (minimize MutationObserver triggers)

#### `handlePrimitiveTextChild(parent, child)`
- Handle primitive text (string/number)
- Reuse first text node

#### `handleTextOnlyVNode(parent, childVNode, childIndex, context)`
- Handle text-only VNode (no tag, only text)
- Includes position adjustment

#### `updateHostTextContent(host, text)`
- Update host element's text content
- Reuse existing text node

---

### Host Finding (`host-finding.ts`)

#### `findHostForChildVNode(parent, childVNode, childIndex, prevChildVNodes, prevChildToElement)`
- Find existing host corresponding to child VNode
- Strategy (priority order):
  1. **SID-based matching** (within parent)
  2. **Global SID search** (supports cross-parent move)
  3. **Structural matching** (same index)
  4. **Full structural matching** (different index)
  5. **Index-based fallback**

#### `findPrevChildVNode(childVNode, childIndex, prevChildVNodes)`
- Find prevChildVNode corresponding to current childVNode
- Strategy:
  1. SID-based matching
  2. decoratorSid-based matching
  3. Structural matching (same index)

---

### Host Management (`host-management.ts`)

#### `createHostElement(parent, childVNode, childIndex, dom, components, context)`
- Create new host element
- Set `data-bc-sid` or `data-decorator-*` attributes
- Insert at correct position
- Component lifecycle: Call `mountComponent`

#### `updateHostElement(host, parent, childVNode, childIndex, prevChildVNode, prevChildVNodes, dom, components, context)`
- Update existing host element
- Position adjustment (move to different parent or reorder within same parent)
- Update decorator attributes
- Component lifecycle: Call `updateComponent`
  - Prevent infinite loop with `__isReconciling` flag

---

### Child Processing (`child-processing.ts`)

#### `processChildVNode(...)`
- Process single child VNode and return DOM node
- Processing order:
  1. Primitive text → Text node
  2. Text-only VNode → Text node
  3. Portal VNode → null (render to external target)
  4. Element VNode:
     - Find/Create/Update Host
     - Update Attributes/Styles
     - Process text content
     - Recursive reconcile
     - Cleanup (remove stray text nodes)

#### `handleTextVNodeInChildren(host, childVNode)`
- Handle when `vnode.text` doesn't exist but text-only VNode exists in children
- Block decorator filtering

#### `cleanupStrayTextNodes(host, childVNode)`
- Remove stray text nodes when element children exist
- Exception: Don't remove if text VNode exists in children

---

### Pre-clean (`pre-clean.ts`)

#### `removeStaleEarly(parent, childVNodes, prevChildVNodes, components, context)`
- Remove unexpected elements early
- Remove `data-bc-sid` elements not in `desiredChildSids`
- Call unmountComponent

---

### Portal Handler (`portal-handler.ts`)

#### `handlePortalVNode(childVNode, dom, reconcileFunc, currentVisitedPortalIds, portalHostsById)`
- Handle Portal VNode
- Create/Find portal host in external target
- Reconcile portal content to host
- Track Portal ID (for cleanup)

---

## Data Structures

### Reconciler Instance Variables

```typescript
class Reconciler {
  // Store prevVNode tree (sid → prevVNode)
  private prevVNodeTree: Map<string, VNode> = new Map();
  
  // Portal management: portalId → { target, host }
  private portalHostsById: Map<string, { target: HTMLElement, host: HTMLElement }> = new Map();
  
  // Set of portalIds visited in current render
  private currentVisitedPortalIds: Set<string> | null = null;
}
```

### Context Structure

```typescript
const context = {
  registry: RendererRegistry,
  builder: VNodeBuilder,
  parent: HTMLElement,
  decorators: Decorator[],
  getComponent: (name: string) => Component,
  reconcile: (vnode, container, reconcileContext) => void,
  __isReconciling?: boolean  // Flag to prevent infinite loop
};
```

### prevChildToElement Map

```typescript
// prevChildVNode → DOM element mapping
const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();

// Usage purpose:
// - Reuse elements without SID (mark wrapper)
// - DOM element reference for structural matching
```

---

## Important Patterns and Strategies

### 1. DOM Element Reuse Strategy

#### SID-based Reuse (Highest Priority)
```typescript
// Components or Decorators are uniquely identified by SID
if (childVNode.sid) {
  host = parent.querySelector(`[data-bc-sid="${childVNode.sid}"]`);
}
```

#### Structural Matching (When No SID)
```typescript
// Elements without SID (mark wrapper, etc.) are matched by structure
if (vnodeStructureMatches(prevChildVNode, childVNode)) {
  host = prevChildVNode.meta.domElement;
}
```

#### Index-based Fallback
```typescript
// Last resort: Reuse same tag at same index
if (childIndex < parent.children.length) {
  const candidate = parent.children[childIndex];
  if (candidate.tagName === childVNode.tag) {
    host = candidate;
  }
}
```

### 2. Text Node Reuse Strategy

**Purpose**: Minimize MutationObserver triggers

```typescript
// Reuse existing text node
const existingTextNode = parent.firstChild;
if (existingTextNode && existingTextNode.nodeType === 3) {
  if (existingTextNode.textContent !== expectedText) {
    existingTextNode.textContent = expectedText;  // Only change content
  }
  return existingTextNode;  // Reuse
}
```

### 3. Infinite Loop Prevention

**Problem**: Infinite loop occurs if `updateComponent` calls `reconcile` internally

**Solution**: Use `__isReconciling` flag

```typescript
if (context.__isReconciling) {
  // Don't call updateComponent, directly update DOM only
  dom.updateAttributes(host, prevVNode.attrs, nextVNode.attrs);
} else {
  // Normally call updateComponent
  components.updateComponent(prevVNode, nextVNode, host, context);
}
```

### 4. Portal Handling

**Characteristic**: Portal does not create DOM under current parent

```typescript
if (handlePortalVNode(...)) {
  return null;  // Don't add to nextDomChildren
}
```

**Behavior**:
1. Create/Find host in Portal target
2. Reconcile portal content to host
3. Track Portal ID (for cleanup)

### 5. Meta Transfer Pattern

**Purpose**: Reuse DOM element reference in next rendering

```typescript
// prevVNode.meta.domElement → nextVNode.meta.domElement
transferMetaFromPrevToNext(prevVNode, nextVNode);

// Recursively transfer children's meta as well
// Condition: Structure matches or SID matches
```

### 6. Stale Removal Strategy

**Two-stage Removal**:

1. **Pre-clean** (at start of reconcileVNodeChildren)
   - Remove unexpected elements early
   - Remove elements not in `desiredChildSids`

2. **Final Clean** (at end of reconcileVNodeChildren)
   - Remove elements not in `keep` Set
   - Force remove elements not in `expectedSids`

### 7. Order Guarantee

**reorder function**:
- Reorder DOM according to `nextDomChildren` array order
- Use `insertBefore` to perform minimal moves

---

## Example: Complete Flow

### Scenario: Simple Text Update

```
Initial State:
  VNode: { tag: 'div', sid: 'root', children: [
    { tag: 'span', text: 'Hello' }
  ]}
  DOM: <div data-bc-sid="root">
         <span>Hello</span>
       </div>

Update:
  VNode: { tag: 'div', sid: 'root', children: [
    { tag: 'span', text: 'World' }
  ]}
```

**Processing Steps**:

1. Call `reconcile`
   - Find root host: `data-bc-sid="root"` element
   - Update Attributes/Styles (no changes)

2. Call `reconcileVNodeChildren`
   - `handleVNodeTextProperty`: false (has children)
   - Build `prevChildToElement` map
   - `removeStaleEarly`: execute (no changes)

3. Call `processChildVNode`
   - `findHostForChildVNode`: Find `<span>` by structural matching
   - `updateHostElement`: Check position (no changes)
   - `updateHostTextContent`: Update 'Hello' → 'World'
   - Recursive reconcile: no children

4. `reorder`: Check order (no changes)
5. `transferMetaFromPrevToNext`: Transfer meta
6. `removeStale`: Remove stale (no changes)

**Result**:
- Reuse `<span>` element
- Reuse text node (only content changed)
- Minimal DOM manipulation

---

## Performance Optimization Strategies

### 1. Minimize DOM Manipulation
- Reuse existing elements
- Reuse text nodes
- Prevent unnecessary DOM manipulation

### 2. Minimize MutationObserver Triggers
- Reuse text nodes (only change content)
- Prevent unnecessary DOM updates

### 3. Efficient Matching
- SID-based matching (O(1))
- Structural matching (only when needed)
- Index-based fallback

### 4. Recursive Call Optimization
- Prevent infinite loop with `__isReconciling` flag
- Prevent unnecessary re-rendering

---

## Debugging Tips

### 1. Use Logs
- `[Reconciler] reconcile: START/END`
- `[Reconciler] reconcileVNodeChildren: START/END`
- `[Reconciler] reconcileVNodeChildren: processing child`

### 2. Unit Tests
- Each utility function can be tested independently
- When issues occur, test only that function to identify cause

### 3. Check DOM State
- Check previous state stored in `prevVNodeTree`
- Check `meta.domElement` reference

---

## Notes

### 1. Never Generate SID
- SID is always retrieved from model
- Never generate arbitrarily

### 2. Portal Cleanup
- Remove unvisited portals at end of render
- Prevent memory leaks

### 3. Component Lifecycle
- Call mount/update/unmount in correct order
- Include error handling

### 4. Text Node Reuse
- Reuse to minimize MutationObserver triggers
- Don't update if content is same

---

## References

- [VNode Structure Examples](./vnode-structure-examples.md)
- [Reconciler Analysis](./reconciler-analysis.md)
- [Component Update Flow](./component-update-flow.md)
- [Text Rendering Architecture](./text-rendering-architecture.md)

