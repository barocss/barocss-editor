# Architecture: Package Relationships (DSL, VNode, Renderer-DOM)

## Overview

This document explains the relationships and separation of responsibilities between `@barocss/dsl` and `@barocss/renderer-dom` packages in the new architecture.

## Core Architecture Principles

```
Model (stype) + Decorators → DOMRenderer.build() → VNode → DOMRenderer.render() → DOM
```

**Important Changes:**
- Build logic moved to `renderer-dom`
- Component state is reflected at Build time
- DSL is registered in Registry and queried by `model.stype`

## Package Role Separation

### 1. `@barocss/dsl` - Template Definition Layer

**Role:**
- DSL template definition (ElementTemplate, ComponentTemplate, etc.)
- Registry system (template registration and lookup)
- Template builder functions (`element()`, `component()`, `data()`, etc.)

**Responsibilities:**
- ✅ Template structure definition
- ✅ Template registration in Registry
- ✅ Template lookup API provision
- ❌ VNode generation (no role)
- ❌ DOM manipulation (no role)

**Example:**
```typescript
import { renderer, element, component } from '@barocss/dsl';

// Template definition and registration
// ElementTemplate is automatically converted to ComponentTemplate
define('paragraph', element('p', {}, [
  data('text')
]));
// Internally: define('paragraph', (props, ctx) => element('p', {}, [data('text')]))

// Component is mapped in two ways: internal state and external data
define('button', (props, context) => {
  // Primary: Initial rendering with internal state (using context.state)
  // Secondary: Remapping with external data (using props/model)
  const label = context.state?.label || props.label || data('label');
  return element('button', { onClick: props.onClick }, [label]);
});
```

**Important**: The `define()` function automatically converts all templates to components:
- `ElementTemplate` → `ComponentTemplate` (automatic conversion)
- All renderers unified as components, simplifying build process

**Component's Dual Mapping Characteristics:**
- **Primary mapping (initial)**: Render with Component internal state (`context.state`)
- **Secondary mapping (update)**: Remap with external Model data (`props`, `model`)
- Component must be able to handle both internal state and external data

### 2. VNode (Integrated into `@barocss/renderer-dom`)

**Role:** (Part of renderer-dom package)
- VNode type definitions
- VNode-related utility functions
- Decorator types and processing logic
- VNodeBuilder (ComponentManager can be injected)

**Responsibilities:**
- ✅ VNode interface definition (`renderer-dom/src/vnode/types.ts`)
- ✅ VNode type guard functions (`renderer-dom/src/vnode/utils/vnode-guards.ts`)
- ✅ Decorator types and processing (`renderer-dom/src/vnode/decorator/`)
- ✅ VNodeBuilder (`renderer-dom/src/vnode/factory.ts`) - ComponentManager can be injected
- ✅ VNode → DOM Reconcile
- ✅ DOM manipulation

**Reason for Change:**
- Need to reference Component state at Build time
- ComponentManager is in renderer-dom, so Build logic should also be in the same package
- Structure simplification and dependency cleanup

**Example:**
```typescript
import { VNode, DecoratorData, VNodeBuilder } from '@barocss/renderer-dom';

// Only provides types
const vnode: VNode = {
  tag: 'div',
  attrs: { 'data-bc-sid': 'node-1' },
  children: []
};

// Type guard
if (isComponent(vnode)) {
  // component processing
}
```

### 3. `@barocss/renderer-dom` - DOM Rendering Layer

**Role:**
- Model + Decorators → VNode build
- VNode → DOM Reconcile
- Component state management
- DOM manipulation

**Responsibilities:**
- ✅ Build: Query DSL by `model.stype` → Generate VNode
- ✅ Component state management (ComponentManager)
- ✅ Decorator processing (DecoratorManager)
- ✅ VNode → DOM Reconcile
- ✅ DOM manipulation and updates

