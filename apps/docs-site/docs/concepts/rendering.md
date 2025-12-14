# Rendering

Rendering is the process of converting your model data into DOM elements using DSL templates. Barocss uses an efficient reconciliation algorithm similar to React.

## Rendering Pipeline

The rendering process follows this pipeline:

```
Model → Registry → Template → VNodeBuilder → VNode → DOMReconcile → DOM
```

### 1. Template Lookup

When rendering a model node, the renderer looks up the corresponding template from the registry:

```typescript
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const template = registry.get(model.stype); // Gets 'paragraph' template
```

### 2. VNode Building

The template and model data are combined to create a VNode (Virtual DOM node):

```typescript
const vnode = vnodeBuilder.build(template, model);
// Result: { tag: 'p', attrs: {...}, children: [...] }
```

### 3. Reconciliation

The VNode is reconciled with the previous VNode to determine what DOM changes are needed:

```typescript
domReconcile.reconcile(prevVNode, nextVNode, container);
```

## DOM Reconciliation

Reconciliation is the process of efficiently updating the DOM to match the new VNode tree.

### How It Works

1. **Create WIP Tree**: Build a work-in-progress tree from the new VNode
2. **Detect Changes**: Compare with previous VNode to find differences
3. **Assign Priority**: Prioritize changes (attributes, children, etc.)
4. **Apply Updates**: Make minimal DOM changes

### Change Detection

The renderer detects three types of changes:

- **Node Changes**: Tag name or key changed → Replace node
- **Attribute Changes**: Attributes changed → Update attributes
- **Child Changes**: Children added/removed/reordered → Reconcile children

### Efficient Updates

Only changed parts of the DOM are updated:

```typescript
// If only text changed, only the text node is updated
// Parent elements are not recreated
```

## Component Rendering

Components are rendered with access to both props and internal state:

```typescript
// Component receives:
// - props: Model data
// - context: Component state and utilities
const elementTemplate = component.template(props, context);
```

### Component State

Components can maintain internal state that persists across renders:

```typescript
define('counter', component((props, context) => {
  const count = context.state?.count || 0;
  return element('div', {}, [
    element('button', { onClick: () => setState({ count: count + 1 }) }, ['+']),
    element('span', {}, [String(count)])
  ]);
}));
```

## Decorators

Decorators are temporary UI elements that don't affect the model:

```typescript
const decorators = [{
  target: { nodeId: 'p1' },
  type: 'highlight',
  attrs: { class: 'highlight' }
}];

// Decorators are applied during rendering
// but don't change the underlying model
```

## Rendering Performance

### Optimizations

1. **Minimal DOM Updates**: Only changed nodes are updated
2. **Priority-based Processing**: Important changes are processed first
3. **Batch Updates**: Multiple changes are batched together
4. **Key-based Reconciliation**: Efficient child reconciliation using keys

### Best Practices

- Use stable keys for list items
- Minimize template complexity
- Avoid unnecessary re-renders
- Use decorators for temporary UI instead of model changes

## Example: Complete Rendering Flow

Here's a complete example showing the rendering process:

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { define, element, data, slot } from '@barocss/dsl';

// 1. Register templates
const registry = getGlobalRegistry();
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// 2. Create renderer
const renderer = new DOMRenderer(registry);

// 3. Model data
const model = {
  stype: 'paragraph',
  sid: 'p1',
  content: [
    {
      stype: 'inline-text',
      sid: 'text-1',
      text: 'Hello, World!'
    }
  ]
};

// 4. Render to DOM
const container = document.getElementById('editor');
const vnode = renderer.build(model, []);
renderer.render(container, vnode);

// 5. Update model (only changed parts are updated)
const updatedModel = {
  ...model,
  content: [{
    stype: 'inline-text',
    sid: 'text-1',
    text: 'Updated text'  // Only this changed
  }]
};

const newVnode = renderer.build(updatedModel, []);
renderer.render(container, newVnode); // Only text node is updated, not the paragraph
```

## Why This Approach?

1. **Performance**: Minimal DOM updates for better performance
2. **Predictability**: Clear rendering pipeline
3. **Testability**: VNode tree can be tested independently
4. **Flexibility**: Easy to add new rendering targets (not just DOM)

## Next Steps

- Learn about [Editor Core](./editor-core) - How editor orchestrates operations
- Learn about [Editor View DOM](./editor-view-dom) - How view triggers rendering
- Learn about [Architecture](../architecture/overview) for the complete picture
- See [Renderer-DOM Package](../architecture/renderer-dom) for rendering implementation details
