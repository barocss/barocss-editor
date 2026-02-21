---
title: Editor View React
---

# @barocss/editor-view-react

The Editor-View-React package provides the React view layer for Barocss Editor. It connects the Editor to the DOM through React components, handling user input, selection synchronization, decorator management, and rendering via `ReactRenderer`.

## Purpose

React view layer for Barocss Editor (Editor + ReactRenderer). Bridges user interactions (typing, clicking, keyboard shortcuts) with editor commands, all rendered as a React component tree.

## Key Exports

- `EditorView` - Main React component (with static sub-components: ContentLayer, DecoratorLayer, SelectionLayer, ContextLayer, CustomLayer, Layer)
- `EditorViewContentLayer` - Content layer component (contenteditable)
- `EditorViewLayer` - Generic overlay layer component
- `EditorViewContextProvider` - Context provider managing editor state, handlers, and decorator managers
- `useEditorViewContext` - Hook to access the editor view context (throws if outside provider)
- `useOptionalEditorViewContext` - Hook that returns `null` if outside provider
- `createMutationObserverManager` - Factory for the React mutation observer manager

### Types

- `EditorViewOptions` - Options for EditorView (registry, className, layers config)
- `EditorViewProps` - Props for EditorView (editor, options, children)
- `EditorViewRef` / `EditorViewHandle` - Ref API type (addDecorator, removeDecorator, getDecorators, selection conversion, etc.)
- `DecoratorExportData` - Serializable decorator export format
- `LoadDecoratorsPatternFunctions` - Functions required when loading pattern decorators
- `DecoratorQueryOptions` - Filtering and sorting options for getDecorators
- `DecoratorTypeSchema` - Schema for defining decorator types
- `ModelSelection` - Model selection type
- `EditorViewContentLayerOptions` / `EditorViewContentLayerProps` - Content layer types
- `EditorViewLayerOptions` / `EditorViewLayerProps` - Overlay layer types
- `EditorViewLayersConfig` / `EditorViewLayerType` - Layer configuration types

## Basic Usage

```tsx
import { EditorView } from '@barocss/editor-view-react';
import { Editor } from '@barocss/editor-core';
import { getGlobalRegistry } from '@barocss/dsl';

const editor = new Editor(/* ... */);

function App() {
  const viewRef = useRef<EditorViewRef>(null);

  return (
    <EditorView
      ref={viewRef}
      editor={editor}
      options={{
        registry: getGlobalRegistry(),
        className: 'my-editor',
      }}
    />
  );
}

// Use ref API for decorators and selection
viewRef.current?.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'p1', startOffset: 0, endOffset: 5 },
});
```

## Component Architecture

```
EditorView
  └─ EditorViewContextProvider       (manages editor, handlers, decorator managers)
       └─ EditorViewRoot             (exposes ref API via useImperativeHandle)
            ├─ EditorViewContentLayer  (contenteditable div, renders model via ReactRenderer)
            ├─ DecoratorLayer          (overlay: decorator decorators)
            ├─ SelectionLayer          (overlay: selection decorators)
            ├─ ContextLayer            (overlay: context decorators)
            └─ CustomLayer             (overlay: custom decorators + children)
```

`EditorView` wraps everything in `EditorViewContextProvider`, then renders `EditorViewRoot` which creates the layered structure. The ref is forwarded through to `EditorViewRoot` which exposes the full `EditorViewHandle` API.

## Context System

`EditorViewContextProvider` creates and manages:

- **editor** — The `Editor` instance
- **viewStateRef** — Mutable state flags (`isModelDrivenChange`, `isRendering`, `isComposing`, `skipNextRenderFromMO`, `skipApplyModelSelectionToDOM`)
- **selectionHandler** — `ReactSelectionHandler` for bidirectional selection sync
- **inputHandler** — `ReactInputHandler` for text input and composition handling
- **mutationObserverManager** — Tracks DOM mutations in the contenteditable
- **contentEditableRef** — Ref to the contenteditable DOM element
- **Decorator managers** — `DecoratorManager`, `RemoteDecoratorManager`, `PatternDecoratorConfigManager`, `DecoratorGeneratorManager`, `DecoratorSchemaRegistry`
- **getMergedDecorators** — Merges local, remote, pattern, and generator decorators
- **decoratorVersion** — Bumped on decorator changes to trigger re-renders