**Core Structure:**
```typescript
class DOMRenderer {
  // Managers
  private componentManager: ComponentManager;  // Component state management
  private vnodeBuilder: VNodeBuilder;          // VNode build (ComponentManager injected)
  
  // Store input from last build time
  private lastModel: Model | null = null;
  private lastDecorators: Decorator[] | null = null;
  
  constructor(registry?: RendererRegistry) {
    this.componentManager = new ComponentManager(...);
    // Inject ComponentManager into VNodeBuilder
    this.vnodeBuilder = new VNodeBuilder(registry, {
      componentManager: this.componentManager
    });
  }
  
  // Build: Model + Decorators → VNode (Component state reflected)
  build(model: Model, decorators: Decorator[]): VNode {
    // 1. Query DSL template from Registry by model.stype
    // 2. Call VNodeBuilder.build() (references ComponentManager's state internally)
    // 3. Apply Decorator
    // 4. Store (for automatic rebuild)
    this.lastModel = model;
    this.lastDecorators = decorators;
    return this.vnodeBuilder.build(model.stype, model, { decorators });
  }
  
  // Render: VNode → DOM (only Reconcile)
  render(container: HTMLElement, vnode: VNode): HTMLElement {
    // Existing reconcile logic
  }
  
  // Automatic rebuild on Component state change
  private rerender(): void {
    if (this.lastModel && this.lastDecorators) {
      const newVnode = this.build(this.lastModel, this.lastDecorators);
      if (this.rootElement) {
        this.render(this.rootElement, newVnode);
      }
    }
  }
}
```

**VNodeBuilder Structure:**
```typescript
class VNodeBuilder {
  private componentManager?: ComponentManager;  // Can be injected
  
  constructor(
    registry?: RendererRegistry,
    options?: { componentManager?: ComponentManager }
  ) {
    this.componentManager = options?.componentManager;
  }
  
  // Reference Component state at Build time
  private _buildComponent(...): VNode {
    const componentId = generateComponentId(...);
    // Get existing state from ComponentManager
    const existingState = this.componentManager?.getComponentState(componentId) || {};
    const ctx = this._makeContext(componentId, existingState, props, {});
    // ...
  }
}
```

## Data Flow

### 1. Initial Rendering

```
[Editor/Application Layer]
  ↓
  model: { stype: 'paragraph', sid: 'p1', text: 'Hello' }
  decorators: [{ target: { nodeId: 'p1' }, ... }]
  ↓
[DOMRenderer.build(model, decorators)]
  ├─ TemplateManager: Registry.get(model.stype) → Query DSL template
  ├─ ComponentManager: Reference existing state (or {})
  ├─ DecoratorManager: Apply Decorator
  └─ Generate VNode (Component state reflected)
  ↓
[DOMRenderer.render(container, vnode)]
  ├─ DOMReconcile: VNode → DOM conversion
  └─ ComponentManager: Component mount (if needed)
  ↓
[DOM]
```

### 2. Component State Change (Internal State Mapping)

```
[Component.setState({ count: 1 })]
  ↓
[ComponentManager.setState()]
  ├─ Update internal State
  └─ Call onRerenderCallback()
  ↓
[DOMRenderer.rerender()]
  ├─ Use stored lastModel, lastDecorators
  ├─ DOMRenderer.build(lastModel, lastDecorators)
  │   ├─ Reference ComponentManager's new state (internal state)
  │   └─ Also pass Model data (external data)
  │   └─ Component template function handles both
  └─ DOMRenderer.render(rootElement, newVnode)
  ↓
[DOM update]
```

**Characteristics:**
- Component rebuilds entirely even on internal state change
- Template function can access both `context.state` (internal) and `props` (external)

### 3. Model Change (External Data Mapping)

```
[Model change (user input, etc.)]
  ↓
[Editor/Application Layer]
  ├─ Create new model
  └─ Update decorators (if needed)
  ↓
[DOMRenderer.build(newModel, newDecorators)]
  ├─ Maintain ComponentManager's existing state (internal state)
  ├─ Pass new Model data (external data)
  └─ Component template function handles both
  ↓
[DOMRenderer.render(container, vnode)]
  └─ (Same as above)
```

**Characteristics:**
- Component internal state is maintained even on Model change
- Template function can access both `context.state` (internal) and `modelData` (external)
- Generate VNode reflecting both data sources

## Key Features

### 1. Component State Reflection at Build Time

**Problem:**
- Previously, Component state was only created at mount time
- No state at Build time, so decorator application impossible

**Solution:**
- `ComponentManager` is inside `DOMRenderer`
- Can reference existing Component state at Build time
- Decorators can be applied to Component internal children as well

**Component's Dual Mapping:**
Component handles two data sources:

1. **Internal State (Initial Rendering)**:
   ```typescript
   // Render with Component internal state
   const componentId = generateComponentId(vnode);
   const existingState = componentManager.getState(componentId) || {};
   const ctx = makeContext(componentId, existingState, props, {});
   const elementTemplate = component.template(props, ctx);
   ```

2. **External Data (Remapping on Model Change)**:
   ```typescript
   // Remap with Model data
   const ctx = makeContext(componentId, existingState, modelData, {});
   const elementTemplate = component.template(modelData, ctx);
   const vnode = buildElement(elementTemplate, modelData, { decorators });
   ```

