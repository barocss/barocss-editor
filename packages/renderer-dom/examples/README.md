# Renderer DOM Examples

This directory contains usage examples for `@barocss/renderer-dom` with the reconcile-based rendering approach.

## Files

- `usage-examples.ts` - Basic usage and patterns
- `editor-integration.ts` - Editor integration example
- `rich-text-editor.ts` - Rich text editor implementation
- `demo.html` - Browser demo

## Core Concepts

### 1. Reconcile-based rendering

Reuses existing DOM elements whenever possible for efficient updates.

```typescript
import { reconcileVNodes } from '@barocss/renderer-dom';

const container = document.getElementById('app')!;

// Initial render
const vnode1 = { tag: 'div', children: [
  { tag: 'p', attrs: { 'data-bc-sid': 'p1' }, text: 'Hello' }
]};
reconcileVNodes(null, vnode1, container);

// Update (reuses existing DOM)
const vnode2 = { tag: 'div', children: [
  { tag: 'p', attrs: { 'data-bc-sid': 'p1' }, text: 'Hello World' }
]};
reconcileVNodes(vnode1, vnode2, container);
```

### 2. Keyed list optimization

Use `data-bc-sid` to identify children and minimize moves/inserts/removes.

```typescript
const list = {
  tag: 'ul',
  children: items.map(item => ({
    tag: 'li',
    attrs: { 'data-bc-sid': item.sid }, // key
    text: item.text
  }))
};

// When order changes, existing DOM nodes are moved (not recreated)
```

### 3. DOMRenderer usage

High-level API with a registry:

```typescript
import { DOMRenderer, RendererRegistry, renderer, element, data, slot } from '@barocss/renderer-dom';

const registry = new RendererRegistry();
registry.register(renderer('article', element('article', null, [
  element('h1', null, [data('title')]),
  slot('content')
])));

const dom = new DOMRenderer(registry);
dom.render({
  type: 'article',
  title: 'My Article',
  content: [/* children */]
}, container);
```

### 4. Error handling

```typescript
import { ReconcileError } from '@barocss/renderer-dom';

const errors: ReconcileError[] = [];

function onError(err: ReconcileError) {
  errors.push(err);
  console.error(err);
}

// You can also pass a custom getComponent function to reconcileVNodes for external components
// reconcileVNodes(prev, next, container, (name) => registry.getComponent(name));
```

## How to run

### Dev server
```bash
cd examples
pnpm dlx vite
# open http://localhost:5173/demo.html
```

### Build
```bash
pnpm build
```

## Performance characteristics

- O(n) child comparison (key-based)
- Minimal DOM ops: update only changed parts
- DOM reuse: move nodes when keys match
- Error isolation: partial failures do not break the whole UI

## Learn more

- [Renderer DOM Spec](/paper/renderer-dom-spec.md)
- [Architecture Spec](/paper/barocss-architecture-spec.md)