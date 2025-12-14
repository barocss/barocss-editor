# @barocss/renderer-dom

The Renderer-DOM package provides DOM rendering from model using templates with efficient reconciliation. It converts your model data into DOM elements.

## Purpose

DOM rendering from model using templates with efficient reconciliation. Handles the Model → VNode → DOM pipeline.

## Key Exports

- `DOMRenderer` - Main renderer class
- `VNodeBuilder` - VNode generation from templates
- Component and decorator management utilities

## Basic Usage

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const renderer = new DOMRenderer(registry);

// Build VNode from model
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const decorators = [];
const vnode = renderer.build(model, decorators);

// Render to DOM
const container = document.getElementById('editor');
renderer.render(container, vnode);
```

## Rendering Pipeline

The renderer follows this pipeline:

```
Model → Registry.get(stype) → Template → VNodeBuilder → VNode → DOMReconcile → DOM
```

### 1. Build Phase

```typescript
// Build VNode from model and decorators
const vnode = renderer.build(model, decorators);
```

This phase:
- Looks up template from registry by `model.stype`
- Applies model data to template
- Processes decorators
- Generates VNode tree

### 2. Render Phase

```typescript
// Render VNode to DOM
renderer.render(container, vnode);
```

This phase:
- Reconciles with previous VNode
- Detects changes
- Applies minimal DOM updates

## Reconciliation

The renderer uses efficient reconciliation similar to React:

```typescript
// First render
renderer.render(container, vnode1);

// Update (only changed parts are updated)
renderer.render(container, vnode2);  // Minimal DOM changes
```

**Reconciliation process:**
1. **Create WIP Tree**: Build work-in-progress tree from new VNode
2. **Detect Changes**: Compare with previous VNode to find differences
3. **Assign Priority**: Prioritize changes (attributes, children, etc.)
4. **Apply Updates**: Make minimal DOM changes

**Change detection:**
- Tag changes → Replace element
- Attribute changes → Update attributes
- Children changes → Reconcile children (React-style)
- Text changes → Update text content

**SID-based stability:**
- Nodes with same `sid` are treated as same node
- DOM nodes are preserved when `sid` matches
- Similar to React's `key` prop

## Component Management

Components are managed by the renderer:

```typescript
// Components can have internal state
// The renderer manages component lifecycle:
// - Mount: Component is created
// - Update: Component state changes
// - Unmount: Component is destroyed
```

## Decorator Support

Decorators are temporary UI elements:

```typescript
const decorators = [{
  target: { nodeId: 'p1' },
  type: 'highlight',
  attrs: { class: 'highlight' }
}];

const vnode = renderer.build(model, decorators);
// Decorators are applied during rendering
```

## When to Use

- **Rendering**: Convert model to DOM
- **Updates**: Update DOM when model changes
- **Component Rendering**: Render components with state

## Integration

Renderer-DOM works with:

- **DSL**: Uses templates from registry
- **Editor-View-DOM**: Called by view layer for rendering
- **Model**: Reads from model for rendering

## Related

- [Core Concepts: Rendering](../concepts/rendering) - Deep dive into rendering
- [DSL Package](./dsl) - Template definition
- [Editor View DOM Package](./editor-view-dom) - How view layer uses renderer
