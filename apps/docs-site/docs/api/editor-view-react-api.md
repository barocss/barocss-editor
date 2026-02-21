---
title: Editor View React API
---

# Editor View React API

The Editor View React API provides React components and hooks for integrating the Barocss Editor into React applications.

## EditorView Component

The main React component that renders the editor with layered content, decorators, selection, and custom overlays.

### Props

```typescript
interface EditorViewProps {
  editor: Editor;                    // Editor core instance
  options?: EditorViewOptions;       // View configuration
  children?: ReactNode;              // Additional children rendered inside the view
}
```

**Options:**
```typescript
interface EditorViewOptions {
  registry?: RendererRegistry;               // Renderer registry (defaults to global)
  className?: string;                        // CSS class for the root element
  layers?: EditorViewLayersConfig;           // Per-layer configuration
}
```

**Layers Config:**
```typescript
interface EditorViewLayersConfig {
  content?: EditorViewContentLayerOptions;   // Content layer options
  decorator?: { className?: string };        // Decorator overlay layer
  selection?: { className?: string };        // Selection highlight layer
  context?: { className?: string };          // Context menu / tooltip layer
  custom?: { className?: string };           // Custom overlay layer
}
```

### Ref

```typescript
type EditorViewRef = EditorViewHandle;
```

Access the imperative API through a React ref:

```typescript
import { useRef } from 'react';
import { EditorView, EditorViewRef } from '@barocss/editor-view-react';

function MyEditor({ editor }: { editor: Editor }) {
  const viewRef = useRef<EditorViewRef>(null);

  return <EditorView ref={viewRef} editor={editor} />;
}
```

### Example

```typescript
import { EditorView } from '@barocss/editor-view-react';
import { Editor } from '@barocss/editor-core';
import { getGlobalRegistry } from '@barocss/dsl';

function App() {
  const editor = useEditor(); // your editor instance

  return (
    <EditorView
      editor={editor}
      options={{
        registry: getGlobalRegistry(),
        className: 'my-editor',
        layers: {
          content: { editable: true, className: 'content' },
          decorator: { className: 'decorators' },
          selection: { className: 'selection' }
        }
      }}
    />
  );
}
```

---

## EditorViewHandle (Ref API)

The imperative handle exposed through `EditorView`'s ref. Provides decorator management, selection conversion, and DOM access.

### Decorator Management

#### `addDecorator(decorator): void`

Adds a decorator or decorator generator to the view.

**Parameters:**
- `decorator: Decorator | DecoratorGenerator` - Decorator instance or generator function

**Example:**
```typescript
viewRef.current.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 0, endOffset: 10 }
});
```

#### `removeDecorator(id): void`

Removes a decorator by its ID.

**Parameters:**
- `id: string` - Decorator sid to remove

**Example:**
```typescript
viewRef.current.removeDecorator('highlight-1');
```

#### `updateDecorator(id, updates): void`

Updates properties of an existing decorator.

**Parameters:**
- `id: string` - Decorator sid to update
- `updates: Partial<Decorator>` - Partial decorator properties to merge

**Example:**
```typescript
viewRef.current.updateDecorator('highlight-1', {
  target: { sid: 'text-1', startOffset: 2, endOffset: 8 }
});
```

#### `getDecorators(options?): Decorator[]`

Retrieves decorators matching optional query criteria.

**Parameters:**
- `options?: DecoratorQueryOptions` - Optional filter criteria

**Returns:**
- `Decorator[]` - Array of matching decorators

**Example:**
```typescript
const inlineDecorators = viewRef.current.getDecorators({
  category: 'inline'
});
```

#### `getDecorator(id): Decorator | undefined`

Gets a single decorator by ID.

**Parameters:**
- `id: string` - Decorator sid

**Returns:**
- `Decorator | undefined` - Decorator instance or `undefined`

**Example:**
```typescript
const decorator = viewRef.current.getDecorator('highlight-1');
if (decorator) {
  console.log('Found:', decorator.stype);
}
```

#### `exportDecorators(): DecoratorExportData`

Exports all decorators as serializable data.

**Returns:**
- `DecoratorExportData` - Serializable decorator state

**Example:**
```typescript
const exported = viewRef.current.exportDecorators();
localStorage.setItem('decorators', JSON.stringify(exported));
```

