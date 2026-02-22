# React Editor Guide

This guide walks you through building a fully functional Barocss Editor inside a React application — from scratch to a complete editor with toolbar, formatting, and custom React-rendered components.

## Prerequisites

- React 18+ project (Vite, Next.js, or CRA)
- Basic understanding of [Schema & Model](../concepts/schema-and-model) and [Extensions](../architecture/extensions)

## Installation

```bash
pnpm add @barocss/editor-core @barocss/editor-view-react @barocss/renderer-react \
  @barocss/schema @barocss/datastore @barocss/dsl @barocss/extensions @barocss/model
```

## Step 1: Define Schema

```typescript
// schema.ts
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';

// Use the standard schema (48 node types + 24 marks)
export const schema = createSchema('my-editor', getStandardSchemaDefinition());
```

Or define a minimal schema if you only need a subset:

```typescript
export const schema = createSchema('my-editor', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    heading:  { name: 'heading',  group: 'block', content: 'inline*', attributes: { level: { default: 1 } } },
    paragraph:{ name: 'paragraph',group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' },
  },
  marks: {
    bold:   { name: 'bold',   group: 'text-style' },
    italic: { name: 'italic', group: 'text-style' },
    link:   { name: 'link',   group: 'text-style', attributes: { href: { default: '' } } },
  }
});
```

## Step 2: Register React Component Renderers

In the React view, every node type and mark is rendered as a **React component** using `define()` + `external()`:

```tsx
// register-renderers.tsx
import React from 'react';
import { define, defineMark, external } from '@barocss/dsl';
import type { BlockComponentProps, MarkComponentProps } from '@barocss/dsl';

type BP = BlockComponentProps;
type MP = MarkComponentProps;

// Block components receive: { sid, stype, attributes, children, text, model }
// Mark components receive:  { markType, attributes, text, children }

function Document({ sid, stype, children }: BP) {
  return (
    <div className="document" data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </div>
  );
}

function Heading({ sid, stype, attributes, children }: BP) {
  const Tag = `h${attributes?.level || 1}` as any;
  return (
    <Tag className="heading" data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </Tag>
  );
}

function Paragraph({ sid, stype, children }: BP) {
  return (
    <p className="paragraph" data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </p>
  );
}

function InlineText({ sid, stype, text }: BP) {
  return (
    <span className="text" data-bc-sid={sid} data-bc-stype={stype}>
      {text ?? ''}
    </span>
  );
}

// Mark components wrap their children
function BoldMark({ children }: MP) {
  return <strong>{children}</strong>;
}

function ItalicMark({ children }: MP) {
  return <em>{children}</em>;
}

function LinkMark({ children, attributes }: MP) {
  return (
    <a href={attributes?.href ?? '#'} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function registerRenderers(): void {
  define('document',    external(Document));
  define('heading',     external(Heading));
  define('paragraph',   external(Paragraph));
  define('inline-text', external(InlineText));

  defineMark('bold',   external(BoldMark));
  defineMark('italic', external(ItalicMark));
  defineMark('link',   external(LinkMark));
}
```

**Important:** Every block component **must** set `data-bc-sid` and `data-bc-stype` on its root element — the renderer uses these attributes for selection sync and reconciliation.

## Step 3: Create the Editor Instance

```tsx
// use-editor.ts
import { useMemo } from 'react';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { schema } from './schema';
import type { ModelData } from '@barocss/dsl';

const initialDocument: ModelData = {
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        { sid: 'text-1', stype: 'inline-text', text: 'Start typing here...' }
      ]
    }
  ]
};

export function useEditor() {
  return useMemo(() => {
    const dataStore = new DataStore(undefined, schema);
    const editor = new Editor({
      dataStore,
      schema,
      editable: true,
      extensions: [
        ...createCoreExtensions(),
        ...createBasicExtensions(),
      ],
    });
    editor.loadDocument(initialDocument, 'my-editor');
    return editor;
  }, []);
}
```

## Step 4: Render the Editor

```tsx
// App.tsx
import { EditorView } from '@barocss/editor-view-react';
import { getGlobalRegistry } from '@barocss/dsl';
import { useEditor } from './use-editor';
import { registerRenderers } from './register-renderers';

// Register once at module level
registerRenderers();

export function App() {
  const editor = useEditor();

  return (
    <div className="editor-app">
      <EditorView
        editor={editor}
        options={{
          registry: getGlobalRegistry(),
          className: 'editor-root',
          layers: {
            content: { editable: true, className: 'editor-content' },
          },
        }}
      />
    </div>
  );
}
```

That's it — you now have a working React editor. The `EditorView` component handles:
- Content rendering via `ReactRenderer`
- Selection sync (DOM ↔ Model)
- Input handling (text, composition/IME, keyboard)
- Mutation observation
- Layered decorator rendering

