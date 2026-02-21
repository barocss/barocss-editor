---
title: Renderer React
---

# @barocss/renderer-react

The Renderer-React package provides React rendering from model using DSL templates. It converts your model data directly into ReactNode — no VNode intermediate step.

## Purpose

DSL → React directly (no VNode). Same templates as renderer-dom, output is ReactNode. Handles the Model → Registry → Template → ReactNode pipeline.

## Key Exports

- `ReactRenderer` - Main renderer class
- `buildToReact` - Low-level function that builds ReactNode from registry + model
- `ReactRendererOptions` - Options type for ReactRenderer constructor
- `BuildOptions` - Options type for buildToReact (contextStub, decorators, sid)
- `Decorator` - Decorator type compatible with renderer-dom

## Basic Usage

```typescript
import { ReactRenderer } from '@barocss/renderer-react';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const renderer = new ReactRenderer(registry);

// Build ReactNode from model
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const decorators = [];
const reactNode = renderer.build(model, decorators);

// Use directly in a React component
function Content() {
  return <>{reactNode}</>;
}
```

## Rendering Pipeline

The renderer follows this pipeline:

```
Model → Registry.get(stype) → Template → buildToReact → ReactNode
```

Compare with renderer-dom which goes through a VNode intermediate:

```
Model → Registry.get(stype) → Template → VNodeBuilder → VNode → DOMReconcile → DOM
```

### Build Phase

```typescript
const reactNode = renderer.build(model, decorators);
```

This phase:
- Looks up template from registry by `model.stype`
- Resolves element/slot/data templates to `React.createElement` calls
- Processes decorators (inline/block/layer) in the same tree
- Sets `key={model.sid}` and `data-bc-sid` / `data-bc-stype` on root elements for reconciliation and selection

### No Reconciliation Phase

Unlike renderer-dom, there is no explicit reconciliation step. React handles reconciliation natively using the `key` props (set to `model.sid`) on each element.

## Mark Rendering

`buildMarkRunToReact` handles text runs that have marks (bold, italic, etc.):

1. **Element templates** — Marks defined with `defineMark` + `element()` (e.g. `<strong>`, `<em>`) are resolved via `registry.getMarkRenderer(markType)` and wrapped as nested `React.createElement` calls.

2. **External React components** — Marks defined with `defineMark` + `external(ReactComponent)` are rendered directly as React components. The component receives `markType`, `attributes`, `text`, and `children` as props.

```typescript
// Element-based mark (resolved from DSL template)
// Output: <strong key="...">text</strong>

// External React component mark
// Output: <MyHighlight markType="highlight" attributes={{color: 'yellow'}} text="hello">text</MyHighlight>
```

Marks are applied innermost-first: the last mark in the array wraps closest to the text.

## External Component Support

Node types and marks can use `external(ReactComponent)` to render as native React components:

```typescript
import { defineMark, external } from '@barocss/dsl';

// Mark as external React component
defineMark('highlight', external(HighlightComponent));
```

The external component receives these props:
- `markType` — The mark type string
- `attributes` — Mark attributes from the model
- `text` — The text content of the run
- `children` — Wrapped child ReactNode

For node types, external components receive the full model as props along with `model`, `sid`, `stype`, `key`, `data-bc-sid`, `data-bc-stype`, and `children`.

## Decorator Support

Decorators are rendered in the same React tree as content, matching renderer-dom behavior:

```typescript
const decorators = [{
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'p1', startOffset: 0, endOffset: 5 }
}];

// Inline decorators wrap text runs
// Block/layer decorators are placed before/after their target node
const reactNode = renderer.build(model, decorators);
```

Three decorator categories:
- **Inline** — Wraps text ranges within a node
- **Block** — Rendered before or after the target node
- **Layer** — Rendered before or after the target node (same as block in content tree)

Overlay decorators for non-content layers are built separately via `renderer.buildOverlayDecorators(decorators)`.

## When to Use

- **React apps** — When your editor UI is built with React
- **Native React rendering** — When you want React to handle reconciliation instead of a custom VNode diff
- **External components** — When marks or node types need to render as React components with full React lifecycle

## Integration

Renderer-React works with:

- **DSL** — Uses templates from the same registry as renderer-dom
- **Editor-View-React** — Called by the React view layer (`EditorViewContentLayer`) for rendering
- **Model** — Reads from model for rendering

## Related

- [Core Concepts: Rendering](../concepts/rendering) - Deep dive into rendering
- [Renderer-DOM Package](./renderer-dom) - DOM rendering with VNode reconciliation
- [DSL Package](./dsl) - Template definition
- [Editor View React Package](./editor-view-react) - How the React view layer uses this renderer