#### `loadDecorators(data, patternFunctions?): void`

Loads decorators from exported data.

**Parameters:**
- `data: DecoratorExportData` - Previously exported decorator data
- `patternFunctions?: Record<string, Function>` - Optional pattern function map for pattern decorators

**Example:**
```typescript
const saved = JSON.parse(localStorage.getItem('decorators') || '{}');
viewRef.current.loadDecorators(saved);
```

#### `defineDecoratorType(type, category, schema): void`

Defines a new decorator type at runtime.

**Parameters:**
- `type: string` - Decorator type name
- `category: 'inline' | 'block' | 'layer'` - Decorator category
- `schema: object` - Decorator schema definition

**Example:**
```typescript
viewRef.current.defineDecoratorType('comment', 'inline', {
  attrs: { author: 'string', text: 'string' }
});
```

### DOM & Selection

#### `contentEditableElement: HTMLElement | null`

The contentEditable DOM element managed by the view. Returns `null` if the view is not mounted.

**Example:**
```typescript
const el = viewRef.current.contentEditableElement;
if (el) {
  el.focus();
}
```

#### `convertModelSelectionToDOM(sel): void`

Converts a model selection to a DOM selection and applies it to the document.

**Parameters:**
- `sel: ModelSelection` - Model selection to apply

**Example:**
```typescript
viewRef.current.convertModelSelectionToDOM({
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});
```

#### `convertDOMSelectionToModel(selection): ModelSelection`

Converts a native DOM `Selection` to a model selection.

**Parameters:**
- `selection: Selection` - Native DOM Selection object

**Returns:**
- `ModelSelection` - Equivalent model selection

**Example:**
```typescript
const domSelection = window.getSelection()!;
const modelSel = viewRef.current.convertDOMSelectionToModel(domSelection);
```

#### `convertStaticRangeToModel(staticRange): ModelSelection | null`

Converts a `StaticRange` to a model selection.

**Parameters:**
- `staticRange: StaticRange` - Native StaticRange object

**Returns:**
- `ModelSelection | null` - Equivalent model selection, or `null` if conversion fails

**Example:**
```typescript
const modelSel = viewRef.current.convertStaticRangeToModel(staticRange);
if (modelSel) {
  console.log('Converted:', modelSel);
}
```

---

## EditorViewContentLayer Component

Renders the editable content layer within an `EditorView`.

### Props

```typescript
interface EditorViewContentLayerProps {
  options?: EditorViewContentLayerOptions;
}
```

**Options:**
```typescript
interface EditorViewContentLayerOptions {
  registry?: RendererRegistry; // Override renderer registry
  className?: string;          // CSS class for the content layer
  editable?: boolean;          // Enable contentEditable (default: true)
}
```

**Example:**
```typescript
import { EditorView, EditorViewContentLayer } from '@barocss/editor-view-react';

function CustomEditor({ editor }: { editor: Editor }) {
  return (
    <EditorView editor={editor}>
      <EditorViewContentLayer
        options={{
          className: 'custom-content',
          editable: true
        }}
      />
    </EditorView>
  );
}
```

---

## EditorViewLayer Component

Renders a named overlay layer (decorator, selection, context, or custom) within an `EditorView`.

### Props

```typescript
interface EditorViewLayerProps {
  layer: EditorViewLayerType;  // Layer type
  className?: string;          // CSS class for the layer
  style?: React.CSSProperties; // Inline styles
  children?: ReactNode;        // Additional children
}
```

**Layer Types:**
```typescript
type EditorViewLayerType = 'decorator' | 'selection' | 'context' | 'custom';
```

**Example:**
```typescript
import { EditorView, EditorViewContentLayer, EditorViewLayer } from '@barocss/editor-view-react';

function FullEditor({ editor }: { editor: Editor }) {
  return (
    <EditorView editor={editor}>
      <EditorViewContentLayer />
      <EditorViewLayer layer="decorator" className="decorator-overlay" />
      <EditorViewLayer layer="selection" className="selection-overlay" />
      <EditorViewLayer layer="custom" className="custom-overlay">
        <MyCustomToolbar />
      </EditorViewLayer>
    </EditorView>
  );
}
```

---

## Context Hooks

### EditorViewContextProvider

Provides editor view context to descendant components.

