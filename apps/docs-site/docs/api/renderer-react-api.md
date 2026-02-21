---
title: Renderer React API
---

# Renderer React API

The Renderer React API provides the rendering layer that converts models to React elements using DSL template interpretation.

## ReactRenderer Class

The main renderer class that builds React element trees from model data.

### Constructor

```typescript
new ReactRenderer(registry?: RendererRegistry, options?: ReactRendererOptions)
```

**Parameters:**
- `registry?: RendererRegistry` - Optional renderer registry
- `options?: ReactRendererOptions` - Optional renderer options

**Options:**
```typescript
interface ReactRendererOptions {
  name?: string; // Renderer name for debugging
}
```

**Example:**
```typescript
import { ReactRenderer } from '@barocss/renderer-react';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const renderer = new ReactRenderer(registry, {
  name: 'content'
});
```

### Methods

#### `getRegistry(): RendererRegistry`

Gets the renderer registry.

**Returns:**
- `RendererRegistry` - Renderer registry instance

#### `build(model, decorators?): ReactNode`

Builds a React element tree from model data and optional decorators.

**Parameters:**
- `model: ModelData` - Model data (must have `stype` property)
- `decorators?: Decorator[]` - Array of decorators to apply (default: `[]`)

**Returns:**
- `ReactNode` - React element tree ready for rendering

**Behavior:**
- Interprets DSL templates registered for the model's `stype`
- Produces `ReactNode` directly without a VNode intermediate step
- Applies inline and block decorators to matching nodes

**Example:**
```typescript
import { ReactRenderer } from '@barocss/renderer-react';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const renderer = new ReactRenderer(registry);

const element = renderer.build(
  {
    sid: 'doc-1',
    stype: 'document',
    content: ['p-1']
  },
  [] // decorators
);

// Use in a React component
function ContentView({ model }: { model: ModelData }) {
  return <>{renderer.build(model)}</>;
}
```

#### `buildOverlayDecorators(decorators): ReactNode`

Builds the overlay layer content from an array of decorators.

**Parameters:**
- `decorators: Decorator[]` - Array of layer-category decorators

**Returns:**
- `ReactNode` - React elements for the overlay layer

**Behavior:**
- Filters and renders decorators with `category: 'layer'`
- Produces positioned overlay elements for highlights, comments, and other non-inline annotations

**Example:**
```typescript
const overlayContent = renderer.buildOverlayDecorators([
  {
    sid: 'highlight-1',
    stype: 'highlight',
    category: 'layer',
    target: { sid: 'text-1', startOffset: 0, endOffset: 5 }
  }
]);
```

---

## buildToReact Function

Standalone function that interprets DSL templates and produces a `ReactNode` directly.

```typescript
function buildToReact(
  registry: RendererRegistry,
  stype: string,
  model: ModelData,
  options?: BuildOptions
): ReactNode
```

**Parameters:**
- `registry: RendererRegistry` - Renderer registry containing DSL template definitions
- `stype: string` - Schema type to look up in the registry
- `model: ModelData` - Model data to render
- `options?: BuildOptions` - Optional build configuration

**Options:**
```typescript
interface BuildOptions {
  contextStub?: Record<string, any>; // Stub values injected into the rendering context
  decorators?: Decorator[];          // Decorators to apply during build
  sid?: string;                      // Override sid for the root element
}
```

**Behavior:**
- Looks up the DSL template for `stype` in the registry
- Interprets `element()`, `data()`, `slot()`, and other DSL directives
- Produces a `ReactNode` directly — no VNode intermediate representation
- Recursively resolves child content references through the registry

**Example:**
```typescript
import { buildToReact } from '@barocss/renderer-react';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();

const element = buildToReact(registry, 'paragraph', {
  sid: 'p-1',
  stype: 'paragraph',
  text: 'Hello world'
});
```

---

## Mark Rendering

### buildMarkRunToReact

Handles rendering of mark runs (styled text spans) in the React renderer.

**Behavior:**
- Processes marks defined with `element()` DSL templates, rendering them as standard React elements with the configured tag and attributes
- Supports marks defined with `external(ReactComponent)`, rendering them directly as React components

**External Mark Props:**

When a mark uses a `reactComponent`, the component receives:

```typescript
interface ExternalMarkProps {
  markType: string;        // Mark type identifier
  attributes: MarkAttrs;   // Mark attributes from the model
  text: string;            // Text content within the mark
  children: ReactNode;     // Nested children (for stacked marks)
  'data-mark-type': string; // Data attribute for DOM identification
}
```

**Example — Element-based mark:**
```typescript
import { defineMark, element } from '@barocss/dsl';

defineMark('bold', () => {
  element('strong');
});
```

**Example — External React component mark:**
```typescript
import { defineMark, external } from '@barocss/dsl';

function LinkMark({ attributes, children, ...props }: ExternalMarkProps) {
  return (
    <a href={attributes.href} {...props}>
      {children}
    </a>
  );
}

defineMark('link', () => {
  external(LinkMark);
});
```

---

## Decorator Type

Decorators annotate model nodes with visual overlays, inline styling, or block-level modifications.

```typescript
interface Decorator {
  sid: string;                           // Unique decorator ID
  stype: string;                         // Decorator schema type
  category: 'inline' | 'block' | 'layer'; // Decorator category
  target: {
    sid: string;                         // Target node ID
    startOffset?: number;                // Start offset within text
    endOffset?: number;                  // End offset within text
  };
}
```

**Categories:**
- `inline` — Applied within text runs (e.g., highlights, annotations)
- `block` — Applied to block-level nodes (e.g., paragraph backgrounds)
- `layer` — Rendered as overlay elements in a separate layer

**Example:**
```typescript
const decorator: Decorator = {
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  }
};

const element = renderer.build(model, [decorator]);
```

---

## Complete Example

```typescript
import { ReactRenderer } from '@barocss/renderer-react';
import { getGlobalRegistry } from '@barocss/dsl';
import { DataStore } from '@barocss/datastore';

const registry = getGlobalRegistry();
const renderer = new ReactRenderer(registry, { name: 'content' });

function EditorContent({ dataStore }: { dataStore: DataStore }) {
  const model = dataStore.getNode('doc-1');

  const decorators = [
    {
      sid: 'hl-1',
      stype: 'highlight',
      category: 'inline' as const,
      target: { sid: 'text-1', startOffset: 0, endOffset: 5 }
    }
  ];

  const content = renderer.build(model, decorators);
  const overlays = renderer.buildOverlayDecorators(decorators);

  return (
    <div className="editor">
      <div className="content-layer">{content}</div>
      <div className="overlay-layer">{overlays}</div>
    </div>
  );
}
```

---

## Related

- [Architecture: Renderer DOM](../architecture/renderer-dom) - Renderer architecture
- [Core Concepts: Rendering](../concepts/rendering) - Rendering concepts
- [Renderer DOM API](./renderer-dom-api) - DOM renderer counterpart
- [DSL API](./dsl-api) - Template DSL
- [Editor View React API](./editor-view-react-api) - Editor View React integration