Access the context from any child component:

```tsx
import { useEditorViewContext } from '@barocss/editor-view-react';

function MyPlugin() {
  const { editor, selectionHandler } = useEditorViewContext();
  // ...
}
```

## Layer System

EditorView uses a layered architecture with five layers:

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Content** | `EditorViewContentLayer` | The `contenteditable` div. Renders model via `ReactRenderer.build()`. Handles input events and mutation observation. |
| **Decorator** | `EditorViewLayer` (decorator) | Overlay for decorator-category decorators (CSS highlights, widgets). |
| **Selection** | `EditorViewLayer` (selection) | Overlay for selection-category decorators (custom carets, selection highlights). |
| **Context** | `EditorViewLayer` (context) | Overlay for context-category decorators (tooltips, floating menus). |
| **Custom** | `EditorViewLayer` (custom) | Overlay for custom decorators. Also accepts React `children` passed to `EditorView`. |

Overlay layers use `ReactRenderer.buildOverlayDecorators()` to render decorator content. Each layer is positioned absolutely over the content layer.

## Decorator Management

The ref API (`EditorViewHandle`) provides full decorator CRUD:

```typescript
// Add a decorator
viewRef.current.addDecorator({
  sid: 'comment-1',
  stype: 'comment-highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 5, endOffset: 15 },
});

// Update a decorator
viewRef.current.updateDecorator('comment-1', {
  data: { resolved: true },
});

// Remove a decorator
viewRef.current.removeDecorator('comment-1');

// Query decorators with filtering and sorting
const inlineDecorators = viewRef.current.getDecorators({
  category: 'inline',
  nodeId: 'text-1',
  sortBy: 'id',
  sortOrder: 'asc',
});

// Export/import decorators for persistence
const data = viewRef.current.exportDecorators();
viewRef.current.loadDecorators(data, patternFunctions);
```

Decorator generators can also be registered via `addDecorator` by passing an object with a `generate` property.

## Selection

The ref API exposes selection conversion between model and DOM:

```typescript
// Apply model selection to DOM
viewRef.current.convertModelSelectionToDOM(modelSelection);

// Read DOM selection as model selection
const modelSel = viewRef.current.convertDOMSelectionToModel(window.getSelection());

// Convert a StaticRange (from beforeinput) to model selection
const sel = viewRef.current.convertStaticRangeToModel(staticRange);
```

Selection sync is bidirectional: DOM selection changes update the model, and model selection changes (from commands or transactions) update the DOM.

## Comparison with editor-view-dom

| Aspect | editor-view-dom | editor-view-react |
|--------|----------------|-------------------|
| Rendering | `DOMRenderer` (VNode → DOM reconciliation) | `ReactRenderer` (DSL → ReactNode, React reconciliation) |
| Mount | `new EditorViewDOM(editor, container)` then `view.mount()` | `<EditorView editor={editor} />` component |
| Decorator API | `view.addDecorator()`, `view.removeDecorator()` | `viewRef.current.addDecorator()`, `viewRef.current.removeDecorator()` |
| Layer structure | 5 layers (content, decorator, selection, context, custom) | Same 5 layers as React components |
| Selection sync | Direct DOM manipulation | Same, via `ReactSelectionHandler` |
| When to use | Vanilla JS / non-React apps | React applications |

The decorator API surface is the same — decorators created for one view work in the other.

## When to Use

- **React applications** — When your app is built with React
- **React ecosystem** — When you need React hooks, context, and component composition around the editor
- **Custom layers** — When you want to render custom React components in overlay layers

## Integration

Editor-View-React connects:

- **Editor-Core** — Executes commands on the `Editor` instance
- **Renderer-React** — Renders model to ReactNode via `ReactRenderer`
- **Shared** — Uses `DecoratorManager`, `PatternDecoratorConfigManager`, and other decorator utilities from `@barocss/shared`

## Related

- [Getting Started: Basic Usage](../basic-usage) - How to set up an editor
- [Editor-Core Package](./editor-core) - The editor it connects to
- [Renderer-React Package](./renderer-react) - React rendering layer
- [Editor View DOM Package](./editor-view-dom) - DOM-based alternative view layer
- [Core Concepts: Rendering](../concepts/rendering) - Deep dive into rendering