## Step 5: Add a Toolbar

Use the `useEditorViewContext` hook or direct `editor.executeCommand()` calls to add formatting controls:

```tsx
// Toolbar.tsx
import { useCallback } from 'react';
import type { Editor } from '@barocss/editor-core';

interface ToolbarProps {
  editor: Editor;
}

export function Toolbar({ editor }: ToolbarProps) {
  const exec = useCallback(
    (command: string, payload?: any) => editor.executeCommand(command, payload),
    [editor]
  );

  return (
    <div className="toolbar">
      <button onClick={() => exec('toggleBold')} title="Bold (Ctrl+B)">
        <b>B</b>
      </button>
      <button onClick={() => exec('toggleItalic')} title="Italic (Ctrl+I)">
        <i>I</i>
      </button>
      <button onClick={() => exec('toggleUnderline')} title="Underline">
        <u>U</u>
      </button>
      <span className="separator" />
      <button onClick={() => exec('setHeading', { level: 1 })}>H1</button>
      <button onClick={() => exec('setHeading', { level: 2 })}>H2</button>
      <button onClick={() => exec('setHeading', { level: 3 })}>H3</button>
      <span className="separator" />
      <button onClick={() => exec('toggleBulletList')}>• List</button>
      <button onClick={() => exec('toggleOrderedList')}>1. List</button>
      <button onClick={() => exec('toggleBlockquote')}>Quote</button>
    </div>
  );
}
```

Then compose it with the editor:

```tsx
export function App() {
  const editor = useEditor();

  return (
    <div className="editor-app">
      <Toolbar editor={editor} />
      <EditorView
        editor={editor}
        options={{
          registry: getGlobalRegistry(),
          className: 'editor-root',
          layers: {
            content: { editable: true, className: 'editor-content' },
          },
        }}
      />
    </div>
  );
}
```

## Step 6: Using the Ref API

The `EditorView` exposes an imperative ref for decorator management and selection control:

```tsx
import { useRef } from 'react';
import { EditorView, type EditorViewRef } from '@barocss/editor-view-react';

function MyEditor({ editor }: { editor: Editor }) {
  const viewRef = useRef<EditorViewRef>(null);

  const addHighlight = () => {
    const sel = editor.selection;
    if (!sel || sel.type !== 'range') return;

    viewRef.current?.addDecorator({
      sid: `hl-${Date.now()}`,
      stype: 'highlight',
      category: 'inline',
      target: {
        sid: sel.startNodeId,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
      },
    });
  };

  return (
    <>
      <button onClick={addHighlight}>Highlight</button>
      <EditorView ref={viewRef} editor={editor} options={{ registry: getGlobalRegistry() }} />
    </>
  );
}
```

## Step 7: Custom Overlay Layers

Render custom React components in overlay layers (above the content):

```tsx
import { EditorView, EditorViewContentLayer, EditorViewLayer } from '@barocss/editor-view-react';

function FloatingToolbar() {
  return <div className="floating-toolbar">Floating UI here</div>;
}

function FullEditor({ editor }: { editor: Editor }) {
  return (
    <EditorView editor={editor} options={{ registry: getGlobalRegistry() }}>
      <EditorViewContentLayer options={{ editable: true }} />
      <EditorViewLayer layer="decorator" />
      <EditorViewLayer layer="selection" />
      <EditorViewLayer layer="custom">
        <FloatingToolbar />
      </EditorViewLayer>
    </EditorView>
  );
}
```

The five layers from bottom to top:

| Layer | Purpose |
|-------|---------|
| **Content** | `contenteditable` div, renders model via `ReactRenderer` |
| **Decorator** | Overlay for decorator highlights and widgets |
| **Selection** | Overlay for custom selection rendering |
| **Context** | Overlay for tooltips, context menus |
| **Custom** | Overlay for arbitrary React children |

## Step 8: Rich Content with External Components

For complex node types, React components can use hooks, state, and effects:

```tsx
import { useRef, useEffect } from 'react';
import type { BlockComponentProps } from '@barocss/dsl';
import katex from 'katex';

function MathBlock({ sid, stype, attributes }: BlockComponentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tex = attributes?.tex ?? '';

  useEffect(() => {
    if (!ref.current || !tex) return;
    try {
      katex.render(tex, ref.current, { displayMode: true, throwOnError: false });
    } catch {
      if (ref.current) ref.current.textContent = tex;
    }
  }, [tex]);

  return (
    <div
      ref={ref}
      className="math-block"
      data-bc-sid={sid}
      data-bc-stype={stype}
    >
      {tex ? null : '(empty equation)'}
    </div>
  );
}

define('mathBlock', external(MathBlock));
```

