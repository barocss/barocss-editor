# Barocss Architecture - Design Principles

## Core Design Principles

### 1. VNode vs Reconcile Separation Principle ⭐

**Most important architecture principle**: VNode is not dynamically determined in reconcile.

#### VNode Build (VNodeBuilder's Role)
```typescript
// VNodeBuilder only creates VNode
build(nodeType: string, data: ModelData): VNode {
  const template = this.registry.getTemplate(nodeType);
  const vnode = this._buildElement(template, data);
  return vnode;
}
```

**Role**: Determines "what to render" (Template → VNode)
**Timing**: Completed before render
**Result**: Complete VNode tree

#### Reconcile (DOMReconcile's Role)
```typescript
// DOMReconcile receives already-created VNode and processes it
reconcile(prevVNode: VNode | null, nextVNode: VNode | null, 
          container: HTMLElement, context: ReconcileContext): void {
  // 1. Create WIP tree (nextVNode is already complete)
  const wipTree = this.createWorkInProgressTree(nextVNode, container, prevVNode);
  
  // 2. Detect changes
  this.workInProgressManager.detectChangesAndAssignPriority(prevVNode, nextVNode);
  
  // 3. Update DOM
  this.processByPriority(context);
}
```

**Role**: Determines "how to update DOM" (VNode → DOM)
**Timing**: During render
**Result**: DOM changes applied

### 2. Unidirectional Data Flow

```
Build Phase (VNode Creation)
  ↓
DSL → VNodeBuilder → VNode Tree
  ↓
Reconcile Phase (DOM Update)
  ↓
VNode Tree → DOMReconcile → DOM
```

**Core**: VNode and DOM updates are completely separate phases

### 3. Separation of Concerns

#### VNodeBuilder's Responsibilities
- ✅ Template lookup and interpretation
- ✅ Data binding
- ✅ Component resolution
- ✅ Conditional logic evaluation (`when`, etc.)
- ✅ VNode tree creation
- ❌ No DOM manipulation
- ❌ No previous state memory

#### DOMReconcile's Responsibilities
- ✅ VNode difference calculation
- ✅ Change minimization
- ✅ DOM manipulation
- ✅ State management (Component lifecycle)
- ❌ No VNode creation
- ❌ No Template interpretation

### 4. Benefits of Unidirectional Flow

#### Predictability
```typescript
// VNode is always completed first
const vnode = builder.build('paragraph', data);  // completed
reconcile(prevVNode, vnode, container, context); // uses already-completed VNode
```

#### Testability
```typescript
// VNodeBuilder test
describe('VNodeBuilder', () => {
  it('should build VNode from template', () => {
    const vnode = builder.build('paragraph', { text: 'Hello' });
    expect(vnode.tag).toBe('p');
    expect(vnode.text).toBe('Hello');
  });
});

// DOMReconcile test
describe('DOMReconcile', () => {
  it('should update DOM from VNode changes', () => {
    const prevVNode = { tag: 'p', text: 'Old' };
    const nextVNode = { tag: 'p', text: 'New' };
    
    reconcile(prevVNode, nextVNode, container, context);
    
    expect(container.textContent).toBe('New');
  });
});
```

#### Purity Guarantee
```typescript
// VNodeBuilder is always a pure function
const vnode = builder.build(type, data);
const vnode2 = builder.build(type, data);
expect(vnode).toEqual(vnode2);  // always identical
```

### 5. State Management Separation

#### VNodeBuilder: Side-effect Free
```typescript
// VNodeBuilder does not change state
build(nodeType: string, data: ModelData): VNode {
  // Only performs template lookup
  // No state mutation
  // No DOM manipulation
}
```

#### DOMReconcile: State Management
```typescript
// Only DOMReconcile manages state
reconcile(prevVNode, nextVNode, container, context) {
  // Component lifecycle
  this.componentManager.updateComponent(...);
  
  // DOM state tracking
  this.workInProgressManager.trackDOMState(wip);
}
```

### 6. Practical Examples

#### Bad Design (Determining VNode in Reconcile)
```typescript
// ❌ Bad design
reconcile(prevVNode, nextVNode, container, context) {
  const template = this.registry.getTemplate(nextVNode.type);  // ❌ template interpretation in reconcile
  const computedVNode = this.buildVNode(template, data);      // ❌ VNode creation in reconcile
  
  // ... DOM update
}
```

**Problems**:
- Mixed responsibilities
- Hard to test
- Unpredictable
- Complex state management

#### Good Design (Current Structure)
```typescript
// ✅ Good design

// Step 1: VNode creation (before render)
const vnode = builder.build('paragraph', { text: 'Hello' });
// → Complete VNode tree

// Step 2: Reconcile (during render)
reconcile(prevVNode, vnode, container, context);
// → Only calculates VNode differences and updates DOM
```

**Benefits**:
- Clear separation of responsibilities
- Easy to test
- Predictable
- Pure function guarantee

### 7. Complete Pipeline

```
┌─────────────────────────────────────────────┐
│ 1. Build Phase (VNodeBuilder)             │
│  - Determines "what to render"            │
│  - Template → VNode                        │
│  - Pure function, no side effects          │
└────────────────────┬────────────────────────┘
                     │
                     ▼ Completed VNode
┌─────────────────────────────────────────────┐
│ 2. Reconcile Phase (DOMReconcile)          │
│  - Determines "how to update"              │
│  - VNode → DOM                             │
│  - State management, DOM manipulation      │
└────────────────────┬────────────────────────┘
                     │
                     ▼ Final DOM
```

### 8. Mathematical Expression

```
// Build Phase (pure function)
f_template : Template × Data → VNode

// Reconcile Phase (function with state)
f_reconcile : VNode × VNode × Container × State → DOM

// Complete pipeline
render = f_reconcile ∘ f_template

where:
  f_template has no side effects (pure)
  f_reconcile has side effects (impure but deterministic)
```

### 9. Practical Scenario

```typescript
// Scenario: Text update

// 1. Build Phase: VNode creation
const prevVNode = builder.build('paragraph', { text: 'Old' });
// → { tag: 'p', text: 'Old' }

const nextVNode = builder.build('paragraph', { text: 'New' });
// → { tag: 'p', text: 'New' }

// 2. Reconcile Phase: DOM update
reconcile(prevVNode, nextVNode, container, context);
// → detectChanges(): ['text']
// → processElementNode(): domNode.textContent = 'New'
// → finalizeDOMUpdate(): already in DOM, skip append

// Result: <p>Old</p> → <p>New</p>
// (only text changed, no full regeneration)
```

### 10. Core Principles Summary

1. **Separation**: VNode creation and DOM updates are completely separate
2. **Unidirectional**: Build → Reconcile order guaranteed
3. **Purity**: VNodeBuilder is a pure function
4. **Predictable**: VNode is always completed first
5. **Clear responsibilities**: Each layer's role is clear
6. **Easy to test**: Each layer can be tested independently

## Why This Principle Matters

### 1. Debugging Ease
- Find VNode issues in Build Phase
- Find DOM issues in Reconcile Phase

### 2. Performance Optimization
- VNode creation can be cached (pure function)
- Reconcile only processes changed parts

### 3. Maintainability
- Each layer's responsibilities are clear
- Limited scope of change impact

### 4. Extensibility
- Add new template type → only modify VNodeBuilder
- Add new DOM manipulation → only modify DOMReconcile

## Conclusion

**Barocss's core design principle**: VNode is not dynamically determined in reconcile.

This ensures:
- **Separation of Concerns**
- **Unidirectional Data Flow**
- **Pure Functions First**
- **Clear Responsibilities**
