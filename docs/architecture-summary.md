# Barocss Architecture - Brief Summary

## Core Structure

```
Model → DSL → VNodeBuilder → VNode → DOMReconcile → DOM
         ↑
     element, data, when, component, slot, portal
```

## Complete Pipeline

```
1. DSL Layer (packages/dsl)
   └─ element('p', {...}, [data('text')]) → Template

2. VNode Builder (packages/renderer-dom)
   └─ Template × Data → VNode

3. DOM Reconcile (packages/renderer-dom)
   └─ VNode × VNode → DOM
```

## Role of Each Layer

### 1. DSL Layer (packages/dsl)
**Role**: Functional template definition

- `element()` - HTML element template
- `data()` - Data binding  
- `when()` - Conditional rendering
- `component()` - Component template
- `slot()` - Slot template
- `portal()` - Portal template

All builders are pure functions (Pure Functions)

**Input**: Builder parameters
**Output**: Template

### 2. VNodeBuilder (packages/renderer-dom)
**Role**: Convert DSL templates to VNode

- Template lookup from Registry
- Data binding (data(), className, style)
- Component resolution
- Conditional rendering (build time)
- `when()` conditions are evaluated at build time and converted to regular VNode

**Input**: Template × Model data
**Output**: VNode tree

### 3. DOMReconcile (packages/renderer-dom)
**Role**: Convert VNode differences to DOM changes

- WIP tree creation and management
- Change detection (tag, attrs, children)
- Priority-based processing
- Minimal DOM changes applied
- Children reconcile (React-style)

**Input**: prevVNode, nextVNode
**Output**: DOM updates

## 4 Steps of Reconcile

```typescript
reconcile(prevVNode, nextVNode, container, context) {
  // 1. Create WIP Tree
  const wipTree = createWorkInProgressTree(nextVNode, prevVNode);
  
  // 2. Detect changes and assign priority
  detectChangesAndAssignPriority(prevVNode, nextVNode);
  
  // 3. Process by priority
  processByPriority(context, processWorkInProgress);
  
  // 4. Execute DOM updates
  executeDOMUpdates(container, finalizeDOMUpdate);
}
```

## Children Reconcile Core

```typescript
// Reconciliation that directly manipulates DOM
reconcileChildren(wip, prevChildren, nextChildren) {
  while (prevIndex < prevChildren.length || nextIndex < nextChildren.length) {
    if (!prevChild) {
      // Add new child
      const newNode = createNewDOMNode(nextChild);
      domNode.insertBefore(newNode, referenceNode);
      
      // Important: Set child WIP's domNode
      wip.children[nextIndex].domNode = newNode;
    } else if (isSameNode(prevChild, nextChild)) {
      // Same node - skip
    } else {
      // Replace node
      const newNode = createNewDOMNode(nextChild);
      domNode.replaceChild(newNode, oldNode);
      wip.children[nextIndex].domNode = newNode;
    }
  }
}
```

**Core Rule**: DOM nodes created/replaced in reconcile must be set in child WIP's `domNode` to prevent duplicate append

## Key Classes

| Class/Function | Layer | Role |
|-----------|--------|------|
| `element, data, when, component` | **DSL** | Template builder (pure functions) |
| `VNodeBuilder` | **VNode** | DSL template → VNode conversion |
| `DOMReconcile` | **Renderer** | VNode → DOM reconcile orchestration |
| `WorkInProgressManager` | **Renderer** | WIP tree creation and management |
| `ChangeDetection` | **Renderer** | Change detection |
| `DOMProcessor` | **Renderer** | DOM manipulation (insert/update/remove) |
| `ComponentManager` | **Renderer** | Component lifecycle |
| `PortalManager` | **Renderer** | Portal rendering |
| `DOMOperations` | **Renderer** | DOM creation/modification utilities |

## Core Rules

1. **DSL builders** define templates as pure functions
2. **VNodeBuilder** only converts templates and data to VNode
3. **DOMReconcile** converts VNode differences to DOM changes
4. **WIP pattern** batches actual changes
5. **children reconcile** must set created DOM nodes in child WIP's domNode
6. **finalizeDOMUpdate** prevents duplicate append (`isAlreadyInDOM` check)

## File Structure

```
packages/
├─ schema/              # Schema definition
├─ dsl/                 # DSL Layer ⭐
│  ├─ template-builders.ts  # element, data, when, component
│  ├─ types.ts             # Template types
│  └─ registry.ts          # Template registry
├─ vnode/              # VNodeBuilder
│  └─ factory.ts       # DSL Template → VNode conversion
├─ model/              # Model data
├─ renderer-dom/
│  ├─ dom-renderer.ts           # High-level wrapper
│  ├─ dom-reconcile.ts          # Main reconcile
│  ├─ work-in-progress.ts       # WIP interfaces
│  ├─ work-in-progress-manager.ts
│  ├─ change-detection.ts       # Change detection
│  ├─ dom-processor.ts          # DOM manipulation
│  ├─ component-manager.ts      # Component lifecycle
│  ├─ portal-manager.ts        # Portal rendering
│  └─ dom-operations.ts        # DOM utilities
└─ datastore/         # Data management
```

## Usage Examples

For detailed examples, see [`architecture-practical-examples.md`](./architecture-practical-examples.md)

### Basic Render
```typescript
// Define DSL template
define('paragraph', element('p', {}, [data('text')]));

// Render
const renderer = new DOMRenderer();
const model = { stype: 'paragraph', text: 'Hello' };
renderer.render(container, model);
// Result: <p>Hello</p>
```

### Update (Automatic Reconcile)
```typescript
model.text = 'New';
renderer.render(container, model);
// Result: <p>New</p> (only text changed without full regeneration)
```

### Complex Template
```typescript
define('article', element('article',
  { className: data('className') },
  [
    when(
      (d) => d('published') === true,
      element('span', {}, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    component('author', { name: data('author') })
  ]
));
```

## Related Documents

- [`architecture-design-principles.md`](./architecture-design-principles.md) - **Core Design Principles** ⭐
- [`architecture-reconcile-algorithm.md`](./architecture-reconcile-algorithm.md) - **Reconcile Algorithm Details** ⭐
- [`architecture-practical-examples.md`](./architecture-practical-examples.md) - Practical usage examples
- [`architecture-mathematical-model.md`](./architecture-mathematical-model.md) - Mathematical model
- [`architecture-flow-diagram.md`](./architecture-flow-diagram.md) - Flow diagram
- [`architecture-reconcile-overview.md`](./architecture-reconcile-overview.md) - Complete overview