## Step 9: Context Hook for Nested Components

Components rendered inside `EditorView` can access editor state via the context hook:

```tsx
import { useEditorViewContext } from '@barocss/editor-view-react';

function WordCount() {
  const { editor } = useEditorViewContext();
  const dataStore = editor.dataStore;
  // ... count words from dataStore nodes
  return <span className="word-count">123 words</span>;
}
```

Use `useOptionalEditorViewContext` if the component may render outside the editor:

```tsx
import { useOptionalEditorViewContext } from '@barocss/editor-view-react';

function StatusBar() {
  const ctx = useOptionalEditorViewContext();
  if (!ctx) return <span>No editor</span>;
  return <span>Editor ready</span>;
}
```

## Complete Example

Here's the full minimal setup:

```tsx
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { EditorView } from '@barocss/editor-view-react';
import { define, defineMark, external, getGlobalRegistry } from '@barocss/dsl';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import type { BlockComponentProps, MarkComponentProps } from '@barocss/dsl';

// 1. Schema
const schema = createSchema('demo', {
  topNode: 'document',
  nodes: {
    document:      { name: 'document',    group: 'document', content: 'block+' },
    paragraph:     { name: 'paragraph',   group: 'block',    content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' },
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' },
  }
});

// 2. React renderers
define('document',    external(({ sid, stype, children }: BlockComponentProps) =>
  <div data-bc-sid={sid} data-bc-stype={stype}>{children}</div>
));
define('paragraph',   external(({ sid, stype, children }: BlockComponentProps) =>
  <p data-bc-sid={sid} data-bc-stype={stype}>{children}</p>
));
define('inline-text', external(({ sid, stype, text }: BlockComponentProps) =>
  <span data-bc-sid={sid} data-bc-stype={stype}>{text ?? ''}</span>
));
defineMark('bold', external(({ children }: MarkComponentProps) =>
  <strong>{children}</strong>
));

// 3. Editor
const dataStore = new DataStore(undefined, schema);
const editor = new Editor({
  dataStore, schema, editable: true,
  extensions: [...createCoreExtensions(), ...createBasicExtensions()],
});
editor.loadDocument({
  sid: 'doc', stype: 'document',
  content: [{
    sid: 'p1', stype: 'paragraph',
    content: [{ sid: 't1', stype: 'inline-text', text: 'Hello, React Editor!' }]
  }]
}, 'demo');

// 4. Render
function App() {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', border: '1px solid #ddd', borderRadius: 8 }}>
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
        <button onClick={() => editor.executeCommand('toggleBold')}><b>B</b></button>
      </div>
      <EditorView
        editor={editor}
        options={{
          registry: getGlobalRegistry(),
          layers: { content: { editable: true, className: 'content' } },
        }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

## Component Props Reference

### Block Components (`BlockComponentProps`)

| Prop | Type | Description |
|------|------|-------------|
| `sid` | `string` | Node's unique schema ID |
| `stype` | `string` | Node's schema type |
| `attributes` | `Record<string, any>` | Node attributes from model |
| `children` | `ReactNode` | Rendered child nodes |
| `text` | `string \| undefined` | Text content (leaf nodes) |
| `model` | `object` | Full model data |

### Mark Components (`MarkComponentProps`)

| Prop | Type | Description |
|------|------|-------------|
| `markType` | `string` | Mark type name |
| `attributes` | `Record<string, any>` | Mark attributes |
| `text` | `string` | Text content of the run |
| `children` | `ReactNode` | Inner content (text or nested marks) |

## DOM vs React: When to Use Which

| Criterion | `EditorViewDOM` | `EditorView` (React) |
|-----------|----------------|---------------------|
| App framework | Vanilla JS, non-React | React |
| Renderer | `DOMRenderer` (VNode → DOM) | `ReactRenderer` (DSL → ReactNode) |
| Reconciliation | Custom VNode diffing | React's built-in reconciler |
| Component model | DSL `element()` templates | React components via `external()` |
| Hooks & state | Not available | Full React lifecycle |
| Mount API | `new EditorViewDOM(editor, { container })` | `<EditorView editor={editor} />` |
| Decorator API | `view.addDecorator()` | `viewRef.current.addDecorator()` |

Both views share the same Editor, DataStore, Schema, Extensions, and transaction system. You can even switch between them — the model layer is completely view-agnostic.

## Next Steps

- [Architecture: Editor-View-React](../architecture/editor-view-react) — Internal architecture
- [API: Editor View React](../api/editor-view-react-api) — Full API reference
- [Architecture: Renderer-React](../architecture/renderer-react) — React rendering pipeline
- [Extension Design Guide](./extension-design) — Create custom extensions
- [Decorators](../concepts/decorators) — Add visual overlays and widgets