**Build Time Processing:**
```typescript
// Build time: Reflect both internal state and external data
const componentId = generateComponentId(vnode);
const existingState = componentManager.getState(componentId) || {};
const ctx = makeContext(componentId, existingState, props, {});
const elementTemplate = component.template(props, ctx);
const vnode = buildElement(elementTemplate, props, { decorators });
```

### 2. Automatic Rebuild Mechanism

**Operation:**
- Store `model`, `decorators` when `build()` is called
- Automatically call `rerender()` on Component state change
- Rebuild with stored `model`, `decorators`

**Advantages:**
- No need to pass `model`, `decorators` every time from upper layer
- Automatic update on Component state change
- DSL, Model, Decorators are immutable (only Component state changes)

### 3. Registry-based Template Lookup

**Operation:**
- Query DSL template from Registry by `model.stype`
- No need to pass DSL separately

**Example:**
```typescript
// Template registered in Registry
renderer('paragraph', element('p', {}, [data('text')]));

// At Build time
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const vnode = domRenderer.build(model, decorators);
// → Query template with Registry.get('paragraph')
```

## Inter-package Dependencies

```
┌─────────────────┐
│  @barocss/dsl   │ (Independent)
└─────────────────┘
        ↑
        │ (Registry + types)
        │
┌─────────────────┐
│ renderer-dom     │
│  ├─ vnode/       │ (Internal module)
│  │  ├─ types.ts  │
│  │  ├─ factory.ts│ (VNodeBuilder)
│  │  └─ decorator/│
│  ├─ component-manager.ts│
│  └─ dom-renderer.ts│
└─────────────────┘
        ↑
        │ (Usage)
        │
┌─────────────────┐
│ editor-view-dom │ (Top layer)
└─────────────────┘
```

**Dependency Direction:**
- `dsl` → Independent (no dependencies on other packages)
- `renderer-dom` → `dsl` (Registry + types)
- `renderer-dom` → `reconcile` (Reconcile algorithm)
- `editor-view-dom` → `renderer-dom`

**Changes:**
- VNode functionality integrated into `renderer-dom`
- VNode types/utilities exported from `renderer-dom`
- VNodeBuilder is part of `renderer-dom` internal module

## API Usage Examples

### Basic Usage

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const domRenderer = new DOMRenderer(registry);

// Initial build + render
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const decorators = [{ target: { nodeId: 'p1' }, type: 'highlight' }];

const vnode = domRenderer.build(model, decorators);
domRenderer.render(container, vnode);
```

### Component State Change

```typescript
// Inside Component
setState({ count: 1 });

// → ComponentManager automatically:
// 1. Update State
// 2. Call onRerenderCallback()
// 3. Execute DOMRenderer.rerender()
// 4. Rebuild with stored model, decorators
// 5. Automatic rendering
```

### Model Change (User Input)

```typescript
// Model change
const newModel = { stype: 'paragraph', sid: 'p1', text: 'Updated' };

// New build + render
const newVnode = domRenderer.build(newModel, decorators);
domRenderer.render(container, newVnode);
```

## Comparison with React

### React
```
JSX → Virtual DOM → Reconcile → DOM
```

### Barocss (New Structure)
```
Model (stype) + Decorators 
  → DOMRenderer.build() (Component state reflected)
  → VNode
  → DOMRenderer.render() (Reconcile)
  → DOM
```

**Differences:**
- React: JSX directly generates Virtual DOM
- Barocss: Query DSL by Model.stype → Reflect Component state → Generate VNode
- Barocss: Decorator concept added (not in React)
- Barocss: Component state reflected at Build time

## Summary

### Core Responsibilities of Each Package

| Package | Build | Render | Component State | Decorator |
|--------|-------|--------|-----------------|-----------|
| `dsl` | Template definition | ❌ | ❌ | ❌ |
| ~~`vnode`~~ | ~~❌~~ | ~~❌~~ | ~~❌~~ | ~~Types only~~ |
| `renderer-dom` | ✅ | ✅ | ✅ | ✅ |

**Changes:**
- `vnode` package integrated into `renderer-dom` internal module
- VNode types/utilities exported from `renderer-dom`

### Core Principles

1. **DSL registered in Registry**: Query by `model.stype`
2. **Build in renderer-dom**: Can reflect Component state
3. **VNode is pure type**: No build logic
4. **Automatic rebuild**: Reuse with stored model, decorators

With this structure, we can generate complete VNodes that reflect both Component state and Decorators.