```typescript
function EditorViewContextProvider({
  editor,
  children
}: {
  editor: Editor;
  children: ReactNode;
}): JSX.Element
```

**Example:**
```typescript
import { EditorViewContextProvider } from '@barocss/editor-view-react';

function App({ editor }: { editor: Editor }) {
  return (
    <EditorViewContextProvider editor={editor}>
      <Toolbar />
      <EditorView editor={editor} />
    </EditorViewContextProvider>
  );
}
```

### useEditorViewContext

Returns the current editor view context. Throws if used outside a provider.

```typescript
function useEditorViewContext(): EditorViewContextValue
```

**Returns:**
- `EditorViewContextValue` - Context value containing the editor instance and view utilities

**Example:**
```typescript
import { useEditorViewContext } from '@barocss/editor-view-react';

function Toolbar() {
  const { editor } = useEditorViewContext();

  return (
    <button onClick={() => editor.commands.execute('toggleBold')}>
      Bold
    </button>
  );
}
```

### useOptionalEditorViewContext

Returns the current editor view context, or `null` if outside a provider. Safe for components that may render with or without an editor.

```typescript
function useOptionalEditorViewContext(): EditorViewContextValue | null
```

**Returns:**
- `EditorViewContextValue | null` - Context value or `null`

**Example:**
```typescript
import { useOptionalEditorViewContext } from '@barocss/editor-view-react';

function StatusBar() {
  const ctx = useOptionalEditorViewContext();

  if (!ctx) {
    return <span>No editor</span>;
  }

  return <span>Editor active</span>;
}
```

---

## ModelSelection Type

Represents selection state in the model layer.

```typescript
type ModelSelection =
  | { type: 'none' }
  | {
      type: 'range';
      startNodeId: string;
      startOffset: number;
      endNodeId: string;
      endOffset: number;
      direction?: 'forward' | 'backward';
    }
  | { type: 'node'; nodeId: string };
```

**Variants:**
- `none` — No active selection
- `range` — Text range selection with start/end positions and optional direction
- `node` — Entire node selected (e.g., an image or embed)

**Example:**
```typescript
const collapsed: ModelSelection = {
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 5
};

const expanded: ModelSelection = {
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-2',
  endOffset: 10,
  direction: 'forward'
};

const nodeSelection: ModelSelection = {
  type: 'node',
  nodeId: 'image-1'
};
```

---

## Complete Example

```typescript
import { useRef } from 'react';
import { EditorView, EditorViewRef, EditorViewContentLayer, EditorViewLayer } from '@barocss/editor-view-react';
import { Editor } from '@barocss/editor-core';
import { getGlobalRegistry } from '@barocss/dsl';

function MyEditor({ editor }: { editor: Editor }) {
  const viewRef = useRef<EditorViewRef>(null);

  const addHighlight = () => {
    viewRef.current?.addDecorator({
      sid: `hl-${Date.now()}`,
      stype: 'highlight',
      category: 'inline',
      target: { sid: 'text-1', startOffset: 0, endOffset: 5 }
    });
  };

  const getSelection = () => {
    const domSel = window.getSelection();
    if (domSel && viewRef.current) {
      const modelSel = viewRef.current.convertDOMSelectionToModel(domSel);
      console.log('Model selection:', modelSel);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button onClick={addHighlight}>Add Highlight</button>
        <button onClick={getSelection}>Log Selection</button>
      </div>
      <EditorView
        ref={viewRef}
        editor={editor}
        options={{
          registry: getGlobalRegistry(),
          className: 'editor-root',
          layers: {
            content: { editable: true },
            decorator: { className: 'decorator-layer' },
            selection: { className: 'selection-layer' }
          }
        }}
      >
        <EditorViewContentLayer />
        <EditorViewLayer layer="decorator" />
        <EditorViewLayer layer="selection" />
        <EditorViewLayer layer="custom">
          <FloatingToolbar />
        </EditorViewLayer>
      </EditorView>
    </div>
  );
}
```

---

## Related

- [Core Concepts: Rendering](../concepts/rendering) - Rendering concepts
- [Renderer React API](./renderer-react-api) - React renderer API
- [Editor Core API](./editor-core-api) - Editor core instance
- [Editor View DOM API](./editor-view-dom-api) - DOM view counterpart
- [DSL API](./dsl-api) - Template DSL
